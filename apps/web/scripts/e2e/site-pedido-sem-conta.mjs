// E2E LOCAL do pedido sem cadastro (06/11): API (conta nova, codigo errado,
// reenvio, correcao do e-mail, conta existente por codigo e por senha, carro pela
// placa, tentativas, limpeza das 24 h, funil) e telas (ET 390, RU 1280, logado).
// 12/11: funil com os passos novos (servico, foto, edasi_bloqueado_*, cookie_*, cadastro_site),
// "Edasi" clicavel sem descricao com aviso, sem balao do chat na pagina do pedido.
// SITE=http://localhost:3100 node site-pedido-sem-conta.mjs <.env.local>
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
const EMAILS = env.EMAIL_PASTA_TESTE;
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}${extra ? ' - ' + extra : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Teste-' + crypto.randomBytes(6).toString('hex');
const emailDe = (x) => `pedido-${x}-${tag}@example.test`;
let ipN = 1;
const ip = () => `10.77.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`; // cada chamada com um IP (limite por IP)
const contas = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const DADOS = (extra) => ({
  origem: 'site', idioma: 'et', nome: 'TESTE AUTOMATICO', senha, telefone: '', aceitouTermos: true,
  tipo: 'mecanica', descricao: 'Pidurid kriuksuvad', urgencia: 'media',
  endereco: 'Tallinn, Harju maakond', latitude: 59.437, longitude: 24.745, pais: 'EE',
  veiculo: { tipo: 'cars', marca: 'Toyota', modelo: 'Corolla', ano: '2019', codigo: null, placa: '123ABC' },
  ...extra,
});
const enviarPedido = async (dados, { fotos = 0, token } = {}) => {
  const form = new FormData();
  form.append('dados', JSON.stringify(dados));
  for (let i = 0; i < fotos; i++) form.append('fotos', new Blob([FOTO], { type: 'image/png' }), `f${i}.png`);
  const headers = { 'x-real-ip': ip() };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${SITE}/api/pedido-sem-conta`, { method: 'POST', body: form, headers });
  return { status: r.status, d: await r.json().catch(() => ({})) };
};
const post = async (p, b) => {
  const r = await fetch(SITE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip() }, body: JSON.stringify(b) });
  return { status: r.status, d: await r.json().catch(() => ({})) };
};
// ultimo codigo enviado a um e-mail (arquivo do ambiente local)
const codigoDe = async (email, depois) => {
  for (let i = 0; i < 20; i++) {
    const arq = fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email.replace(/[^a-z0-9@._-]/gi, '_')}.html`) && Number(f.split('_')[0]) >= depois).sort();
    if (arq.length) {
      const html = fs.readFileSync(path.join(EMAILS, arq.at(-1)), 'utf8');
      const txt = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
      const m = txt.match(/(?<![\d#])\d{6}(?!\d)/);
      if (m) return { codigo: m[0], assunto: (html.match(/assunto: (.*?) -->/) || [])[1] };
    }
    await sleep(300);
  }
  return { codigo: null };
};
const perfilDe = async (email) => (await admin.from('profiles').select('id, tipo, termos_versao, termos_aceitos_em, telefone').eq('email', email).maybeSingle()).data;
const avisos = async (solId) => (await admin.from('notificacoes').select('id', { count: 'exact', head: true }).eq('tipo', 'nova_solicitacao').eq('dados->>solicitacao_id', solId)).count;

try {
  // 1) validacoes
  ok('sem termos -> TERMOS_OBRIGATORIOS', (await enviarPedido(DADOS({ email: emailDe('v'), aceitouTermos: false }))).d.codigo === 'TERMOS_OBRIGATORIOS');
  ok('senha curta -> SENHA_CURTA', (await enviarPedido(DADOS({ email: emailDe('v'), senha: '123' }))).d.codigo === 'SENHA_CURTA');
  ok('robo (campo invisivel) -> 400', (await enviarPedido(DADOS({ email: emailDe('v'), site: 'http://spam' }))).status === 400);
  ok('sem carro -> 400', (await enviarPedido(DADOS({ email: emailDe('v'), veiculo: {} }))).status === 400);
  ok('nenhuma conta criada nas recusas', !(await admin.from('pedidos_pendentes').select('id').ilike('email', emailDe('v'))).data?.length);

  // 2) conta nova: fica pendente, nada vai as oficinas
  const emailErrado = emailDe('erado');
  let t0 = Date.now();
  const r1 = await enviarPedido(DADOS({ email: emailErrado }), { fotos: 2 });
  ok('pedido novo -> pendente', r1.status === 200 && !!r1.d.pendenteId && r1.d.contaNova === true, JSON.stringify(r1.d));
  const pend = (await admin.from('pedidos_pendentes').select('*').eq('id', r1.d.pendenteId).single()).data;
  if (pend) contas.add(pend.user_id);
  ok('pendente com 2 fotos e codigo guardado so como hash', pend?.fotos?.length === 2 && /^[0-9a-f]{64}$/.test(pend?.codigo_hash || ''));
  const { data: u1 } = await admin.auth.admin.getUserById(pend.user_id);
  ok('conta criada mas nao confirmada', !!u1.user && !u1.user.email_confirmed_at);
  ok('sem perfil antes do codigo', !(await perfilDe(emailErrado)));
  ok('nenhum pedido visivel as oficinas', !(await admin.from('solicitacoes').select('id').eq('cliente_id', pend.user_id)).data?.length);
  const c1 = await codigoDe(emailErrado, t0);
  ok('e-mail com o codigo (estoniano)', !!c1.codigo && /kood/i.test(c1.assunto || ''), c1.assunto);
  const l0 = await anon().auth.signInWithPassword({ email: emailErrado, password: senha });
  ok('login bloqueado antes do codigo', !!l0.error);

  // 3) codigo errado e reenvio cedo demais
  const errado = c1.codigo === '000000' ? '111111' : '000000';
  const e1 = await post('/api/pedido-sem-conta/confirmar', { id: r1.d.pendenteId, codigo: errado });
  ok('codigo errado -> 400 CODIGO_INVALIDO', e1.status === 400 && e1.d.codigo === 'CODIGO_INVALIDO', JSON.stringify(e1.d));
  ok('reenviar antes de 30 s -> 429', (await post('/api/pedido-sem-conta/reenviar', { id: r1.d.pendenteId })).status === 429);

  // 4) correcao do e-mail (conta nova): codigo vai ao novo endereco
  await admin.from('pedidos_pendentes').update({ ultimo_envio_em: new Date(Date.now() - 60000).toISOString() }).eq('id', r1.d.pendenteId);
  const email1 = emailDe('novo');
  t0 = Date.now();
  const rc = await post('/api/pedido-sem-conta/reenviar', { id: r1.d.pendenteId, email: email1 });
  ok('corrigir e-mail -> 200', rc.status === 200 && rc.d.email === email1, JSON.stringify(rc.d));
  const c2 = await codigoDe(email1, t0);
  ok('novo codigo no e-mail corrigido', !!c2.codigo);
  const ant = await post('/api/pedido-sem-conta/confirmar', { id: r1.d.pendenteId, codigo: c1.codigo });
  ok('codigo antigo nao vale mais', ant.status === 400);

  // 5) confirma: conta ativa, pedido criado e oficinas avisadas
  const ok1 = await post('/api/pedido-sem-conta/confirmar', { id: r1.d.pendenteId, codigo: c2.codigo });
  ok('codigo certo -> pedido criado', ok1.status === 200 && !!ok1.d.solicitacaoId && ok1.d.contaNova === true, JSON.stringify(ok1.d));
  const p1 = await perfilDe(email1);
  ok('perfil cliente com termos gravados', p1?.tipo === 'cliente' && !!p1?.termos_versao && !!p1?.termos_aceitos_em);
  const { data: u2 } = await admin.auth.admin.getUserById(pend.user_id);
  ok('e-mail confirmado', !!u2.user.email_confirmed_at);
  const sol1 = (await admin.from('solicitacoes').select('id, cliente_id, veiculo_id, tipo, latitude').eq('id', ok1.d.solicitacaoId).single()).data;
  ok('pedido do cliente certo, com carro', sol1?.cliente_id === pend.user_id && !!sol1?.veiculo_id);
  ok('2 fotos no pedido', (await admin.from('solicitacao_fotos').select('id').eq('solicitacao_id', ok1.d.solicitacaoId)).data?.length === 2);
  ok('oficinas avisadas', (await avisos(ok1.d.solicitacaoId)) > 0, String(await avisos(ok1.d.solicitacaoId)));
  ok('pendente apagado', !(await admin.from('pedidos_pendentes').select('id').eq('id', r1.d.pendenteId).maybeSingle()).data);
  ok('fotos sairam de pendentes/', !(await admin.storage.from('damage-photos').list(`pendentes/${r1.d.pendenteId}`)).data?.length);
  ok('fotos na pasta do pedido', (await admin.storage.from('damage-photos').list(`solicitacoes/${ok1.d.solicitacaoId}`)).data?.length === 2);
  ok('mesmo codigo de novo -> 410', (await post('/api/pedido-sem-conta/confirmar', { id: r1.d.pendenteId, codigo: c2.codigo })).status === 410);
  const l1 = await anon().auth.signInWithPassword({ email: email1, password: senha });
  ok('login com a senha escolhida', !l1.error, l1.error?.message);

  // 6) mesma pessoa, sem login: conta existente
  const r2 = await enviarPedido(DADOS({ email: email1 }));
  ok('e-mail com conta -> 409 CONTA_EXISTENTE', r2.status === 409 && r2.d.codigo === 'CONTA_EXISTENTE');
  // "nao lembro a senha": codigo, e o pedido entra na conta; mesma placa = mesmo carro
  t0 = Date.now();
  const r3 = await enviarPedido(DADOS({ email: email1, modo: 'codigo', senha: '', veiculo: { ...DADOS().veiculo, placa: '123 abc' } }));
  ok('conta existente por codigo -> pendente', r3.status === 200 && r3.d.contaNova === false, JSON.stringify(r3.d));
  const c3 = await codigoDe(email1, t0);
  const ok3 = await post('/api/pedido-sem-conta/confirmar', { id: r3.d.pendenteId, codigo: c3.codigo });
  ok('confirmado na conta existente', ok3.status === 200 && ok3.d.contaNova === false);
  const veic = async () => (await admin.from('veiculos').select('id').eq('profile_id', pend.user_id)).data?.length;
  ok('mesma placa: nao cria carro novo', (await veic()) === 1, String(await veic()));
  const l2 = await anon().auth.signInWithPassword({ email: email1, password: senha });
  ok('senha continua a mesma', !l2.error);
  // com login (senha na caixa "ja tem conta"): pedido vai direto; placa diferente = carro novo
  const r4 = await enviarPedido(DADOS({ email: email1, veiculo: { ...DADOS().veiculo, placa: '999XYZ' } }), { token: l2.data.session.access_token });
  ok('com login: pedido direto', r4.status === 200 && !!r4.d.solicitacaoId, JSON.stringify(r4.d));
  ok('placa diferente: carro novo', (await veic()) === 2);
  ok('pedido direto avisou oficinas', (await avisos(r4.d.solicitacaoId)) > 0);
  // sem placa: mesma marca/modelo/ano reaproveita
  const r5 = await enviarPedido(DADOS({ email: email1, veiculo: { ...DADOS().veiculo, placa: null } }), { token: l2.data.session.access_token });
  ok('sem placa, mesmo modelo: nao cria carro', r5.status === 200 && (await veic()) === 2, String(await veic()));
  // correcao de e-mail nao vale para conta existente
  const r6 = await enviarPedido(DADOS({ email: email1, modo: 'codigo' }));
  await admin.from('pedidos_pendentes').update({ ultimo_envio_em: new Date(Date.now() - 60000).toISOString() }).eq('id', r6.d.pendenteId);
  const rc2 = await post('/api/pedido-sem-conta/reenviar', { id: r6.d.pendenteId, email: emailDe('outro') });
  ok('conta existente nao troca e-mail', rc2.status >= 400, String(rc2.status));
  // um pedido por codigo aberto por conta: o novo substitui o anterior
  const r6b = await enviarPedido(DADOS({ email: email1, modo: 'codigo' }));
  const abertos = (await admin.from('pedidos_pendentes').select('id').eq('user_id', pend.user_id)).data || [];
  ok('conta existente: so 1 pedido por codigo aberto', r6b.status === 200 && abertos.length === 1 && abertos[0].id === r6b.d.pendenteId, JSON.stringify(abertos));
  await admin.from('pedidos_pendentes').delete().eq('user_id', pend.user_id);
  // conta desativada: nem por codigo nem com login
  await admin.from('profiles').update({ ativo: false }).eq('id', pend.user_id);
  const emailD = emailDe('desat');
  const { data: ud } = await admin.auth.admin.createUser({ email: emailD, password: senha, email_confirm: true });
  contas.add(ud.user.id);
  await admin.from('profiles').insert({ id: ud.user.id, tipo: 'cliente', nome: 'TESTE AUTOMATICO', email: emailD, ativo: false });
  const rd = await enviarPedido(DADOS({ email: emailD, modo: 'codigo' }));
  ok('conta desativada por codigo -> 403', rd.status === 403, `${rd.status} ${JSON.stringify(rd.d)}`);
  ok('5 e-mails por hora para o mesmo endereco', (await enviarPedido(DADOS({ email: email1, modo: 'codigo' }))).status === 429);
  ok('conta desativada com login -> 403', (await enviarPedido(DADOS({ email: email1 }), { token: l2.data.session.access_token })).status === 403);
  await admin.from('profiles').update({ ativo: true }).eq('id', pend.user_id);

  // 7) limite de tentativas
  const r7 = await enviarPedido(DADOS({ email: emailDe('tent') }));
  if (r7.d.pendenteId) contas.add((await admin.from('pedidos_pendentes').select('user_id').eq('id', r7.d.pendenteId).single()).data.user_id);
  let ult;
  for (let i = 0; i < 6; i++) ult = await post('/api/pedido-sem-conta/confirmar', { id: r7.d.pendenteId, codigo: String(100000 + i) });
  ok('5 erros -> CODIGO_TENTATIVAS', ult.d.codigo === 'CODIGO_TENTATIVAS', JSON.stringify(ult.d));
  // reenvio nao zera as tentativas (auditoria 06/11): codigo novo certo continua recusado
  await admin.from('pedidos_pendentes').update({ ultimo_envio_em: new Date(Date.now() - 60000).toISOString() }).eq('id', r7.d.pendenteId);
  let t7 = Date.now();
  ok('reenviar depois de esgotar -> 200', (await post('/api/pedido-sem-conta/reenviar', { id: r7.d.pendenteId })).status === 200);
  const c7 = await codigoDe(emailDe('tent'), t7);
  ok('codigo novo nao reabre as tentativas', (await post('/api/pedido-sem-conta/confirmar', { id: r7.d.pendenteId, codigo: c7.codigo })).d.codigo === 'CODIGO_TENTATIVAS');
  // 12 tentativas ao mesmo tempo: o banco nao passa de 5
  const rp = await enviarPedido(DADOS({ email: emailDe('paral') }));
  const pendP = (await admin.from('pedidos_pendentes').select('user_id').eq('id', rp.d.pendenteId).single()).data;
  if (pendP) contas.add(pendP.user_id);
  const cp = await codigoDe(emailDe('paral'), 0);
  const chutes = Array.from({ length: 12 }, (_, i) => String(200000 + i)).filter((x) => x !== cp.codigo);
  await Promise.all(chutes.map((c) => post('/api/pedido-sem-conta/confirmar', { id: rp.d.pendenteId, codigo: c })));
  const tp = (await admin.from('pedidos_pendentes').select('tentativas').eq('id', rp.d.pendenteId).single()).data?.tentativas;
  ok('tentativas em paralelo param em 5', tp === 5, String(tp));
  ok('depois disso nem o codigo certo passa', (await post('/api/pedido-sem-conta/confirmar', { id: rp.d.pendenteId, codigo: cp.codigo })).d.codigo === 'CODIGO_TENTATIVAS');
  // mesmo e-mail pede de novo: reaproveita a conta nao ativada e troca o pedido
  const r8 = await enviarPedido(DADOS({ email: emailDe('tent') }), { fotos: 1 });
  const pend8 = (await admin.from('pedidos_pendentes').select('*').ilike('email', emailDe('tent'))).data || [];
  ok('novo pedido do mesmo e-mail: 1 pendente so', r8.status === 200 && pend8.length === 1, String(pend8.length));

  // 8) limpeza das 24 h: pedido, fotos e conta nao ativada somem
  await admin.from('pedidos_pendentes').update({ created_at: new Date(Date.now() - 25 * 3600e3).toISOString() }).eq('id', pend8[0].id);
  const lp = await fetch(`${SITE}/api/tarefas/limpar-pendentes`, { method: 'POST', headers: { 'x-tarefa-chave': env.TAREFAS_CHAVE } });
  ok('tarefa de limpeza -> 200', lp.ok, String(lp.status));
  ok('pendente velho apagado', !(await admin.from('pedidos_pendentes').select('id').eq('id', pend8[0].id).maybeSingle()).data);
  ok('fotos do pendente apagadas', !(await admin.storage.from('damage-photos').list(`pendentes/${pend8[0].id}`)).data?.length);
  const { data: u8 } = await admin.auth.admin.getUserById(pend8[0].user_id);
  ok('conta nao ativada apagada', !u8?.user);
  ok('limpeza sem chave -> recusada', !(await fetch(`${SITE}/api/tarefas/limpar-pendentes`, { method: 'POST' })).ok);

  // 9) funil (contagem anonima)
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Tallinn' });
  const total = async (funil, etapa) => (await admin.from('funil_contagem').select('total').eq('funil', funil).eq('etapa', etapa).eq('dia', hoje).maybeSingle()).data?.total || 0;
  const antes = await total('pedido_app', 'abriu');
  ok('funil -> 200', (await post('/api/funil', { funil: 'pedido_app', etapa: 'abriu' })).status < 300);
  const depois = await total('pedido_app', 'abriu');
  ok('funil contou +1', depois === antes + 1, `${antes} -> ${depois}`);
  await post('/api/funil', { funil: 'x', etapa: 'abriu' });
  ok('funil desconhecido nao grava', !(await admin.from('funil_contagem').select('funil').eq('funil', 'x')).data?.length);
  // passos novos (12/11): toque no servico, foto, Edasi bloqueado, cookies e o cadastro de oficina
  for (const [funil, etapa] of [['pedido_site', 'servico'], ['pedido_site', 'foto'], ['pedido_site', 'edasi_bloqueado_detalhe'], ['pedido_site', 'edasi_bloqueado_carro'], ['pedido_site', 'edasi_bloqueado_local'], ['pedido_site', 'edasi_bloqueado_contato'], ['pedido_site', 'cookie_aceito'], ['pedido_site', 'cookie_recusado'], ['cadastro_site', 'abriu'], ['cadastro_site', 'edasi_bloqueado'], ['cadastro_site', 'enviado']]) {
    const a = await total(funil, etapa);
    await post('/api/funil', { funil, etapa });
    const d = await total(funil, etapa);
    ok(`funil ${funil} ${etapa} conta +1`, d === a + 1, `${a} -> ${d}`);
  }
  for (const [funil, etapa] of [['cadastro_site', 'servico'], ['pedido_site', 'edasi_bloqueado_x'], ['pedido_site', 'enviado']]) {
    const a = await total(funil, etapa);
    await post('/api/funil', { funil, etapa });
    ok(`funil ${funil} ${etapa} (fora da lista) nao grava`, (await total(funil, etapa)) === a);
  }

  // 10) telas
  const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
  const tela = async (idioma, largura, rotulos) => {
    const ctx = await browser.newContext({ viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500, extraHTTPHeaders: { 'x-real-ip': ip() } });
    const page = await ctx.newPage();
    const erros = [];
    page.on('pageerror', (e) => erros.push(e.message));
    const caminho = idioma === 'ru' ? '/ee/ru/zayavka' : '/ee/et/paring';
    await page.goto(SITE + caminho, { waitUntil: 'networkidle' });
    const sw = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`${idioma} ${largura}: pagina abre`, await page.getByTestId('passo-servico').isVisible());
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    ok(`${idioma}: fora do Google (noindex)`, /noindex/.test(robots || ''), robots);
    ok(`${idioma}: subtitulo sem "sem cadastro"`, !/registr|cadastr|sign-up/i.test(await page.locator('.pedido-subtitulo').innerText()), await page.locator('.pedido-subtitulo').innerText());
    await page.getByRole('button', { name: rotulos.mecanica }).click();
    // "Edasi" sem descricao/servico: clicavel, avisa o que falta (com a lista: "...vali teenus nimekirjast...") e foca a caixa
    const edasi = page.getByTestId('passo-detalhe').getByRole('button', { name: rotulos.next, exact: true });
    ok(`${idioma}: Edasi clicavel sem descricao`, await edasi.isEnabled());
    await edasi.click();
    await page.waitForTimeout(300);
    ok(`${idioma}: aviso do que falta (${rotulos.faltaDescricaoLista.slice(0, 20)}...)`, (await page.getByTestId('passo-detalhe').getByTestId('falta-aviso').innerText().catch(() => '')) === rotulos.faltaDescricaoLista);
    ok(`${idioma}: foco na descricao`, await page.evaluate(() => document.activeElement?.id) === 'pedido-descricao');
    // sem balao do chat de suporte nesta pagina
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(500);
    ok(`${idioma} ${largura}: sem balao do chat na pagina do pedido`, (await page.getByTestId('chat-suporte-botao').count()) === 0);
    await page.locator('#pedido-descricao').fill('Test');
    await page.getByRole('button', { name: rotulos.next, exact: true }).click();
    await page.getByTestId('passo-carro').waitFor();
    const marca = page.getByLabel(rotulos.marca, { exact: false }).locator('visible=true').first();
    await marca.waitFor({ timeout: 15000 });
    await page.waitForFunction((el) => el.options.length > 2, await marca.elementHandle(), { timeout: 15000 });
    await marca.selectOption({ label: 'Toyota' });
    const modelo = page.getByLabel(rotulos.modelo, { exact: false }).locator('visible=true').first();
    await page.waitForFunction((el) => el.options.length > 2, await modelo.elementHandle(), { timeout: 15000 });
    const opcoes = await modelo.locator('option').allTextContents();
    await modelo.selectOption({ label: opcoes.find((o) => /Corolla/.test(o)) || opcoes[1] });
    const ano = page.getByLabel(rotulos.ano, { exact: false }).locator('visible=true').first();
    await ano.fill('2019').catch(async () => { await page.waitForFunction((el) => el.options.length > 1, await ano.elementHandle()); await ano.selectOption({ index: 1 }); });
    await page.locator('#pedido-placa').fill('555TST');
    await page.screenshot({ path: `${OUT}/pedido-carro-${idioma}-${largura}.png`, fullPage: true });
    await page.getByRole('button', { name: rotulos.next, exact: true }).click();
    await page.getByTestId('passo-local').waitFor();
    await page.locator('#pedido-endereco').fill('Tallinn');
    await page.waitForTimeout(1500);
    const sug = page.getByRole('option').first();
    if (await sug.isVisible().catch(() => false)) await sug.click();
    await page.getByRole('button', { name: rotulos.next, exact: true }).click();
    await page.getByTestId('passo-contato').waitFor();
    const email = emailDe(`tela-${idioma}`);
    await page.locator('#pedido-nome').fill('TESTE AUTOMATICO');
    await page.locator('#pedido-email').fill(email.replace('example.test', 'gmial.com'));
    ok(`${idioma}: sugere o e-mail certo (gmial -> gmail)`, await page.getByTestId('sugestao-email').isVisible());
    await page.locator('#pedido-email').fill(email);
    await page.locator('#pedido-senha').fill(senha);
    await page.getByTestId('aceito-termos').check();
    ok(`${idioma} ${largura}: sem transbordo`, (await sw()) <= 0, String(await sw()));
    await page.screenshot({ path: `${OUT}/pedido-contato-${idioma}-${largura}.png`, fullPage: true });
    const t1 = Date.now();
    await page.getByRole('button', { name: rotulos.enviar }).click();
    await page.getByTestId('passo-codigo').waitFor({ timeout: 30000 });
    await page.screenshot({ path: `${OUT}/pedido-codigo-${idioma}-${largura}.png`, fullPage: true });
    const c = await codigoDe(email, t1);
    const p = (await admin.from('pedidos_pendentes').select('user_id').ilike('email', email).maybeSingle()).data;
    if (p) contas.add(p.user_id);
    await page.locator('#pedido-codigo').fill(c.codigo || '');
    await page.getByTestId('confirmar-codigo').click();
    await page.waitForURL(/orcamentos\//, { timeout: 30000 }).catch(() => {});
    ok(`${idioma} ${largura}: entra logado e abre o pedido`, /\/cliente\/orcamentos\/|\/klient|orcamentos/.test(page.url()), page.url());
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/pedido-aberto-${idioma}-${largura}.png`, fullPage: true });
    ok(`${idioma}: sem erro de pagina`, !erros.length, erros.join(' | '));
    // ja logado: /paring leva ao pedido normal
    await page.goto(SITE + caminho, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    ok(`${idioma}: logado vai ao pedido normal`, !/paring|zayavka/.test(page.url()), page.url());
    await ctx.close();
  };
  const R = (l) => {
    const MSG = new URL('../../messages/', import.meta.url); // apps/web/messages, de onde quer que o script rode
    const m = { ...JSON.parse(fs.readFileSync(new URL(`${l}.json`, MSG), 'utf8')), ...JSON.parse(fs.readFileSync(new URL(`${l}.cliente.json`, MSG), 'utf8')) };
    return { mecanica: new RegExp(m.constants.tiposServico.mecanica), next: m.clienteNovaSolicitacao.next, marca: m.veiculoForm?.labelMarca || 'Mark', modelo: m.veiculoForm?.labelModelo || 'Mudel', ano: m.veiculoForm?.labelAno || 'Aasta', enviar: m.pedidoSemConta.enviarPedido, faltaDescricaoLista: m.pedidoSemConta.faltaDescricaoLista };
  };
  await tela('et', 390, R('et'));
  await tela('ru', 1280, R('ru'));

  // 11) botoes que levam ao pedido
  const pg = await (await browser.newContext()).newPage();
  await pg.goto(`${SITE}/ee/et/autojuhtidele`);
  ok('pagina de motoristas -> /ee/et/paring', /\/ee\/et\/paring$/.test(await pg.getByTestId('cta-motorista').first().getAttribute('href') || ''));
  await pg.goto(`${SITE}/ee/ru`);
  ok('home RU "мне нужен ремонт" -> /ee/ru/zayavka', (await pg.locator('a[href="/ee/ru/zayavka"]').count()) > 0);
  await browser.close();
} catch (e) {
  falhas++;
  console.log('FALHA excecao', e.stack || e.message);
} finally {
  // limpeza: pedidos, carros, perfis e contas do teste
  for (const id of contas) {
    const { data: sols } = await admin.from('solicitacoes').select('id').eq('cliente_id', id);
    for (const s of sols || []) {
      await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', s.id);
      await admin.from('solicitacao_fotos').delete().eq('solicitacao_id', s.id);
    }
    await admin.from('solicitacoes').delete().eq('cliente_id', id);
    await admin.from('veiculos').delete().eq('profile_id', id);
    await admin.from('pedidos_pendentes').delete().eq('user_id', id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
}
