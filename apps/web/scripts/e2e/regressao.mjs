// Bateria de REGRESSAO local (dono 06/11: "testar ao menos uma vez todas as
// funcionalidades do site em local"). Roda cada teste num processo proprio, um por
// vez; se o navegador de teste cair (memoria) ou a rede falhar, repete ate 2x.
// Resumo em resultados/regressao/resumo.txt e a saida de cada teste ao lado.
//   node regressao.mjs <.env.local> [filtro]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ENV = path.resolve(process.argv[2]);
// argumentos: filtro de nome e/ou "pular=nome1,nome2" (os que ja passaram)
const ARGS = process.argv.slice(3);
const FILTRO = ARGS.find((a) => !a.startsWith('pular=')) || '';
const PULAR = (ARGS.find((a) => a.startsWith('pular=')) || 'pular=').slice(6).split(',').filter(Boolean);
const PAUSA_MS = 15000; // memoria do PC: respiro entre um teste e outro
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/regressao';
fs.mkdirSync(OUT, { recursive: true });
const T = [
  // pedido sem cadastro (o que mexemos agora)
  ['pedido-exaustivo.mjs', [ENV]], ['pedido-lembrete.mjs', [ENV]], ['jornada-pedido.mjs', [ENV]], ['privacidade-agenda.mjs', [ENV]], ['agenda-mudanca.mjs', [ENV]], ['feedback-0711.mjs', [ENV]],
  ['site-pedido-sem-conta.mjs', [ENV]], ['app-pedido-sem-conta.mjs', [ENV]],
  // cadastro, acidente, seguro, seguranca
  ['e2e-cadastro.mjs', [ENV]], ['e2e-acidente.mjs', [ENV]], ['e2e-seguro.mjs', [ENV]], ['seguranca-rls.mjs', [ENV]],
  // site: fluxos de cliente/oficina/loja/admin
  ['site-fluxos.mjs', [ENV]], ['site-mensagens.mjs', [ENV]], ['site-revisao.mjs', [ENV]], ['site-expirado.mjs', [ENV]],
  ['site-prazo.mjs', [ENV]], ['site-quadro.mjs', [ENV]], ['site-quadro-hora.mjs', [ENV]], ['site-conclusao.mjs', [ENV]],
  ['site-garantia.mjs', [ENV]], ['site-servico.mjs', [ENV]], ['site-oficina-nova.mjs', [ENV]], ['site-painel-oficina.mjs', [ENV]],
  ['site-pecas.mjs', [ENV]], ['site-pecas-ux.mjs', [ENV]], ['site-loja-sem-comissao.mjs', [ENV]], ['site-pagador.mjs', [ENV]],
  ['site-atendimento.mjs', [ENV]], ['site-suporte.mjs', [ENV]], ['site-admin-email.mjs', [ENV]], ['site-seguro-pais.mjs', [ENV]],
  ['site-estonia.mjs', [ENV]], ['site-traducao.mjs', [ENV]], ['site-educacao.mjs', [ENV]],
  ['site-menu-sobreposto.mjs', [ENV]], ['site-ajustes-0611.mjs', [ENV]], ['teste-idioma-painel.mjs', [ENV]],
  ['site-motoristas.mjs', [OUT]],
  ['site-mercados.mjs', [ENV, 'EE']], ['site-mercados.mjs', [ENV, 'IT']], ['site-mercados.mjs', [ENV, 'PT']], ['site-mercados.mjs', [ENV, 'BR']],
  ['site-varredura.mjs', [ENV]],
  // app (versao web do mesmo codigo)
  ['app-e2e.mjs', [ENV, 'et']], ['app-e2e.mjs', [ENV, 'it']], ['app-idioma.mjs', [ENV]], ['app-situacao.mjs', [ENV]],
  ['app-garantia.mjs', [ENV]], ['app-teste-dono.mjs', [ENV]], ['app-traducao-expirado.mjs', [ENV]],
  // motor do Safari (WebKit), tela de iPhone - achados do dono 08-09/11 (rodar com HOST_LAN=<ip da rede>)
  ['safari-iphone.mjs', [ENV]], ['correcoes-0811.mjs', [ENV]], ['chat-teclado.mjs', [ENV]], ['acidente-fluxo.mjs', [ENV]],
  ['cancelar-pedido.mjs', [ENV]], ['app-navegacao.mjs', [ENV]], ['navegacao-voltar.mjs', [ENV]], ['troca-idioma-formularios.mjs', [ENV]], ['links-idiomas.mjs', [ENV]],
].filter(([f, a]) => f.includes(FILTRO) && !PULAR.includes(`${f.replace('.mjs', '')}${a[1] && a[0] === ENV ? '-' + a[1] : ''}`));
const CAIU = /Target page, context or browser has been closed|Page crashed|browser has disconnected|ECONNRESET|ETIMEDOUT|socket hang up/;
const resumo = [];
for (const [arq, args] of T) {
  const nome = `${arq.replace('.mjs', '')}${args[1] && args[0] === ENV ? '-' + args[1] : ''}`;
  let saida = '', st = 0, vezes = 0;
  const inicio = Date.now();
  do {
    vezes++;
    const r = spawnSync(process.execPath, [arq, ...args], { cwd: AQUI, encoding: 'utf8', timeout: 12 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
    saida = (r.stdout || '') + (r.stderr || '');
    st = r.status;
    if (r.error) saida += `\n[nao rodou: ${r.error.message}]`;
    else if (r.status === null) saida += '\n[tempo esgotado]';
  } while (vezes < 3 && (CAIU.test(saida) || st === null));
  fs.writeFileSync(`${OUT}/${nome}.txt`, saida);
  const pedacos = [...saida.matchAll(/^== .*?: (\d+) ok, (\d+) falha/gm)];
  const nOk = (saida.match(/^ok\b/gm) || []).length + pedacos.reduce((t, m) => t + Number(m[1]), 0);
  const nFalha = (saida.match(/^\s*FALHA/gm) || []).length;
  const linha = `${nome.padEnd(34)} ${String(nOk).padStart(4)} ok  ${String(nFalha).padStart(3)} falha  ${Math.round((Date.now() - inicio) / 1000)}s${vezes > 1 ? `  (${vezes}x)` : ''}${st !== 0 && !nFalha ? `  [saiu ${st}]` : ''}`;
  console.log(linha);
  for (const l of saida.split('\n').filter((x) => x.startsWith('FALHA')).slice(0, 8)) console.log('     ' + l.slice(0, 220));
  resumo.push(linha);
  fs.appendFileSync(`${OUT}/resumo.txt`, linha + '\n');
  // navegadores de teste que tenham sobrado + pausa (o PC ficou sem memoria na 1a bateria)
  spawnSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*ms-playwright*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"]);
  await new Promise((ok) => setTimeout(ok, PAUSA_MS));
}
console.log('\nFIM');
