// Fuso da OFICINA (pelo pais), igual ao apps/web/src/lib/fuso.ts: a hora do
// agendamento e a da oficina, nao a do aparelho (cliente de fora de Tallinn ou
// com o telefone em outro fuso via 07:00 em vez de 08:00 - teste 07/11).
const FUSO_DO_PAIS: Record<string, string> = {
  EE: 'Europe/Tallinn', BR: 'America/Sao_Paulo', PT: 'Europe/Lisbon', IT: 'Europe/Rome',
  LV: 'Europe/Riga', LT: 'Europe/Vilnius', FI: 'Europe/Helsinki',
};

export const fusoDoPais = (pais?: string | null) => FUSO_DO_PAIS[(pais || '').toUpperCase()] || 'Europe/Tallinn';

// Partes da data/hora no fuso da oficina. Sem `hourCycle` (auditoria Fable 079, M3: opcao nunca usada no app
// e incerta no Intl do Hermes): `hour12: false` e "24" normalizado para 0. Se o Intl falhar ou devolver algo
// inesperado, cai no relogio do aparelho (mesmo comportamento de antes, "sem pais").
function partesNoFuso(instante: Date, pais?: string | null): { ymd: string; min: number } {
  const p2 = (n: number) => String(n).padStart(2, '0');
  const doAparelho = () => ({ ymd: `${instante.getFullYear()}-${p2(instante.getMonth() + 1)}-${p2(instante.getDate())}`, min: instante.getHours() * 60 + instante.getMinutes() });
  try {
    const partes = new Intl.DateTimeFormat('en-US', { timeZone: fusoDoPais(pais), hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(instante);
    const v = (t: string) => partes.find((x) => x.type === t)?.value || '';
    const ano = v('year'), mes = v('month'), dia = v('day');
    const h = parseInt(v('hour'), 10) % 24, m = parseInt(v('minute'), 10);
    if (!/^\d{4}$/.test(ano) || !/^\d{2}$/.test(mes) || !/^\d{2}$/.test(dia) || !Number.isFinite(h) || !Number.isFinite(m)) return doAparelho();
    return { ymd: `${ano}-${mes}-${dia}`, min: h * 60 + m };
  } catch {
    return doAparelho();
  }
}

/** instante -> 'AAAA-MM-DD' no fuso da oficina (igual ao site) */
export function diaNaOficina(instante: Date, pais?: string | null): string {
  return partesNoFuso(instante, pais).ymd;
}

/** instante -> minutos desde a meia-noite no fuso da oficina (0..1439) */
export function minutoNaOficina(instante: Date, pais?: string | null): number {
  return partesNoFuso(instante, pais).min;
}
