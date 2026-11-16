import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionUserId } from '@/lib/api-auth';
import { limitarPorIp } from '@/lib/rate-limit';
import { hashLinkAcesso, TOKEN_ACESSO } from '@/lib/link-acesso';
import { loginPorToken } from '@/lib/login-token';
import { TIPOS } from '@/lib/avisar-oficinas-pedido';

export const dynamic = 'force-dynamic';

// Pagina "ver pedido" do link do e-mail (lib/link-acesso.ts). Nada acontece ao
// abrir o link: so o toque no botao gasta o token.
//   acao 'ver'    -> nome e numero do pedido para a saudacao (nao gasta o token);
//                    quem ja esta logado como o dono do pedido recebe jaLogado
//   acao 'entrar' -> gasta o token (uso unico, num passo so no banco) e devolve o
//                    login de uso unico (tokenHash) + se ainda falta criar senha
// Link da OFICINA (089, finalidade 'oficina'): as mesmas acoes + 'dispensar' e
// 'desfazer' ("nao tenho interesse" pelo e-mail), que NAO gastam o token: so
// "Abrir o pedido" entra na conta. Pedido fechado nunca entra (410 PEDIDO_FECHADO).

// mesma lista de components/oficina/DispensarPedido.tsx (componente de cliente: nao da para importar aqui)
const MOTIVOS_DISPENSA = ['nao_faz', 'faz_parte', 'sem_agenda', 'longe', 'outro'];
const ABERTO = ['aberta', 'em_orcamento'];

