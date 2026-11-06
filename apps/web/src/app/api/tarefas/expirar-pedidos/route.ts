import { NextRequest, NextResponse } from 'next/server';
import { iguaisSeguro } from '@/lib/segredos';
import { expirarPedidos } from '@/lib/expirar-pedidos';
import { limparPendentes } from '@/lib/pedido-sem-conta';

export const dynamic = 'force-dynamic';

// Pedido aberto ha 30 dias sem orcamento escolhido -> "expirada" (lib/expirar-pedidos.ts).
// Chamada 1x por dia pelo agendador do servidor (crontab), com a chave TAREFAS_CHAVE.
export async function POST(req: NextRequest) {
  const chave = process.env.TAREFAS_CHAVE;
  if (!chave || !iguaisSeguro(req.headers.get('x-tarefa-chave') || '', chave)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  try {
    // tambem apaga pedidos sem cadastro nao confirmados ha mais de 24 h (migracao 073)
    const pendentesApagados = await limparPendentes().catch((e) => { console.error('[limpar-pendentes]', e); return -1; });
    return NextResponse.json({ ok: true, ...(await expirarPedidos()), pendentesApagados });
  } catch (err) {
    console.error('[expirar-pedidos]', (err as Error).message);
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}
