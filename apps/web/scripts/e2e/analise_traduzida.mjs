// Teste real (Chromium): a analise da IA guardada em RUSSO aparece traduzida para
// a oficina que le em estoniano (resumo, pecas, checklist), com "ver original";
// e quem le em russo ve o original sem pedir traducao paga. /api/traduzir simulada.
// 14/11 (versao 2): estimativa aproximada (pecas + mao de obra + horas + aviso),
// observacoes e perguntas para o cliente, em 390 px e 1280 px; analise antiga
// (sem versao) continua aparecendo sem os blocos novos e sem erro.
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

const ANALISE = { resumo: 'Выполнить замену моторного масла и фильтров.', severidade: 'leve', pecas_afetadas: ['Моторное масло', 'Масляный фильтр', 'Пробкасливногоотверстияуплотнительноекольцодвигателя'], checklist_inspecao: ['Проверить уровень масла'], estimativa_custo: { min: 105, max: 400, pecas_min: 60, pecas_max: 250, mao_obra_min: 45, mao_obra_max: 150, horas_min: 1, horas_max: 2 }, confianca: 0.4,
  raw_response: { versao: 2, observacoes: ['Износ ШРУСа часто связан с повреждением пыльника.', 'Проверить ступичный подшипник.'], perguntas_sugeridas: ['Какой год выпуска и тип двигателя?', 'Оригинал или аналог?'] } };
const ANTIGA = { resumo: 'Выполнить замену моторного масла и фильтров.', severidade: 'leve', pecas_afetadas: ['Моторное масло'], checklist_inspecao: [], estimativa_custo: { min: 100, max: 250 }, confianca: 0.5, raw_response: { perguntas_sugeridas: ['Какое масло?'] } };
const ET = { 'Выполнить замену моторного масла и фильтров.': 'Vahetada mootoriõli ja filtrid.', 'Моторное масло': 'Mootoriõli', 'Масляный фильтр': 'Õlifilter', 'Пробкасливногоотверстияуплотнительноекольцодвигателя': 'Mootoriõlipaagitühjenduskorgitihendrõngasvahetuskomplekt', 'Проверить уровень масла': 'Kontrollida õlitaset', 'Износ ШРУСа часто связан с повреждением пыльника.': 'Veovõlli liigendi kulumine on sageli seotud katkise mansetiga.', 'Проверить ступичный подшипник.': 'Kontrollida rattalaagrit.', 'Какой год выпуска и тип двигателя?': 'Mis on auto aasta ja mootor?', 'Оригинал или аналог?': 'Originaal või analoog?', 'Какое масло?': 'Milline õli?' };

function pagina(lingua, analise = ANALISE) {
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
    '@/hooks/use-analise-dano': { useAnaliseDano: () => ({ analise: ${JSON.stringify(analise)}, loading: false, analyzing: false, atualizando: false, error: null, analisar() {} }) },
    '@/lib/utils': { formatCurrency: (v) => v + ' €' }, '@fixauto/shared': {}, '@/lib/currency': { currencyForCountry: () => 'EUR' } };
  const require = (m) => { if (!(m in mods)) throw new Error('modulo ' + m); return mods[m]; };
  (function () { const exports = {}; ${comp('apps/web/src/components/ui/TextoTraduzido.tsx')}; mods['@/components/ui/TextoTraduzido'] = exports; })();
  const exports = {}; ${comp('apps/web/src/components/ui/DamageAnalysis.tsx')}
  ReactDOM.createRoot(document.getElementById('r')).render(React.createElement(exports.default, { solicitacaoId: 's1', pais: 'EE' }));
  </script></body></html>`;
}

const b = await chromium.launch({ executablePath: exe });
for (const [lingua, largura] of [['et', 390], ['et', 1280], ['ru', 390]]) {
  const p = await b.newPage({ viewport: { width: largura, height: 800 } }); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.setContent(pagina(lingua), { waitUntil: 'load' }); await p.waitForTimeout(600);
  const botao = p.locator('button', { hasText: /\(1\)|1/ }).last(); await botao.click().catch(() => {}); await p.waitForTimeout(200);
  const txt = await p.textContent('#r');
  if (lingua === 'et') {
    confere('et: resumo traduzido', txt.includes('Vahetada mootoriõli ja filtrid.'));
    confere('et: pecas traduzidas', txt.includes('Mootoriõli') && txt.includes('Õlifilter'));
    confere('et: checklist traduzido', txt.includes('Kontrollida õlitaset'), txt.slice(0, 300));
    const D = JSON.parse(ler('apps/web/messages/et.json')).damageAnalysis;
    confere('et: estimativa aproximada com total, varuosad, töötasu e horas', txt.includes(D.estimativaCusto) && txt.includes('105 € – 400 €') && txt.includes(D.estimativaPecas) && txt.includes('60 € – 250 €') && txt.includes(D.estimativaMaoObra) && txt.includes('45 € – 150 €') && txt.includes('≈ 1–2 h'));
    confere('et: aviso de valor aproximado', txt.includes(D.estimativaAviso));
    confere('et: observacoes traduzidas', txt.includes(D.observacoes) && txt.includes('Kontrollida rattalaagrit.'));
    confere('et: perguntas para o cliente traduzidas', txt.includes(D.perguntasCliente) && txt.includes('Mis on auto aasta ja mootor?') && txt.includes(D.perguntasDica));
    confere('et: sem russo na tela (fora do "ver original")', !/[а-яА-Я]/.test(txt));
    confere('et: um aviso de traducao so (bloco)', txt.split(M_orig(lingua)).length - 1 === 1);
    confere('et: aviso diz a lingua (vene)', /vene/.test(txt));
    await p.click('text=' + M_orig(lingua));
    const orig = await p.textContent('#r');
    confere('et: ver original volta resumo, pecas, checklist, observacoes e perguntas juntos', orig.includes('Выполнить замену') && orig.includes('Моторное масло') && orig.includes('Проверить уровень масла') && orig.includes('Проверить ступичный подшипник.') && orig.includes('Оригинал или аналог?') && !orig.includes('Mootoriõli'));
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
// analise antiga (antes de 14/11): sem blocos novos, sem 'sem estimativa', sem erro
{
  const p = await b.newPage({ viewport: { width: 390, height: 800 } }); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.setContent(pagina('et', ANTIGA), { waitUntil: 'load' }); await p.waitForTimeout(600);
  const txt = await p.textContent('#r'); const D = JSON.parse(ler('apps/web/messages/et.json')).damageAnalysis;
  confere('antiga: mostra resumo e faixa total', txt.includes('Vahetada mootoriõli ja filtrid.') && txt.includes('100 € – 250 €'));
  confere('antiga: sem observacoes e sem "sem estimativa"', !txt.includes(D.observacoes) && !txt.includes(D.semEstimativa));
  confere('antiga: perguntas antigas aparecem', txt.includes('Milline õli?'));
  confere('antiga: sem rolagem lateral', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  confere('antiga: sem erros de JavaScript', erros.length === 0, erros.join(' | '));
  await p.screenshot({ path: path.join(RAIZ, 'Documentos/_teste_local/analise_ia_antiga_et_390.png'), fullPage: true });
  await p.close();
}
function M_orig(l) { return JSON.parse(ler(`apps/web/messages/${l}.json`)).traducao.verOriginal; }
await b.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
