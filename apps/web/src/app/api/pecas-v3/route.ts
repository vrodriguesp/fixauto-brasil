import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { pecasV3Ativo } from '@/lib/pecas-v3';
import { botaoPedirPecaAtivo } from '@/lib/pecas-botao-pedido';

export const dynamic = 'force-dynamic';

// Lote 1 de pecas (17/11): a tela nova vale para esta sessao? (interruptor global OU
// conta de teste). As telas de pecas sao do navegador e perguntam aqui antes de desenhar.
// 21/11 (113): ?botao=1 devolve tambem botaoPedido - o botao "Pedir peca" do pedido do motorista
// (lib/pecas-botao-pedido.ts). Sem o parametro a resposta e a de sempre ({ ativo }).
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const ativo = await pecasV3Ativo(userId);
  if (req.nextUrl.searchParams.get('botao') === '1') {
    const botaoPedido = await botaoPedirPecaAtivo(userId, ativo).catch(() => false);
    return NextResponse.json({ ativo, botaoPedido }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ ativo }, { headers: { 'Cache-Control': 'no-store' } });
}
