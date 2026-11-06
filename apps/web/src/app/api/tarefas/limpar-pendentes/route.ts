import { NextRequest, NextResponse } from 'next/server';
import { iguaisSeguro } from '@/lib/segredos';
import { limparPendentes } from '@/lib/pedido-sem-conta';

export const dynamic = 'force-dynamic';

// Pedido sem cadastro nao confirmado ha mais de 24 h: apaga pedido, fotos e a
// conta nao ativada (migracao 073; politica de privacidade). Chamada de hora em
// hora pelo agendador do servidor (crontab), com a chave TAREFAS_CHAVE.
export async function POST(req: NextRequest) {
  const chave = process.env.TAREFAS_CHAVE;
  if (!chave || !iguaisSeguro(req.headers.get('x-tarefa-chave') || '', chave)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, apagados: await limparPendentes() });
  } catch (err) {
    console.error('[limpar-pendentes]', (err as Error).message);
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}
