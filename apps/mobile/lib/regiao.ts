import * as Localization from 'expo-localization';

// Regras do pos-acidente (numero de emergencia, formulario amigavel, seguro)
// sao do PAIS onde a batida aconteceu, nao do idioma (antes: italiano -> regras
// da Estonia). Pais vem da localizacao do acidente; sem ela, da regiao do
// aparelho; por ultimo, do idioma. Pais sem regras proprias: conselho generico.
// Mesma regra do site (apps/web/src/lib/seguro-reparo.ts).
export type RegiaoSeguro = 'br' | 'ee' | 'it' | 'pt' | 'geral';
const POR_PAIS: Record<string, RegiaoSeguro> = { BR: 'br', EE: 'ee', IT: 'it', PT: 'pt' };
const POR_IDIOMA: Record<string, RegiaoSeguro> = { pt: 'br', 'pt-PT': 'pt', et: 'ee', it: 'it' };

export function regiaoSeguro(idioma: string, paisAcidente?: string | null): RegiaoSeguro {
  if (paisAcidente) return POR_PAIS[paisAcidente.toUpperCase()] || 'geral';
  const doAparelho = Localization.getLocales()[0]?.regionCode;
  if (doAparelho && POR_PAIS[doAparelho.toUpperCase()]) return POR_PAIS[doAparelho.toUpperCase()];
  return POR_IDIOMA[idioma] || 'geral';
}
