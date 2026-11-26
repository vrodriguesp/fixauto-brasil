// E2E LOCAL do passo "Asukoht" do pedido no celular (26/11): a lista de sugestoes fica no fluxo da
// pagina e NUNCA cobre a barra Tagasi/Edasi; o Edasi funciona com a lista aberta (texto livre) e
// depois de escolher uma sugestao; em RU, "Ласнамяэ" traz Lasnamäe em 1o e nenhum ponto de interesse.
// Tambem: /api/funil ignora previas de anuncio/robos (lib/robo.ts) e continua contando pessoas.
// Banco local (Docker) e site local; as sugestoes vem do Photon (sem chave Geoapify).
//   SITE=http://localhost:3100 node endereco-mobile.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire(new URL('../../package.json', import.meta.url)); // apps/web do checkout onde o script esta
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/endereco-mobile';
fs.mkdirSync(OUT, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0, oks = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; else oks++; console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}${extra ? ' - ' + String(extra).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
let ipN = 1;
const ip = () => `10.79.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
const msPw = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
const exe = fs.existsSync(msPw) ? msPw : 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: exe });
const CAMINHO = { et: '/ee/et/paring', ru: '/ee/ru/zayavka' };
const edasi = (p, passo) => p.getByTestId(`passo-${passo}`).getByTestId('edasi');
const etapa = (p) => p.locator('.pedido-pagina').getAttribute('data-etapa');
async function carroCampo(p, id, nome) {
  const el = p.locator('#' + id);
  await el.waitFor({ state: 'visible', timeout: 20000 });
  await el.click(); await el.fill(nome.slice(0, 4));
  const op = p.getByTestId(id + '-lista').getByRole('option', { name: nome, exact: true });
  await op.first().waitFor({ timeout: 20000 }); await op.first().click();
}
// o que esta de fato sob o centro do botao (nada por cima dele)
const sobOBotao = async (p, loc) => {
  const b = await loc.boundingBox();
  return p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.closest('[data-testid]')?.getAttribute('data-testid') || e.tagName) : 'nada'; }, [b.x + b.width / 2, b.y + b.height / 2]);
};

async function atePassoLocal(l) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: l === 'et' ? 'et-EE' : 'ru-RU', extraHTTPHeaders: { 'x-real-ip': ip() } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(`${SITE}${CAMINHO[l]}?servico=mecanica`, { waitUntil: 'networkidle', timeout: 120000 });
  await p.getByTestId('passo-detalhe').waitFor({ timeout: 60000 });
  await p.getByTestId('chip-servico').first().click();
  await edasi(p, 'detalhe').click(); await p.getByTestId('passo-fotos').waitFor();
  await edasi(p, 'fotos').click(); await p.getByTestId('passo-carro').waitFor({ state: 'visible' });
  await carroCampo(p, 'cbbe3-101', 'Toyota'); await carroCampo(p, 'cbbe3-102', 'Corolla');
  await p.locator('#pedido-placa').fill('123ABC');
  await edasi(p, 'carro').click(); await p.getByTestId('passo-local').waitFor();
  return { ctx, p, erros };
}

async function passoLocal(l, texto, { esperaPrimeiro, semPoi }) {
  const nome = `${l} 390x844`;
  const { ctx, p, erros } = await atePassoLocal(l);
  await p.locator('#pedido-endereco').fill(texto);
  const lista = p.getByTestId('endereco-sugestoes');
  const veio = await lista.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  ok(`${nome}: "${texto}" traz sugestoes (Photon)`, veio);
  if (veio) {
    const rotulos = await lista.getByRole('option').allInnerTexts();
    ok(`${nome}: 1a sugestao e ${esperaPrimeiro}`, rotulos.length > 0 && rotulos[0].includes(esperaPrimeiro), rotulos.slice(0, 3).join(' | '));
    if (semPoi) ok(`${nome}: nenhuma sugestao e ponto de interesse (igreja/loja)`, !rotulos.some((r) => /church|kirik|церк|shop|kauplus|hotel/i.test(r)), rotulos.join(' | '));
    // a lista nao cobre a barra: o Edasi esta "por cima" e e o que o toque alcanca
    const botao = edasi(p, 'local');
    await botao.scrollIntoViewIfNeeded();
    ok(`${nome}: Edasi visivel com a lista aberta`, await botao.isVisible());
    const sob = await sobOBotao(p, botao);
    ok(`${nome}: nada cobre o Edasi (elementFromPoint = edasi)`, sob === 'edasi', sob);
    const lb = await lista.boundingBox(); const bb = await botao.boundingBox();
    ok(`${nome}: a lista termina acima da barra`, lb && bb && lb.y + lb.height <= bb.y + 1, `lista ate y=${lb && Math.round(lb.y + lb.height)}, botao y=${bb && Math.round(bb.y)}`);
    await p.screenshot({ path: `${OUT}/${l}-lista-aberta.png` });
  }
  // 1) Edasi com a lista aberta, SEM escolher sugestao (texto livre): vai ao contato
  await edasi(p, 'local').click({ timeout: 5000 }).catch(() => {});
  await p.getByTestId('passo-contato').waitFor({ timeout: 10000 }).catch(() => {});
  ok(`${nome}: Edasi com a lista aberta e texto livre -> passo contato`, (await etapa(p)) === 'contato', await etapa(p));
  // volta e escolhe uma sugestao
  await p.getByTestId('passo-contato').getByTestId('navegar').locator('button').first().click(); // Tagasi
  await p.getByTestId('passo-local').waitFor();
  await p.locator('#pedido-endereco').fill(''); await p.locator('#pedido-endereco').fill(texto);
  const veio2 = await lista.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  if (veio2) {
    await lista.getByRole('option').first().click(); await p.waitForTimeout(800);
    ok(`${nome}: escolheu a 1a sugestao -> campo preenchido e lista fechada`, (await p.locator('#pedido-endereco').inputValue()).length > texto.length && (await lista.count()) === 0, await p.locator('#pedido-endereco').inputValue());
    await p.screenshot({ path: `${OUT}/${l}-escolhida.png` });
    await edasi(p, 'local').click();
    await p.getByTestId('passo-contato').waitFor({ timeout: 10000 }).catch(() => {});
    ok(`${nome}: Edasi depois de escolher -> passo contato`, (await etapa(p)) === 'contato');
  }
  ok(`${nome}: sem erro de pagina`, erros.length === 0, erros.join(' | '));
  await ctx.close();
}

await passoLocal('et', 'Lasnamäe', { esperaPrimeiro: 'Lasnamäe' });
await passoLocal('ru', 'Ласнамяэ', { esperaPrimeiro: 'Lasnamäe', semPoi: true });

// a lista sobreposta continua nos outros formularios (nova-solicitacao usa o componente sem listaEmLinha):
// conferido pelo codigo-fonte do componente, aqui so o contrato: a prop existe e o padrao e sobreposta
const src = fs.readFileSync(new URL('../../src/components/forms/EnderecoAutocomplete.tsx', import.meta.url), 'utf8');
ok('componente: lista sobreposta (absolute) por padrao, em linha so com listaEmLinha', /listaEmLinha \? 'relative/.test(src) && /: 'absolute z-30/.test(src));
ok('nova-solicitacao e emergencia nao usam listaEmLinha (sem mudanca de layout)', !/listaEmLinha/.test(fs.readFileSync(new URL('../../src/app/[locale]/cliente/nova-solicitacao/page.tsx', import.meta.url), 'utf8')) && !/listaEmLinha/.test(fs.readFileSync(new URL('../../src/app/[locale]/emergencia/page.tsx', import.meta.url), 'utf8')));

// /api/funil: robo nao conta, pessoa conta (etapa 'cookie_recusado' do funil pedido_site, dia de hoje em Tallinn)
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Tallinn' });
const total = async () => (await admin.from('funil_contagem').select('total').eq('funil', 'pedido_site').eq('etapa', 'cookie_recusado').eq('dia', hoje).maybeSingle()).data?.total || 0;
const post = (ua) => fetch(`${SITE}/api/funil`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip(), ...(ua === null ? {} : { 'User-Agent': ua }) }, body: JSON.stringify({ funil: 'pedido_site', etapa: 'cookie_recusado' }) });
const antes = await total();
for (const ua of ['Google', 'Google-Ads-Creatives-Assistant', 'AdsBot-Google (+http://www.google.com/adsbot.html)', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)']) {
  const r = await post(ua); ok(`funil: robo "${ua.slice(0, 30)}" responde ok`, r.ok);
}
ok('funil: 5 robos nao somaram nada', (await total()) === antes, `${antes} -> ${await total()}`);
const r = await post('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Mobile Safari/537.36');
ok('funil: pessoa (Chrome Android) somou 1', r.ok && (await total()) === antes + 1, `${antes} -> ${await total()}`);

await browser.close();
console.log(`\n${oks} ok, ${falhas} FALHA(S)`);
process.exit(falhas ? 1 : 0);
