import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { limitarPorIp } from '@/lib/rate-limit';
import { ehUuid } from '@/lib/validacao';
import { PENDENTE_HORAS, linkConfere, apagarPendente, ativarEPublicar, contarEtapa } from '@/lib/pedido-sem-conta';
import { loginPorToken } from '@/lib/login-token';

export const dynamic = 'force-dynamic';

// Link dos e-mails de confirmacao (1o e-mail e lembrete; dono 06/11 e 13/11;
// lib/pedido-sem-conta.ts): a pessoa confirma por aqui (o link prova o e-mail) ou
// cancela o pedido. Confirmar por aqui ou pelo codigo apaga o pendente: o outro morre. So acontece com o clique na pagina (POST), nunca ao abrir o
// link - leitores automaticos de e-mail que abrem links nao confirmam nem cancelam.
//   acao 'ver'       -> resumo do pedido para a pessoa reconhecer
//   acao 'confirmar' -> conta ativada, pedido para as oficinas e login (token_hash)
//   acao 'cancelar'  -> pedido, fotos e conta nao ativada apagados na hora
export async function POST(req: NextRequest) {
  if (!limitarPorIp(req, 'pedido-sem-conta-retomar', 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  const id = b?.id;
  const token = typeof b?.t === 'string' ? b.t : '';
  const acao = b?.acao;
  const doLembrete = b?.o === 'l';
  const invalido = NextResponse.json({ error: 'Link inválido', codigo: 'CODIGO_EXPIRADO' }, { status: 410 });
  if (!ehUuid(id) || !/^[a-f0-9]{64}$/.test(token) || !['ver', 'confirmar', 'cancelar'].includes(acao)) return invalido;

  const { data: p } = await supabaseAdmin.from('pedidos_pendentes').select('*').eq('id', id).maybeSingle();
  if (!p || !linkConfere(p, token)) return invalido;
  const expira = new Date(p.created_at).getTime() + PENDENTE_HORAS * 3600 * 1000;
  if (Date.now() > expira) {
    await apagarPendente(p);
    return invalido;
  }

  if (acao === 'ver') {
    const d = p.dados || {};
    await contarEtapa(`pedido_${p.origem}`, 'link_aberto');
    // sem endereco e com o telefone mascarado (Fable 13/11): o link ja vai no 1o e-mail -
    // quem recebeu por engano reconhece que nao e dele sem ver onde a pessoa mora
    const tel = String(p.telefone || '').replace(/\s+/g, '');
    return NextResponse.json({
      tipo: d.tipo, descricao: String(d.descricao || '').slice(0, 120),
      carro: [d.veiculo?.marca, d.veiculo?.modelo, d.veiculo?.ano].filter(Boolean).join(' '),
      telefone: tel.length > 6 ? `${tel.slice(0, tel.startsWith('+') ? 5 : 2)}••••${tel.slice(-2)}` : null,
      fotos: (p.fotos || []).length, expiraEm: new Date(expira).toISOString(),
    });
  }

  if (acao === 'cancelar') {
    await apagarPendente(p);
    await contarEtapa(doLembrete ? 'pedido_lembrete' : `pedido_${p.origem}`, 'cancelado');
    return NextResponse.json({ ok: true });
  }

  // confirmar: reserva (dois cliques ao mesmo tempo criam um pedido so)
  const { data: reservado } = await supabaseAdmin.from('pedidos_pendentes').delete().eq('id', id).select('id');
  if (!reservado?.length) return invalido;
  try {
    const r = await ativarEPublicar(p, 'link');
    if ('erro' in r) {
      return r.erro === 'SEM_ACESSO'
        ? NextResponse.json({ error: 'Sem acesso', codigo: 'SEM_ACESSO' }, { status: 403 })
        : NextResponse.json({ error: 'Avaliação pendente', codigo: 'AVALIACAO_PENDENTE' }, { status: 409 });
    }
    if (doLembrete) await contarEtapa('pedido_lembrete', 'confirmado');
    // o clique no link prova o e-mail: entra na conta (nova ou antiga, dono 12/11)
    const login = await loginPorToken(p.user_id);
    return NextResponse.json({ solicitacaoId: r.id, numero: r.numero, ...login });
  } catch (e) {
    await supabaseAdmin.from('pedidos_pendentes').insert(p).then(() => {}, () => {});
    console.error('[pedido-sem-conta/retomar]', e);
    return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  }
}
