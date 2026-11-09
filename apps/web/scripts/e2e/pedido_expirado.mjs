// Teste real (Chromium) do aviso "pedido expirado" + botao "Reabrir pedido",
// renderizado sozinho com os textos reais (et, ru) e o supabase simulado.
//   node pedido_expirado.mjs <raiz do repo>
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path';
const req = createRequire(import.meta.url);
const { chromium } = req('playwright-core');
const [RAIZ] = process.argv.slice(2);
const { transform } = createRequire(path.join(RAIZ, 'package.json'))('sucrase');
const react = fs.readFileSync(path.join(RAIZ, 'node_modules/react/umd/react.development.js'), 'utf8');
const reactDom = fs.readFileSync(path.join(RAIZ, 'node_modules/react-dom/umd/react-dom.development.js'), 'utf8');
const code = transform(fs.readFileSync(path.join(RAIZ, 'apps/web/src/components/cliente/PedidoExpirado.tsx'), 'utf8').replace("'use client';", ''), { transforms: ['typescript', 'jsx', 'imports'] }).code;
const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
let falhas = 0;
const confere = (nome, ok, extra = '') => { if (!ok) falhas++; console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${extra ? ' — ' + extra : ''}`); };

function pagina(lingua, rpcErro) {
  const msgs = JSON.parse(fs.readFileSync(path.join(RAIZ, `apps/web/messages/${lingua}.cliente.json`), 'utf8')).pedidoExpirado;
  return `<html><head><meta name="viewport" content="width=device-width"><script src="https://cdn.tailwindcss.com/3.4.1"></script><style>.btn-primary{background:#2563eb;color:#fff;padding:8px 16px;border-radius:8px}</style></head><body style="font-family:sans-serif;margin:0;padding:16px"><div id="r"></div>
  <script>${react}</script><script>${reactDom}</script><script>
  window.chamadas = []; window.reabriu = 0;
  const M = ${JSON.stringify(msgs)};
  const t = (k, v) => String(M[k]).replace(/\\{(\\w+)\\}/g, (_, x) => v && v[x] != null ? v[x] : '{' + x + '}');
  const mods = { react: React, 'next-intl': { useTranslations: () => t },
    '@/lib/supabase': { supabase: { rpc: async (nome, args) => { window.chamadas.push({ nome, args }); await new Promise((r) => setTimeout(r, 150)); return ${rpcErro ? "{ error: { message: 'PEDIDO_NAO_REABRIVEL' } }" : '{ data: "em_orcamento", error: null }'}; } } } };
  const require = (m) => mods[m]; const exports = {}; const module = { exports };
  ${code}
  ReactDOM.createRoot(document.getElementById('r')).render(React.createElement(exports.default, { solicitacaoId: 'sol-1', dias: 30, aoReabrir: () => { window.reabriu++; } }));
  </script></body></html>`;
}

const b = await chromium.launch({ executablePath: exe });
for (const lingua of ['et', 'ru']) {
  const p = await b.newPage({ viewport: { width: 375, height: 700 } }); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.setContent(pagina(lingua, false), { waitUntil: 'load' }); await p.waitForTimeout(500);
  const texto = await p.textContent('[data-testid="pedido-expirado"]');
  confere(`${lingua}: mostra o prazo de 30 dias`, texto.includes('30'), texto.slice(0, 90));
  confere(`${lingua}: sem chave crua ({dias})`, !/\{\w+\}/.test(texto));
  const btn = await p.textContent('[data-testid="reabrir-pedido"]');
  await p.click('[data-testid="reabrir-pedido"]');
  confere(`${lingua}: botao mostra "reabrindo" e fica desligado`, await p.isDisabled('[data-testid="reabrir-pedido"]'));
  await p.waitForTimeout(300);
  const ch = await p.evaluate(() => window.chamadas);
  confere(`${lingua}: chama reabrir_pedido com o id`, ch.length === 1 && ch[0].nome === 'reabrir_pedido' && ch[0].args.p_solicitacao === 'sol-1');
  confere(`${lingua}: avisa a pagina para recarregar`, (await p.evaluate(() => window.reabriu)) === 1);
  confere(`${lingua}: botao volta ao texto original`, (await p.textContent('[data-testid="reabrir-pedido"]')) === btn);
  const h = await p.evaluate(() => document.querySelector('[data-testid="reabrir-pedido"]').getBoundingClientRect().height);
  confere(`${lingua}: botao >= 44 px no celular`, h >= 44, String(h));
  const larg = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  confere(`${lingua}: sem rolagem lateral`, larg[0] <= larg[1], larg.join('x'));
  confere(`${lingua}: sem erros de JavaScript`, erros.length === 0, erros.join(' | '));
  await p.screenshot({ path: path.join(RAIZ, `Documentos/_teste_local/pedido_expirado_${lingua}.png`) });
  await p.close();
}
// erro do servidor: mostra aviso, nao recarrega
const p = await b.newPage({ viewport: { width: 375, height: 700 } });
await p.setContent(pagina('et', true)); await p.waitForTimeout(200);
await p.click('[data-testid="reabrir-pedido"]'); await p.waitForTimeout(400);
confere('erro: mostra mensagem de erro', (await p.locator('[role="alert"]').count()) === 1);
confere('erro: nao recarrega a pagina', (await p.evaluate(() => window.reabriu)) === 0);
confere('erro: botao volta a funcionar', !(await p.isDisabled('[data-testid="reabrir-pedido"]')));
await b.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
