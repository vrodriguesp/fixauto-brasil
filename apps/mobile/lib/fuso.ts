// Fuso da OFICINA (pelo pais), igual ao apps/web/src/lib/fuso.ts: a hora do
// agendamento e a da oficina, nao a do aparelho (cliente de fora de Tallinn ou
// com o telefone em outro fuso via 07:00 em vez de 08:00 - teste 07/11).
const FUSO_DO_PAIS: Record<string, string> = {
  EE: 'Europe/Tallinn', BR: 'America/Sao_Paulo', PT: 'Europe/Lisbon', IT: 'Europe/Rome',
  LV: 'Europe/Riga', LT: 'Europe/Vilnius', FI: 'Europe/Helsinki',
};

export const fusoDoPais = (pais?: string | null) => FUSO_DO_PAIS[(pais || '').toUpperCase()] || 'Europe/Tallinn';
