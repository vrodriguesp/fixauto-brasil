import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { ehUuid } from '@/lib/validacao';
import { dataValida } from '@/lib/agenda-oficina';
import { proporMudanca } from '@/lib/mudanca-data';

export const dynamic = 'force-dynamic';

// A oficina muda a data de entrega pelo orcamento aceito, antes do check-in. Fluxo
// unificado (migracao 077, lib/mudanca-data.ts): "pedir ao cliente" ou "ja combinei";
// diz se a data atual ainda serve; no mesmo dia so com "ja combinei".
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!dentroDoLimite(`revisao:${userId}`, 20, 60 * 60 * 1000)) return NextResponse.json({ error: 'Muitas requisições', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const motivo = typeof b?.motivo === 'string' ? b.motivo.trim().slice(0, 1000) : '';
  const data = String(b?.data || ''), turno = b?.turno, previsao = b?.previsao ? String(b.previsao) : null;
  if (!ehUuid(b?.orcamentoId) || !dataValida(data) || !['manha', 'tarde'].includes(turno) || (previsao && !dataValida(previsao))) {
    return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  }
  // previsao antes da nova chegada: erro proprio (antes caia no "confira os dados" generico - dono 08/11)
  if (previsao && previsao < data) return NextResponse.json({ error: 'Previsão antes da chegada', codigo: 'PREVISAO_ANTES_DA_DATA' }, { status: 400 });
  const r = await proporMudanca({ userId, orcamentoId: b.orcamentoId, data, turno, previsao, motivo, dataAtualServe: b?.dataAtualServe !== false, combinado: b?.combinado === true });
  return NextResponse.json(r.body, { status: r.status });
}
