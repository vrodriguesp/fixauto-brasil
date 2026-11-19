// Jornada cruzada da release 20/11 (gate Fable): pedido em ETAPAS no site (sem conta) -> oficina do raio
// avisada so com a AREA (sino + e-mail) -> no detalhe e no formulario ve so "Cliente · codigo" + area ->
// orcamento pelo formulario novo (dica do preco maximo, obrigatorios, validade pre-preenchida) -> motorista
// aceita -> oficina passa a ver nome + rua -> admin ve numero do pedido, numero do cliente, rua (tabela
// privada), busca pela rua, presenca "online agora" e escreve a oficina pelo chat; a oficina responde.
// Precisa de TRADUCAO_FAKE=1 (ou DEEPL_API_KEY) no .env.local; Resend sem chave -> pasta.
//   SITE=http://localhost:3105 node jornada-release-2011.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { escolherCheckin } from './ajuda-checkin.mjs';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PASTA = env.EMAIL_PASTA_TESTE;
const OUT = process.env.PRINTS || 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/jornada-release-2011';
fs.mkdirSync(OUT, { recursive: true });
let falhas = 0; let total = 0;
const ok = (n, c, x = '') => { total++; if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 260) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; let ofId, solId, motoristaId;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esperar = async (fn, ms = 30000, passo = 1000) => { for (let t = 0; t < ms; t += passo) { const v = await fn(); if (v) return v; await sleep(passo); } return fn(); };
const emailsDesde = (t0, para) => (PASTA && fs.existsSync(PASTA) ? fs.readdirSync(PASTA) : []).filter((f) => Number(f.split('_')[0]) >= t0 && (!para || f.includes(para.replace(/[^a-z0-9@._-]/gi, '_')))).map((f) => fs.readFileSync(path.join(PASTA, f), 'utf8'));
const codigoDe = async (email, depois) => esperar(async () => { const t = emailsDesde(depois, email).at(-1); if (!t) return null; const m = t.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').match(/(?<![\d#])\d{6}(?!\d)/); return m ? m[0] : null; }, 20000, 400);
const MSG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../messages');
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8'))));
const tr = (l) => { const m = msgs(l); return (k) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`); };
const TET = tr('et');
const hojeTallinn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date());
const somar = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const HORARIO = Object.fromEntries(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map((d) => [d, { aberto: true, inicio: '08:00', fim: '18:00' }]));
const RUA = 'Narva mnt 7'; const ENDERECO = 'Narva mnt 7, 10117 Tallinn, Estonia'; const AREA = 'Tallinn, Estonia';
const NOME_MOTORISTA = `Juhan Jornada ${tag}`;
let ipN = 1; const ip = () => `10.79.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const ctxNovo = async (tela, locale = 'et-EE') => {
  const movel = tela === 'celular';
  const c = await browser.newContext({ viewport: movel ? { width: 390, height: 844 } : { width: 1366, height: 900 }, deviceScaleFactor: movel ? 2 : 1, isMobile: movel, hasTouch: movel, locale, extraHTTPHeaders: { 'x-real-ip': ip() } });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const entrar = async (ctx, u, pre) => { const p = await ctx.newPage(); await p.goto(`${SITE}${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]'); await p.waitForURL((x) => !x.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(2000); return p; };
const conta = async (tipo, nome, idioma) => {
  const email = `jr-${tipo}${contas.length}-${tag}@example.test`; const senha = `Jr${tag}Senha9`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone: '+372 5000 0000', termos_aceitos_em: new Date().toISOString(), termos_versao: '2026-09-30' });
  return { id: data.user.id, email, senha };
};
const token = async (email, senha) => { const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data, error } = await a.auth.signInWithPassword({ email, password: senha }); if (error) throw new Error(error.message); return data.session.access_token; };
const texto = (p, id) => p.getByTestId(id).innerText().catch(() => '');
const visivel = (p, id) => p.getByTestId(id).isVisible().catch(() => false);
const edasi = (p, etapa) => p.getByTestId(`passo-${etapa}`).getByTestId('edasi');
async function carroCampo(p, id, nome, re) {
  const el = p.locator('#' + id); await el.waitFor({ state: 'visible', timeout: 20000 }); await el.click(); await el.fill(nome.slice(0, 4));
  const op = p.getByTestId(id + '-lista').getByRole('option', { name: re || nome, exact: !re }); await op.first().waitFor({ timeout: 20000 }); await op.first().click();
}

try {
  await sb.from('plataforma_config').upsert({ id: 1, admin_visto_em: null, suporte_traducao: true }, { onConflict: 'id' });
  const adm = await conta('admin', `Admin Jornada ${tag}`, 'pt');
  const dono = await conta('oficina', `Mart Jornada ${tag}`, 'et');
  const { data: of, error: eOf } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `JR Autoteenindus ${tag}`, endereco: 'Tartu mnt 50', cidade: 'Tallinn', estado: 'Harjumaa', cep: '10115', pais: 'EE', latitude: 59.4325, longitude: 24.7703, raio_atendimento_km: 30, especialidades: ['mecanica'], ativa: true, horario_funcionamento: HORARIO }).select('id').single();
  if (eOf) throw new Error(eOf.message);
  ofId = of.id;

  // ---------- 1 motorista sem conta: pedido em etapas (celular, et)
  const ctxM = await ctxNovo('celular');
  const SUG = { rotulo: ENDERECO, endereco: RUA, rua: 'Narva mnt', numero: '7', cidade: 'Tallinn', estado: 'Harju maakond', cep: '10117', paisCodigo: 'EE', latitude: 59.4371, longitude: 24.7536 };
  await ctxM.route('**/api/endereco/sugestoes**', (r) => r.fulfill({ json: [SUG] }));
  await ctxM.route('**/api/geocode**', (r) => r.fulfill({ json: { latitude: 59.4371, longitude: 24.7536, paisCodigo: 'EE', enderecoCompleto: ENDERECO, cidade: 'Tallinn' } }));
  const pM = await ctxM.newPage();
  const errosM = []; pM.on('pageerror', (e) => errosM.push(e.message));
  const r5xx = []; pM.on('response', (r) => { if (r.url().startsWith(SITE) && r.status() >= 500) r5xx.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await pM.goto(`${SITE}/ee/et/paring`, { waitUntil: 'networkidle' });
  await pM.getByTestId('passo-servico').locator('button').nth(3).click(); // Mehaanika
  await pM.getByTestId('passo-detalhe').waitFor();
  await pM.locator('#pedido-descricao').fill(`Mootor ei käivitu hommikul (${tag})`);
  await edasi(pM, 'detalhe').click(); await pM.getByTestId('passo-fotos').waitFor();
  await edasi(pM, 'fotos').click(); await pM.getByTestId('passo-carro').waitFor(); // "Jatka ilma fotota"
  await carroCampo(pM, 'cbbe3-101', 'Toyota'); await carroCampo(pM, 'cbbe3-102', 'Corolla', /Corolla/);
  await pM.locator('#cbbe3-103').fill('2015');
  await edasi(pM, 'carro').click(); await pM.getByTestId('passo-local').waitFor();
  await pM.locator('#pedido-endereco').fill('Narva mnt 7');
  const sug = pM.getByRole('option').first(); await sug.waitFor({ timeout: 15000 }); await sug.click(); await pM.waitForTimeout(600);
  ok('1 passo do local: endereco escolhido pela lista', (await pM.locator('#pedido-endereco').inputValue()).includes('Narva mnt'), await pM.locator('#pedido-endereco').inputValue());
  await edasi(pM, 'local').click(); await pM.getByTestId('passo-contato').waitFor();
  const emailM = `jr-motorista-${tag}@example.test`;
  await pM.locator('#pedido-nome').fill(NOME_MOTORISTA);
  await pM.locator('#pedido-email').fill(emailM);
  if (await pM.getByTestId('quer-sms').isChecked()) await pM.getByTestId('quer-sms').uncheck();
  await pM.getByTestId('aceito-termos').check();
  const t0 = Date.now();
  await edasi(pM, 'contato').click();
  await pM.getByTestId('passo-codigo').waitFor({ timeout: 40000 });
  const cod = await codigoDe(emailM, t0);
  ok('1 e-mail com o codigo chegou (Resend falso -> pasta)', !!cod);
  await pM.locator('#pedido-codigo').fill(cod || '');
  await pM.getByTestId('confirmar-codigo').click();
  const criar = await pM.getByTestId('criar-senha').waitFor({ timeout: 40000 }).then(() => true, () => false);
  ok('1 codigo -> "crie a sua senha"', criar, pM.url());
  await pM.getByTestId('criar-senha-agora-nao').click();
  await pM.waitForURL(/orcamentos\//, { timeout: 30000 }).catch(() => {});
  // o pendente e apagado ao confirmar: o pedido vem do endereco da pagina; a conta, da linha do pedido
  const idUrl = (pM.url().match(/orcamentos\/([0-9a-f-]{36})/) || [])[1] || null;
  const sol = idUrl ? (await sb.from('solicitacoes').select('id, numero, endereco, area, latitude, longitude, status, tipo, cliente_id').eq('id', idUrl).maybeSingle()).data : null;
  solId = sol?.id; motoristaId = sol?.cliente_id;
  if (!motoristaId) { const u = (await sb.from('profiles').select('id').eq('email', emailM).maybeSingle()).data; motoristaId = u?.id; }
  if (motoristaId) contas.push(motoristaId);
  ok('1 pedido criado pelo fluxo novo (mecanica, aberto, com numero)', !!sol && sol.tipo === 'mecanica' && sol.numero > 0 && pM.url().includes(`/cliente/orcamentos/${sol.id}`), JSON.stringify(sol) + ' ' + pM.url());
  const priv = solId ? (await sb.from('solicitacoes_privado').select('endereco, latitude, longitude').eq('solicitacao_id', solId).maybeSingle()).data : null;
  ok('1 banco (102): linha publica = area + ~1 km; rua e coordenadas exatas na tabela privada', !!sol && sol.endereco === AREA && sol.area === AREA && sol.latitude === 59.44 && sol.longitude === 24.75 && priv?.endereco === ENDERECO && priv?.latitude === 59.4371, JSON.stringify({ sol, priv }));
  const { data: motoristaPerfil } = await sb.from('profiles').select('codigo, nome').eq('id', motoristaId || '00000000-0000-0000-0000-000000000000').maybeSingle();
  // motorista ve o PROPRIO endereco completo
  await pM.waitForTimeout(1500);
  const corpoM = await pM.locator('main').innerText().catch(() => '');
  ok('1 motorista (logado) ve a rua completa do proprio pedido', corpoM.includes(RUA), corpoM.match(/[^\n]*Tallinn[^\n]*/)?.[0]);
  await pM.screenshot({ path: `${OUT}/1-motorista-pedido.png`, fullPage: true });
  ok('1 sem erro de JavaScript nem 5xx no fluxo do motorista', !errosM.length && !r5xx.length, [...errosM, ...r5xx].join(' | '));
  await ctxM.close();

  // ---------- 2 oficina do raio: aviso so com a area (sino + e-mail)
  const notif = await esperar(async () => (await sb.from('notificacoes').select('mensagem, dados').eq('profile_id', dono.id).eq('tipo', 'nova_solicitacao').eq('dados->>solicitacao_id', solId).maybeSingle()).data, 30000);
  ok('2 sino da oficina: aviso de pedido novo com a AREA, sem a rua e sem o nome', !!notif && notif.mensagem.includes('Tallinn') && !notif.mensagem.includes(RUA) && !JSON.stringify(notif.dados).includes(RUA) && !notif.mensagem.includes(NOME_MOTORISTA), JSON.stringify(notif));
  const eMailOf = await esperar(async () => emailsDesde(t0, dono.email).find((t) => t.includes('Uus päring')), 30000);
  ok('2 e-mail "Uus päring" a oficina: area, sem a rua e sem o nome do motorista', !!eMailOf && eMailOf.includes(AREA) && !eMailOf.includes(RUA) && !eMailOf.includes(NOME_MOTORISTA), (eMailOf || 'sem e-mail').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200));

  // ---------- 3 oficina (PC, et): detalhe e formulario do orcamento antes do aceite
  const ctxO = await ctxNovo('pc'); const pO = await entrar(ctxO, dono, '/ee/et');
  await pO.goto(`${SITE}/ee/et/oficina/pedidos/${solId}`, { waitUntil: 'networkidle' }); await pO.getByTestId('cliente-nome').waitFor({ timeout: 20000 }); await pO.waitForTimeout(800);
  const nome1 = await texto(pO, 'cliente-nome'); const loc1 = await texto(pO, 'cliente-local'); const html1 = await pO.content();
  ok('3 detalhe antes do aceite: "Klient · codigo", area, aviso; sem nome e sem rua', nome1 === `${TET('oficinaSolicitacaoDetalhe.clienteFallback')} · ${motoristaPerfil?.codigo}` && loc1 === AREA && (await visivel(pO, 'nome-apos-aceite')) && !html1.includes(RUA) && !html1.includes(NOME_MOTORISTA), `${nome1} | ${loc1}`);
  await pO.screenshot({ path: `${OUT}/3-oficina-detalhe-antes.png`, fullPage: true });
  await pO.goto(`${SITE}/ee/et/oficina/orcamento/${solId}`, { waitUntil: 'networkidle' }); await pO.getByTestId('enviar-orcamento').waitFor({ timeout: 20000 }); await pO.waitForTimeout(800);
  ok('3 formulario: resumo dos 3 passos + dica do preco MAXIMO com link para a conversa', (await texto(pO, 'passos-orcamento')) === TET('oficinaEnviarOrcamento.passosResumo') && (await texto(pO, 'dica-preco-maximo')).includes(TET('oficinaEnviarOrcamento.dicaPrecoMaximo').slice(0, 25)) && ((await pO.getByTestId('link-conversa-antes').getAttribute('href')) || '').includes('/oficina/'), await texto(pO, 'dica-preco-maximo'));
  const localForm = await texto(pO, 'cliente-local-form');
  ok('3 formulario: "Klient · codigo | area", sem nome e sem rua', localForm.includes(String(motoristaPerfil?.codigo)) && localForm.includes(AREA) && !localForm.includes(RUA) && !localForm.includes(NOME_MOTORISTA), localForm);
  const obrig = await pO.locator('main').innerText();
  ok('3 formulario: legenda de obrigatorios (*) e "(valikuline)" nos opcionais', /\*/.test(obrig) && /valikuline/i.test(obrig));
  const precoSel = `input[placeholder="${TET('oficinaEnviarOrcamento.placeholderValor')}"]`;
  await pO.getByTestId('enviar-orcamento').click(); await pO.waitForTimeout(700);
  ok('3 enviar vazio: preco em falta marcado (aria-invalid) e resumo "preencha N campos"', (await pO.locator(precoSel).first().getAttribute('aria-invalid')) === 'true' && (await visivel(pO, 'falta-valor')), await pO.locator('main').innerText().then((t) => t.slice(-300)));
  await pO.locator(precoSel).first().fill('180'); await pO.waitForTimeout(200);
  const r = await escolherCheckin(pO, { dia: somar(hojeTallinn, 2), faixa: 'manha' }); await pO.waitForTimeout(300);
  const val = await pO.locator('#cacb1-103').inputValue();
  ok('3 validade PRE-PREENCHIDA = check-in + 7 (P5)', val === somar(r.dia, 7) && (await visivel(pO, 'validade-auto')), `${val} vs ${r.dia}`);
  await pO.screenshot({ path: `${OUT}/3-oficina-formulario.png`, fullPage: true });
  await pO.getByTestId('enviar-orcamento').click(); await pO.waitForTimeout(4000);
  const orc = (await sb.from('orcamentos').select('id, valor_total, validade, status').eq('solicitacao_id', solId).eq('oficina_id', ofId).maybeSingle()).data;
  const slot = orc ? (await sb.from('orcamento_disponibilidade').select('id, data_checkin').eq('orcamento_id', orc.id).maybeSingle()).data : null;
  ok('3 orcamento gravado 180 com data de check-in e validade = data + 7', !!orc && Number(orc.valor_total) === 180 && !!slot && orc.validade === somar(r.dia, 7), JSON.stringify({ orc, slot }));

  // ---------- 4 motorista aceita (API, como o botao do site) -> oficina ve nome + rua
  await sb.auth.admin.updateUserById(motoristaId, { password: `Jr${tag}Senha9` });
  const tokM = await token(emailM, `Jr${tag}Senha9`);
  const rAc = await fetch(`${SITE}/api/aceitar-orcamento`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokM}`, 'x-real-ip': ip() }, body: JSON.stringify({ orcamentoId: orc?.id, slotId: slot?.id }) });
  const orc2 = orc ? (await sb.from('orcamentos').select('status').eq('id', orc.id).single()).data : null;
  ok('4 motorista aceita o orcamento (200, status aceito)', rAc.status === 200 && orc2?.status === 'aceito', `${rAc.status} ${await rAc.text().catch(() => '')} ${JSON.stringify(orc2)}`);
  await pO.goto(`${SITE}/ee/et/oficina/pedidos/${solId}`, { waitUntil: 'networkidle' }); await pO.getByTestId('cliente-nome').waitFor({ timeout: 20000 }); await pO.waitForTimeout(800);
  const nome2 = await texto(pO, 'cliente-nome'); const loc2 = await texto(pO, 'cliente-local');
  ok('4 detalhe depois do aceite: nome e rua completos, sem o aviso', nome2 === NOME_MOTORISTA && loc2 === ENDERECO && !(await visivel(pO, 'nome-apos-aceite')), `${nome2} | ${loc2}`);
  await pO.screenshot({ path: `${OUT}/4-oficina-detalhe-depois.png`, fullPage: true });
  // a oficina fica no painel (aba aberta): manda o sinal de presenca; o chat de suporte esta FECHADO
  await pO.goto(`${SITE}/ee/et/oficina/dashboard`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(2500);

  // ---------- 5 admin: numeros, rua, busca pela rua, presenca, escreve a oficina pelo chat
  const ctxA = await ctxNovo('pc', 'pt-BR'); const pA = await entrar(ctxA, adm, '/br/pt');
  await pA.goto(`${SITE}/admin/solicitacoes`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(1500);
  const linha = pA.locator('tr').filter({ hasText: `(${tag})` });
  ok('5 lista do admin: numero do pedido e numero do cliente na linha', (await linha.getByTestId('admin-numero-pedido').innerText().catch(() => '')) === String(sol?.numero) && (await linha.getByTestId('admin-numero-cliente').innerText().catch(() => '')).includes(String(motoristaPerfil?.codigo)), await linha.innerText().catch(() => 'linha nao achada'));
  await pA.fill('input[placeholder*="Buscar"]', 'Narva mnt 7'); await pA.waitForTimeout(1800);
  ok('5 lista do admin: busca pela RUA acha o pedido (tabela privada)', (await pA.locator('tbody tr').count()) >= 1 && (await pA.locator('tbody').innerText()).includes(`(${tag})`), `${await pA.locator('tbody tr').count()} linhas`);
  const lista = await (await pA.request.get(`${SITE}/api/admin/solicitacoes?q=${encodeURIComponent('Narva mnt 7')}`)).json();
  const naLista = (lista.solicitacoes || []).find((x) => x.id === solId);
  ok('5 API da lista devolve a rua completa ao admin', naLista?.endereco === ENDERECO, JSON.stringify(naLista?.endereco));
  await pA.goto(`${SITE}/admin/solicitacoes/${solId}`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(2500);
  const corpoA = await pA.locator('body').innerText();
  ok('5 detalhe do admin: "Pedido N", numero do cliente, rua completa', (await texto(pA, 'admin-detalhe-numero')) === `Pedido ${sol?.numero}` && (await texto(pA, 'admin-detalhe-cliente-codigo')).includes(String(motoristaPerfil?.codigo)) && corpoA.includes(ENDERECO), corpoA.match(/[^\n]*Tallinn[^\n]*/)?.[0]);
  const presOf = pA.getByTestId('contato-oficina').filter({ hasText: `JR Autoteenindus ${tag}` }).getByTestId('presenca').first();
  const online = await esperar(async () => ((await presOf.getAttribute('data-online').catch(() => null)) === '1' ? '1' : null), 20000, 2000);
  ok('5 detalhe do admin: oficina "online agora" (sinal do site)', online === '1', await presOf.innerText().catch(() => 'sem presenca'));
  ok('5 detalhe do admin: presenca do cliente tambem na tela', (await pA.getByTestId('presenca').count()) >= 2, String(await pA.getByTestId('presenca').count()));
  await pA.screenshot({ path: `${OUT}/5-admin-detalhe.png`, fullPage: true });
  await pA.getByTestId('contato-oficina').filter({ hasText: `JR Autoteenindus ${tag}` }).getByRole('link', { name: /Escrever à oficina/ }).click();
  await pA.waitForURL((x) => x.pathname === '/admin/suporte', { timeout: 20000 });
  await esperar(async () => (await pA.locator('main').innerText().catch(() => '')).includes('Sem mensagens ainda'), 20000);
  const tMsg = Date.now();
  await pA.getByTestId('suporte-resposta').fill(`Tere! Kas saate pakkumise täna saata? (${tag})`);
  await pA.getByRole('button', { name: 'Enviar' }).click();
  const enviada = await esperar(async () => { const t = await pA.locator('main').innerText(); return t.includes(`(${tag})`) ? t : null; });
  ok('5 admin escreve a oficina a partir do pedido (conversa unica da conta)', !!enviada, (enviada || '').slice(-200));
  // ---------- 6 oficina ve 1 nao lida no balao, responde; admin ve a resposta
  const cont = await esperar(async () => (await pO.getByTestId('chat-suporte-nao-lidas').innerText().catch(() => '')) === '1', 60000);
  ok('6 oficina: botao do chat com 1 nao lida (sem recarregar)', !!cont);
  await pO.getByTestId('chat-suporte-botao').click();
  const lido = await esperar(async () => { const t = await pO.getByTestId('chat-suporte-janela').innerText().catch(() => ''); return t.includes(`(${tag})`) ? t : null; });
  ok('6 oficina le a mensagem do admin no chat', !!lido, (lido || '').slice(-200));
  await pO.locator('#suporte-texto').fill(`Jah, saadan pakkumise täna pärastlõunal. (${tag}-vastus)`); await pO.getByTestId('chat-suporte-enviar').click(); await pO.waitForTimeout(2000);
  const resp = await esperar(async () => { const t = await pA.locator('main').innerText(); return t.includes(`(${tag}-`) && t.includes('traduzido do estoniano') ? t : null; }, 40000);
  ok('6 admin ve a resposta da oficina', !!resp, (resp || '').slice(-200));
  await pO.screenshot({ path: `${OUT}/6-oficina-chat.png` }); await pA.screenshot({ path: `${OUT}/6-admin-suporte.png` });
  await ctxO.close(); await ctxA.close();
} catch (e) {
  falhas++; console.log('ERRO', e.stack?.slice(0, 900) || e.message);
} finally {
  await browser.close();
  await sb.from('plataforma_config').upsert({ id: 1, admin_visto_em: null, suporte_traducao: true }, { onConflict: 'id' });
  if (solId) {
    const { data: os } = await sb.from('orcamentos').select('id').eq('solicitacao_id', solId);
    for (const o of os || []) { await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await sb.from('orcamento_itens').delete().eq('orcamento_id', o.id); }
    await sb.from('orcamentos').delete().eq('solicitacao_id', solId);
    await sb.from('notificacoes').delete().eq('dados->>solicitacao_id', solId);
    await sb.from('solicitacoes').delete().eq('id', solId);
  }
  if (ofId) await sb.from('oficinas').delete().eq('id', ofId);
  for (const id of contas) {
    await sb.from('suporte_conversas').delete().eq('profile_id', id); await sb.from('presenca').delete().eq('profile_id', id);
    await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('veiculos').delete().eq('profile_id', id);
    await sb.from('pedidos_pendentes').delete().eq('user_id', id); await sb.from('profiles').delete().eq('id', id);
    await sb.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`prints em ${OUT}`);
  console.log(`${total - falhas} ok / ${falhas} falhas`);
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
