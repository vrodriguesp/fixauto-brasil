import * as Localization from 'expo-localization';

// Regras do pos-acidente (numero de emergencia, formulario amigavel, seguro)
// sao do PAIS onde a batida aconteceu, NUNCA do idioma (W3C: idioma e
// localizacao sao coisas diferentes). Pais vem da localizacao do acidente;
// sem ela, da regiao do aparelho. Pais sem regras proprias: conselho generico.
// Mesma regra do site (apps/web/src/lib/seguro-reparo.ts).
export type RegiaoSeguro = 'br' | 'ee' | 'it' | 'pt' | 'geral';
const POR_PAIS: Record<string, RegiaoSeguro> = { BR: 'br', EE: 'ee', IT: 'it', PT: 'pt' };

/** Pais do acidente: localizacao; sem ela, a regiao do aparelho. */
export function paisDoAcidente(paisAcidente?: string | null): string | null {
  return (paisAcidente || Localization.getLocales()[0]?.regionCode || '').toUpperCase() || null;
}

export function regiaoSeguro(paisAcidente?: string | null): RegiaoSeguro {
  const p = paisDoAcidente(paisAcidente);
  return (p && POR_PAIS[p]) || 'geral';
}

// paises com lista de seguradoras para o "seguro de outro pais" (carta verde)
export const PAISES_SEGURO = ['EE', 'LV', 'LT', 'FI', 'IT', 'PT', 'BR'];

// nomes dos paises (Intl.DisplayNames nem sempre existe no motor do celular)
const NOMES: Record<string, Record<string, string>> = {
  EE: { pt: 'Estônia', 'pt-PT': 'Estónia', en: 'Estonia', et: 'Eesti', it: 'Estonia', ru: 'Эстония' },
  LV: { pt: 'Letônia', 'pt-PT': 'Letónia', en: 'Latvia', et: 'Läti', it: 'Lettonia', ru: 'Латвия' },
  LT: { pt: 'Lituânia', 'pt-PT': 'Lituânia', en: 'Lithuania', et: 'Leedu', it: 'Lituania', ru: 'Литва' },
  FI: { pt: 'Finlândia', 'pt-PT': 'Finlândia', en: 'Finland', et: 'Soome', it: 'Finlandia', ru: 'Финляндия' },
  IT: { pt: 'Itália', 'pt-PT': 'Itália', en: 'Italy', et: 'Itaalia', it: 'Italia', ru: 'Италия' },
  PT: { pt: 'Portugal', 'pt-PT': 'Portugal', en: 'Portugal', et: 'Portugal', it: 'Portogallo', ru: 'Португалия' },
  BR: { pt: 'Brasil', 'pt-PT': 'Brasil', en: 'Brazil', et: 'Brasiilia', it: 'Brasile', ru: 'Бразилия' },
};
export const nomeDoPais = (codigo: string, idioma: string) => NOMES[codigo]?.[idioma] || NOMES[codigo]?.en || codigo;
