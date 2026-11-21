// 114 (dono 21/11): "Quando voce pode levar o carro?" - pergunta OPCIONAL depois do envio do pedido.
// Guardada em solicitacoes.preferencia_horario; a oficina ve no pedido e ao lado do seletor de datas do
// orcamento. Nunca trava nem atrasa o pedido (ele ja foi gravado quando a pergunta aparece).
//   { v: 1, dias: [1..6] (1 = segunda ... 6 = sabado), partes: ['manha' | 'tarde'], opcao: 'qualquer' | 'urgente' | null }
//   - 'qualquer' = qualquer dia util; 'urgente' = o quanto antes; dias/partes vazios = sem preferencia nesse eixo.
export type PreferenciaHorario = { v: 1; dias: number[]; partes: ('manha' | 'tarde')[]; opcao: 'qualquer' | 'urgente' | null };

const PARTES = ['manha', 'tarde'] as const;

/** null = formato invalido; objeto vazio (sem dias, partes nem opcao) tambem e invalido (use DELETE/limpar) */
export function validarPreferencia(bruto: unknown): PreferenciaHorario | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const b = bruto as Record<string, unknown>;
  const d = Array.isArray(b.dias) ? b.dias : [];
  const p = Array.isArray(b.partes) ? b.partes : [];
  if (d.length > 6 || p.length > 2) return null;
  const dias = Array.from(new Set(d.map(Number))).filter((x) => Number.isInteger(x) && x >= 1 && x <= 6).sort((a, b2) => a - b2);
  if (dias.length !== d.length) return null;
  const partes = Array.from(new Set(p.map(String))).filter((x): x is 'manha' | 'tarde' => (PARTES as readonly string[]).includes(x));
  if (partes.length !== p.length) return null;
  const opcao = b.opcao == null || b.opcao === '' ? null : b.opcao === 'qualquer' || b.opcao === 'urgente' ? b.opcao : undefined;
  if (opcao === undefined) return null;
  if (!dias.length && !partes.length && !opcao) return null;
  // "qualquer dia util" dispensa a lista de dias; as partes continuam valendo
  return { v: 1, dias: opcao === 'qualquer' ? [] : dias, partes: partes.length === 2 ? [] : partes, opcao };
}

export const ehPreferencia = (x: unknown): x is PreferenciaHorario => !!x && typeof x === 'object' && Array.isArray((x as any).dias);

/** dias preferidos como dia da semana do JS (0 = domingo ... 6 = sabado) - para realcar o calendario */
export function diasSemanaPreferidos(p: PreferenciaHorario | null | undefined): number[] {
  if (!p) return [];
  if (p.opcao === 'qualquer' && !p.dias.length) return [1, 2, 3, 4, 5];
  return p.dias.slice();
}

/** a data (AAAA-MM-DD) cai num dia preferido? (sem preferencia de dias = qualquer dia serve) */
export function diaCombinaComPreferencia(ymd: string, p: PreferenciaHorario | null | undefined): boolean {
  const dias = diasSemanaPreferidos(p);
  if (!dias.length) return true;
  return dias.includes(new Date(`${ymd}T12:00:00Z`).getUTCDay());
}
