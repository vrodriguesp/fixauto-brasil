// Chat de suporte com o admin (dono 03/11):
//  1 visitante (russo, celular): botao no canto so depois de rolar (na primeira
//    tela cobria o botao principal), janela em tela cheia, pede
//    nome + e-mail + consentimento, mensagem vai; admin offline -> resposta
//    automatica em russo e e-mail ao admin
//  2 admin: ve a conversa traduzida para o portugues (com o original), responde
//    em ingles -> visitante recebe em russo com "показать оригинал"; visitante
//    com o chat fechado recebe a resposta por e-mail
//  3 admin online (painel aberto) -> nova mensagem SEM resposta automatica
//  4 modo manual: recebida chega no original e o admin toca "Traduzir"; a
//    resposta vai traduzida so com a caixa marcada
//  5 oficina logada (celular): botao acima da barra de baixo, sem cobrir;
//    some na conversa com cliente (/oficina/mensagens/...)
//  6 6 linguas: botao com rotulo traduzido, sem rolagem lateral
// Gasta poucos caracteres do DeepL (precisa de DEEPL_API_KEY no .env.local).
//   node site-suporte.mjs <.env.local> [SITE]
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
const SITE = process.argv[3] || 'http://localhost:3100';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const MSG = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/messages';
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8'))));
const tr = (l) => { const m = msgs(l); return (k) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`); };
const RU = tr('ru');
const PREFIXO = { pt: '/br/pt', 'pt-PT': '/pt/pt', en: '/ee/en', et: '/ee/et', it: '/it/it', ru: '/ee/ru' };
const PASTA = env.EMAIL_PASTA_TESTE;
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const conversas = []; let ofId;
const EMAIL_VIS = `visitante-${tag}@example.test`;
const cirilico = /[А-Яа-яЁё]{4,}/;
const emailsDesde = (t0, para) => (PASTA && fs.existsSync(PASTA) ? fs.readdirSync(PASTA) : []).filter((f) => Number(f.split('_')[0]) >= t0 && (!para || f.includes(para.replace(/[^a-z0-9@._-]/gi, '_')))).map((f) => fs.readFileSync(path.join(PASTA, f), 'utf8'));
const config = (c) => sb.from('plataforma_config').upsert({ id: 1, ...c }, { onConflict: 'id' });

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const TELAS = { celular: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true }, pc: { viewport: { width: 1366, height: 900 } } };
const ctxNovo = async (tela) => { const c = await browser.newContext(TELAS[tela]); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} }); return c; };
const entrar = async (ctx, u, pre = '/ee/ru') => { const p = await ctx.newPage(); await p.goto(`${SITE}${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]'); await p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(2500); return p; };
const conta = async (tipo, nome, idioma = 'ru') => {
  const email = `sup-${tipo}${contas.length}-${tag}@example.test`; const senha = `Sp${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone: '+372 5000 0000' });
  return { id: data.user.id, email, senha };
};
const semRolagem = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const esperar = async (fn, ms = 20000) => { for (let t = 0; t < ms; t += 1000) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 1000)); } return fn(); };
const janela = (p) => p.getByTestId('chat-suporte-janela');

try {
  await config({ admin_visto_em: null, suporte_traducao: true });

  // ---------- 1 visitante
  const ctxV = await ctxNovo('celular'); const pV = await ctxV.newPage();
  await pV.goto(`${SITE}/ee/ru`, { waitUntil: 'networkidle' }); await pV.waitForTimeout(1500);
  const botao = pV.getByTestId('chat-suporte-botao');
  ok('1 celular, primeira tela: botao escondido (nao cobre o botao principal)', !(await botao.isVisible()));
  await pV.evaluate(() => window.scrollTo(0, 700)); await pV.waitForTimeout(500);
  ok('1 botao do chat no canto', await botao.isVisible(), '');
  ok('1 rotulo do botao em russo', (await botao.getAttribute('aria-label')) === RU('suporte.abrir'));
  await botao.click(); await pV.waitForTimeout(500);
  ok('1 ao abrir, o foco vai para o campo Nome', await pV.evaluate(() => document.activeElement?.id === 'suporte-nome'));
  await pV.keyboard.press('Escape'); await pV.waitForTimeout(300);
  ok('1 Esc fecha e o foco volta ao botao', !(await janela(pV).isVisible().catch(() => false)) && await pV.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'chat-suporte-botao'));
  await botao.click(); await pV.waitForTimeout(500);
  const caixa = await janela(pV).boundingBox();
  ok('1 celular: janela em tela cheia', caixa && caixa.width >= 359 && caixa.height >= 770, JSON.stringify(caixa));
  ok('1 sem rolagem lateral com o chat aberto', await semRolagem(pV));
  await pV.getByRole('button', { name: RU('suporte.comecar') }).click(); await pV.waitForTimeout(300);
  ok('1 sem nome/e-mail: pede os campos', (await janela(pV).innerText()).includes(RU('suporte.erroCampos')));
  await pV.fill('#suporte-nome', 'Ivan Test'); await pV.fill('#suporte-email', EMAIL_VIS);
  await pV.getByRole('button', { name: RU('suporte.comecar') }).click(); await pV.waitForTimeout(300);
  ok('1 sem consentimento: pede para marcar', (await janela(pV).innerText()).includes(RU('suporte.erroConsentimento')));
  await pV.locator('input[name=consentimento]').check();
  const t0 = Date.now();
  await pV.getByRole('button', { name: RU('suporte.comecar') }).click();
  await pV.locator('#suporte-texto').waitFor({ timeout: 15000 });
  await pV.fill('#suporte-texto', `Здравствуйте! Как добавить фото в смету? (${tag})`);
  await pV.getByTestId('chat-suporte-enviar').click();
  const comAuto = await esperar(async () => { const t = await janela(pV).innerText(); return t.includes('Спасибо за сообщение') ? t : null; });
  ok('1 admin offline: resposta automatica em russo', !!comAuto, (await janela(pV).innerText()).slice(-200));
  const { data: conv } = await sb.from('suporte_conversas').select('id, visitante_email, idioma, nao_lidas_admin, pagina').eq('visitante_email', EMAIL_VIS).single();
  if (conv) conversas.push(conv.id);
  ok('1 conversa gravada (ru, 1 nao lida)', conv?.idioma === 'ru' && conv?.nao_lidas_admin === 1, JSON.stringify(conv));
  ok('1 de visitante nao guarda a pagina', conv?.pagina === null, conv?.pagina);
  const eAdmin = await esperar(async () => emailsDesde(t0).find((h) => h.includes('Chat de suporte')));
  ok('1 e-mail ao admin com a traducao', !!eAdmin && /foto/i.test(eAdmin) && eAdmin.includes(tag), (eAdmin || 'sem e-mail').slice(0, 200));

  // ---------- 2 admin responde em ingles
  const adm = await conta('admin', 'Admin Suporte', 'pt');
  const ctxA = await ctxNovo('pc'); const pA = await entrar(ctxA, adm, '/br/pt');
  await pA.goto(`${SITE}/admin/suporte`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(2000);
  await pA.getByTestId('suporte-conversa').filter({ hasText: 'Ivan Test' }).first().click(); await pA.waitForTimeout(2500);
  let tA = await pA.locator('main').innerText();
  ok('2 admin le em portugues ("traduzido do russo")', /foto/i.test(tA) && tA.includes('traduzido do russo') && !tA.includes('Как добавить'), tA.slice(0, 300));
  await pA.getByTestId('suporte-ver-original').first().click(); await pA.waitForTimeout(300);
  tA = await pA.locator('main').innerText();
  ok('2 "ver original" mostra o russo', tA.includes('Как добавить') && tA.includes('ver tradução'), tA.slice(0, 300));
  ok('2 a resposta automatica aparece marcada para o admin', tA.includes('Resposta automática'));
  // visitante fecha o chat e "sai" (nao conta como ativo) -> resposta tambem por e-mail
  await pV.getByRole('button', { name: RU('suporte.fechar') }).click();
  await pV.waitForTimeout(5000); // a ultima consulta do chat aberto (marca 'ativo') termina antes
  await sb.from('suporte_conversas').update({ usuario_visto_em: new Date(Date.now() - 10 * 60e3).toISOString() }).eq('id', conv.id);
  const t1 = Date.now();
  await pA.getByTestId('suporte-resposta').fill(`You can upload a photo or PDF of your estimate on the quote page (${tag}).`);
  await pA.getByRole('button', { name: 'Enviar' }).click();
  tA = await esperar(async () => { const t = await pA.locator('main').innerText(); return t.includes('enviado em russo') ? t : null; });
  await pA.getByTestId('suporte-ver-original').last().click(); await pA.waitForTimeout(300);
  const { data: env } = await sb.from('suporte_mensagens').select('traducao').eq('conversa_id', conv.id).eq('autor', 'admin').order('created_at', { ascending: false }).limit(1).single();
  tA = await pA.locator('main').innerText();
  ok('2 admin ve como a resposta foi (em russo)', !!env?.traducao && cirilico.test(env.traducao) && tA.includes(env.traducao.slice(0, 25)) && tA.includes('ver o que você escreveu'), (tA || '').slice(-300));
  const eResp = await esperar(async () => emailsDesde(t1, EMAIL_VIS)[0]);
  ok('2 visitante com o chat fechado recebe a resposta por e-mail, em russo', !!eResp && eResp.includes('Ответ от BipFix') && cirilico.test(eResp) && eResp.includes('suporte=1'), (eResp || 'sem e-mail').slice(0, 200));
  // contador no botao fechado
  const cont = await esperar(async () => (await pV.getByTestId('chat-suporte-nao-lidas').innerText().catch(() => '')) === '1', 60000);
  ok('2 botao fechado mostra 1 nao lida', !!cont);
  await pV.getByTestId('chat-suporte-botao').click();
  const tV = await esperar(async () => { const t = await janela(pV).innerText(); return t.includes(RU('traducao.verOriginal')) ? t : null; });
  ok('2 visitante le a resposta em russo com "показать оригинал"', !!tV && !tV.includes('You can upload'), (tV || '').slice(-300));
  await pV.getByRole('button', { name: new RegExp(RU('traducao.verOriginal')) }).first().click(); await pV.waitForTimeout(300);
  ok('2 "показать оригинал" mostra o ingles', (await janela(pV).innerText()).includes('You can upload'));

  // ---------- 3 admin online -> sem resposta automatica
  await pA.goto(`${SITE}/admin/suporte`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(2000); // sinal de online
  const { count: autos1 } = await sb.from('suporte_mensagens').select('id', { count: 'exact', head: true }).eq('conversa_id', conv.id).eq('autor', 'auto');
  await sb.from('suporte_mensagens').update({ created_at: new Date(Date.now() - 7 * 3600e3).toISOString() }).eq('conversa_id', conv.id).eq('autor', 'auto'); // a regra de 6 h nao atrapalha
  await pV.fill('#suporte-texto', `Спасибо, понятно (${tag})`); await pV.getByTestId('chat-suporte-enviar').click(); await pV.waitForTimeout(4000);
  const { count: autos2 } = await sb.from('suporte_mensagens').select('id', { count: 'exact', head: true }).eq('conversa_id', conv.id).eq('autor', 'auto');
  ok('3 admin online: nenhuma resposta automatica nova', autos1 === 1 && autos2 === 1, `${autos1} -> ${autos2}`);
  const vis = await pV.locator('text=Сейчас в сети').count();
  ok('3 visitante ve "Сейчас в сети"', vis > 0);

  // ---------- 4 modo manual: recebida chega no original com "Traduzir"; resposta traduzida so se marcada
  await pA.getByRole('button', { name: /^Tradução:/ }).click(); await pA.waitForTimeout(300);
  await pA.getByTestId('suporte-traducao-manual').check({ force: true }); await pA.waitForTimeout(1000);
  const { data: cfg } = await sb.from('plataforma_config').select('suporte_traducao').eq('id', 1).single();
  ok('4 admin escolhe o modo manual', cfg.suporte_traducao === false);
  await pV.fill('#suporte-texto', `Ещё вопрос: можно ли добавить второй адрес? (${tag})`); await pV.getByTestId('chat-suporte-enviar').click(); await pV.waitForTimeout(3000);
  const { data: rec } = await sb.from('suporte_mensagens').select('id, traducao').eq('conversa_id', conv.id).eq('autor', 'usuario').order('created_at', { ascending: false }).limit(1).single();
  ok('4 manual: mensagem recebida sem traducao', rec.traducao === null, JSON.stringify(rec));
  await pA.getByTestId('suporte-conversa').filter({ hasText: 'Ivan Test' }).first().click(); await pA.waitForTimeout(2000);
  await pA.getByTestId('suporte-traduzir-msg').last().click();
  const trad = await esperar(async () => (await sb.from('suporte_mensagens').select('traducao').eq('id', rec.id).single()).data?.traducao);
  ok('4 manual: "Traduzir para português" traduz a recebida', !!trad && !/[А-Яа-я]{4,}/.test(trad), trad);
  const tA4 = await esperar(async () => { const t = await pA.locator('main').innerText(); return trad && t.includes(trad.slice(0, 20)) && t.includes('traduzido do russo') ? t : null; });
  ok('4 manual: admin ve a traducao com o original', !!tA4);
  await pA.getByTestId('suporte-traduzir-resposta').uncheck();
  await pA.getByTestId('suporte-resposta').fill(`Plain English reply (${tag})`); await pA.getByRole('button', { name: 'Enviar' }).click(); await pA.waitForTimeout(2500);
  let { data: ult } = await sb.from('suporte_mensagens').select('texto, traducao').eq('conversa_id', conv.id).eq('autor', 'admin').order('created_at', { ascending: false }).limit(1).single();
  ok('4 manual: resposta sem a caixa marcada vai sem traducao', ult.traducao === null && ult.texto.startsWith('Plain English'), JSON.stringify(ult));
  const tV2 = await esperar(async () => { const t = await janela(pV).innerText(); return t.includes('Plain English reply') ? t : null; });
  ok('4 visitante recebe como foi escrita', !!tV2);
  await pA.getByTestId('suporte-traduzir-resposta').check();
  await pA.getByTestId('suporte-resposta').fill(`Yes, you can add a second address in your profile (${tag})`); await pA.getByRole('button', { name: 'Enviar' }).click(); await pA.waitForTimeout(3000);
  ({ data: ult } = await sb.from('suporte_mensagens').select('texto, traducao').eq('conversa_id', conv.id).eq('autor', 'admin').order('created_at', { ascending: false }).limit(1).single());
  ok('4 manual: resposta com a caixa marcada vai traduzida para o russo', !!ult.traducao && /[А-Яа-я]{4,}/.test(ult.traducao), JSON.stringify(ult));
  await config({ suporte_traducao: true });
  // admin no celular: lista -> conversa (com voltar) e campo de resposta visivel, sem rolagem lateral
  const ctxAc = await ctxNovo('celular'); const pAc = await entrar(ctxAc, adm, '/br/pt');
  await pAc.goto(`${SITE}/admin/suporte`, { waitUntil: 'networkidle' }); await pAc.waitForTimeout(2000);
  await pAc.getByTestId('suporte-conversa').filter({ hasText: 'Ivan Test' }).first().click(); await pAc.waitForTimeout(2500);
  const campo = await pAc.getByTestId('suporte-resposta').boundingBox();
  const altura = pAc.viewportSize().height;
  ok('4 admin celular: conversa aberta e campo de resposta na tela', !!campo && campo.y + campo.height <= altura && (await pAc.getByTestId('suporte-conversa').first().isHidden()), JSON.stringify(campo));
  ok('4 admin celular: sem rolagem lateral', await pAc.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await pAc.getByRole('button', { name: 'Voltar' }).click(); await pAc.waitForTimeout(500);
  ok('4 admin celular: voltar mostra a lista', await pAc.getByTestId('suporte-conversa').first().isVisible());
  await pAc.screenshot({ path: 'admin-suporte-celular.png' });
  await ctxAc.close();
  await pA.getByTestId('suporte-conversa').filter({ hasText: 'Ivan Test' }).first().click(); await pA.waitForTimeout(2000);
  await pA.screenshot({ path: 'admin-suporte-pc.png' });
  await ctxA.close(); await ctxV.close();

  // ---------- 5 oficina logada no celular
  await config({ admin_visto_em: null });
  const dono = await conta('oficina', 'Dono Suporte');
  const { data: of } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `SUP ${tag}`, endereco: 'Kesktee 1', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: 59.437, longitude: 24.75, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica'], seguradoras_convencionadas: [] }).select('id').single();
  ofId = of.id;
  const ctxO = await ctxNovo('celular'); const pO = await entrar(ctxO, dono);
  await pO.goto(`${SITE}/ee/ru/oficina/pedidos`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(2000);
  const b = await pO.getByTestId('chat-suporte-botao').boundingBox();
  const barra = await pO.locator('nav[aria-label]').last().boundingBox();
  ok('5 botao acima da barra de baixo (sem cobrir)', b && barra && b.y + b.height <= barra.y - 4, JSON.stringify({ b, barra }));
  await pO.getByTestId('chat-suporte-botao').click(); await pO.waitForTimeout(800);
  ok('5 oficina logada nao precisa de nome/e-mail', !(await pO.locator('#suporte-nome').count()) && (await pO.locator('#suporte-texto').count()) === 1);
  await pO.fill('#suporte-texto', `Нужна помощь с профилем (${tag})`); await pO.getByTestId('chat-suporte-enviar').click(); await pO.waitForTimeout(4000);
  const { data: convO } = await sb.from('suporte_conversas').select('id, profile_id').eq('profile_id', dono.id).maybeSingle();
  if (convO) conversas.push(convO.id);
  ok('5 conversa da conta da oficina', !!convO);
  await pO.goto(`${SITE}/ee/ru/oficina/mensagens/00000000-0000-0000-0000-000000000000`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(1500);
  ok('5 sem botao na conversa com o cliente', !(await pO.getByTestId('chat-suporte-botao').isVisible().catch(() => false)));
  await ctxO.close();

  // ---------- 6 6 linguas (visitante, celular e PC)
  for (const tela of ['celular', 'pc']) {
    const ctx = await ctxNovo(tela); const p = await ctx.newPage();
    for (const [l, pre] of Object.entries(PREFIXO)) {
      await p.goto(`${SITE}${pre}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
      await p.evaluate(() => window.scrollTo(0, 700)); await p.waitForTimeout(400);
      const bt = p.getByTestId('chat-suporte-botao');
      ok(`6 ${tela} ${l}: botao traduzido e sem rolagem lateral`, (await bt.getAttribute('aria-label')) === tr(l)('suporte.abrir') && await semRolagem(p));
    }
    await ctx.close();
  }

  // ---------- 7 aviso de cookies sem resposta (dono 04/11: tampava o botao). Os outros testes ja
  // comecam com cookies respondidos, por isso nao viam; aqui o aviso aparece de verdade
  // (o site de teste precisa de NEXT_PUBLIC_GA_MEASUREMENT_ID para mostrar o aviso).
  const semConsent = async (tela) => {
    const c = await browser.newContext(TELAS[tela]);
    await c.route(/googletagmanager|google-analytics|clarity.ms/, (r) => r.abort());
    await c.addInitScript(() => { try { localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} });
    return c;
  };
  const acimaDoAviso = async (p, nome) => {
    const aviso = await p.getByTestId('aviso-cookies').boundingBox();
    const bt = await p.getByTestId('chat-suporte-botao').boundingBox();
    ok(`7 ${nome}: aviso de cookies aparece`, !!aviso);
    // os botoes do aviso estao por cima de tudo (nao escondidos pela barra de baixo nem pelo chat)
    const livre = await p.getByTestId('aviso-cookies').getByRole('button').evaluateAll((bs) => bs.every((x) => { const r = x.getBoundingClientRect(); const topo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!topo && (topo === x || x.contains(topo)); }));
    ok(`7 ${nome}: botoes do aviso visiveis e clicaveis`, livre);
    ok(`7 ${nome}: botao do chat acima do aviso (sem cobrir)`, !!aviso && !!bt && bt.y + bt.height <= aviso.y - 4, JSON.stringify({ bt, aviso }));
  };
  for (const tela of ['celular', 'pc']) {
    const ctx = await semConsent(tela); const p = await ctx.newPage();
    await p.goto(`${SITE}/ee/ru`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    await p.evaluate(() => window.scrollTo(0, 700)); await p.waitForTimeout(600);
    await acimaDoAviso(p, `visitante ${tela}`);
    await p.getByTestId('aviso-cookies').getByRole('button', { name: RU('cookieBanner.rejeitar') }).click(); await p.waitForTimeout(600);
    const bt = await p.getByTestId('chat-suporte-botao').boundingBox();
    ok(`7 visitante ${tela}: depois de responder, o botao volta para baixo`, !!bt && bt.y + bt.height >= p.viewportSize().height - 40, JSON.stringify(bt));
    await ctx.close();
  }
  {
    const ctx = await semConsent('celular'); const p = await entrar(ctx, dono);
    await p.goto(`${SITE}/ee/ru/oficina/pedidos`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    await acimaDoAviso(p, 'oficina celular (com a barra de baixo)');
    await p.screenshot({ path: 'cookies-chat-oficina.png' });
    await ctx.close();
  }
} catch (e) {
  falhas++; console.log('ERRO', e.message);
} finally {
  await browser.close();
  await config({ suporte_traducao: true, admin_visto_em: null });
  for (const c of conversas) await sb.from('suporte_conversas').delete().eq('id', c);
  await sb.from('suporte_conversas').delete().eq('visitante_email', EMAIL_VIS);
  if (ofId) await sb.from('oficinas').delete().eq('id', ofId);
  for (const id of contas) { await sb.from('suporte_conversas').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
