// Base comum dos testes do lote "acesso direto das oficinas pelo e-mail + lembrete" (17/11;
// Documentos/Analises/Acesso_oficinas_2026-11-17). So banco LOCAL (Docker) + site :3100.
// Cria contas @example.test com nome "TESTE-ACESSO ..." e apaga tudo no fim (limpar()).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
export const { createClient } = req('@supabase/supabase-js');
export const { chromium, webkit, devices } = req('playwright-core');

export const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const WEB = path.resolve(AQUI, '../..');
export const ENV_PADRAO = path.join(WEB, '.env.local');

export function lerEnv(arq = ENV_PADRAO) {
  const env = Object.fromEntries(fs.readFileSync(arq, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
  if (!/localhost|127\.0\.0\.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
  return env;
}

export const SITE = process.env.SITE || 'http://localhost:3100';
// o banco local nao basta: o site tambem tem de ser o local (auditoria dos testes 17/11)
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SITE)) throw new Error('TESTE LOCAL: SITE precisa ser o site local (ex.: http://localhost:3100) - parado para nao tocar a producao');
export const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
export const WEBKIT = path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const dia = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
export const horasAtras = (h) => new Date(Date.now() - h * 3600e3).toISOString();
export const hashAcesso = (token) => crypto.createHash('sha256').update(`acesso:${token}`).digest('hex');
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const psql = (sql) => execSync('docker exec -i supabase_db_bipfix-teste psql -U postgres -v ON_ERROR_STOP=1 -tA', { input: sql }).toString().trim();

// Narva (EE): longe das oficinas de teste que ja existem no banco local (Tallinn, ~200 km)
export const NARVA = { lat: 59.377, lon: 28.19 };
export const perto = (km) => ({ lat: NARVA.lat + km * 0.009, lon: NARVA.lon });

// mensagens (todos os arquivos do idioma juntos) e T('ns.chave', { x })
export const mensagens = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => { try { return JSON.parse(fs.readFileSync(path.join(WEB, 'messages', `${l}${a}.json`), 'utf8')); } catch { return {}; } }));
export const tradutor = (l) => { const m = mensagens(l); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
export const IDIOMAS = ['et', 'ru', 'en', 'it', 'pt', 'pt-PT'];
export const PREFIXO = { et: '/ee/et', ru: '/ee/ru', en: '/ee/en', it: '/it/it', pt: '/br/pt', 'pt-PT': '/pt/pt' };

export function contador() {
  let oks = 0, falhas = 0;
  const ok = (nome, cond, extra = '') => {
    if (cond) oks++; else falhas++;
    console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}${!cond && extra ? ' - ' + String(extra).replace(/\s+/g, ' ').slice(0, 320) : ''}`);
  };
  const fim = () => { console.log(`\nok ${oks} / falhas ${falhas}`); return falhas; };
  const tentar = async (nome, fn) => { try { await fn(); } catch (e) { ok(`${nome} (excecao)`, false, e?.stack || e?.message || e); } };
  return { ok, fim, tentar };
}

export function ambiente(env) {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const EMAILS = env.EMAIL_PASTA_TESTE;
  const tag = crypto.randomBytes(3).toString('hex');
  const senha = `Acesso-${crypto.randomBytes(5).toString('hex')}A1`;
  let ipN = 1;
  const ip = () => `10.77.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
  const criado = { contas: [], oficinas: [], sols: [], emails: [] };
  const HORARIO = Object.fromEntries(['seg', 'ter', 'qua', 'qui', 'sex'].map((d) => [d, { aberto: true, inicio: '08:00', fim: '18:00' }]).concat([['sab', { aberto: false, inicio: '', fim: '' }], ['dom', { aberto: false, inicio: '', fim: '' }]]));

  const conta = async (tipo, apelido, { idioma = 'et', contaTeste = false, senhaDefinida = true, ativo = true } = {}) => {
    const email = `teste-acesso-${apelido}-${tag}@example.test`.toLowerCase();
    const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (error) throw new Error(`createUser ${apelido}: ${error.message}`);
    criado.contas.push(data.user.id); criado.emails.push(email);
    const { error: e2 } = await admin.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE-ACESSO ${apelido}`, email, idioma, telefone: '+372 5000 0000', conta_teste: contaTeste, senha_definida: senhaDefinida, ativo, termos_aceitos_em: new Date().toISOString() });
    if (e2) throw new Error(`profile ${apelido}: ${e2.message}`);
    return { id: data.user.id, email, senha, nome: `TESTE-ACESSO ${apelido}`, idioma };
  };
  const oficina = async (dono, apelido, { km = 1, esp = ['mecanica'], ativa = true, raio = 30 } = {}) => {
    const p = perto(km);
    const { data, error } = await admin.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `TESTE-ACESSO ${apelido}`, endereco: `${apelido} tee 1`, cidade: 'Narva', estado: 'Ida-Virumaa', cep: '20308', pais: 'EE', latitude: p.lat, longitude: p.lon, raio_atendimento_km: raio, especialidades: esp, ativa, seguradoras_convencionadas: [], horario_funcionamento: HORARIO }).select('id').single();
    if (error) throw new Error(`oficina ${apelido}: ${error.message}`);
    criado.oficinas.push(data.id);
    return { id: data.id, dono, nome: `TESTE-ACESSO ${apelido}` };
  };
  const pedido = async (cliente, { tipo = 'mecanica', status = 'aberta', descricao = 'teste', urgencia = 'media' } = {}) => {
    const { data: v, error: ev } = await admin.from('veiculos').insert({ profile_id: cliente.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018', placa: `TA${crypto.randomBytes(2).toString('hex').toUpperCase()}` }).select('id').single();
    if (ev) throw new Error(`veiculo: ${ev.message}`);
    const { data, error } = await admin.from('solicitacoes').insert({ cliente_id: cliente.id, veiculo_id: v.id, tipo, descricao: `TESTE-ACESSO ${descricao} ${tag}`, urgencia, endereco: 'Tallinna mnt 1, Narva', latitude: NARVA.lat, longitude: NARVA.lon, pais: 'EE', status }).select('id, numero').single();
    if (error) throw new Error(`solicitacao: ${error.message}`);
    criado.sols.push(data.id);
    return { id: data.id, numero: data.numero, cliente, veiculoId: v.id };
  };
  const orcamento = async (sol, of, status = 'enviado') => {
    const { data, error } = await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of.id, valor_total: 120, prazo_dias: 1, status, validade: dia(10) }).select('id').single();
    if (error) throw new Error(`orcamento: ${error.message}`);
    await admin.from('orcamento_itens').insert({ orcamento_id: data.id, descricao: 'Remont', tipo: 'mao_de_obra', valor_unitario: 120, quantidade: 1, valor_total: 120 });
    return data.id;
  };
  // aviso ja recebido (sino), com a data que o teste quiser (regra das 12 h / 48 h)
  const aviso = async (of, sol, tipo = 'nova_solicitacao', hAtras = 20, dados = {}) => {
    const { error } = await admin.from('notificacoes').insert({ profile_id: of.dono.id, tipo, titulo: 'TESTE-ACESSO', mensagem: 'TESTE-ACESSO', dados: { solicitacao_id: sol.id, ...dados }, created_at: horasAtras(hAtras) });
    if (error) throw new Error(`notificacao: ${error.message}`);
  };
  const sessao = async (u) => { const c = anon(); const { data, error } = await c.auth.signInWithPassword({ email: u.email, password: u.senha }); if (error) throw new Error(`login ${u.email}: ${error.message}`); return { c, token: data.session.access_token }; };
  const api = async (metodo, rota, corpo, token) => {
    const r = await fetch(`${SITE}${rota}`, { method: metodo, headers: { 'Content-Type': 'application/json', 'x-real-ip': ip(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { status: r.status, d: await r.json().catch(() => ({})) };
  };
  const linkAcesso = (k) => api('POST', '/api/link-acesso', k);
  const linha = async (token) => (await admin.from('links_acesso').select('*').eq('token_hash', hashAcesso(token)).maybeSingle()).data;
  const get302 = async (caminho) => { const r = await fetch(`${SITE}${caminho}`, { redirect: 'manual', headers: { 'x-real-ip': ip() } }); return { status: r.status, location: r.headers.get('location') || '' }; };

  // e-mails do ambiente local (lib/email.ts): <timestamp>_<para>.html com "<!-- para: | assunto: -->"
  const arqDe = (email) => `_${email.replace(/[^a-z0-9@._-]/gi, '_')}.html`;
  const emailsDe = (email, depois = 0) => (fs.existsSync(EMAILS) ? fs.readdirSync(EMAILS) : []).filter((f) => f.endsWith(arqDe(email)) && Number(f.split('_')[0]) >= depois).sort()
    .map((f) => {
      const html = fs.readFileSync(path.join(EMAILS, f), 'utf8');
      // cabecalho: "<!-- para: x | assunto: y [| anexos: ...] [| responder: z] -->"
      const cab = (html.match(/<!-- para: .*? -->/) || [''])[0];
      const m = cab.match(/<!-- para: (.*?) \| assunto: (.*?)(?: \| .*)? -->/);
      return { f, html, cab, assunto: m?.[2] || '', responder: (cab.match(/\| responder: (\S+)/) || [])[1] || '', texto: html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
    });
  const esperarEmail = async (email, depois, filtro = () => true, tentativas = 40) => { for (let i = 0; i < tentativas; i++) { const e = emailsDe(email, depois).filter(filtro).at(-1); if (e) return e; await sleep(300); } return null; };
  const linksDe = (html) => [...String(html).matchAll(/href="([^"]*\/r\/\d+\?[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const codigoDe = (e) => (e?.texto.match(/(?<![\d#])\d{6}(?!\d)/) || [])[0];

  // link de acesso inserido direto no banco (token conhecido), para os casos que nenhum e-mail gera
  // (ex.: token de CLIENTE aberto com ?o=1 - o modo da tela vem de `finalidade`, nao da URL)
  const linkDireto = async (user, sol, { finalidade = 'cliente', oficinaId = null, horas = 24 } = {}) => {
    const token = crypto.randomBytes(32).toString('base64url');
    const extra = finalidade === 'oficina' ? { finalidade, oficina_id: oficinaId } : {};
    const { error } = await admin.from('links_acesso').insert({ user_id: user.id, solicitacao_id: sol.id, token_hash: hashAcesso(token), expira_em: new Date(Date.now() + horas * 3600e3).toISOString(), ...extra });
    if (error) throw new Error(`links_acesso: ${error.message}`);
    return token;
  };

  // apaga tudo desta rodada; devolve a lista de erros (antes os erros eram engolidos - auditoria 17/11)
  const limpar = async () => {
    const erros = [];
    const del = async (tabela, col, val) => { const { error } = await admin.from(tabela).delete().eq(col, val); if (error) erros.push(`${tabela}: ${error.message}`); };
    for (const s of criado.sols) {
      await del('notificacoes', 'dados->>solicitacao_id', s);
      for (const t of ['admin_auditoria', 'pedido_dispensas', 'pedido_convites', 'links_acesso', 'orcamentos']) await del(t, 'solicitacao_id', s);
    }
    for (const id of criado.contas) { await del('notificacoes', 'profile_id', id); await del('links_acesso', 'user_id', id); await del('codigos_login', 'user_id', id); }
    for (const s of criado.sols) await del('solicitacoes', 'id', s);
    for (const id of criado.contas) await del('veiculos', 'profile_id', id);
    for (const id of criado.oficinas) await del('oficinas', 'id', id);
    for (const id of criado.contas) { await del('profiles', 'id', id); const { error } = await admin.auth.admin.deleteUser(id); if (error) erros.push(`auth ${id}: ${error.message}`); }
    if (EMAILS && fs.existsSync(EMAILS)) for (const f of fs.readdirSync(EMAILS)) if (criado.emails.some((e) => f.endsWith(arqDe(e)))) fs.rmSync(path.join(EMAILS, f), { force: true });
    if (erros.length) console.log('limpar: ' + erros.join(' | '));
    return erros;
  };
  // o que sobrou desta rodada (tem de ser nada): contas, oficinas, pedidos, links e e-mails criados aqui
  const verificarLimpeza = async () => {
    const sobras = [];
    const conta1 = async (nome, q) => { const { count, error } = await q; if (error) sobras.push(`${nome}: ${error.message}`); else if (count) sobras.push(`${nome}: ${count}`); };
    if (criado.contas.length) await conta1('profiles', admin.from('profiles').select('id', { count: 'exact', head: true }).in('id', criado.contas));
    if (criado.oficinas.length) await conta1('oficinas', admin.from('oficinas').select('id', { count: 'exact', head: true }).in('id', criado.oficinas));
    if (criado.sols.length) {
      await conta1('solicitacoes', admin.from('solicitacoes').select('id', { count: 'exact', head: true }).in('id', criado.sols));
      await conta1('links_acesso', admin.from('links_acesso').select('id', { count: 'exact', head: true }).in('solicitacao_id', criado.sols));
    }
    if (criado.contas.length) await conta1('links_acesso (user)', admin.from('links_acesso').select('id', { count: 'exact', head: true }).in('user_id', criado.contas));
    const mails = EMAILS && fs.existsSync(EMAILS) ? fs.readdirSync(EMAILS).filter((f) => criado.emails.some((e) => f.endsWith(arqDe(e)))).length : 0;
    if (mails) sobras.push(`e-mails: ${mails}`);
    return sobras;
  };

  return { admin, anon, EMAILS, tag, senha, ip, criado, conta, oficina, pedido, orcamento, aviso, sessao, api, linkAcesso, linkDireto, linha, get302, emailsDe, esperarEmail, linksDe, codigoDe, limpar, verificarLimpeza };
}

// navegadores: Chromium (390 ou 1280) e WebKit (iPhone 13)
export async function abrirNavegadores(precisaWebkit = true) {
  const chrome = await chromium.launch({ executablePath: CHROME });
  const wk = precisaWebkit ? await webkit.launch({ executablePath: WEBKIT }) : null;
  const contexto = async (motor, largura, ip, extra = {}) => {
    const B = motor === 'webkit' ? wk : chrome;
    const base = motor === 'webkit' ? { ...devices['iPhone 13'] }
      : { viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500 };
    const ctx = await B.newContext({ ...base, locale: 'et-EE', extraHTTPHeaders: { 'x-real-ip': ip() }, ...extra });
    ctx.setDefaultTimeout(20000);
    // sem traducao automatica (chave Gemini de teste): a descricao aparece como foi escrita
    await ctx.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
    await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} });
    return ctx;
  };
  const fechar = async () => { await chrome.close().catch(() => {}); await wk?.close().catch(() => {}); };
  return { contexto, fechar };
}
export const semRolagemLateral = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
// Links de motorista do CABECALHO (Navbar: fila do computador + 2a linha do celular): so os <nav>
// fora do <footer>. O rodape tambem tem "Töökodadele"/"Автосервисам" e "Juhendid autojuhtidele" e
// NAO muda neste lote - conferir o body inteiro nunca passaria (auditoria dos testes 17/11).
export const textoCabecalho = (p) => p.evaluate(() => Array.from(document.querySelectorAll('nav')).filter((n) => !n.closest('footer')).map((n) => n.innerText).join(' '));
export const semLinksMotorista = async (p, tr) => { const t = await textoCabecalho(p); return !t.includes(tr('nav.pedirOrcamento')) && !t.includes(tr('nav.guias')) && !t.includes(tr('nav.paraOficinas')); };
export const comLinksMotorista = async (p, tr) => { const t = await textoCabecalho(p); return t.includes(tr('nav.pedirOrcamento')) && t.includes(tr('nav.guias')) && t.includes(tr('nav.paraOficinas')); };
// o mesmo no HTML do servidor (sem <script> - o catalogo de mensagens vai serializado - e sem <footer>)
export const htmlSemRodape = (html) => String(html).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<footer[\s\S]*?<\/footer>/gi, '');
export const semLinksMotoristaHtml = (html, tr) => { const h = htmlSemRodape(html); return !h.includes(tr('nav.pedirOrcamento')) && !h.includes(tr('nav.guias')) && !h.includes(tr('nav.paraOficinas')); };
export const comLinksMotoristaHtml = (html, tr) => { const h = htmlSemRodape(html); return h.includes(tr('nav.pedirOrcamento')) && h.includes(tr('nav.guias')) && h.includes(tr('nav.paraOficinas')); };
export const vigiar = (p, erros, quem) => { p.on('pageerror', (e) => erros.push(`${quem}: ${String(e.message).slice(0, 200)}`)); };
export const entrarPelaTela = async (p, prefixo, u, voltar) => {
  await p.goto(`${SITE}${prefixo}/login${voltar ? `?voltar=${encodeURIComponent(voltar)}` : ''}`, { waitUntil: 'networkidle' });
  await p.locator('#c0862-2').fill(u.email);
  await p.locator('#login-senha').fill(u.senha);
  await p.locator('form:has(#login-senha) button[type=submit]').click();
  await p.waitForURL((x) => !/\/login/.test(x.pathname), { timeout: 30000 }).catch(() => {});
  await p.waitForLoadState('networkidle').catch(() => {});
};
export const PRINTS = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/acesso-oficinas';
fs.mkdirSync(PRINTS, { recursive: true });
