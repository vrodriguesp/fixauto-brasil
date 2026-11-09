// teste do bug de foco no comentario do "Nao tenho interesse": versao antiga x nova
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path';
const req = createRequire(import.meta.url);
const { chromium } = req('playwright-core');
const [S, RAIZ] = process.argv.slice(2);
const rr = createRequire(path.join(RAIZ, 'package.json'));
const { transform } = rr('sucrase');
const react = fs.readFileSync(path.join(RAIZ, 'node_modules/react/umd/react.development.js'), 'utf8');
const reactDom = fs.readFileSync(path.join(RAIZ, 'node_modules/react-dom/umd/react-dom.development.js'), 'utf8');
const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
const b = await chromium.launch({ executablePath: exe });
for (const v of ['antes', 'depois']) {
  const code = transform(fs.readFileSync(path.join(S, v + '.tsx'), 'utf8').replace("'use client';", ''), { transforms: ['typescript', 'jsx', 'imports'] }).code;
  const html = `<html><body><div id="r"></div><script>${react}</script><script>${reactDom}</script><script>
    const mods = { react: React, 'next-intl': { useTranslations: () => (k) => k }, '@/lib/supabase': { supabase: { from: () => ({ upsert: async () => ({}) }) } } };
    const require = (m) => mods[m]; const exports = {}; const module = { exports };
    ${code}
    ReactDOM.createRoot(document.getElementById('r')).render(React.createElement(exports.default, { solicitacaoId: 's', oficinaId: 'o', aoMudar: () => {} }));
  </script></body></html>`;
  const p = await b.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.setContent(html);
  await p.click('[data-testid="nao-tenho-interesse"]');
  await p.click('[data-testid="motivo-faz_parte"]');
  await p.click('[data-testid="dispensa-comentario"]');
  await p.keyboard.type('Ne delaem polirovku', { delay: 30 });
  const valor = await p.inputValue('[data-testid="dispensa-comentario"]');
  const foco = await p.evaluate(() => document.activeElement?.dataset?.testid || document.activeElement?.tagName);
  console.log(v.padEnd(7), '| texto:', JSON.stringify(valor), '| foco no fim:', foco, erros.length ? '| ERROS: ' + erros : '');
}
await b.close();
