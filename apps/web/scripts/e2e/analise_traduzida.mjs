// Teste real (Chromium): a analise da IA guardada em RUSSO aparece traduzida para
// a oficina que le em estoniano (resumo, pecas, checklist), com "ver original";
// e quem le em russo ve o original sem pedir traducao paga. /api/traduzir simulada.
//   node analise_traduzida.mjs <raiz do repo>
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path';
const req = createRequire(import.meta.url);
const { chromium } = req('playwright-core');
const [RAIZ] = process.argv.slice(2);
const { transform } = createRequire(path.join(RAIZ, 'package.json'))('sucrase');
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const comp = (p) => transform(ler(p).replace("'use client';", ''), { transforms: ['typescript', 'jsx', 'imports'] }).code;
const react = ler('node_modules/react/umd/react.development.js');
const reactDom = ler('node_modules/react-dom/umd/react-dom.development.js');
const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
let falhas = 0;
const confere = (nome, ok, extra = '') => { if (!ok) falhas++; console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${extra ? ' — ' + extra : ''}`); };

const ANALISE = { resumo: 'Выполнить замену моторного масла и фильтров.', severidade: 'leve', pecas_afetadas: ['Моторное масло', 'Масляный фильтр', 'Пробкасливногоотверстияуплотнительноекольцодвигателя'], checklist_inspecao: ['Проверить уровень масла'], estimativa_custo: { min: 100, max: 250 }, confianca: 0.5 };
const ET = { 'Выполнить замену моторного масла и фильтров.': 'Vahetada mootoriõli ja filtrid.', 'Моторное масло': 'Mootoriõli', 'Масляный фильтр': 'Õlifilter', 'Пробкасливногоотверстияуплотнительноекольцодвигателя': 'Mootoriõlipaagitühjenduskorgitihendrõngasvahetuskomplekt', 'Проверить уровень масла': 'Kontrollida õlitaset' };

function pagina(lingua) {
  const msgs = { ...JSON.parse(ler(`apps/web/messages/${lingua}.json`)) };
  return `<html><head><meta name="viewport" content="width=device-width"><script src="https://cdn.tailwindcss.com/3.4.1"></script></head><body style="margin:0;padding:16px"><div id="r"></div>
  <script>${react}</script><script>${reactDom}</script><script>
  window.pedidos = [];
  const M = ${JSON.stringify(msgs)}; const ET = ${JSON.stringify(ET)};
  window.fetch = async (url, op) => { const b = JSON.parse(op.body); window.pedidos.push(b);
    const traducoes = b.textos.map((t) => b.lingua === 'et' && ET[t] ? { texto: ET[t], origem: 'RU' } : { texto: null, origem: null });
    return { ok: true, json: async () => ({ traducoes }) }; };
  const ns = (n) => (k, v) => { let s = String((M[n] || {})[k] ?? (n + '.' + k)); for (const x in (v || {})) s = s.replace('{' + x + '}', v[x]); return s; };
  const nextIntl = { useTranslations: ns, useLocale: () => '${lingua}' };
  const mods = { react: React, 'next-intl': nextIntl,
    '@/hooks/use-analise-dano': { useAnaliseDano: () => ({ analise: ${JSON.stringify(ANALISE)}, loading: false, analyzing: false, error: null, analisar() {} }) },
    '@/lib/utils': { formatCurrency: (v) => v + ' €' }, '@/lib/currency': { currencyForCountry: () => 'EUR' } };
  const require = (m) => { if (!(m in mods)) throw new Error('modulo ' + m); return mods[m]; };
  (function () { const exports = {}; ${comp('apps/web/src/components/ui/TextoTraduzido.tsx')}; mods['@/components/ui/TextoTraduzido'] = exports; })();
  const exports = {}; ${comp('apps/web/src/components/ui/DamageAnalysis.tsx')}
  ReactDOM.createRoot(document.getElementById('r')).render(React.createElement(exports.default, { solicitacaoId: 's1', pais: 'EE' }));
  </script></body></html>`;
}

const b = await chromium.launch({ executablePath: exe });
for (const [lingua, largura] of [['et', 375], ['et', 1280], ['ru', 375]]) {
  const p = await b.newPage({ viewport: { width: largura, height: 800 } }); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.setContent(pagina(lingua), { waitUntil: 'load' }); await p.waitForTimeout(600);
  const botao = p.locator('button', { hasText: /\(1\)|1/ }).last(); await botao.click().catch(() => {}); await p.waitForTimeout(200);
  const txt = await p.textContent('#r');
  if (lingua === 'et') {
    confere('et: resumo traduzido', txt.includes('Vahetada mootoriõli ja filtrid.'));
    confere('et: pecas traduzidas', txt.includes('Mootoriõli') && txt.includes('Õlifilter'));
    confere('et: checklist traduzido', txt.includes('Kontrollida õlitaset'), txt.slice(0, 300));
    confere('et: sem russo na tela (fora do "ver original")', !/[а-яА-Я]/.test(txt));
    confere('et: um aviso de traducao so (bloco)', txt.split(M_orig(lingua)).length - 1 === 1);
    confere('et: aviso diz a lingua (vene)', /vene/.test(txt));
    await p.click('text=' + M_orig(lingua));
    const orig = await p.textContent('#r');
    confere('et: ver original volta resumo, pecas e checklist juntos', orig.includes('Выполнить замену') && orig.includes('Моторное масло') && orig.includes('Проверить уровень масла') && !orig.includes('Mootoriõli'));
    await p.click('text=' + JSON.parse(ler('apps/web/messages/et.json')).traducao.verTraducao);
    confere('et: ver traducao volta ao estoniano', (await p.textContent('#r')).includes('Mootoriõli'));
  } else {
    confere('ru: original em russo', txt.includes('Выполнить замену моторного масла'));
    confere('ru: sem aviso de traducao', !txt.includes(JSON.parse(ler('apps/web/messages/ru.json')).traducao.verOriginal));
  }
  confere(`${lingua} ${largura}px: sem rolagem lateral`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  confere(`${lingua}: sem erros de JavaScript`, erros.length === 0, erros.join(' | '));
  await p.screenshot({ path: path.join(RAIZ, `Documentos/_teste_local/analise_ia_${lingua}_${largura}.png`), fullPage: true });
  await p.close();
}
function M_orig(l) { return JSON.parse(ler(`apps/web/messages/${l}.json`)).traducao.verOriginal; }
await b.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
