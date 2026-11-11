import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { aceitarOrcamento } from '@/lib/aceitar-orcamento';

// O cliente aceita o orcamento e escolhe o horario. A logica fica em lib/aceitar-orcamento.ts
// (079: a oficina usa a mesma ao confirmar a data sugerida pelo cliente); respostas e codigos iguais.

export async function POST(req: NextRequest) {
  try {
    const callerId = await getSessionUserId(req);
    if (!callerId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { orcamentoId, slotId } = await req.json();

    if (!orcamentoId || !slotId) {
      return NextResponse.json({ error: 'Missing orcamentoId or slotId' }, { status: 400 });
    }

    const r = await aceitarOrcamento({ orcamentoId, slotId, clienteId: callerId });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    console.error('[aceitar-orcamento]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
