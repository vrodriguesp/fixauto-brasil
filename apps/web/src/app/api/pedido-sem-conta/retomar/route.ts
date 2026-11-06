import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { limitarPorIp } from '@/lib/rate-limit';
import { ehUuid } from '@/lib/validacao';
import { iguaisSeguro } from '@/lib/segredos';
import { PENDENTE_HORAS, hashRetomar, apagarPendente, ativarEPublicar, contarEtapa } from '@/lib/pedido-sem-conta';

export const dynamic = 'force-dynamic';

// Link do e-mail de lembrete (dono 06/11; lib/pedido-sem-conta.ts): quem nao
// digitou o codigo volta por aqui e confirma (o link de uso unico prova o e-mail)
// ou cancela o pedido. So acontece com o clique na pagina (POST), nunca ao abrir o
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
  const invalido = NextResponse.json({ error: 'Link inválido', codigo: 'CODIGO_EXPIRADO' }, { status: 410 });
  if (!ehUuid(id) || !/^[a-f0-9]{64}$/.test(token) || !['ver', 'confirmar', 'cancelar'].includes(acao)) return invalido;

  const { data: p } = await supabaseAdmin.from('pedidos_pendentes').select('*').eq('id', id).maybeSingle();
  if (!p || !p.retomar_hash || !iguaisSeguro(hashRetomar(token), p.retomar_hash)) return invalido;
  const expira = new Date(p.created_at).getTime() + PENDENTE_HORAS * 3600 * 1000;
  if (Date.now() > expira) {
    await apagarPendente(p);
    return invalido;
  }

  if (acao === 'ver') {
    const d = p.dados || {};
    return NextResponse.json({
      tipo: d.tipo, descricao: d.descricao, endereco: d.endereco,
      carro: [d.veiculo?.marca, d.veiculo?.modelo, d.veiculo?.ano].filter(Boolean).join(' '),
      fotos: (p.fotos || []).length, expiraEm: new Date(expira).toISOString(),
    });
  }

  if (acao === 'cancelar') {
    await apagarPendente(p);
    await contarEtapa('pedido_lembrete', 'cancelado');
    return NextResponse.json({ ok: true });
  }

  // confirmar: reserva (dois cliques ao mesmo tempo criam um pedido so)
  const { data: reservado } = await supabaseAdmin.from('pedidos_pendentes').delete().eq('id', id).select('id');
  if (!reservado?.length) return invalido;
  try {
    const r = await ativarEPublicar(p);
    if ('erro' in r) {
      return r.erro === 'SEM_ACESSO'
        ? NextResponse.json({ error: 'Sem acesso', codigo: 'SEM_ACESSO' }, { status: 403 })
        : NextResponse.json({ error: 'Avaliação pendente', codigo: 'AVALIACAO_PENDENTE' }, { status: 409 });
    }
    await contarEtapa('pedido_lembrete', 'confirmado');
    // login de uso unico (o mesmo tipo de link do e-mail de confirmacao do cadastro)
    const { data: link } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: p.email });
    return NextResponse.json({ solicitacaoId: r.id, numero: r.numero, tokenHash: link?.properties?.hashed_token || null });
  } catch (e) {
    await supabaseAdmin.from('pedidos_pendentes').insert(p).then(() => {}, () => {});
    console.error('[pedido-sem-conta/retomar]', e);
    return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  }
}
