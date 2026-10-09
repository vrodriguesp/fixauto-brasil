import { Platform } from 'react-native';
import { API_BASE_URL } from './api';

// Erros e travamentos do APP chegam ao servidor (tabela app_errors, tela
// /admin/monitoramento) - antes so apareciam no terminal do Expo de quem
// estava com o aparelho, e um travamento no iPhone (teste do dono 09/10,
// novo pedido carregando sem fim) nao tinha como ser diagnosticado.
// Sem dados pessoais: so a tela, a etapa e a mensagem de erro.
export function enviarDiagnostico(onde: string, mensagem: string, extra?: Record<string, unknown>) {
  fetch(`${API_BASE_URL}/api/log-error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mensagem: `[app ${Platform.OS}] ${onde}: ${mensagem}`.slice(0, 500),
      stack: extra ? JSON.stringify(extra).slice(0, 3000) : null,
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
