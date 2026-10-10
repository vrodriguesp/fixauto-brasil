import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import pt from './locales/pt.json';
import en from './locales/en.json';
import et from './locales/et.json';
import it from './locales/it.json';
import ptPT from './locales/pt-PT.json';
import ru from './locales/ru.json';

const SUPPORTED = ['pt', 'pt-PT', 'en', 'et', 'it', 'ru'] as const;
export type SupportedLocale = (typeof SUPPORTED)[number];

// Portugues de Portugal pela regiao do aparelho; idioma sem versao -> ingles
// (antes caia no portugues do Brasil, inclusive para quem usa russo).
function detectDeviceLocale(): SupportedLocale {
  const l = Localization.getLocales()[0];
  const idioma = l?.languageCode || '';
  // idioma escolhido so para o app nos Ajustes vem na etiqueta (pt-PT), nao na regiao do aparelho
  if (idioma === 'pt') return /^pt-PT/i.test(l?.languageTag || '') || l?.regionCode === 'PT' ? 'pt-PT' : 'pt';
  return (SUPPORTED as readonly string[]).includes(idioma) ? (idioma as SupportedLocale) : 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    pt: { translation: pt },
    en: { translation: en },
    et: { translation: et },
    it: { translation: it },
    'pt-PT': { translation: ptPT },
    ru: { translation: ru },
  },
  lng: detectDeviceLocale(),
  fallbackLng: 'en',
  // i18next por padrao interpola com chave DUPLA ({{variavel}}), mas todos
  // os textos em locales/*.json foram escritos com chave SIMPLES
  // ({variavel} - mesma convencao usada no site e no lib/notif-i18n.ts) -
  // sem isso, toda string com variavel (ex: "Ola, {nome}") aparecia
  // literal na tela, sem nunca substituir pelo valor de verdade. Achado
  // testando o app de verdade (nao so tsc), corrigido configurando o
  // interpolador pra chave simples em vez de reescrever ~50 chaves de
  // traducao.
  interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
});

export default i18n;
