import { NextRequest, NextResponse } from 'next/server';
import { iguaisSeguro } from '@/lib/segredos';
import { limparPendentes, enviarLembretes } from '@/lib/pedido-sem-conta';
import { lembretesMudanca } from '@/lib/mudanca-data';
import { tarefasPedidoDatas } from '@/lib/pedido-datas';

export const dynamic = 'force-dynamic';

// Pedido sem cadastro nao confirmado ha mais de 24 h: apaga pedido, fotos e a
// conta nao ativada (migracao 073; politica de privacidade). Chamada de hora em
// hora pelo agendador do servidor (crontab), com a chave TAREFAS_CHAVE. Na mesma
// passada vai o lembrete unico de quem nao confirmou ha 2 h (link para confirmar/cancelar).
export async function POST(req: NextRequest) {
  const chave = process.env.TAREFAS_CHAVE;
  if (!chave || !iguaisSeguro(req.headers.get('x-tarefa-chave') || '', chave)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  try {
    const apagados = await limparPendentes();
    const lembretes = await enviarLembretes();
    // mudanca de data sem resposta: lembrete ao cliente (24 h) e aviso na vespera (077)
    const mudancas = await lembretesMudanca();
    // pedido de novas datas (079): lembrete a oficina sem resposta em 24 h; pendentes sem sentido caem
    const novasDatas = await tarefasPedidoDatas();
    return NextResponse.json({ ok: true, apagados, lembretes, mudancas, novasDatas });
  } catch (err) {
    console.error('[limpar-pendentes]', (err as Error).message);
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}
