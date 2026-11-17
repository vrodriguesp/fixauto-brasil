import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { pecasV3Ativo } from '@/lib/pecas-v3';

export const dynamic = 'force-dynamic';

// Lote 1 de pecas (17/11): a tela nova vale para esta sessao? (interruptor global OU
// conta de teste). As telas de pecas sao do navegador e perguntam aqui antes de desenhar.
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  return NextResponse.json({ ativo: await pecasV3Ativo(userId) }, { headers: { 'Cache-Control': 'no-store' } });
}
