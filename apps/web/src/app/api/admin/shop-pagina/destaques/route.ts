import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { limparConteudo, resolverDestaques } from '@/lib/shop-pagina';

export const dynamic = 'force-dynamic';

// Pecas lote 5: previa do editor - resolve os destaques do rascunho como o Shop resolveria (ativos, nao ocultos,
// visiveis no Shop, loja ativa), sem o filtro de pais/paridade. Os que sumiram voltam em `fora` (B7: riscados no editor).
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const corpo = await req.json().catch(() => ({}));
  const { destaques } = limparConteudo({ destaques: corpo.destaques });
  const itens = await resolverDestaques(destaques, null);
  const vivos = new Set(itens.map((i) => `${i.tipo}:${i.id}`));
  return NextResponse.json({ itens, fora: destaques.filter((d) => !vivos.has(`${d.tipo}:${d.id}`)) }, { headers: { 'Cache-Control': 'no-store' } });
}
