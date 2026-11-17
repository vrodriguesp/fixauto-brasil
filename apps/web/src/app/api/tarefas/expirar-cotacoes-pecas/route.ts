import { NextRequest, NextResponse } from 'next/server';
import { iguaisSeguro } from '@/lib/segredos';
import { expirarCotacoesPecas } from '@/lib/expirar-cotacoes-pecas';

export const dynamic = 'force-dynamic';

// Cotacao de peca vencida (7 dias) -> 'expirada' + aviso a compradora (lib/expirar-cotacoes-pecas.ts).
// Chamada de hora em hora pelo agendador do servidor (crontab, /root/expirar-cotacoes-pecas.sh),
// com a chave TAREFAS_CHAVE. So mexe onde o interruptor do lote 1 de pecas vale.
export async function POST(req: NextRequest) {
  const chave = process.env.TAREFAS_CHAVE;
  if (!chave || !iguaisSeguro(req.headers.get('x-tarefa-chave') || '', chave)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...(await expirarCotacoesPecas()) });
  } catch (err) {
    console.error('[expirar-cotacoes-pecas]', (err as Error).message);
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}
