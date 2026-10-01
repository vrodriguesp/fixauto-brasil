// Teste de ponta a ponta do APP (versao web do mesmo codigo, tela de iPhone),
// como uma pessoa usaria: acidente sem conta, cadastro + confirmacao + login,
// veiculo, pedido, orcamento aceito, mensagem, idioma, sair; e varredura das
// telas de entrada nos 6 idiomas. Banco de PRODUCAO, limpa tudo no fim.
//   node app-e2e.mjs <.env.local> [idioma=it]
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const IDIOMA = process.argv[3] || 'it';
const APP = 'http://localhost:8090';
const SITE = 'https://bipfix.com';
const MOB = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/mobile/i18n/locales';
const FOTO = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/public/apple-touch-icon.png';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const LOC_BROWSER = { pt: 'pt-BR', 'pt-PT': 'pt-PT', en: 'en-GB', et: 'et-EE', it: 'it-IT', ru: 'ru-RU' };
const txt = (loc) => {
  const j = JSON.parse(fs.readFileSync(`${MOB}/${loc}.json`, 'utf8'));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], j) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};
const T = txt(IDIOMA);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + x : ''}`); };
const CHAVE_CRUA = /\b(auth|emergencia|seguro|veiculos|novaSolicitacao|tabs|common|perfil|erros|solicitacoes|mensagens|dashboard|orcamentos|acompanhamento|constants)\.[a-zA-Z_]+/;
const tag = crypto.randomBytes(3).toString('hex');
const limpar = { contas: [], oficinas: [], emails: [] };

async function checaTela(page, nome) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth - window.innerWidth, t: document.body.innerText }));
  const crua = r.t.match(CHAVE_CRUA);
  if (crua) ok(`${nome}: sem chave crua`, false, crua[0]);
  if (r.sw > 1) ok(`${nome}: sem transbordo`, false, `${r.sw}px`);
  return r.t;
}
const clicaTexto = async (page, texto) => { await page.getByText(texto, { exact: true }).locator('visible=true').last().click(); };
const campo = (page, rotulo) => page.getByLabel(rotulo, { exact: true }).locator('visible=true').first();

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const novoContexto = (loc) => browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: LOC_BROWSER[loc],
  geolocation: { latitude: 59.437, longitude: 24.745 }, permissions: ['geolocation'],
});
const errosPagina = (page) => { const e = []; page.on('pageerror', (x) => e.push(x.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) e.push(m.text()); }); return e; };

try {
  // ---------------- 1) varredura das telas de entrada nos 6 idiomas
  for (const loc of ['pt', 'pt-PT', 'en', 'et', 'it', 'ru']) {
    const Tl = txt(loc);
    const ctx = await novoContexto(loc); const page = await ctx.newPage(); const erros = errosPagina(page);
    await page.goto(APP, { waitUntil: 'networkidle' });
    await page.getByText(Tl('auth.slogan')).waitFor({ timeout: 15000 }).catch(() => {});
    const t1 = await checaTela(page, `[${loc}] entrada`);
    ok(`[${loc}] entrada no idioma do aparelho`, t1.includes(Tl('auth.slogan')));
    await clicaTexto(page, Tl('auth.criarConta'));
    await page.waitForTimeout(800);
    await checaTela(page, `[${loc}] cadastro`);
    await page.goto(`${APP}/emergencia`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const t3 = await checaTela(page, `[${loc}] acidente`);
    ok(`[${loc}] acidente pede contato sem conta`, t3.includes(Tl('emergencia.contatoTitulo')));
    if (erros.length) ok(`[${loc}] sem erro na pagina`, false, erros[0].slice(0, 120));
    await page.screenshot({ path: `app-${loc}-acidente.png`, fullPage: true });
    await ctx.close();
  }

  // ---------------- 2) acidente SEM conta, com seguro e sugestao de endereco
  {
    const ctx = await novoContexto(IDIOMA); const page = await ctx.newPage(); const erros = errosPagina(page);
    await page.goto(APP, { waitUntil: 'networkidle' });
    await clicaTexto(page, T('emergencia.titulo'));
    await page.waitForTimeout(800);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), clicaTexto(page, T('emergencia.galeria'))]);
    await fc.setFiles(FOTO);
    await page.waitForTimeout(500);
    await campo(page, T('emergencia.descricaoLabel')).fill('Test automatico: urto al paraurti posteriore');
    await clicaTexto(page, T('emergencia.optionOutroCausouLabel'));
    await clicaTexto(page, T('seguro.opcao_seguro_terceiro'));
    await campo(page, T('seguro.labelSeguradora')).fill('ERGO');
    ok('dica do seguro do outro aparece', (await page.innerText('body')).includes(T('seguro.dica_seguro_terceiro_ee')));
    await campo(page, T('emergencia.localTitulo')).fill('Pärnu mnt 10');
    const sug = page.getByText(/Tallinn/).locator('visible=true').first();
    await sug.waitFor({ timeout: 10000 }).catch(() => {});
    ok('sugestao de endereco aparece ao digitar', await sug.isVisible().catch(() => false));
    if (await sug.isVisible().catch(() => false)) await sug.click();
    const email = `delivered+appac${tag}@resend.dev`;
    limpar.emails.push(email);
    await campo(page, T('auth.nome')).fill('TESTE AUTOMATICO');
    await campo(page, T('auth.email')).fill(email);
    await campo(page, T('auth.telefone')).fill('+37255550000');
    await checaTela(page, 'acidente preenchido');
    await clicaTexto(page, T('emergencia.enviarRegistro'));
    await page.getByText(T('seguro.proximosTitulo')).waitFor({ timeout: 20000 }).catch(() => {});
    const fim = await checaTela(page, 'acidente enviado');
    ok('acidente enviado sem conta', fim.includes(T('seguro.proximosTitulo')) && fim.includes(email), fim.slice(0, 80));
    await page.screenshot({ path: 'app-acidente-enviado.png', fullPage: true });
    const { data: em } = await admin.from('emergencias').select('id, profile_id, solicitacao_id').eq('email', email).maybeSingle();
    ok('acidente gravado no banco', !!em);
    if (em) {
      limpar.contas.push(em.profile_id);
      const { data: s } = await admin.from('solicitacoes').select('pagamento_reparo, seguradora, latitude').eq('id', em.solicitacao_id).single();
      ok('pedido com seguro do outro + ERGO + posicao escolhida', s.pagamento_reparo === 'seguro_terceiro' && s.seguradora === 'ERGO' && Math.abs(s.latitude - 59.43) < 0.1);
    }
    if (erros.length) ok('acidente: sem erro na pagina', false, erros[0].slice(0, 160));
    await ctx.close();
  }

  // ---------------- 3) cadastro -> confirmacao -> login -> veiculo -> pedido -> orcamento -> mensagem -> idioma -> sair
  {
    const ctx = await novoContexto(IDIOMA); const page = await ctx.newPage(); const erros = errosPagina(page);
    const email = `delivered+app${tag}@resend.dev`; const senha = `Teste-${tag}-Senha9`;
    limpar.emails.push(email);
    await page.goto(APP, { waitUntil: 'networkidle' });
    await clicaTexto(page, T('auth.criarConta'));
    await page.waitForTimeout(800);
    await campo(page, T('auth.nome')).fill('TESTE AUTOMATICO APP');
    await campo(page, T('auth.email')).fill(email);
    await campo(page, T('auth.telefone')).fill('+37255551111');
    await campo(page, T('auth.senha')).fill(senha);
    await campo(page, T('auth.confirmarSenha')).fill(senha);
    await page.getByRole('checkbox').locator('visible=true').first().click({ position: { x: 12, y: 14 } }); // na caixinha, nao no link dos Termos
    await page.getByText(T('auth.criarConta'), { exact: true }).locator('visible=true').last().click();
    await page.getByText(T('auth.verifiqueTitulo')).waitFor({ timeout: 20000 }).catch(() => {});
    ok('cadastro pelo app -> "confira seu e-mail"', (await checaTela(page, 'cadastro enviado')).includes(T('auth.verifiqueTitulo')));
    const { data: p } = await admin.from('profiles').select('id, idioma').eq('email', email).maybeSingle();
    ok('conta criada no idioma do app', p?.idioma === IDIOMA, p?.idioma);
    if (p) limpar.contas.push(p.id);

    await clicaTexto(page, T('auth.irLogin'));
    await campo(page, T('auth.email')).fill(email);
    await campo(page, T('auth.senha')).fill(senha);
    await clicaTexto(page, T('auth.entrar'));
    await page.waitForTimeout(2500);
    ok('login antes de confirmar explica o motivo', (await page.innerText('body')).includes(T('auth.naoConfirmado')));

    // link do e-mail aberto no navegador do celular (cadastro feito pelo app)
    const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const web = await ctx.newPage();
    const webLoc = IDIOMA === 'pt' ? 'pt-br' : IDIOMA.toLowerCase();
    await web.goto(`${SITE}/${webLoc}/confirmar-email?token_hash=${encodeURIComponent(link.properties.hashed_token)}&app=1`, { waitUntil: 'networkidle' });
    await web.waitForTimeout(3000);
    const tw = await web.innerText('body');
    ok('confirmacao manda de volta ao app', /bipfix:\/\/login/.test(await web.content()), tw.slice(0, 100));
    await web.close();

    await clicaTexto(page, T('auth.entrar'));
    await page.getByText(T('tabs.inicio')).first().waitFor({ timeout: 20000 }).catch(() => {});
    const tIni = await checaTela(page, 'inicio logado');
    ok('entrou no app depois de confirmar', tIni.includes(T('dashboard.novaSolicitacaoBotao')));

    // veiculo
    await page.goto(`${APP}/veiculo/novo`, { waitUntil: 'networkidle' });
    await campo(page, T('veiculos.marca')).click();
    await page.getByLabel(T('veiculos.marca'), { exact: true }).locator('visible=true').last().fill('Toyota');
    await page.getByText('Toyota', { exact: true }).last().click({ timeout: 10000 });
    await page.waitForTimeout(500);
    await campo(page, T('veiculos.modelo')).click();
    await page.getByLabel(T('veiculos.modelo'), { exact: true }).locator('visible=true').last().fill('Corolla');
    await page.getByText(/^Corolla/).first().click({ timeout: 10000 });
    await campo(page, T('veiculos.ano')).fill('2019');
    await campo(page, T('veiculos.placa')).fill('123ABC');
    await checaTela(page, 'novo veiculo');
    await clicaTexto(page, T('common.salvar'));
    await page.waitForTimeout(2500);
    const { data: vs } = await admin.from('veiculos').select('id, fipe_marca, fipe_modelo').eq('profile_id', p.id);
    ok('veiculo salvo', vs?.length === 1 && vs[0].fipe_marca === 'Toyota', JSON.stringify(vs));

    // pedido (o erro de "row-level security" do teste do dono)
    await page.goto(`${APP}/nova-solicitacao`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.getByText(/Toyota Corolla/).locator('visible=true').first().click();
    await page.getByText(T('constants.tiposServico.mecanica'), { exact: false }).locator('visible=true').first().click();
    await campo(page, T('novaSolicitacao.passoSintomas')).fill('Test automatico: rumore ai freni');
    await campo(page, T('novaSolicitacao.passoLocal')).fill('Viru valjak 4');
    const s2 = page.getByText(/Tallinn/).locator('visible=true').first();
    await s2.waitFor({ timeout: 10000 }).catch(() => {});
    if (await s2.isVisible().catch(() => false)) await s2.click();
    await checaTela(page, 'novo pedido');
    await clicaTexto(page, T('novaSolicitacao.enviarSolicitacao'));
    await page.getByText(T('novaSolicitacao.sucessoTitulo')).waitFor({ timeout: 20000 }).catch(() => {});
    ok('pedido enviado pelo app', (await page.innerText('body')).includes(T('novaSolicitacao.sucessoTitulo')));
    const { data: sols } = await admin.from('solicitacoes').select('id').eq('cliente_id', p.id);
    ok('pedido gravado no banco', sols?.length === 1);

    // oficina de teste manda orcamento com horario de entrega
    if (sols?.length) {
      const emailO = `app-ofi-${tag}@example.test`;
      const { data: uo } = await admin.auth.admin.createUser({ email: emailO, password: senha, email_confirm: true });
      limpar.contas.push(uo.user.id);
      await admin.from('profiles').insert({ id: uo.user.id, tipo: 'oficina', nome: 'TESTE OFICINA APP', email: emailO, idioma: 'et' });
      const { data: of } = await admin.from('oficinas').insert({ profile_id: uo.user.id, nome_fantasia: 'TESTE OFICINA APP', endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '1', pais: 'EE', latitude: 59.43, longitude: 24.75, ativa: true, especialidades: ['mecanica'] }).select('id').single();
      limpar.oficinas.push(of.id);
      const { data: orc } = await admin.from('orcamentos').insert({ solicitacao_id: sols[0].id, oficina_id: of.id, valor_total: 180, prazo_dias: 2, status: 'enviado', validade: '2030-01-01' }).select('id').single();
      const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const depois = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      const { error: eDisp } = await admin.from('orcamento_disponibilidade').insert({ orcamento_id: orc.id, data_checkin: amanha, turno: 'manha', data_previsao_entrega: depois });
      if (eDisp) throw new Error('disponibilidade: ' + eDisp.message);
      await admin.from('solicitacoes').update({ status: 'orcamentos_recebidos' }).eq('id', sols[0].id);

      await page.goto(`${APP}/solicitacao/${sols[0].id}`, { waitUntil: 'networkidle' });
      await page.getByText('TESTE OFICINA APP', { exact: false }).first().waitFor({ timeout: 15000 }).catch(() => {});
      const tOrc = await checaTela(page, 'orcamento recebido');
      ok('orcamento aparece com valor em euro', /180/.test(tOrc) && /€/.test(tOrc));
      ok('turno do horario traduzido (sem "manha" cru)', !/\bmanha\b/.test(tOrc));
      await page.screenshot({ path: 'app-orcamento.png', fullPage: true });
      ok('pede para escolher a data', tOrc.includes(T('orcamentos.escolhaData')));
      ok('horario aparece com turno traduzido', tOrc.includes(T('orcamentos.turno_manha')));
      await page.getByText(new RegExp(T('orcamentos.turno_manha'))).locator('visible=true').first().click();
      await clicaTexto(page, T('orcamentos.aceitar'));
      await page.waitForTimeout(3000);
      const { data: o2 } = await admin.from('orcamentos').select('status').eq('id', orc.id).single();
      ok('orcamento aceito pelo app', o2.status === 'aceito', o2.status);

      // mensagem
      await page.goto(`${APP}/conversa/${sols[0].id}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await checaTela(page, 'conversa');
      await campo(page, T('mensagens.digiteMensagem')).fill('Ciao, a che ora posso portare la macchina?');
      await page.getByLabel(T('mensagens.enviar'), { exact: true }).locator('visible=true').first().click();
      await page.waitForTimeout(2500);
      const { data: ms } = await admin.from('mensagens').select('id').eq('solicitacao_id', sols[0].id);
      ok('mensagem enviada pelo app', (ms || []).length >= 1);
    }

    // idioma no Perfil (6 opcoes) e sair
    await page.goto(APP, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'app-inicio.png' });
    await clicaTexto(page, T('tabs.perfil'));
    await page.waitForTimeout(1500);
    await page.getByText('Eesti', { exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {});
    const tPerf = await checaTela(page, 'perfil');
    await page.screenshot({ path: 'app-perfil.png', fullPage: true });
    ok('perfil lista os 6 idiomas', ['Português (Brasil)', 'Português (Portugal)', 'English', 'Eesti', 'Italiano', 'Русский'].every((x) => tPerf.includes(x)));
    await clicaTexto(page, 'Eesti');
    await page.waitForTimeout(1500);
    ok('trocou o app para estoniano', (await page.innerText('body')).includes(txt('et')('perfil.titulo')));
    const { data: p2 } = await admin.from('profiles').select('idioma').eq('id', p.id).single();
    ok('conta passou a estoniano (e-mails no mesmo idioma)', p2.idioma === 'et', p2.idioma);
    if (erros.length) ok('fluxo logado: sem erro na pagina', false, erros.slice(0, 2).join(' | ').slice(0, 200));
    await ctx.close();
  }
} finally {
  await browser.close();
  for (const id of limpar.oficinas) {
    const { data: orcs } = await admin.from('orcamentos').select('id').eq('oficina_id', id);
    for (const o of orcs || []) { await admin.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await admin.from('orcamento_itens').delete().eq('orcamento_id', o.id); }
    await admin.from('agenda').delete().eq('oficina_id', id);
    await admin.from('orcamentos').delete().eq('oficina_id', id);
    await admin.from('emergencia_oficinas_notificadas').delete().eq('oficina_id', id);
    await admin.from('oficinas').delete().eq('id', id);
  }
  for (const id of limpar.contas) {
    const { data: sols } = await admin.from('solicitacoes').select('id').eq('cliente_id', id);
    for (const s of sols || []) {
      const { data: orcs } = await admin.from('orcamentos').select('id').eq('solicitacao_id', s.id);
      for (const o of orcs || []) { await admin.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await admin.from('agenda').delete().eq('orcamento_id', o.id); }
      for (const t of ['orcamentos', 'mensagens', 'solicitacao_fotos', 'analise_dano']) await admin.from(t).delete().eq('solicitacao_id', s.id);
    }
    const { data: ems } = await admin.from('emergencias').select('id').eq('profile_id', id);
    for (const e of ems || []) {
      const { data: fotos } = await admin.from('emergencia_fotos').select('foto_url').eq('emergencia_id', e.id);
      const cam = (fotos || []).map((f) => f.foto_url.split('/damage-photos/')[1]).filter(Boolean);
      if (cam.length) await admin.storage.from('damage-photos').remove(cam);
      await admin.from('emergencia_fotos').delete().eq('emergencia_id', e.id);
      await admin.from('emergencia_oficinas_notificadas').delete().eq('emergencia_id', e.id);
      await admin.from('emergencias').update({ solicitacao_id: null }).eq('id', e.id);
    }
    await admin.from('solicitacoes').delete().eq('cliente_id', id);
    await admin.from('emergencias').delete().eq('profile_id', id);
    for (const [t, c] of [['notificacoes', 'profile_id'], ['mensagens', 'remetente_id'], ['veiculos', 'profile_id'], ['avaliacoes', 'cliente_id'], ['oficinas', 'profile_id']]) await admin.from(t).delete().eq(c, id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`limpeza ok (${limpar.contas.length} contas)`);
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
