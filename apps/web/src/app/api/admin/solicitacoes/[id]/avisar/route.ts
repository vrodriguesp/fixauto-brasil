import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehUuid } from '@/lib/validacao';
import { TETO_AVISO_ADMIN, carregarPedido, destinatariosDoPedido, enviarAvisoNovoPedido, type PedidoAviso } from '@/lib/avisar-oficinas-pedido';
import { STATUS_TRIAGEM, mesmoConjunto, umDeCadaVez } from '@/lib/triagem-pedido';

export const dynamic = 'force-dynamic';

// Triagem (Lote 2): avisar as oficinas do tipo (novo) do pedido. GET = "Ver quem seria avisado" (so leitura);
// POST = "Confirmar e avisar N". Os dois usam destinatariosDoPedido - a MESMA funcao do aviso automatico - e o
// mesmo teto: no maximo TETO_AVISO_ADMIN (50) oficinas, as mais proximas primeiro (decisao do dono 15/11).
// O POST recebe a lista que o admin viu (`esperados`) e devolve 409, sem enviar nada, se ela mudou.
// Quem ja recebeu este pedido (aviso, orcamento, "sem interesse", convite) nunca recebe de novo.

function bloqueio(sol: PedidoAviso): string | null {
  if (sol.emergencia_id) return 'Pedido de acidente: os avisos são do fluxo do acidente.';
  if (!STATUS_TRIAGEM.includes(sol.status)) return 'Só um pedido aberto ou em orçamento recebe aviso novo.';
  if (sol.latitude == null || sol.longitude == null) return 'O pedido não tem localização: não há como saber quem está na área.';
  return null;
}

async function calcular(sol: PedidoAviso) {
  const { alvo, jaReceberam } = await destinatariosDoPedido(sol);
  const seriam = alvo.slice(0, TETO_AVISO_ADMIN);
  return {
    alvo: seriam,
    resposta: {
      tipo: sol.tipo,
      teto: TETO_AVISO_ADMIN,
      total: alvo.length,
      foraDoTeto: Math.max(0, alvo.length - TETO_AVISO_ADMIN),
      seriam: seriam.map((o) => ({ oficina_id: o.oficina_id, profile_id: o.profile_id, nome: o.nome, cidade: o.cidade, especialidades: o.especialidades, km: o.km == null ? null : Math.round(o.km * 10) / 10, idioma: o.idioma, conta_teste: o.conta_teste })),
      jaReceberam: jaReceberam.map((j) => ({ oficina_id: j.oficina_id, nome: j.nome, motivo: j.motivo, motivos: j.motivos })),
    },
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  if (!ehUuid(params.id)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  const sol = await carregarPedido(params.id);
  if (!sol) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });
  const motivo = bloqueio(sol);
  if (motivo) return NextResponse.json({ tipo: sol.tipo, bloqueado: motivo, teto: TETO_AVISO_ADMIN, total: 0, foraDoTeto: 0, seriam: [], jaReceberam: [] });
  return NextResponse.json((await calcular(sol)).resposta);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  if (!ehUuid(params.id)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const esperados = b?.esperados;
  if (!Array.isArray(esperados) || esperados.length > TETO_AVISO_ADMIN || !esperados.every(ehUuid)) {
    return NextResponse.json({ error: `esperados: lista de até ${TETO_AVISO_ADMIN} oficinas` }, { status: 400 });
  }

  // um envio por pedido de cada vez (a mesma trava do convite: os dois avisam oficinas deste pedido)
  return umDeCadaVez(`envio:${params.id}`, async () => {
    const sol = await carregarPedido(params.id);
    if (!sol) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });
    const motivo = bloqueio(sol);
    if (motivo) return NextResponse.json({ error: motivo }, { status: 409 });

    const { alvo, resposta } = await calcular(sol);
    // preview = envio: se a lista mudou desde o "Ver quem seria avisado", nada sai
    if (!mesmoConjunto(esperados, alvo.map((o) => o.oficina_id))) {
      return NextResponse.json({ error: 'A lista mudou desde que você viu. Veja de novo antes de confirmar.', ...resposta }, { status: 409 });
    }
    if (!alvo.length) return NextResponse.json({ avisadas: 0, oficinas: [], foraDoTeto: resposta.foraDoTeto });

    const { inseridas, erro } = await enviarAvisoNovoPedido(sol, alvo);
    if (erro) return NextResponse.json({ error: `Os avisos não foram gravados: ${erro}` }, { status: 500 });
    await registrarAuditoria(supabaseAdmin, {
      adminId: auth.userId, entidade: 'solicitacao', entidadeId: sol.id, acao: 'avisar_tipo_novo',
      depois: { tipo: sol.tipo, oficinas: alvo.map((o) => o.oficina_id), profiles: alvo.map((o) => o.profile_id), fora_do_teto: resposta.foraDoTeto },
      solicitacaoId: sol.id,
    });
    return NextResponse.json({ avisadas: inseridas, oficinas: alvo.map((o) => ({ oficina_id: o.oficina_id, nome: o.nome })), foraDoTeto: resposta.foraDoTeto });
  });
}
