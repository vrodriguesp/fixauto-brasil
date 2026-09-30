import { API_BASE_URL } from './api';

// Termos e Politica de Privacidade no site, no idioma do app (os nomes das
// paginas sao traduzidos - ver PATHNAMES em apps/web/src/i18n/routing.ts).
const TERMOS: Record<string, string> = {
  pt: '/pt-br/termos',
  'pt-PT': '/pt-pt/termos',
  en: '/en/terms',
  et: '/et/tingimused',
  it: '/it/termini',
  ru: '/ru/usloviya',
};
const PRIVACIDADE: Record<string, string> = {
  pt: '/pt-br/privacidade',
  'pt-PT': '/pt-pt/privacidade',
  en: '/en/privacy',
  et: '/et/privaatsus',
  it: '/it/privacy',
  ru: '/ru/konfidentsialnost',
};

export const urlTermos = (idioma: string) => `${API_BASE_URL}${TERMOS[idioma] || TERMOS.en}`;
export const urlPrivacidade = (idioma: string) => `${API_BASE_URL}${PRIVACIDADE[idioma] || PRIVACIDADE.en}`;