export async function POST(req: NextRequest) {
  if (!limitarPorIp(req, 'link-acesso', 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  const token = typeof b?.k === 'string' ? b.k : '';
  const acao = b?.acao;
  const invalido = (extra: Record<string, unknown> = {}) => NextResponse.json({ error: 'Link inválido', codigo: 'LINK_INVALIDO', ...extra }, { status: 410 });
  if (!TOKEN_ACESSO.test(token) || !['ver', 'entrar', 'dispensar', 'desfazer'].includes(acao)) return invalido();
  const hash = hashLinkAcesso(token);
  const { data: l } = await supabaseAdmin.from('links_acesso')
    .select('id, user_id, solicitacao_id, oficina_id, finalidade, usado_em, expira_em, visto_em').eq('token_hash', hash).maybeSingle();
  if (!l) return invalido();
  // ja esta logado como o dono: vai direto ao pedido (mesmo com o link gasto)
  const sessao = await getSessionUserId(req);
  const jaLogado = !!sessao && sessao === l.user_id;
  const vencido = !!l.usado_em || new Date(l.expira_em).getTime() < Date.now();

  if (l.finalidade === 'oficina') return linkDaOficina(req, b, acao, hash, l, jaLogado, vencido, invalido);
  if (acao === 'dispensar' || acao === 'desfazer') return invalido();

  if (acao === 'ver') {
    if (jaLogado) return NextResponse.json({ jaLogado: true, solicitacaoId: l.solicitacao_id });
    if (vencido) return invalido({ solicitacaoId: l.solicitacao_id });
    const { data: perfil } = await supabaseAdmin.from('profiles').select('nome, ativo').eq('id', l.user_id).maybeSingle();
    const { data: sol } = await supabaseAdmin.from('solicitacoes').select('numero').eq('id', l.solicitacao_id).maybeSingle();
    if (!perfil || perfil.ativo === false) return invalido();
    return NextResponse.json({ nome: perfil.nome, numero: sol?.numero ?? null, solicitacaoId: l.solicitacao_id });
  }

  // entrar: gasta o token num passo so (dois toques ao mesmo tempo entram uma vez)
  const { data: usado } = await supabaseAdmin.rpc('link_acesso_usar', { p_hash: hash });
  const linha = (usado as { user_id: string; solicitacao_id: string }[] | null)?.[0];
  if (!linha) return jaLogado ? NextResponse.json({ jaLogado: true, solicitacaoId: l.solicitacao_id }) : invalido({ solicitacaoId: l.solicitacao_id });
  const { data: perfil } = await supabaseAdmin.from('profiles').select('ativo').eq('id', linha.user_id).maybeSingle();
  if (!perfil || perfil.ativo === false) return NextResponse.json({ error: 'Sem acesso', codigo: 'SEM_ACESSO' }, { status: 403 });
  const login = await loginPorToken(linha.user_id);
  if (!login.tokenHash) return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  return NextResponse.json({ ...login, solicitacaoId: linha.solicitacao_id });
}

type LinhaLink = { id: string; user_id: string; solicitacao_id: string; oficina_id: string | null; usado_em: string | null; visto_em: string | null };

async function linkDaOficina(
  req: NextRequest, b: any, acao: string, hash: string, l: LinhaLink, jaLogado: boolean, vencido: boolean,
  invalido: (extra?: Record<string, unknown>) => NextResponse,
) {
  const base = { finalidade: 'oficina', solicitacaoId: l.solicitacao_id };
  const destino = `/oficina/orcamento/${l.solicitacao_id}`;
  const semAcessoResp = () => NextResponse.json({ error: 'Sem acesso', codigo: 'SEM_ACESSO', ...base }, { status: 403 });
  const fechado = () => NextResponse.json({ error: 'Pedido encerrado', codigo: 'PEDIDO_FECHADO', ...base }, { status: 410 });

  const [{ data: of }, { data: perfil }, { data: sol }] = await Promise.all([
    supabaseAdmin.from('oficinas').select('id, nome_fantasia, profile_id, ativa').eq('id', l.oficina_id as string).maybeSingle(),
    supabaseAdmin.from('profiles').select('ativo, tipo').eq('id', l.user_id).maybeSingle(),
    supabaseAdmin.from('solicitacoes').select('numero, tipo, status, endereco, veiculo:veiculos(fipe_marca, fipe_modelo, fipe_ano)').eq('id', l.solicitacao_id).maybeSingle(),
  ]);
  const semAcesso = !of || of.profile_id !== l.user_id || !of.ativa || !perfil || perfil.ativo === false || perfil.tipo !== 'oficina' || !sol;
  const aberto = !!sol && ABERTO.includes(sol.status);

  if (acao === 'ver') {
    if (vencido && !jaLogado) return invalido(base);
    if (semAcesso) return semAcessoResp();
    if (!l.visto_em) await supabaseAdmin.from('links_acesso').update({ visto_em: new Date().toISOString() }).eq('id', l.id).is('visto_em', null);
    const [{ count: orcs }, { data: disp }] = await Promise.all([
      supabaseAdmin.from('orcamentos').select('id', { count: 'exact', head: true }).eq('solicitacao_id', l.solicitacao_id).eq('oficina_id', of!.id),
      supabaseAdmin.from('pedido_dispensas').select('motivo').eq('solicitacao_id', l.solicitacao_id).eq('oficina_id', of!.id).maybeSingle(),
    ]);
    const idioma = typeof b?.idioma === 'string' && TIPOS[b.idioma] ? b.idioma : 'en';
    const v = (sol as any).veiculo as { fipe_marca?: string | null; fipe_modelo?: string | null } | null;
    // so bairro/cidade: partes do endereco sem numero (rua com numero, CEP) e sem o pais;
    // nada de contato do cliente
    const partes = String(sol!.endereco || '').split(',').map((x) => x.trim())
      .filter((x) => x && !/\d/.test(x) && !/^(eesti|estonia|эстония|estônia|itália|italia|portugal|brasil)$/i.test(x));
    return NextResponse.json({
      ...base, oficina: { nome: of!.nome_fantasia || '' }, numero: sol!.numero ?? null,
      tipo: sol!.tipo, tipoNome: TIPOS[idioma]?.[sol!.tipo] || sol!.tipo,
      carro: [v?.fipe_marca, v?.fipe_modelo].filter(Boolean).join(' ') || null,
      cidade: partes.slice(-2).join(', ') || null,
      aberto, jaOrcou: (orcs ?? 0) > 0, dispensa: disp ? { motivo: disp.motivo } : null, jaLogado,
      vencido,
    });
  }

  if (acao === 'entrar') {
    if (semAcesso) return semAcessoResp();
    if (!aberto) return fechado();
    if (jaLogado) return NextResponse.json({ jaLogado: true, ...base, destino });
    const { data: usado } = await supabaseAdmin.rpc('link_acesso_usar', { p_hash: hash });
    const linha = (usado as { user_id: string; solicitacao_id: string }[] | null)?.[0];
    if (!linha) return invalido(base);
    const login = await loginPorToken(linha.user_id);
    if (!login.tokenHash) return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
    return NextResponse.json({ ...login, ...base, destino });
  }

  // dispensar / desfazer: nao gastam o token (o "Desfazer" funciona sem login)
  if (vencido) return invalido(base);
  if (semAcesso) return semAcessoResp();
  if (!aberto) return fechado();
  if (acao === 'desfazer') {
    const { error } = await supabaseAdmin.from('pedido_dispensas').delete().eq('solicitacao_id', l.solicitacao_id).eq('oficina_id', of!.id);
    if (error) return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
    return NextResponse.json({ ok: true, ...base });
  }
  const motivo = typeof b?.motivo === 'string' ? b.motivo : '';
  if (!MOTIVOS_DISPENSA.includes(motivo)) return NextResponse.json({ error: 'Motivo inválido', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  const comentario = typeof b?.comentario === 'string' ? b.comentario.trim().slice(0, 500) || null : null;
  const { count: orcs } = await supabaseAdmin.from('orcamentos').select('id', { count: 'exact', head: true }).eq('solicitacao_id', l.solicitacao_id).eq('oficina_id', of!.id);
  if ((orcs ?? 0) > 0) return NextResponse.json({ error: 'Já orçou', codigo: 'JA_ORCOU', ...base }, { status: 409 });
  const { error } = await supabaseAdmin.from('pedido_dispensas').upsert(
    { solicitacao_id: l.solicitacao_id, oficina_id: of!.id, motivo, comentario, autor_id: l.user_id, origem: 'email' },
    { onConflict: 'solicitacao_id,oficina_id' },
  );
  if (error) { console.error('[link-acesso] dispensar', error.message); return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 }); }
  return NextResponse.json({ ok: true, ...base, dispensa: { motivo } });
}
