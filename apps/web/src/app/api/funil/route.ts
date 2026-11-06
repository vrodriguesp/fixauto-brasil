import { NextRequest, NextResponse } from 'next/server';
import { limitarPorIp } from '@/lib/rate-limit';
import { contarEtapa } from '@/lib/pedido-sem-conta';

export const dynamic = 'force-dynamic';

// Passos do pedido (onde as pessoas desistem): so soma 1 no contador do dia.
// Sem IP guardado, sem cookie, sem dado pessoal (migracao 073).
const FUNIS = ['pedido_site', 'pedido_app'];
const ETAPAS = ['abriu', 'servico', 'detalhe', 'carro', 'local', 'contato'];

export async function POST(req: NextRequest) {
  if (!limitarPorIp(req, 'funil', 60, 60 * 60 * 1000)) return NextResponse.json({ ok: true });
  const b = await req.json().catch(() => ({}));
  if (FUNIS.includes(b?.funil) && ETAPAS.includes(b?.etapa)) await contarEtapa(b.funil, b.etapa);
  return NextResponse.json({ ok: true });
}
