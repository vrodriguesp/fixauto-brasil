// APP (versao web, celular 360 px): pacote do dono 15/11
//  1 Perfil: campo de telefone (+372 padrao, >= 8 digitos), salvar grava no perfil; invalido avisa;
//    apagar o numero e permitido. Fotos ET e RU a 360 px.
//  2 Pedido aceito: "Muuda numbrit" abre o perfil, que agora tem o campo.
//  3 Antes de escolher: a linha "so a oficina escolhida ve o seu contato" junto do botao.
//  4 Observacoes da oficina no orcamento (antes so no site): RU -> motorista ET pelo /api/traduzir
//    (simulado aqui, como os testes do site fazem), sem [COMISSAO:...], "ver original" volta ao RU;
//    orcamento sem observacoes nao mostra a secao.
// Pre-requisito: app web em :8090 (servir-app-web.mjs) e site em :3100.
//   node app-perfil-observacoes.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const APP = 'http://localhost:8090';
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados';
const MOB = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/site/apps/mobile/i18n/locales';
const txt = (loc) => { const j = JSON.parse(fs.readFileSync(`${MOB}/${loc}.json`, 'utf8')); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], j) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 260) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const oficinas = []; const sols = [];
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const erros = [];
const semCortes = async (page, nome) => {
  const t = await page.innerText('body');
  ok(`${nome}: sem chave crua`, !/\b(telefoneOficina|pedidoSemConta|perfil|orcamentos|traducao)\.[a-zA-Z]+|\?\?[a-z]/.test(t), (t.match(/\b(telefoneOficina|pedidoSemConta|perfil|orcamentos|traducao)\.[a-zA-Z]+|\?\?[a-z]+/) || [])[0]);
  ok(`${nome}: sem rolagem lateral`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  return t;
};
const RU_OBS = 'Нужно заменить тормозные колодки и проверить диски.';
const ET_OBS = 'Piduriklotsid tuleb vahetada ja kettad üle kontrollida.';
const traduzidos = [];
async function contexto(locale) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale });
  // tradutor simulado (local nao tem DeepL): o mesmo formato da rota /api/traduzir
  await ctx.route('**/api/traduzir', async (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    traduzidos.push(b);
    await r.fulfill({ json: { traducoes: (b.textos || []).map((t) => (t === RU_OBS && b.lingua === 'et' ? { texto: ET_OBS, origem: 'ru' } : { texto: null, origem: null })) } });
  });
  return ctx;
}
async function entrar(page, email, senha, T) {
  await page.goto(APP, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.getByLabel(T('auth.email'), { exact: true }).locator('visible=true').first().fill(email);
  await page.getByLabel(T('auth.senha'), { exact: true }).locator('visible=true').first().fill(senha);
  await page.getByText(T('auth.entrar'), { exact: true }).locator('visible=true').last().click();
  await page.waitForTimeout(4000);
}
const telDe = async (id) => (await sb.from('profiles').select('telefone').eq('id', id).single()).data.telefone;

try {
  const senha = `App${tag}Senha9`;
  const criar = async (email, perfil) => {
    const { data: u } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
    contas.push(u.user.id);
    await sb.from('profiles').insert({ id: u.user.id, email, ...perfil });
    return u.user.id;
  };
  const emailCli = `app-perfil-${tag}@example.test`;
  const cli = await criar(emailCli, { tipo: 'cliente', nome: 'Perfil App', idioma: 'et' });
  const novaOficina = async (n) => {
    const p = await criar(`app-perfil-of${n}-${tag}@example.test`, { tipo: 'oficina', nome: `Of ${n}`, idioma: 'ru' });
    const { data: of } = await sb.from('oficinas').insert({ profile_id: p, nome_fantasia: `Автосервис ${n} ${tag}`, endereco: 'x', cidade: 'Tallinn', estado: '-', cep: '1', pais: 'EE', latitude: 59.45, longitude: 24.74, ativa: true }).select('id, nome_fantasia').single();
    oficinas.push(of.id); return of;
  };
  const of1 = await novaOficina(1); const of2 = await novaOficina(2);
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Yaris', fipe_ano: '2015' }).select('id').single();
  const novoPedido = async () => {
    const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli, veiculo_id: v.id, tipo: 'mecanica', descricao: `Perfil ${tag}`, urgencia: 'media', latitude: 59.44, longitude: 24.74, endereco: 'Tallinn', status: 'em_orcamento' }).select('id').single();
    sols.push(s.id); return s;
  };
  const d1 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const orc = async (s, of, observacoes) => {
    const { data: o } = await sb.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: of.id, valor_total: 95, prazo_dias: 1, status: 'enviado', validade: '2030-01-01', observacoes }).select('id').single();
    await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_checkin: d1, turno: 'manha', data_previsao_entrega: d1 });
    return o;
  };
  const sA = await novoPedido();
  await orc(sA, of1, `[COMISSAO:10] ${RU_OBS}`);
  await orc(sA, of2, null);

  const ET = txt('et');
  const ctx = await contexto('et-EE');
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erros.push(String(e.message)));
  await entrar(page, emailCli, senha, ET);

  // 4 observacoes (e 3, a linha do contato junto do botao)
  await page.goto(`${APP}/solicitacao/${sA.id}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
  let t = await semCortes(page, '4 orcamentos ET');
  const obs = page.getByTestId('orcamento-observacoes').locator('visible=true');
  ok('4 so o orcamento com observacoes mostra a secao', (await obs.count()) === 1, String(await obs.count()));
  const tObs = (await obs.count()) ? await obs.first().innerText() : '';
  ok('4 rotulo "Märkused" e o texto traduzido para ET', tObs.includes(ET('orcamentos.observacoes')) && tObs.includes(ET_OBS), tObs);
  ok('4 sem a marca interna [COMISSAO:...]', !t.includes('[COMISSAO') && !t.includes('COMISSAO'));
  ok('4 pediu a traducao pela rota do site (lingua et, texto limpo)', traduzidos.some((b) => b.lingua === 'et' && (b.textos || []).includes(RU_OBS)), JSON.stringify(traduzidos).slice(0, 200));
  ok('4 aviso "traduzido automaticamente"', tObs.includes(ET('traducao.traduzido')));
  await page.screenshot({ path: `${OUT}/app_observacoes_et_360.png`, fullPage: true });
  await obs.first().getByText(ET('traducao.verOriginal'), { exact: true }).click();
  await page.waitForTimeout(400);
  ok('4 "ver original" mostra o texto russo', (await obs.first().innerText()).includes(RU_OBS));
  ok('3 linha do contato junto do botao de escolher', (await page.getByTestId('contato-no-aceite').locator('visible=true').count()) >= 1 && t.includes(ET('telefoneOficina.contatoNoAceite')));

  // 1 perfil: campo de telefone
  await page.goto(`${APP}/perfil`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  const campo = page.getByTestId('perfil-telefone').locator('visible=true');
  ok('1 perfil tem o campo de telefone', (await campo.count()) === 1);
  t = await semCortes(page, '1 perfil ET');
  ok('1 prefixo +372 por padrao', t.includes('+372'));
  const input = page.getByLabel(ET('pedidoSemConta.telefone'), { exact: true }).locator('visible=true').last();
  ok('1 sem mudanca, sem botao salvar', (await page.getByTestId('perfil-telefone-salvar').locator('visible=true').count()) === 0);
  await input.fill('123');
  await page.getByTestId('perfil-telefone-salvar').locator('visible=true').first().click();
  await page.waitForTimeout(500);
  ok('1 numero curto -> aviso, nada gravado', (await page.innerText('body')).includes(ET('telefoneOficina.numeroInvalido')) && (await telDe(cli)) === null);
  await input.fill('5123 4567');
  await page.screenshot({ path: `${OUT}/app_perfil_telefone_et_360.png`, fullPage: true });
  await page.getByTestId('perfil-telefone-salvar').locator('visible=true').first().click();
  await page.getByTestId('perfil-telefone-salvo').locator('visible=true').first().waitFor({ timeout: 10000 }).catch(() => {});
  ok('1 salvo: "+372 5123 4567" no perfil e aviso na tela', (await telDe(cli)) === '+372 5123 4567' && (await page.innerText('body')).includes(ET('perfil.telefoneSalvo')), await telDe(cli));
  await page.screenshot({ path: `${OUT}/app_perfil_telefone_et_360_salvo.png`, fullPage: true });

  // 2 pedido aceito: "Muuda numbrit" abre o perfil com o campo
  await sb.from('orcamentos').update({ status: 'aceito' }).eq('solicitacao_id', sA.id).eq('oficina_id', of1.id);
  await sb.from('orcamentos').update({ status: 'recusado' }).eq('solicitacao_id', sA.id).eq('oficina_id', of2.id);
  await page.goto(`${APP}/solicitacao/${sA.id}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  const ve = page.getByTestId('telefone-oficina-ve').locator('visible=true');
  ok('2 aceito: "a oficina ve o seu numero" com "Muuda numbrit"', (await ve.count()) === 1 && (await ve.first().innerText()).includes(ET('telefoneOficina.alterar')) && ET('telefoneOficina.alterar') === 'Muuda numbrit');
  await ve.first().getByText(ET('telefoneOficina.alterar'), { exact: true }).click();
  await page.waitForTimeout(2000);
  ok('2 o link abre o perfil com o campo do numero', /\/perfil/.test(page.url()) && (await page.getByTestId('perfil-telefone').locator('visible=true').count()) === 1, page.url());
  // apagar o numero e permitido
  await page.getByLabel(ET('pedidoSemConta.telefone'), { exact: true }).locator('visible=true').last().fill('');
  await page.getByTestId('perfil-telefone-salvar').locator('visible=true').first().click();
  await page.waitForTimeout(1500);
  ok('1 campo vazio apaga o numero', (await telDe(cli)) === null, await telDe(cli));
  await ctx.close();

  // RU a 360 px
  const RU = txt('ru');
  await sb.from('profiles').update({ idioma: 'ru', telefone: '+372 5555 1212' }).eq('id', cli);
  const ctxRu = await contexto('ru-RU');
  const pr = await ctxRu.newPage();
  pr.on('pageerror', (e) => erros.push(String(e.message)));
  await entrar(pr, emailCli, senha, RU);
  await pr.goto(`${APP}/perfil`, { waitUntil: 'networkidle' }); await pr.waitForTimeout(2000);
  t = await semCortes(pr, '1 perfil RU');
  ok('1 RU: campo com o numero salvo e o texto de privacidade em russo', (await pr.getByTestId('perfil-telefone').locator('visible=true').count()) === 1 && t.includes(RU('pedidoSemConta.smsPrivacidade')));
  await pr.screenshot({ path: `${OUT}/app_perfil_telefone_ru_360.png`, fullPage: true });
  await ctxRu.close();
  ok('sem erro de JavaScript', erros.length === 0, erros.join(' | '));
} catch (e) {
  falhas++; console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  for (const id of sols) { await sb.from('notificacoes').delete().eq('dados->>solicitacao_id', id); await sb.from('mensagens').delete().eq('solicitacao_id', id); const { data: os } = await sb.from('orcamentos').select('id').eq('solicitacao_id', id); for (const o of os || []) await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await sb.from('orcamentos').delete().eq('solicitacao_id', id); await sb.from('solicitacoes').delete().eq('id', id); }
  for (const id of oficinas) await sb.from('oficinas').delete().eq('id', id);
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id).catch(() => {}); }
  console.log(`\n${falhas ? 'FALHAS: ' + falhas : 'TUDO OK'}`);
}
