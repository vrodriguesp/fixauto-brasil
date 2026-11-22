import { NextRequest, NextResponse } from 'next/server';
import { iguaisSeguro } from '@/lib/segredos';
import { limparPendentes, enviarLembretes } from '@/lib/pedido-sem-conta';
import { lembretesMudanca } from '@/lib/mudanca-data';
import { tarefasPedidoDatas } from '@/lib/pedido-datas';
import { limparLinksAcesso } from '@/lib/link-acesso';
import { limparCodigosLogin } from '@/lib/codigo-login';
import { lembrarClientes } from '@/lib/lembrar-clientes';

export const dynamic = 'force-dynamic';

// Pedido sem cadastro nao confirmado ha mais de 24 h: apaga pedido, fotos e a
// conta nao ativada (migracao 073; politica de privacidade). Chamada de hora em
// hora pelo agendador do servidor (crontab), com a chave TAREFAS_CHAVE. Na mesma
// passada vai o lembrete unico de quem nao confirmou ha 2 h (link para confirmar/cancelar) e os
// lembretes ao motorista (115, lib/lembrar-clientes.ts).
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
    // lembretes ao motorista (115): ainda nao decidiu / vencem / venceram / vespera do check-in.
    // { agora } no corpo (hora simulada) so vale com TAREFAS_SIMULAR_HORA=1 (so no .env do teste local);
    // as outras tarefas desta rota seguem com a hora real.
    let agora = Date.now();
    if (process.env.TAREFAS_SIMULAR_HORA === '1') {
      const corpo = await req.json().catch(() => ({}));
      const t = typeof corpo?.agora === 'string' ? Date.parse(corpo.agora) : NaN;
      if (Number.isFinite(t)) agora = t;
    }
    const clientes = await lembrarClientes(agora).catch((e) => { console.error('[limpar-pendentes] lembretes clientes', (e as Error).message); return { erro: true }; });
    // links de acesso dos e-mails e codigos de login vencidos (080)
    await limparLinksAcesso();
    await limparCodigosLogin();
    return NextResponse.json({ ok: true, apagados, lembretes, mudancas, novasDatas, clientes });
  } catch (err) {
    console.error('[limpar-pendentes]', (err as Error).message);
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}
