// /pedido no celular (dono 10/11, emulador Android + video do Moto E13):
// camera e galeria em botoes separados, fotos e texto voltam se a pagina recarregar,
// Tagasi/Edasi sempre na tela, passo restaurado nao conta de novo no funil e a
// localizacao so e pedida no passo do endereco (nunca ao abrir a pagina).
// 12/11 (analise do abandono no passo 1-2): "Edasi" sempre clicavel com aviso do que falta,
// foto vale como descricao, funil (servico, foto, edasi_bloqueado, cookie), sem balao do chat,
// barra Tagasi/Edasi acima do aviso de cookies (390x780) e tela deitada (740x300).
//   SITE=http://localhost:3100 node scripts/e2e/pedido-fotos-celular.mjs .env.local
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const env = Object.fromEntries(fs.readFileSync(process.argv[2] || '.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
const CHROME = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let falhas = 0;
const ok = (nome, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra !== '' ? ' - ' + extra : ''}`); if (!cond) falhas++; };
const r = (b) => b && `${Math.round(b.y)}+${Math.round(b.height)}`;

const br = await chromium.launch({ executablePath: CHROME });
// contexto do celular: conta os pedidos de localizacao da pagina (sem permissao concedida: so o
// pedido importa) e guarda o que vai ao funil; cookies: 'denied' ja respondido ou sem resposta
const contexto = async ({ viewport, cookies }) => {
  const ctx = await br.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'et-EE' });
  await ctx.addInitScript((cookies) => {
    window.__geo = 0;
    const g = navigator.geolocation;
    if (g) { const orig = g.getCurrentPosition.bind(g); g.getCurrentPosition = (...a) => { window.__geo++; return orig(...a); }; }
    try { if (cookies) localStorage.setItem('bipfix_cookie_consent', cookies); } catch {}
  }, cookies);
  const funil = [];
  await ctx.route('**/api/funil', async (r) => { try { const b = JSON.parse(r.request().postData() || '{}'); funil.push(b.funil === 'pedido_site' ? b.etapa : `${b.funil}:${b.etapa}`); } catch {} await r.fulfill({ status: 200, body: '{"ok":true}' }); });
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  return { ctx, p, funil, erros };
};

// ---- 1) celular em pe, cookies ja respondidos
const { ctx, p, funil, erros } = await contexto({ viewport: { width: 393, height: 780 }, cookies: 'denied' });
await p.goto(`${SITE}/ee/et/paring`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
ok('abrir a pagina nao pede localizacao', await p.evaluate(() => window.__geo) === 0, await p.evaluate(() => window.__geo));
ok('subtitulo sem "ilma registreerimiseta"', !/registreeri/i.test(await p.locator('.pedido-subtitulo').innerText()), await p.locator('.pedido-subtitulo').innerText());

await p.getByRole('button', { name: /Kere- ja/ }).first().tap();
await p.getByTestId('passo-detalhe').waitFor();
ok('toque no servico conta "servico" e "detalhe" no funil', funil.includes('servico') && funil.includes('detalhe'), JSON.stringify(funil));

// "Edasi" sem descricao: clicavel, avisa o que falta, foco na caixa, continua no passo 2
const edasi = () => p.getByTestId('passo-detalhe').getByRole('button', { name: 'Edasi', exact: true });
ok('Edasi clicavel sem descricao (nao fica palido)', await edasi().isEnabled());
await edasi().tap();
await p.waitForTimeout(400);
const aviso = p.getByTestId('passo-detalhe').getByTestId('falta-aviso'); // (o passo do carro fica montado escondido, com a barra dele)
ok('Edasi sem descricao: aviso do que falta', await aviso.isVisible() && /Kirjelda probleemi/.test(await aviso.innerText()), await aviso.innerText().catch(() => ''));
ok('Edasi sem descricao: foco vai a caixa de texto', await p.evaluate(() => document.activeElement?.id) === 'pedido-descricao', await p.evaluate(() => document.activeElement?.id));
ok('Edasi sem descricao: continua no passo 2', await p.getByTestId('passo-detalhe').isVisible() && !(await p.getByTestId('passo-carro').isVisible()));
ok('funil: edasi_bloqueado_detalhe', funil.includes('edasi_bloqueado_detalhe'), JSON.stringify(funil));
await p.locator('#pedido-descricao').fill('Kriimustus esiuksel');
await p.waitForTimeout(200);
ok('escreveu: o aviso some', !(await aviso.isVisible()));

const camera = p.getByTestId('foto-camera'), galeria = p.getByTestId('foto-galeria');
ok('botao camera e botao galeria', await camera.isVisible() && await galeria.isVisible());
ok('campo da camera abre a camera (capture) e aceita 1 foto', await p.locator('input[type=file][capture=environment]:not([multiple])').count() === 1);
ok('campo da galeria aceita varias fotos', await p.locator('input[type=file][multiple]:not([capture])').count() === 1);
ok('linha de ajuda da permissao', (await p.getByTestId('passo-detalhe').innerText()).includes('luba telefoni seadetes'));

const [fc1] = await Promise.all([p.waitForEvent('filechooser'), camera.tap()]);
ok('camera: seletor de 1 foto', !fc1.isMultiple());
await fc1.setFiles({ name: 'camera.png', mimeType: 'image/png', buffer: PNG });
const [fc2] = await Promise.all([p.waitForEvent('filechooser'), galeria.tap()]);
ok('galeria: seletor de varias fotos', fc2.isMultiple());
await fc2.setFiles({ name: 'galeria.png', mimeType: 'image/png', buffer: PNG });
await p.waitForTimeout(500);
const imgs = () => p.locator('[data-testid=passo-detalhe] img').count();
ok('foto da camera + foto da galeria juntas', await imgs() === 2, await imgs());
ok('funil: cada foto anexada conta "foto"', funil.filter((e) => e === 'foto').length === 2, JSON.stringify(funil));

const nav = await p.getByTestId('passo-detalhe').getByTestId('navegar').boundingBox();
ok('Tagasi/Edasi dentro da tela (celular 393x780)', nav && nav.y + nav.height <= 780, nav && Math.round(nav.y + nav.height));
ok('Edasi liberado', await edasi().isEnabled());

// sem balao do chat de suporte nesta pagina (cobria a ponta do Edasi)
await p.evaluate(() => window.scrollTo(0, 600));
await p.waitForTimeout(600);
ok('sem balao do chat na pagina do pedido (depois de rolar)', (await p.getByTestId('chat-suporte-botao').count()) === 0 && !(await p.evaluate(() => document.body.classList.contains('com-chat-suporte'))));

// so foto, sem texto: NAO passa (regra do dono 12/11: a oficina precisa de uma descricao para orcar)
await p.locator('#pedido-descricao').fill('');
await edasi().tap();
await p.waitForTimeout(400);
ok('so foto (sem texto) nao passa: avisa e fica no passo', await p.getByTestId('passo-detalhe').getByTestId('falta-aviso').isVisible() && !(await p.getByTestId('passo-carro').isVisible()));
await p.locator('#pedido-descricao').fill('Kriuksub esirattast');
await edasi().tap();
await p.getByTestId('passo-carro').waitFor({ state: 'visible' });
ok('com descricao passa ao passo do carro', await p.getByTestId('passo-carro').isVisible());
// passo do carro: "Edasi" sem marca avisa e foca a marca
await p.getByTestId('passo-carro').getByRole('button', { name: 'Edasi', exact: true }).tap();
await p.waitForTimeout(400);
const avisoCarro = p.getByTestId('passo-carro').getByTestId('falta-aviso');
ok('carro: Edasi sem marca avisa "Vali mark, mudel ja aasta"', await avisoCarro.isVisible() && /Vali mark/.test(await avisoCarro.innerText()), await avisoCarro.innerText().catch(() => ''));
ok('carro: foco no seletor de marca', await p.evaluate(() => document.activeElement?.id) === 'cbbe3-101', await p.evaluate(() => document.activeElement?.id));
ok('funil: edasi_bloqueado_carro', funil.includes('edasi_bloqueado_carro'), JSON.stringify(funil));
await p.getByTestId('passo-carro').getByRole('button', { name: 'Tagasi' }).tap();
await p.getByTestId('passo-detalhe').waitFor({ state: 'visible' });
await p.locator('#pedido-descricao').fill('Kriimustus esiuksel');

// recarregar (no Android o Chrome fecha a aba ao abrir a galeria/camera)
const detalhesAntes = funil.filter((e) => e === 'detalhe').length;
await p.waitForTimeout(800); // deixa as fotos gravarem no IndexedDB
await p.reload({ waitUntil: 'networkidle' });
await p.getByTestId('passo-detalhe').waitFor();
await p.waitForTimeout(1000);
ok('recarregou: volta no passo 2', await p.getByTestId('passo-detalhe').isVisible());
ok('recarregou: descricao volta', await p.locator('#pedido-descricao').inputValue() === 'Kriimustus esiuksel');
ok('recarregou: as 2 fotos voltam', await imgs() === 2, await imgs());
ok('recarregou: passo nao conta de novo no funil', funil.filter((e) => e === 'detalhe').length === detalhesAntes, JSON.stringify(funil));
ok('recarregou: ainda sem pedido de localizacao', await p.evaluate(() => window.__geo) === 0);

// passo do endereco: a localizacao e pedida uma vez (rascunho no passo 'local')
await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('bipfix_pedido_rascunho')); r.etapa = 'local'; localStorage.setItem('bipfix_pedido_rascunho', JSON.stringify(r)); });
await p.reload({ waitUntil: 'networkidle' });
await p.getByTestId('passo-local').waitFor();
await p.waitForTimeout(800);
ok('passo do endereco pede localizacao 1 vez', await p.evaluate(() => window.__geo) === 1, await p.evaluate(() => window.__geo));
// "Edasi" sem endereco avisa
await p.getByTestId('passo-local').getByRole('button', { name: 'Edasi', exact: true }).tap();
await p.waitForTimeout(300);
ok('endereco: Edasi vazio avisa e foca o campo', await p.getByTestId('passo-local').getByTestId('falta-aviso').isVisible() && await p.evaluate(() => document.activeElement?.id) === 'pedido-endereco');
await p.locator('#pedido-endereco').fill('Tartu mnt 67');
ok('campo de endereco continua editavel (sem travar)', await p.locator('#pedido-endereco').inputValue() === 'Tartu mnt 67');
ok('sem erro de pagina', erros.length === 0, erros.join(' | '));
await ctx.close();

// ---- 2) celular em pe, aviso de cookies ainda sem resposta: a barra Tagasi/Edasi fica acima dele
{
  const { ctx, p, funil, erros } = await contexto({ viewport: { width: 390, height: 780 }, cookies: null });
  await p.goto(`${SITE}/ee/et/paring`, { waitUntil: 'networkidle' });
  const banner = p.getByTestId('aviso-cookies');
  ok('390x780: aviso de cookies na tela', await banner.isVisible());
  await p.getByRole('button', { name: /Kere- ja/ }).first().tap();
  await p.getByTestId('passo-detalhe').waitFor();
  await p.waitForTimeout(500);
  const b = await banner.boundingBox(), n = await p.getByTestId('passo-detalhe').getByTestId('navegar').boundingBox();
  ok('390x780: barra Tagasi/Edasi inteira acima do aviso de cookies', b && n && n.y + n.height <= b.y + 1 && n.y >= 0, `barra ${r(n)} aviso ${r(b)}`);
  const edasiBox = await p.getByTestId('passo-detalhe').getByRole('button', { name: 'Edasi', exact: true }).boundingBox();
  ok('390x780: Edasi visivel e fora do aviso', edasiBox && edasiBox.y + edasiBox.height <= b.y + 1, `edasi ${r(edasiBox)}`);
  await p.getByRole('button', { name: 'Keeldu' }).tap();
  await p.waitForTimeout(400);
  ok('funil: resposta ao aviso de cookies (cookie_recusado)', funil.includes('cookie_recusado'), JSON.stringify(funil));
  const n2 = await p.getByTestId('passo-detalhe').getByTestId('navegar').boundingBox();
  ok('390x780: aviso respondido, a barra volta ao pe da tela', n2 && n2.y + n2.height <= 780 && n2.y + n2.height > 780 - 40, r(n2));
  ok('390x780: sem erro de pagina', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

// ---- 3) celular deitado (740x300, gravacao do Clarity 11/11): o 1o cartao de servico aparece sem rolar
{
  const { ctx, p, erros } = await contexto({ viewport: { width: 740, height: 300 }, cookies: null });
  await p.goto(`${SITE}/ee/et/paring`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  const menu = await p.locator('nav.sticky').first().boundingBox();
  ok('740x300: menu de cima baixo (<= 48 px)', menu && menu.height <= 48, r(menu));
  ok('740x300: subtitulo escondido', !(await p.locator('.pedido-subtitulo').isVisible()));
  const b = await p.getByTestId('aviso-cookies').boundingBox();
  ok('740x300: aviso de cookies numa linha (<= 48 px)', b && b.height <= 48, r(b));
  const cartao = await p.getByRole('button', { name: /Kokkupõrge/ }).first().boundingBox();
  ok('740x300: 1o cartao de servico inteiro na tela, acima do aviso', cartao && cartao.y >= 0 && cartao.y + cartao.height <= (b ? b.y : 300) + 1, `cartao ${r(cartao)} aviso ${r(b)}`);
  await p.getByRole('button', { name: /Kere- ja/ }).first().tap();
  await p.getByTestId('passo-detalhe').waitFor();
  await p.waitForTimeout(500);
  const n = await p.getByTestId('passo-detalhe').getByTestId('navegar').boundingBox();
  ok('740x300: barra Tagasi/Edasi visivel acima do aviso', n && n.y >= 0 && n.y + n.height <= (b ? b.y : 300) + 1, `barra ${r(n)}`);
  ok('740x300: sem erro de pagina', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

await br.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
