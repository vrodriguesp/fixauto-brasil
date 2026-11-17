import { NextRequest, NextResponse } from 'next/server';
import { iguaisSeguro } from '@/lib/segredos';
import { resumoCotacoesPecas } from '@/lib/resumo-cotacoes-pecas';

export const dynamic = 'force-dynamic';

// Resumo de e-mail das cotacoes de pecas da fila (lib/resumo-cotacoes-pecas.ts). Chamada de
// hora em hora pelo agendador do servidor (crontab em UTC, /root/resumo-cotacoes-pecas.sh), com
// a chave TAREFAS_CHAVE; so age nos slots de Tallinn. { agora } no corpo (hora injetada) so vale
// com TAREFAS_SIMULAR_HORA=1, que existe apenas no .env do ambiente de teste local.
export async function POST(req: NextRequest) {
  const chave = process.env.TAREFAS_CHAVE;
  if (!chave || !iguaisSeguro(req.headers.get('x-tarefa-chave') || '', chave)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  try {
    let agora = Date.now();
    if (process.env.TAREFAS_SIMULAR_HORA === '1') {
      const corpo = await req.json().catch(() => ({}));
      const t = typeof corpo?.agora === 'string' ? Date.parse(corpo.agora) : NaN;
      if (Number.isFinite(t)) agora = t;
    }
    return NextResponse.json({ ok: true, ...(await resumoCotacoesPecas(agora)) });
  } catch (err) {
    console.error('[resumo-cotacoes-pecas]', (err as Error).message);
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}
