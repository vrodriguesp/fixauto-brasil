import { API_BASE_URL } from './api';

// Termos e Politica de Privacidade no site, na versao (pais/idioma) do idioma
// do app. Os nomes das paginas sao traduzidos e o prefixo e /{pais}/{idioma} -
// ver LOCALE_PREFIX e PATHNAMES em apps/web/src/i18n/routing.ts.
const TERMOS: Record<string, string> = {
  pt: '/br/pt/termos',
  'pt-PT': '/pt/pt/termos',
  en: '/ee/en/terms',
  et: '/ee/et/tingimused',
  it: '/it/it/termini',
  ru: '/ee/ru/usloviya',
};
const PRIVACIDADE: Record<string, string> = {
  pt: '/br/pt/privacidade',
  'pt-PT': '/pt/pt/privacidade',
  en: '/ee/en/privacy',
  et: '/ee/et/privaatsus',
  it: '/it/it/privacy',
  ru: '/ee/ru/konfidentsialnost',
};

export const urlTermos = (idioma: string) => `${API_BASE_URL}${TERMOS[idioma] || TERMOS.en}`;
export const urlPrivacidade = (idioma: string) => `${API_BASE_URL}${PRIVACIDADE[idioma] || PRIVACIDADE.en}`;
