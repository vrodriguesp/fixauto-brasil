// Admin: numero do cliente, conversa comecada pelo admin e "online agora" (dono 19/11).
//  A numero do cliente (profiles.codigo) e do pedido: usuarios (coluna + busca), solicitacoes
//    (ao lado do cliente + busca pelo numero do cliente e do pedido), detalhe do pedido, CSV,
//    detalhe da oficina (Pedido N)
//  B presenca (migracao 101): oficina sem sinal -> entra no site -> "online agora" na lista
//    de oficinas, no detalhe, no pedido (contato com as oficinas) e no suporte; sinal velho ->
//    "visto ha X"; visitante sem login nao chama /api/presenca; 401/403 nas rotas; limite
//  C admin comeca a conversa: "Escrever a oficina" no detalhe -> /admin/suporte com a conversa
//    aberta -> mensagem traduzida (et) -> oficina sem o chat aberto recebe e-mail "BipFixi
//    sonum" -> oficina ve no balao do site (1 nao lida), le, responde -> admin ve a resposta
//    traduzida; "Nova conversa" pelo numero do cliente -> e-mail em russo; "Escrever" nos
//    usuarios leva a MESMA conversa (uma por conta); 401/403; 2a mensagem com o chat aberto
//    nao manda e-mail
// Precisa de DEEPL_API_KEY no .env.local (gasta poucos caracteres).
//   SITE=http://localhost:3106 node admin-chat-online.mjs <.env.local>
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
const SITE = process.env.SITE || process.argv[3] || 'http://localhost:3100';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PASTA = env.EMAIL_PASTA_TESTE;
const PRINTS = process.env.PRINTS || 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/admin-chat-online';
fs.mkdirSync(PRINTS, { recursive: true });
let falhas = 0; let total = 0;
const ok = (n, c, x = '') => { total++; if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 240) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const conversas = []; let ofId, solId, veicId;
const emailsDesde = (t0, para) => (PASTA && fs.existsSync(PASTA) ? fs.readdirSync(PASTA) : []).filter((f) => Number(f.split('_')[0]) >= t0 && (!para || f.includes(para.replace(/[^a-z0-9@._-]/gi, '_')))).map((f) => fs.readFileSync(path.join(PASTA, f), 'utf8'));
const esperar = async (fn, ms = 20000, passo = 1000) => { for (let t = 0; t < ms; t += passo) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, passo)); } return fn(); };
const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const TELAS = { celular: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, pc: { viewport: { width: 1366, height: 900 } } };
const ctxNovo = async (tela) => { const c = await browser.newContext(TELAS[tela]); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} }); return c; };
const entrar = async (ctx, u, pre) => { const p = await ctx.newPage(); await p.goto(`${SITE}${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]'); await p.waitForURL((x) => !x.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(2500); return p; };
const conta = async (tipo, nome, idioma) => {
  const email = `aco-${tipo}${contas.length}-${tag}@example.test`; const senha = `Ac${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone: '+372 5000 0000', termos_aceitos_em: new Date().toISOString(), termos_versao: '2026-09-30' });
  const { data: p } = await sb.from('profiles').select('codigo').eq('id', data.user.id).single();
  const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await a.auth.signInWithPassword({ email, password: senha });
  const { data: { session } } = await a.auth.getSession();
  return { id: data.user.id, email, senha, codigo: p.codigo, token: session?.access_token };
};
const api = (caminho, { token, metodo = 'GET', corpo } = {}) => fetch(`${SITE}${caminho}`, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
const presencaNaTela = async (p, filtro) => { const el = filtro ? p.getByTestId('presenca').filter(filtro).first() : p.getByTestId('presenca').first(); return { online: await el.getAttribute('data-online').catch(() => null), texto: await el.innerText().catch(() => '') }; };

try {
  await sb.from('plataforma_config').upsert({ id: 1, admin_visto_em: null, suporte_traducao: true }, { onConflict: 'id' });
  const adm = await conta('admin', 'Admin Chat', 'pt');
  const dono = await conta('oficina', 'Mart Sepp', 'et');
  const cli = await conta('cliente', 'Olga Ivanova', 'ru');
  const { data: of } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `ACO Autoteenindus ${tag}`, endereco: 'Tartu mnt 50', cidade: 'Tallinn', estado: 'Harjumaa', cep: '10115', pais: 'EE', latitude: 59.4325, longitude: 24.7703, raio_atendimento_km: 30, especialidades: ['mecanica'], ativa: true }).select('id').single();
  ofId = of.id;
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: 'Octavia', fipe_ano: '2016', placa: `ACO${tag.slice(0, 3).toUpperCase()}` }).select('id').single();
  veicId = v.id;
  const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: `Pidurid kriuksuvad ${tag}`, urgencia: 'media', latitude: 59.4371, longitude: 24.7536, endereco: `Pikk 12, 10123 Tallinn, Estonia`, status: 'em_orcamento' }).select('id, numero, endereco').single();
  solId = s.id;
  // a oficina orcou: aparece em "Contato com as oficinas" do pedido e em "Solicitacoes recentes" da oficina
  await sb.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: of.id, valor_total: 120, prazo_dias: 2, tempo_execucao_horas: 3, validade: dia(10), garantia_dias: 30 });
  ok('setup: cliente com numero (>= 500001) e pedido com numero', cli.codigo >= 500001 && s.numero > 0, JSON.stringify({ codigo: cli.codigo, numero: s.numero }));

  const ctxA = await ctxNovo('pc'); const pA = await entrar(ctxA, adm, '/br/pt');

  // ---------- A numero do cliente / do pedido
  await pA.goto(`${SITE}/admin/usuarios`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(1500);
  const linhaCli = pA.locator('tr').filter({ hasText: cli.email });
  ok('A.1 usuarios: coluna Nº com o numero do cliente', (await linhaCli.getByTestId('admin-usuario-codigo').innerText()) === String(cli.codigo));
  ok('A.1 usuarios: "Escrever" na linha da conta', await linhaCli.getByTestId('admin-escrever').isVisible());
  await pA.fill('input[placeholder*="Buscar"]', String(cli.codigo)); await pA.waitForTimeout(1500);
  const linhas = await pA.locator('tbody tr').count();
  ok('A.1 usuarios: busca pelo numero do cliente acha so ele', linhas === 1 && (await pA.locator('tbody').innerText()).includes(cli.email), `${linhas} linhas`);
  await pA.screenshot({ path: `${PRINTS}/A1-usuarios-numero.png` });

  await pA.goto(`${SITE}/admin/solicitacoes`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(1500);
  const linhaSol = pA.locator('tr').filter({ hasText: `Pidurid kriuksuvad ${tag}` });
  ok('A.2 solicitacoes: numero do pedido na linha', (await linhaSol.getByTestId('admin-numero-pedido').innerText()) === String(s.numero));
  ok('A.2 solicitacoes: numero do cliente ao lado do cliente', (await linhaSol.getByTestId('admin-numero-cliente').innerText()).includes(String(cli.codigo)));
  for (const [rotulo, termo] of [['numero do cliente', String(cli.codigo)], ['numero do pedido', String(s.numero)]]) {
    await pA.fill('input[placeholder*="Buscar"]', termo); await pA.waitForTimeout(1500);
    const n = await pA.locator('tbody tr').count(); const t = await pA.locator('tbody').innerText();
    ok(`A.2 solicitacoes: busca pelo ${rotulo} acha o pedido`, n === 1 && t.includes(tag), `${n} linhas`);
  }
  await pA.screenshot({ path: `${PRINTS}/A2-solicitacoes-numeros.png` });

  await pA.goto(`${SITE}/admin/solicitacoes/${s.id}`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(2000);
  ok('A.3 detalhe do pedido: "Pedido N" em destaque', (await pA.getByTestId('admin-detalhe-numero').innerText()) === `Pedido ${s.numero}`);
  ok('A.3 detalhe do pedido: numero do cliente no cartao do cliente', (await pA.getByTestId('admin-detalhe-cliente-codigo').innerText()).includes(String(cli.codigo)));
  // 102: a linha publica guarda so a area; o admin ve a RUA (tabela privada) na lista (API), no detalhe e no CSV
  const corpoDetalhe = await pA.locator('body').innerText();
  ok('A.3 detalhe do pedido: rua completa (102, tabela privada)', corpoDetalhe.includes('Pikk 12, 10123 Tallinn'), corpoDetalhe.match(/[^\n]*Tallinn[^\n]*/)?.[0]);
  ok('A.3 detalhe do pedido: oficina que recebeu com "Escrever a oficina"', (await pA.getByTestId('contato-oficina').filter({ hasText: `ACO Autoteenindus ${tag}` }).innerText()).includes('Escrever à oficina'));

  const csv = await (await pA.request.get(`${SITE}/api/admin/export?tipo=solicitacoes`)).text();
  const cab = csv.split('\n')[0].split(','); const linhaCsv = csv.split('\n').find((l) => l.includes(tag)) || '';
  ok('A.4 CSV: rua completa na linha (102)', linhaCsv.includes('Pikk 12'), linhaCsv.slice(0, 160));
  ok('setup 102: a linha publica do pedido ficou so com a area', s.endereco === 'Tallinn, Estonia', s.endereco);
  const listaRua = await (await pA.request.get(`${SITE}/api/admin/solicitacoes?q=${encodeURIComponent('Pikk 12')}`)).json();
  const naLista = (listaRua.solicitacoes || []).find((x) => x.id === s.id);
  ok('A.4 lista (API): busca pela RUA acha o pedido e devolve a rua completa ao admin (102)', !!naLista && naLista.endereco === 'Pikk 12, 10123 Tallinn, Estonia', JSON.stringify({ n: (listaRua.solicitacoes || []).length, endereco: naLista?.endereco }));
  ok('A.4 CSV: coluna cliente_codigo e numero na linha', cab.includes('cliente_codigo') && cab.includes('numero') && linhaCsv.split(',')[cab.indexOf('cliente_codigo')] === String(cli.codigo) && linhaCsv.split(',')[cab.indexOf('numero')] === String(s.numero), `${cab.join('|')} / ${linhaCsv.slice(0, 120)}`);

  await pA.goto(`${SITE}/admin/oficinas/${of.id}`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(2000);
  ok('A.5 detalhe da oficina: "Pedido N" nas solicitacoes recentes (link ao pedido)', (await pA.getByTestId('admin-numero-pedido').first().innerText()) === `Pedido ${s.numero}` && (await pA.getByTestId('admin-numero-pedido').first().getAttribute('href')) === `/admin/solicitacoes/${s.id}`);

  // ---------- B presenca
  let pr = await presencaNaTela(pA);
  ok('B.1 oficina que nunca entrou: sem sinal (bolinha apagada)', pr.online === '0' && pr.texto.includes('sem sinal'), JSON.stringify(pr));
  // visitante sem login: nenhuma chamada a /api/presenca
  const ctxV = await ctxNovo('celular'); const pV = await ctxV.newPage(); let chamadasVisitante = 0;
  pV.on('request', (r) => { if (r.url().includes('/api/presenca')) chamadasVisitante++; });
  await pV.goto(`${SITE}/ee/et`, { waitUntil: 'networkidle' }); await pV.waitForTimeout(3000);
  ok('B.2 visitante sem login nao manda sinal de presenca', chamadasVisitante === 0, `${chamadasVisitante} chamadas`);
  await ctxV.close();
  // oficina entra no site (celular) -> sinal
  const ctxO = await ctxNovo('celular'); let chamadasOficina = 0;
  const pO = await entrar(ctxO, dono, '/ee/et');
  pO.on('request', (r) => { if (r.url().includes('/api/presenca')) chamadasOficina++; });
  await pO.goto(`${SITE}/ee/et/oficina/dashboard`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(2500);
  const { data: pres } = await sb.from('presenca').select('visto_em').eq('profile_id', dono.id).maybeSingle();
  ok('B.3 oficina logada: linha de presenca so com a hora (sem IP/pagina)', !!pres?.visto_em && Date.now() - Date.parse(pres.visto_em) < 60000 && Object.keys(pres).length === 1, JSON.stringify(pres));
  await pA.reload({ waitUntil: 'networkidle' }); await pA.waitForTimeout(2000);
  pr = await presencaNaTela(pA);
  ok('B.4 detalhe da oficina: "online agora" (bolinha verde)', pr.online === '1' && pr.texto.includes('online agora'), JSON.stringify(pr));
  await pA.screenshot({ path: `${PRINTS}/B4-oficina-online.png` });
  await pA.goto(`${SITE}/admin/oficinas`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(2000);
  pr = await presencaNaTela(pA.locator('tr').filter({ hasText: `ACO Autoteenindus ${tag}` }));
  ok('B.5 lista de oficinas: "online agora" na linha', pr.online === '1', JSON.stringify(pr));
  await pA.goto(`${SITE}/admin/solicitacoes/${s.id}`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(2000);
  pr = await presencaNaTela(pA.getByTestId('contato-oficina').filter({ hasText: `ACO Autoteenindus ${tag}` }));
  ok('B.6 detalhe do pedido: oficina que recebeu o pedido "online agora"', pr.online === '1', JSON.stringify(pr));
  // sinal velho -> "visto ha X" (a oficina sai do site antes: a pagina manda sinal por minuto)
  await pO.goto('about:blank');
  await sb.from('presenca').update({ visto_em: new Date(Date.now() - 10 * 60e3).toISOString() }).eq('profile_id', dono.id);
  await pA.goto(`${SITE}/admin/oficinas/${of.id}`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(2000);
  pr = await presencaNaTela(pA);
  ok('B.7 sinal de 10 min atras: "visto 10 min" (bolinha cinza)', pr.online === '0' && /visto 10 min/.test(pr.texto), JSON.stringify(pr));
  // limite de 1 sinal a cada 20 s por conta (espera passar a janela do ultimo sinal da pagina)
  await pA.waitForTimeout(21000);
  const rPres1 = await api('/api/presenca', { token: dono.token, metodo: 'POST' }); const d1 = await rPres1.json();
  const rPres2 = await api('/api/presenca', { token: dono.token, metodo: 'POST' }); const d2 = await rPres2.json();
  ok('B.8 sinal pela API (Bearer, como o app): grava; 2o em menos de 20 s ignorado sem erro', rPres1.ok && rPres2.ok && d2.ignorado === true, JSON.stringify({ d1, d2 }));
  const { data: pres2 } = await sb.from('presenca').select('visto_em').eq('profile_id', dono.id).single();
  ok('B.8 a hora voltou a agora', Date.now() - Date.parse(pres2.visto_em) < 15000);
  ok('B.9 sem login: POST /api/presenca 401', (await api('/api/presenca', { metodo: 'POST' })).status === 401);
  ok('B.9 sem login: GET /api/admin/presenca 401', (await api(`/api/admin/presenca?profiles=${dono.id}`)).status === 401);
  ok('B.9 oficina: GET /api/admin/presenca 403', (await api(`/api/admin/presenca?profiles=${cli.id}`, { token: dono.token })).status === 403);
  const rAdm = await api(`/api/admin/presenca?profiles=${dono.id}&oficinas=${of.id}`, { token: adm.token }); const dAdm = await rAdm.json();
  ok('B.9 admin: GET /api/admin/presenca por conta e por oficina', rAdm.ok && !!dAdm.profiles[dono.id] && !!dAdm.oficinas[of.id], JSON.stringify(dAdm));

  // ---------- C admin comeca a conversa com a oficina
  // a oficina fecha o site (nao esta com o chat aberto): a mensagem vai tambem por e-mail
  await pO.goto('about:blank');
  await pA.goto(`${SITE}/admin/oficinas/${of.id}`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(1500);
  await pA.getByTestId('admin-escrever-oficina').click();
  await pA.waitForURL((x) => x.pathname === '/admin/suporte', { timeout: 20000 });
  const cab1 = await esperar(async () => { const t = await pA.locator('main').innerText().catch(() => ''); return t.includes('Sem mensagens ainda') ? t : null; });
  ok('C.1 "Escrever a oficina" abre /admin/suporte com a conversa da oficina (vazia)', !!cab1 && cab1.includes('Mart Sepp') && cab1.includes('estoniano'), (cab1 || '').slice(0, 300));
  const { data: convO } = await sb.from('suporte_conversas').select('id, idioma, profile_id').eq('profile_id', dono.id).maybeSingle();
  if (convO) conversas.push(convO.id);
  ok('C.1 conversa criada na lingua do cadastro (et)', convO?.idioma === 'et', JSON.stringify(convO));
  ok('C.1 cabecalho: numero da conta e presenca', (await pA.getByTestId('suporte-codigo').innerText()).includes(String(dono.codigo)) && (await pA.locator('header').getByTestId('presenca').count()) === 1);
  await pA.screenshot({ path: `${PRINTS}/C1-admin-conversa-nova.png` });
  const t1 = Date.now();
  await pA.getByTestId('suporte-resposta').fill(`Olá! Recebeu o pedido de travões? Precisa de ajuda? (${tag})`);
  await pA.getByRole('button', { name: 'Enviar' }).click();
  const depois = await esperar(async () => { const t = await pA.locator('main').innerText(); return t.includes('enviado em estoniano') ? t : null; });
  ok('C.2 mensagem do admin vai traduzida para o estoniano (automatico)', !!depois, (depois || '').slice(-300));
  ok('C.2 aviso: a pessoa nao esta com o chat aberto -> tambem por e-mail', (await pA.locator('main').innerText()).includes('também por e-mail'));
  const eOf = await esperar(async () => emailsDesde(t1, dono.email)[0]);
  ok('C.2 e-mail a oficina em estoniano: "BipFixi sõnum" (mensagem, nao "resposta") com o texto', !!eOf && eOf.includes('BipFixi sõnum') && !eOf.includes('BipFixi vastus') && /pidur|tellimus|abi/i.test(eOf) && eOf.includes('suporte=1'), (eOf || 'sem e-mail').slice(0, 200));
  const { data: m1 } = await sb.from('suporte_mensagens').select('autor, texto, traducao').eq('conversa_id', convO.id).order('created_at').limit(1).single();
  ok('C.2 banco: mensagem do admin com traducao', m1?.autor === 'admin' && !!m1.traducao && m1.traducao !== m1.texto, JSON.stringify(m1));

  // oficina ve no balao do site (celular): 1 nao lida -> abre -> le -> responde
  await pO.goto(`${SITE}/ee/et/oficina/dashboard`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(1500);
  const cont = await esperar(async () => (await pO.getByTestId('chat-suporte-nao-lidas').innerText().catch(() => '')) === '1', 60000);
  ok('C.3 oficina: botao do chat com 1 nao lida', !!cont);
  await pO.screenshot({ path: `${PRINTS}/C3-oficina-balao-nao-lida.png` });
  await pO.getByTestId('chat-suporte-botao').click();
  const janela = pO.getByTestId('chat-suporte-janela');
  const lido = await esperar(async () => { const t = await janela.innerText().catch(() => ''); return t.includes(m1.traducao.slice(0, 20)) ? t : null; });
  ok('C.3 oficina le a mensagem em estoniano no chat do site', !!lido, (lido || '').slice(-300));
  await pO.screenshot({ path: `${PRINTS}/C3-oficina-chat-aberto.png` });
  await pO.fill('#suporte-texto', `Tere! Jah, sain tellimuse kätte, saadan hinnapakkumise täna. (${tag})`);
  await pO.getByTestId('chat-suporte-enviar').click();
  const resp = await esperar(async () => { const t = await pA.locator('main').innerText(); return t.includes('traduzido do estoniano') ? t : null; }, 30000);
  ok('C.3 admin ve a resposta da oficina traduzida para o portugues', !!resp && /pedido|orçamento|encomenda/i.test(resp), (resp || '').slice(-300));
  await pA.screenshot({ path: `${PRINTS}/C3-admin-ve-resposta.png` });
  const { data: convO2 } = await sb.from('suporte_conversas').select('nao_lidas_admin, nao_lidas_usuario, usuario_visto_em').eq('id', convO.id).single();
  ok('C.3 banco: a conversa continua a mesma (lida pelos dois lados)', convO2.nao_lidas_admin === 0 && convO2.nao_lidas_usuario === 0 && !!convO2.usuario_visto_em, JSON.stringify(convO2));
  // 2a mensagem com a oficina de chat aberto: sem e-mail
  const t2 = Date.now(); const emailsAntes = emailsDesde(t2, dono.email).length;
  await pA.getByTestId('suporte-resposta').fill(`Ótimo, obrigado! (${tag})`); await pA.getByRole('button', { name: 'Enviar' }).click();
  await esperar(async () => (await pA.locator('main').innerText()).includes(`Ótimo, obrigado! (${tag})`));
  await pA.waitForTimeout(3000);
  ok('C.4 oficina com o chat aberto: 2a mensagem SEM e-mail', emailsDesde(t2, dono.email).length === emailsAntes && !(await pA.locator('main').innerText()).includes('também por e-mail'));
  const vista = await esperar(async () => { const t = await janela.innerText().catch(() => ''); return t.includes(`Ótimo, obrigado! (${tag})`) || /tänan|aitäh/i.test(t) ? t : null; });
  ok('C.4 oficina ve a 2a mensagem no chat aberto', !!vista, (vista || '').slice(-200));

  // "Nova conversa" pelo numero do cliente -> cliente (ru), sem chat aberto -> e-mail em russo
  await pA.getByTestId('suporte-nova-conversa').click();
  await pA.getByTestId('suporte-nova-busca').fill(String(cli.codigo)); await pA.waitForTimeout(1500);
  const achada = pA.getByTestId('suporte-nova-conta').filter({ hasText: cli.email });
  ok('C.5 "Nova conversa": busca pelo numero do cliente acha a conta (tipo, nº, lingua)', (await achada.count()) === 1 && (await achada.innerText()).includes(`nº ${cli.codigo}`) && (await achada.innerText()).includes('RU'), await pA.getByTestId('suporte-nova-caixa').innerText().catch(() => ''));
  await pA.screenshot({ path: `${PRINTS}/C5-nova-conversa-busca.png` });
  await achada.click();
  const cabC = await esperar(async () => { const t = await pA.locator('main').innerText(); return t.includes('Olga Ivanova') && t.includes('Sem mensagens ainda') ? t : null; });
  ok('C.5 conversa do cliente aberta (russo)', !!cabC && cabC.includes('russo'), (cabC || '').slice(0, 300));
  const { data: convC } = await sb.from('suporte_conversas').select('id, idioma').eq('profile_id', cli.id).maybeSingle();
  if (convC) conversas.push(convC.id);
  const t3 = Date.now();
  await pA.getByTestId('suporte-resposta').fill(`Olá Olga, a oficina já respondeu ao seu pedido. (${tag})`); await pA.getByRole('button', { name: 'Enviar' }).click();
  await esperar(async () => (await pA.locator('main').innerText()).includes('enviado em russo'));
  const eCli = await esperar(async () => emailsDesde(t3, cli.email)[0]);
  ok('C.5 cliente sem o chat aberto: e-mail em russo "Сообщение от BipFix"', !!eCli && eCli.includes('Сообщение от BipFix') && /[А-Яа-я]{4,}/.test(eCli), (eCli || 'sem e-mail').slice(0, 200));
  // "Escrever" nos usuarios leva a MESMA conversa
  await pA.goto(`${SITE}/admin/usuarios`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(1500);
  await pA.locator('tr').filter({ hasText: cli.email }).getByTestId('admin-escrever').click();
  await pA.waitForURL((x) => x.pathname === '/admin/suporte', { timeout: 20000 });
  const mesma = await esperar(async () => { const t = await pA.locator('main').innerText(); return t.includes('Olga Ivanova') && t.includes(`a oficina já respondeu ao seu pedido. (${tag})`) ? t : null; });
  const { count: nConv } = await sb.from('suporte_conversas').select('id', { count: 'exact', head: true }).eq('profile_id', cli.id);
  ok('C.6 "Escrever" nos usuarios abre a MESMA conversa (uma por conta, com o historico)', !!mesma && nConv === 1, `${nConv} conversas`);
  // lista de conversas: as duas aparecem, com presenca na da oficina
  const lista = pA.getByTestId('suporte-conversa');
  ok('C.6 lista: as duas conversas comecadas pelo admin aparecem', (await lista.filter({ hasText: 'Mart Sepp' }).count()) === 1 && (await lista.filter({ hasText: 'Olga Ivanova' }).count()) === 1);
  ok('C.6 lista: bolinha de presenca na conversa da oficina (online: chat aberto no site)', (await lista.filter({ hasText: 'Mart Sepp' }).getByTestId('presenca').getAttribute('data-online')) === '1');
  await pA.screenshot({ path: `${PRINTS}/C6-lista-conversas.png` });

  // rotas novas: 401/403 para quem nao e admin
  ok('C.7 sem login: POST /api/admin/suporte/iniciar 401', (await api('/api/admin/suporte/iniciar', { metodo: 'POST', corpo: { profileId: cli.id } })).status === 401);
  ok('C.7 oficina: POST /api/admin/suporte/iniciar 403', (await api('/api/admin/suporte/iniciar', { token: dono.token, metodo: 'POST', corpo: { profileId: cli.id } })).status === 403);
  ok('C.7 oficina: GET /api/admin/suporte/iniciar?q= 403', (await api('/api/admin/suporte/iniciar?q=olga', { token: dono.token })).status === 403);
  ok('C.7 cliente: GET /api/admin/suporte 403', (await api('/api/admin/suporte', { token: cli.token })).status === 403);
  ok('C.7 admin: iniciar com uma conta de admin recusado (400)', (await api('/api/admin/suporte/iniciar', { token: adm.token, metodo: 'POST', corpo: { profileId: adm.id } })).status === 400);
  ok('C.7 admin: iniciar de novo devolve a conversa existente (nova=false)', JSON.stringify(await (await api('/api/admin/suporte/iniciar', { token: adm.token, metodo: 'POST', corpo: { profileId: cli.id } })).json()) === JSON.stringify({ conversaId: convC.id, nova: false }));

  await ctxO.close(); await ctxA.close();
} catch (e) {
  falhas++; console.log('ERRO', e.stack?.slice(0, 800) || e.message);
} finally {
  await browser.close();
  await sb.from('plataforma_config').upsert({ id: 1, admin_visto_em: null, suporte_traducao: true }, { onConflict: 'id' });
  for (const c of conversas) await sb.from('suporte_conversas').delete().eq('id', c);
  if (solId) { await sb.from('orcamentos').delete().eq('solicitacao_id', solId); await sb.from('solicitacoes').delete().eq('id', solId); }
  if (veicId) await sb.from('veiculos').delete().eq('id', veicId);
  if (ofId) await sb.from('oficinas').delete().eq('id', ofId);
  for (const id of contas) { await sb.from('suporte_conversas').delete().eq('profile_id', id); await sb.from('presenca').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(`${total - falhas} ok / ${falhas} falhas`);
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
