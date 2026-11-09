import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { ehUuid } from '@/lib/validacao';
import { motivoValido, dataValida } from '@/lib/agenda-oficina';
import { proporMudanca } from '@/lib/mudanca-data';

export const dynamic = 'force-dynamic';

// "Mudar data" na agenda da oficina, antes do check-in. Mesmo fluxo do orcamento
// (migracao 077): "pedir ao cliente" (pendente ate ele responder) ou "ja combinei com o
// cliente" (vale na hora; ele pode dizer "nao combinei isso"). Mesmo dia so combinado.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const motivo = motivoValido(b?.motivo);
  if (!ehUuid(params.id) || !dataValida(b?.data) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b?.hora || '')) {
    return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  }
  const r = await proporMudanca({ userId, agendaId: params.id, data: b.data, hora: b.hora, motivo, dataAtualServe: b?.dataAtualServe !== false, combinado: b?.combinado === true });
  return NextResponse.json(r.body, { status: r.status });
}
