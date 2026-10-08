import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { dentroDoLimite } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Excluir a propria conta (exigido pela Apple - 5.1.1(v) - e pelo Google Play,
// que pede tambem um endereco na web: /[locale]/excluir-conta).
// - Sem historico (nenhum pedido/acidente/oficina/loja): apaga tudo de vez.
// - Com historico: o login deixa de existir (email trocado, senha aleatoria,
//   bloqueado) e os dados pessoais somem (nome, email, telefone, placas,
//   veiculos sem pedido, avisos, dados de acidente). Pedidos/orcamentos/
//   comissoes ficam anonimos: sao da oficina tambem (e apagar o perfil em
//   cascata levaria junto a comissao devida e e barrado pela agenda).
// - Carro dentro da oficina agora (servico em andamento): pede para esperar a
//   entrega, para nao deixar a oficina sem contato com o dono do carro.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!dentroDoLimite(`excluir-conta:${userId}`, 5, 60 * 60 * 1000)) return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  const { confirmar } = await req.json().catch(() => ({}));
  if (confirmar !== true) return NextResponse.json({ error: 'Confirmação obrigatória', codigo: 'DADOS_INVALIDOS' }, { status: 400 });

  const { data: perfil } = await supabaseAdmin.from('profiles').select('id, tipo').eq('id', userId).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 });
  if (perfil.tipo === 'admin') return NextResponse.json({ error: 'Conta de administrador', codigo: 'ACESSO_NEGADO' }, { status: 403 });

  const [{ data: sols }, { data: emerg }, { data: ofs }, { data: lojas }] = await Promise.all([
    supabaseAdmin.from('solicitacoes').select('id, status').eq('cliente_id', userId),
    supabaseAdmin.from('emergencias').select('id').eq('profile_id', userId),
    supabaseAdmin.from('oficinas').select('id').eq('profile_id', userId),
    supabaseAdmin.from('lojas_pecas').select('id').eq('profile_id', userId),
  ]);
  const solIds = (sols || []).map((s) => s.id);
  const ofIds = (ofs || []).map((o) => o.id);

  // carro na oficina agora: do cliente ou, se for oficina, carros dos clientes dela
  const emServico = [
    ...(solIds.length ? ((await supabaseAdmin.from('agenda').select('id').in('solicitacao_id', solIds).eq('status', 'em_andamento')).data || []) : []),
    ...(ofIds.length ? ((await supabaseAdmin.from('agenda').select('id').in('oficina_id', ofIds).eq('status', 'em_andamento')).data || []) : []),
  ];
  if (emServico.length) return NextResponse.json({ error: 'Há um carro em serviço', codigo: 'CARRO_EM_SERVICO' }, { status: 409 });

  const semHistorico = !solIds.length && !(emerg || []).length && !ofIds.length && !(lojas || []).length;
  if (semHistorico) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, modo: 'apagada' });
  }

  // 1) login: deixa de existir para o usuario
  const emailAnonimo = `excluida-${userId}@conta-excluida.invalid`;
  const { error: eAuth } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email: emailAnonimo, email_confirm: true, password: crypto.randomBytes(32).toString('hex'),
    phone: '', user_metadata: {}, ban_duration: '876000h',
  } as any);
  if (eAuth) return NextResponse.json({ error: eAuth.message }, { status: 500 });

  // 2) dados pessoais
  await supabaseAdmin.from('profiles').update({ nome: '—', email: emailAnonimo, telefone: null, avatar_url: null, ativo: false }).eq('id', userId);
  await supabaseAdmin.from('notificacoes').delete().eq('profile_id', userId);
  // veiculos sem pedido saem; os de pedidos ficam sem placa/cor/apelido
  const { data: veics } = await supabaseAdmin.from('veiculos').select('id, solicitacoes(id)').eq('profile_id', userId);
  const semPedido = (veics || []).filter((v: any) => !(v.solicitacoes || []).length).map((v: any) => v.id);
  if (semPedido.length) await supabaseAdmin.from('veiculos').delete().in('id', semPedido);
  await supabaseAdmin.from('veiculos').update({ placa: null, cor: null, apelido: null }).eq('profile_id', userId);
  await supabaseAdmin.from('emergencias').update({ nome: '—', email: null, telefone: null }).eq('profile_id', userId);
  await supabaseAdmin.from('emergencia_outro_veiculo').update({ nome: '—', email: null, telefone: null, placa: null }).eq('profile_id', userId);
  await supabaseAdmin.from('funcionarios').update({ ativo: false, acesso_portal: false, nome: '—', telefone: null }).eq('profile_id', userId);

  // 3) o que estava aberto e cancelado (as oficinas deixam de ver o pedido)
  const abertos = (sols || []).filter((s) => ['aberta', 'em_orcamento', 'aceita'].includes(s.status)).map((s) => s.id);
  if (abertos.length) {
    await supabaseAdmin.from('solicitacoes').update({ status: 'cancelada' }).in('id', abertos);
    await supabaseAdmin.from('agenda').update({ status: 'cancelado' }).in('solicitacao_id', abertos).eq('status', 'agendado');
  }
  // oficina/loja: some das buscas; comissoes e historico ficam para o acerto
  if (ofIds.length) {
    await supabaseAdmin.from('oficinas').update({ ativa: false }).in('id', ofIds);
    await supabaseAdmin.from('agenda').update({ status: 'cancelado' }).in('oficina_id', ofIds).eq('status', 'agendado');
  }
  if ((lojas || []).length) await supabaseAdmin.from('lojas_pecas').update({ ativa: false }).eq('profile_id', userId);

  return NextResponse.json({ ok: true, modo: 'anonimizada' });
}
