// Exemplos dos campos (placeholder) no formato de cada pais: a placa de
// exemplo em portugues ("ABC-1234") aparecia para oficinas da Estonia/Italia.
const PLACA: Record<string, string> = { pt: 'ABC1D23', 'pt-PT': 'AA-00-AA', en: '123 ABC', et: '123 ABC', it: 'AB 123 CD', ru: '123 ABC' };
export const exemploPlaca = (locale: string) => PLACA[locale] || '123 ABC';
export const EXEMPLO_EMAIL = 'nome@example.com';
export const exemploValor = (locale: string) => (0).toLocaleString(locale === 'pt' ? 'pt-BR' : locale, { minimumFractionDigits: 2 });
export const exemploVeiculo = (locale: string) => (locale === 'pt' ? { marca: 'Fiat', modelo: 'Argo' } : { marca: 'Toyota', modelo: 'Corolla' });
