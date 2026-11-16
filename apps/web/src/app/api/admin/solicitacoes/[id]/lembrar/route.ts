import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { ehUuid } from '@/lib/validacao';
import { carregarPedido } from '@/lib/avisar-oficinas-pedido';
import { candidatosLembrete, enviarLembretes, ESTADOS_LEMBRETE } from '@/lib/lembrar-oficinas';
import { umDeCadaVez } from '@/lib/triagem-pedido';

export const dynamic = 'force-dynamic';

// Lembrete as oficinas que receberam este pedido e ainda nao responderam (dono 16/11;
// substitui "cobrar"). GET: previa (quem recebe, quem fica de fora e por que).
// POST { oficinaIds }: envia so a essas (subconjunto da previa; o admin desmarca quem
// foi contatado por fora). Regra e textos em lib/lembrar-oficinas.ts.
async function base(id: string) {
  if (!ehUuid(id)) return { erro: NextResponse.json({ error: 'Pedido inválido' }, { status: 400 }) };
  const sol = await carregarPedido(id);
  if (!sol) return { erro: NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 }) };
  if (!ESTADOS_LEMBRETE.includes(sol.status)) return { erro: NextResponse.json({ error: 'Pedido encerrado', codigo: 'PEDIDO_FECHADO' }, { status: 409 }) };
  return { sol };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const b = await base(params.id);
  if (b.erro) return b.erro;
  const c = await candidatosLembrete(b.sol);
  return NextResponse.json({
    numero: b.sol.numero,
    recebem: c.recebem.map((o) => ({ oficina_id: o.oficina_id, nome: o.nome, email: o.email, idioma: o.idioma, ultimoAviso: o.ultimoAviso })),
    ficamFora: c.ficamFora,
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const corpo = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(corpo?.oficinaIds) ? corpo.oficinaIds.filter((x: unknown) => typeof x === 'string') : [];
  if (!ids.length) return NextResponse.json({ error: 'Escolha ao menos uma oficina' }, { status: 400 });
  return umDeCadaVez(`lembrar:${params.id}`, async () => {
    const b = await base(params.id);
    if (b.erro) return b.erro;
    const c = await candidatosLembrete(b.sol);
    const permitidas = new Map(c.recebem.map((o) => [o.oficina_id, o]));
    const fora = ids.filter((id) => !permitidas.has(id));
    if (fora.length) return NextResponse.json({ error: 'Oficina fora da lista atual. Abra a prévia de novo.', codigo: 'FORA_DA_LISTA', oficinaIds: fora }, { status: 409 });
    const enviados = await enviarLembretes(ids.map((id) => ({ oficina: permitidas.get(id)!, pedidos: [b.sol] })), auth.userId);
    const ignorados = c.recebem.filter((o) => !ids.includes(o.oficina_id)).map((o) => ({ oficina_id: o.oficina_id, motivo: 'desmarcada' }));
    return NextResponse.json({ numero: b.sol.numero, enviados, ignorados });
  });
}
