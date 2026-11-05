// Filtro de erros que nao sao do BipFix (lib/erro-externo.ts), com as mensagens
// reais que chegaram ao /admin/monitoramento ate 05/11, e erros nossos que
// precisam continuar aparecendo.
//   npx tsx scripts/teste-erro-externo.ts
import { ehErroExterno } from '../src/lib/erro-externo';

let falhas = 0;
const conf = (nome: string, real: boolean, esperado: boolean) => {
  const ok = real === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
};

// externos (somem)
conf('Facebook Android iabjs', ehErroExterno('Uncaught Error: Error invoking postMessage: Java object is gone',
  'Error: Error invoking postMessage: Java object is gone\n    at sendDataToNative (iabjs://navigation_performance_logger_android:1:11853)\n    at sendBeforeUnloadMessage'), true);
conf('Facebook Android so a mensagem', ehErroExterno('Error invoking postMessage: Java object is gone', null), true);
conf('extensao do Chrome (sseError)', ehErroExterno('func sseError not found',
  'Error: func sseError not found\n    at Object.<anonymous> (chrome-extension://cadiboklkpojfamcoggejbbdjcoiljjk/inpage.js:253:4574)'), true);
conf('Facebook iPhone webkit', ehErroExterno("TypeError: undefined is not an object (evaluating 'window.webkit.messageHandlers')",
  'sendDataToNative@https://bipfix.com/ee/ru/dlya-avtoservisov:1:1325\nsendPageHideMessage@https://bipfix.com/ee/ru/dlya-avtoservisov:1:4139'), true);
conf('Script error. sem stack', ehErroExterno('Script error.', ''), true);
conf('Uncaught Script error sem stack', ehErroExterno('Uncaught Script error.', null), true);
conf('extensao do Firefox', ehErroExterno('x is undefined', 'f@moz-extension://abc/content.js:1:1'), true);

// nossos (continuam)
conf('erro de render nosso', ehErroExterno("TypeError: Cannot read properties of undefined (reading 'map')",
  'TypeError: ...\n    at Lista (https://bipfix.com/_next/static/chunks/app/page-abc.js:1:200)'), false);
conf('versao antiga (ChunkLoadError)', ehErroExterno('ChunkLoadError: Loading chunk 123 failed.', 'ChunkLoadError\n    at https://bipfix.com/_next/static/chunks/webpack.js:1:1'), false);
conf('erro nosso com extensao no MEIO do stack (embrulha o fetch)', ehErroExterno('TypeError: Failed to fetch',
  'TypeError: Failed to fetch\n    at salvar (https://bipfix.com/_next/static/chunks/app/page.js:1:2)\n    at enviar (https://bipfix.com/_next/static/chunks/app/page.js:1:9)\n    at window.fetch (chrome-extension://abc/inpage.js:10:1)'), false);
conf('Script error. COM stack', ehErroExterno('Script error.', 'at algo (https://bipfix.com/x.js:1:1)'), false);
conf('app android (relatorio do app)', ehErroExterno('[app android] avaliacao-pendente: ', '{}'), false);
conf('mensagem vazia', ehErroExterno('', ''), false);
conf('nulos', ehErroExterno(null, undefined), false);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos ok');
process.exit(falhas ? 1 : 0);
