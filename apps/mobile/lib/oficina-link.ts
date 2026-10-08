import * as WebBrowser from 'expo-web-browser';
import { API_BASE_URL } from './api';

// Pagina publica da oficina no site (avaliacoes, endereco, mapa), no idioma do app.
const PREFIXO: Record<string, string> = { pt: 'pt-br', 'pt-PT': 'pt-pt', en: 'en', et: 'et', it: 'it', ru: 'ru' };

export function abrirOficina(oficinaId: string, idioma: string) {
  return WebBrowser.openBrowserAsync(`${API_BASE_URL}/${PREFIXO[idioma] || 'en'}/oficinas/${oficinaId}`);
}
