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
  // check-in v2: a oficina escolhe dia + faixa no mesmo seletor do orcamento (hora_inicio/hora_fim, minimo 30 min);
  // so turno (tela antiga) continua valendo: o servidor usa a 1a faixa do perfil nesse turno
  const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
  const hi = typeof b?.hora_inicio === 'string' ? b.hora_inicio.slice(0, 5) : null, hf = typeof b?.hora_fim === 'string' ? b.hora_fim.slice(0, 5) : null;
  const comJanela = !!(hi || hf);
  const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  if (!ehUuid(b?.orcamentoId) || !dataValida(data) || (previsao && !dataValida(previsao))
    || (comJanela ? !(hi && hf && HORA.test(hi) && HORA.test(hf) && minutos(hf) - minutos(hi) >= 30) : !['manha', 'tarde'].includes(turno))) {
    return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  }
  // previsao antes da nova chegada: erro proprio (antes caia no "confira os dados" generico - dono 08/11)
  if (previsao && previsao < data) return NextResponse.json({ error: 'Previsão antes da chegada', codigo: 'PREVISAO_ANTES_DA_DATA' }, { status: 400 });
  const r = await proporMudanca({ userId, orcamentoId: b.orcamentoId, data, turno: comJanela ? null : turno, hora: comJanela ? hi : null, horaFim: comJanela ? hf : null, previsao, motivo, dataAtualServe: b?.dataAtualServe !== false, combinado: b?.combinado === true });
  return NextResponse.json(r.body, { status: r.status });
}
