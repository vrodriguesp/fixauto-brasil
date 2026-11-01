import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import i18n from 'i18next';
import { API_BASE_URL } from './api';

// Erros e travamentos do APP chegam ao servidor (tabela app_errors, tela
// /admin/monitoramento) - antes so apareciam no terminal do Expo de quem
// estava com o aparelho, e um travamento no iPhone (teste do dono 09/10,
// novo pedido carregando sem fim) nao tinha como ser diagnosticado.
// Sem dados pessoais: so a tela, a etapa e a mensagem de erro (+ versao,
// atualizacao instalada e idioma, para saber se o erro ja foi corrigido).
export function enviarDiagnostico(onde: string, mensagem: string, extra?: Record<string, unknown>) {
  fetch(`${API_BASE_URL}/api/log-error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mensagem: `[app ${Platform.OS}] ${onde}: ${mensagem}`.slice(0, 500),
      stack: JSON.stringify({ ...extra, versao: Constants.expoConfig?.version, atualizacao: Updates.isEmbeddedLaunch ? 'embutida' : Updates.updateId?.slice(0, 8), idioma: i18n.language }).slice(0, 3000),
      url: `app:${onde}`,
    }),
  }).catch(() => {});
}

let instalado = false;
// Erros de JavaScript nao tratados: manda e segue com o tratamento padrao
export function instalarCapturaDeErros() {
  if (instalado) return;
  instalado = true;
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: Error, fatal?: boolean) => void; setGlobalHandler: (h: (e: Error, fatal?: boolean) => void) => void } };
  const eu = g.ErrorUtils;
  if (!eu) return;
  const anterior = eu.getGlobalHandler();
  eu.setGlobalHandler((e, fatal) => {
    enviarDiagnostico('erro-js', e?.message || String(e), { fatal: !!fatal, stack: e?.stack?.slice(0, 2000) });
    anterior(e, fatal);
  });
}
