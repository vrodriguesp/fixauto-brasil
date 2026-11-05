// Erros que nao sao do BipFix e so poluiam o /admin/monitoramento (05/11):
// - navegador interno do Facebook/Instagram: script iabjs:// no Android
//   ("Error invoking postMessage: Java object is gone") e sendDataToNative /
//   window.webkit.messageHandlers no iPhone, ao sair da pagina;
// - extensoes do navegador (chrome-extension://, moz-extension://...);
// - "Script error." sem stack = script de outro dominio (o navegador esconde
//   o detalhe; o nosso codigo e do mesmo dominio e sempre traz a mensagem).
// Usado no navegador (nem envia) e na rota /api/log-error (paginas antigas).
const EXTERNO = /iabjs:\/\/|Java object is gone|sendDataToNative|webkit\.messageHandlers|(chrome|moz|safari(-web)?)-extension:\/\//;

export function ehErroExterno(mensagem?: string | null, stack?: string | null): boolean {
  const m = String(mensagem ?? '');
  const s = String(stack ?? '');
  // so o comeco do stack (onde o erro nasceu): uma extensao que embrulha o fetch
  // aparece no meio do stack de um erro NOSSO, e esse tem que continuar aparecendo
  const inicio = s.split('\n').slice(0, 3).join('\n');
  if (EXTERNO.test(m) || EXTERNO.test(inicio)) return true;
  return /^(Uncaught )?Script error\.?$/i.test(m.trim()) && !s.trim();
}
