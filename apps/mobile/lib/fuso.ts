// Fuso da OFICINA (pelo pais), igual ao apps/web/src/lib/fuso.ts: a hora do
// agendamento e a da oficina, nao a do aparelho (cliente de fora de Tallinn ou
// com o telefone em outro fuso via 07:00 em vez de 08:00 - teste 07/11).
const FUSO_DO_PAIS: Record<string, string> = {
  EE: 'Europe/Tallinn', BR: 'America/Sao_Paulo', PT: 'Europe/Lisbon', IT: 'Europe/Rome',
  LV: 'Europe/Riga', LT: 'Europe/Vilnius', FI: 'Europe/Helsinki',
};

export const fusoDoPais = (pais?: string | null) => FUSO_DO_PAIS[(pais || '').toUpperCase()] || 'Europe/Tallinn';

/** instante -> 'AAAA-MM-DD' no fuso da oficina (igual ao site) */
export function diaNaOficina(instante: Date, pais?: string | null): string {
  return instante.toLocaleDateString('en-CA', { timeZone: fusoDoPais(pais) });
}

/** instante -> minutos desde a meia-noite no fuso da oficina (0..1439) */
export function minutoNaOficina(instante: Date, pais?: string | null): number {
  const hm = instante.toLocaleTimeString('en-GB', { timeZone: fusoDoPais(pais), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
  return ((h % 24) * 60) + (m || 0);
}
