import * as WebBrowser from 'expo-web-browser';
import { SITE_URL } from './api';

// Pagina publica da oficina no site (avaliacoes, endereco, mapa), no idioma do
// app, ja no endereco atual /{pais}/{idioma}/{pagina} (ver PATHNAMES em
// apps/web/src/i18n/routing.ts) - antes /it/oficinas/... dependia de redirecionamento.
const CAMINHO: Record<string, string> = {
  pt: '/br/pt/oficinas', 'pt-PT': '/pt/pt/oficinas', en: '/ee/en/repair-shops',
  et: '/ee/et/tookojad', it: '/it/it/officine', ru: '/ee/ru/avtoservisy',
};

export function abrirOficina(oficinaId: string, idioma: string) {
  return WebBrowser.openBrowserAsync(`${SITE_URL}${CAMINHO[idioma] || CAMINHO.en}/${oficinaId}`);
}
