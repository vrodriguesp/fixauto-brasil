import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { candidatosGlobais, enviarLembretes } from '@/lib/lembrar-oficinas';
import { umDeCadaVez } from '@/lib/triagem-pedido';

export const dynamic = 'force-dynamic';

// "Lembretes de hoje" (dono 16/11): todos os pedidos abertos, agrupados por oficina -
// um e-mail por oficina com todos os pedidos que ela ainda nao respondeu.
// GET: previa. POST { oficinaIds }: envia as escolhidas (subconjunto da previa).
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { grupos, ficamFora } = await candidatosGlobais();
  return NextResponse.json({
    oficinas: grupos.map((g) => ({ oficina_id: g.oficina.oficina_id, nome: g.oficina.nome, email: g.oficina.email, pedidos: g.pedidos.map((p: { id: string; numero: number | null }) => ({ solicitacao_id: p.id, numero: p.numero })) })),
    ficamFora,
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const corpo = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(corpo?.oficinaIds) ? corpo.oficinaIds.filter((x: unknown) => typeof x === 'string') : [];
  if (!ids.length) return NextResponse.json({ error: 'Escolha ao menos uma oficina' }, { status: 400 });
  return umDeCadaVez('lembrar:global', async () => {
    const { grupos } = await candidatosGlobais();
    const permitidas = new Map(grupos.map((g) => [g.oficina.oficina_id, g]));
    const fora = ids.filter((id) => !permitidas.has(id));
    if (fora.length) return NextResponse.json({ error: 'Oficina fora da lista atual. Abra a prévia de novo.', codigo: 'FORA_DA_LISTA', oficinaIds: fora }, { status: 409 });
    const enviados = await enviarLembretes(ids.map((id) => permitidas.get(id)!), auth.userId);
    return NextResponse.json({ enviados });
  });
}
