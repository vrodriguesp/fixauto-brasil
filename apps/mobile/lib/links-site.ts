import * as WebBrowser from 'expo-web-browser';
import { SITE_URL } from './api';

// Paginas do painel da oficina no site, no mercado/idioma do app (prefixo /{pais}/{idioma} de
// apps/web/src/i18n/routing.ts LOCALE_PREFIX; as rotas /oficina/* nao sao traduzidas). Auditoria 27/11 (M3):
// "use o site" sem link era um beco sem saida - agora e um botao "Abrir no site".
const PREFIXO: Record<string, string> = { pt: '/br/pt', 'pt-PT': '/pt/pt', en: '/ee/en', et: '/ee/et', it: '/it/it', ru: '/ee/ru' };

export function urlDoSite(idioma: string, caminho: string): string {
  return `${SITE_URL}${PREFIXO[idioma] || PREFIXO.en}${caminho}`;
}
export const urlPedidoNoSite = (idioma: string, solicitacaoId: string) => urlDoSite(idioma, `/oficina/pedidos/${solicitacaoId}`);
export const urlOrcamentoNoSite = (idioma: string, solicitacaoId: string) => urlDoSite(idioma, `/oficina/orcamento/${solicitacaoId}`);
export const urlPerfilNoSite = (idioma: string) => urlDoSite(idioma, '/oficina/perfil');

/** abre no navegador do sistema (Custom Tab / Safari View); nunca lanca */
export function abrirNoSite(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => {});
}
