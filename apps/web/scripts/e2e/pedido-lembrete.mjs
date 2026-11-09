// E2E LOCAL do lembrete de quem nao digitou o codigo (dono 06/11):
// pedido parado ha 2 h -> tarefa de hora em hora manda UM e-mail no idioma da pessoa,
// so com tipo de servico e carro; link "confirmar" (sem codigo, ja entra logado e abre
// o pedido) e "cancelar" (apaga na hora); link usado/adulterado/vencido nao vale; o
// codigo antigo continua valendo; pedido confirmado vai as oficinas.
//   node pedido-lembrete.mjs <.env.local>
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
const SITE = 'http://localhost:3100';
const EMAILS = env.EMAIL_PASTA_TESTE;
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/exaustivo';
fs.mkdirSync(OUT, { recursive: true });
const WEBMSG = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/site/apps/web/messages';
const msgWeb = (l) => {
  const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.json`, 'utf8'));
  for (const area of ['cliente', 'misc', 'auth']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.${area}.json`, 'utf8')));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const LOCS = ['et', 'ru', 'en', 'it', 'pt-PT', 'pt'];
const ASSUNTO = { et: /töökodadeni/, ru: /автосервис/, en: /repair shops/, it: /officine/, 'pt-PT': /oficinas/, pt: /oficinas/ };
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Lembr-' + crypto.randomBytes(6).toString('hex');
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 240) : ''}`); };
const contas = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => `10.99.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
const tarefa = async () => (await fetch(`${SITE}/api/tarefas/limpar-pendentes`, { method: 'POST', headers: { 'x-tarefa-chave': env.TAREFAS_CHAVE } })).json();
const emailsDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort()
  .map((f) => fs.readFileSync(path.join(EMAILS, f), 'utf8'));
const pedir = async (l, email, extra = {}) => {
  const form = new FormData();
  form.append('dados', JSON.stringify({ origem: extra.origem || 'site', idioma: l, nome: `Lembrete ${l}`, email, senha, telefone: '+372 5123 4567', aceitouTermos: true,
    tipo: 'mecanica', descricao: `Rua Secreta 99 descricao ${l}`, urgencia: 'media', endereco: 'Rua Secreta 99, Tallinn', latitude: 59.437, longitude: 24.745, pais: 'EE',
    veiculo: { tipo: 'cars', marca: 'Toyota', modelo: 'Corolla', ano: '2018', codigo: null, placa: 'LMB' + l.slice(0, 2).toUpperCase() } }));
  const t0 = Date.now();
  const r = await fetch(`${SITE}/api/pedido-sem-conta`, { method: 'POST', body: form, headers: { 'x-real-ip': ip() } });
  const d = await r.json();
  const p = (await admin.from('pedidos_pendentes').select('id, user_id').eq('id', d.pendenteId).maybeSingle()).data;
  if (p) contas.add(p.user_id);
  const cod = emailsDe(email, t0).at(-1)?.replace(/<[^>]+>/g, ' ').match(/(?<![\d#])\d{6}(?!\d)/)?.[0];
  return { id: d.pendenteId, user: p?.user_id, codigo: cod };
};
const envelhecer = (id, horas) => admin.from('pedidos_pendentes').update({ created_at: new Date(Date.now() - horas * 3600e3).toISOString() }).eq('id', id);
const linksDo = (html) => [...html.matchAll(/href="([^"]+retomar=[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/^https?:\/\/[^/]+/, SITE));

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const contexto = (largura) => browser.newContext({ viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500 });
const checar = async (page, nome) => {
  const t = await page.innerText('body');
  ok(`${nome}: sem chave sem traducao`, !/\b(pedidoSemConta|constants|erros)\.[a-zA-Z_]+/.test(t));
  ok(`${nome}: sem rolagem lateral`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  // nada sobreposto/cortado: botoes inteiros dentro da tela e sem um cobrir o outro
  const sobrep = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('[data-testid=retomar-pedido] button, [data-testid=retomar-pedido] a')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect());
    const fora = bs.some((r) => r.left < 0 || r.right > innerWidth + 1);
    const cruza = bs.some((a, i) => bs.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
    return { fora, cruza };
  });
  ok(`${nome}: botoes inteiros e sem sobreposicao`, !sobrep.fora && !sobrep.cruza, JSON.stringify(sobrep));
  return t;
};

try {
  // 1) lembrete so depois de 2 h, um so, no idioma; com tipo e carro e SEM endereco/descricao/telefone
  const pedidos = {};
  for (const l of LOCS) {
    const email = `lembrete-${l.toLowerCase()}-${tag}@example.test`;
    pedidos[l] = { email, ...(await pedir(l, email, { origem: l === 'ru' ? 'app' : 'site' })) };
  }
  const t1 = Date.now();
  let r = await tarefa();
  ok('tarefa antes de 2 h: nenhum lembrete destes pedidos', LOCS.every((l) => emailsDe(pedidos[l].email, t1).length === 0), JSON.stringify(r));
  for (const l of LOCS) await envelhecer(pedidos[l].id, 2.5);
  const t2 = Date.now();
  r = await tarefa();
  ok('tarefa depois de 2 h: lembretes enviados', r.lembretes >= LOCS.length, JSON.stringify(r));
  for (const l of LOCS) {
    const T = msgWeb(l);
    const m = emailsDe(pedidos[l].email, t2);
    const html = m.at(-1) || '';
    const assunto = (html.match(/assunto: (.*?) -->/) || [])[1] || '';
    const txt = html.replace(/<[^>]+>/g, ' ');
    ok(`lembrete ${l}: um e-mail, assunto no idioma`, m.length === 1 && ASSUNTO[l].test(assunto), assunto);
    ok(`lembrete ${l}: mostra tipo e carro`, txt.includes(T('constants.tiposServico.mecanica')) && txt.includes('Toyota Corolla 2018'));
    ok(`lembrete ${l}: sem endereco, descricao nem telefone`, !/Rua Secreta|5123 4567/.test(txt));
    ok(`lembrete ${l}: link confirmar e cancelar no idioma do pedido`, linksDo(html).length === 2 && linksDo(html).every((u) => u.includes(['et', 'ru', 'en'].includes(l) ? `/ee/${l}/` : l === 'it' ? '/it/it/' : l === 'pt-PT' ? '/pt/pt/' : '/br/pt/')), JSON.stringify(linksDo(html)));
    pedidos[l].links = linksDo(html);
  }
  const t3 = Date.now();
  await tarefa();
  ok('tarefa de novo: nenhum lembrete repetido', LOCS.every((l) => emailsDe(pedidos[l].email, t3).length === 0));

  // 2) confirmar pelo link (celular): ve o pedido, confirma, entra logado no pedido; oficinas avisadas
  for (const [l, largura] of [['et', 390], ['ru', 390], ['en', 1280], ['it', 390], ['pt', 1280]]) {
    const T = msgWeb(l);
    const nm = `confirmar ${l} ${largura}`;
    const ctx = await contexto(largura);
    await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(e.message));
    await page.goto(pedidos[l].links[0], { waitUntil: 'networkidle' });
    await page.getByTestId('retomar-resumo').waitFor({ timeout: 15000 });
    ok(`${nm}: link some da barra de endereco`, !page.url().includes('t='), page.url());
    const t = await checar(page, nm);
    ok(`${nm}: resumo do pedido no idioma`, t.includes(T('pedidoSemConta.retomarTitulo')) && t.includes(T('constants.tiposServico.mecanica')) && t.includes('Toyota Corolla 2018'));
    await page.screenshot({ path: `${OUT}/lembrete-${l}-${largura}-resumo.png`, fullPage: true });
    ok(`${nm}: abrir o link nao confirma sozinho`, !!(await admin.from('pedidos_pendentes').select('id').eq('id', pedidos[l].id).maybeSingle()).data);
    await page.getByTestId('retomar-confirmar').click();
    await page.waitForURL((u) => !u.pathname.endsWith(new URL(pedidos[l].links[0]).pathname.split('/').pop()), { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const sol = (await admin.from('solicitacoes').select('id').eq('cliente_id', pedidos[l].user).maybeSingle()).data;
    ok(`${nm}: pedido criado`, !!sol);
    ok(`${nm}: entra logado e abre o pedido`, !!sol && page.url().includes(sol.id), page.url());
    const tp = await page.innerText('body');
    ok(`${nm}: tela do pedido mostra o pedido`, tp.includes(`descricao ${l}`) && tp.includes('Toyota'), tp.slice(0, 160));
    await page.screenshot({ path: `${OUT}/lembrete-${l}-${largura}-pedido.png`, fullPage: true });
    const { count } = await admin.from('notificacoes').select('id', { count: 'exact', head: true }).eq('tipo', 'nova_solicitacao').eq('dados->>solicitacao_id', sol?.id);
    ok(`${nm}: oficinas avisadas`, count > 0, String(count));
    const perfil = (await admin.from('profiles').select('tipo, idioma').eq('id', pedidos[l].user).maybeSingle()).data;
    ok(`${nm}: conta ativada (cliente, idioma ${l})`, perfil?.tipo === 'cliente' && perfil?.idioma === l, JSON.stringify(perfil));
    // o mesmo link de novo: nao vale
    await page.goto(pedidos[l].links[0], { waitUntil: 'networkidle' });
    await page.getByTestId('retomar-invalido').waitFor({ timeout: 15000 });
    ok(`${nm}: link usado nao vale mais`, (await page.innerText('body')).includes(T('pedidoSemConta.retomarInvalido')));
    ok(`${nm}: sem erro de JS`, !erros.length, erros.join(' | '));
    await ctx.close();
  }

  // 3) cancelar pelo link: pergunta, apaga pedido + fotos + conta nao ativada; e-mail pode recomecar
  {
    const l = 'pt-PT'; const T = msgWeb(l); const nm = 'cancelar pt-PT 390';
    const ctx = await contexto(390);
    await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
    const page = await ctx.newPage();
    await page.goto(pedidos[l].links[1], { waitUntil: 'networkidle' });
    await page.getByTestId('retomar-pergunta-cancelar').waitFor({ timeout: 15000 });
    await checar(page, nm);
    ok(`${nm}: pergunta antes de cancelar (abrir o link nao apaga)`, !!(await admin.from('pedidos_pendentes').select('id').eq('id', pedidos[l].id).maybeSingle()).data);
    await page.screenshot({ path: `${OUT}/lembrete-${l}-cancelar.png`, fullPage: true });
    await page.getByTestId('retomar-cancelar-sim').click();
    await page.getByTestId('retomar-cancelado').waitFor({ timeout: 15000 });
    ok(`${nm}: mensagem de cancelado no idioma`, (await page.innerText('body')).includes(T('pedidoSemConta.retomarCancelado')));
    await page.screenshot({ path: `${OUT}/lembrete-${l}-cancelado.png`, fullPage: true });
    ok(`${nm}: pedido apagado`, !(await admin.from('pedidos_pendentes').select('id').eq('id', pedidos[l].id).maybeSingle()).data);
    const { data: u } = await admin.auth.admin.getUserById(pedidos[l].user);
    ok(`${nm}: conta nao ativada apagada`, !u?.user);
    const novo = await pedir(l, pedidos[l].email);
    ok(`${nm}: o mesmo e-mail pode pedir de novo (conta nova)`, !!novo.id);
    await ctx.close();
  }

  // 4) seguranca: link adulterado, link vencido (24 h), codigo antigo continua valendo depois do lembrete
  {
    const [lnk] = pedidos['et'].links;
    const r1 = await fetch(`${SITE}/api/pedido-sem-conta/retomar`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip() }, body: JSON.stringify({ id: pedidos['et'].id, t: 'f'.repeat(64), acao: 'ver' }) });
    ok('link adulterado -> 410', r1.status === 410);
    const venc = await pedir('en', `lembrete-venc-${tag}@example.test`);
    await envelhecer(venc.id, 3); await tarefa();
    const hv = emailsDe(`lembrete-venc-${tag}@example.test`).at(-1) || '';
    const lv = linksDo(hv)[0];
    await envelhecer(venc.id, 25);
    const u = new URL(lv);
    const r2 = await fetch(`${SITE}/api/pedido-sem-conta/retomar`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip() }, body: JSON.stringify({ id: u.searchParams.get('retomar'), t: u.searchParams.get('t'), acao: 'confirmar' }) });
    ok('link depois de 24 h -> 410 e tudo apagado', r2.status === 410 && !(await admin.from('pedidos_pendentes').select('id').eq('id', venc.id).maybeSingle()).data);
    const cod = await pedir('ru', `lembrete-cod-${tag}@example.test`);
    await envelhecer(cod.id, 3); await tarefa();
    const r3 = await fetch(`${SITE}/api/pedido-sem-conta/confirmar`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip() }, body: JSON.stringify({ id: cod.id, codigo: cod.codigo }) });
    ok('codigo antigo continua valendo depois do lembrete', r3.status === 200, String(r3.status));
    // conta existente ("nao lembro a senha"): lembrete tambem funciona e entra na mesma conta
    const emailExist = `lembrete-exist-${tag}@example.test`;
    const { data: ue } = await admin.auth.admin.createUser({ email: emailExist, password: senha, email_confirm: true });
    contas.add(ue.user.id);
    await admin.from('profiles').insert({ id: ue.user.id, tipo: 'cliente', nome: 'Exist', email: emailExist, idioma: 'et' });
    const form = new FormData();
    form.append('dados', JSON.stringify({ origem: 'site', modo: 'codigo', idioma: 'et', nome: 'Exist', email: emailExist, aceitouTermos: true, tipo: 'pneu', descricao: 'x', urgencia: 'media', endereco: 'Tallinn', latitude: 59.43, longitude: 24.75, pais: 'EE', veiculo: { tipo: 'cars', marca: 'Toyota', modelo: 'Corolla', ano: '2018', placa: null } }));
    const de = await (await fetch(`${SITE}/api/pedido-sem-conta`, { method: 'POST', body: form, headers: { 'x-real-ip': ip() } })).json();
    await envelhecer(de.pendenteId, 3); const t4 = Date.now(); await tarefa();
    const le = linksDo(emailsDe(emailExist, t4).at(-1) || '')[0];
    const ue2 = new URL(le);
    const r4 = await fetch(`${SITE}/api/pedido-sem-conta/retomar`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip() }, body: JSON.stringify({ id: ue2.searchParams.get('retomar'), t: ue2.searchParams.get('t'), acao: 'confirmar' }) });
    const d4 = await r4.json();
    const se = (await admin.from('solicitacoes').select('id, cliente_id').eq('id', d4.solicitacaoId || '00000000-0000-0000-0000-000000000000').maybeSingle()).data;
    ok('conta existente: link do lembrete cria o pedido na mesma conta', se?.cliente_id === ue.user.id, JSON.stringify(d4));
    // auditoria 07/11: conta que ja existia nao entra pelo link (como no fluxo do codigo)
    ok('conta existente: link nao faz login (sem tokenHash)', r4.status === 200 && d4.tokenHash === null, JSON.stringify(d4));
    // auditoria 07/11: e-mail digitado errado e corrigido depois do lembrete -> o link
    // que foi para o endereco errado deixa de valer; o lembrete vai de novo para o certo
    const errado = `lembrete-errado-${tag}@example.test`, certo = `lembrete-certo-${tag}@example.test`;
    const pe = await pedir('en', errado);
    await envelhecer(pe.id, 3); const t5 = Date.now(); await tarefa();
    const lErrado = new URL(linksDo(emailsDe(errado, t5).at(-1) || '')[0]);
    await admin.from('pedidos_pendentes').update({ ultimo_envio_em: new Date(Date.now() - 60e3).toISOString() }).eq('id', pe.id);
    const rc = await fetch(`${SITE}/api/pedido-sem-conta/reenviar`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip() }, body: JSON.stringify({ id: pe.id, email: certo }) });
    ok('corrigir o e-mail depois do lembrete', rc.status === 200, String(rc.status));
    const rv = await fetch(`${SITE}/api/pedido-sem-conta/retomar`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip() }, body: JSON.stringify({ id: lErrado.searchParams.get('retomar'), t: lErrado.searchParams.get('t'), acao: 'ver' }) });
    const rx = await fetch(`${SITE}/api/pedido-sem-conta/retomar`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip() }, body: JSON.stringify({ id: lErrado.searchParams.get('retomar'), t: lErrado.searchParams.get('t'), acao: 'confirmar' }) });
    ok('link do e-mail errado nao abre nem confirma (410)', rv.status === 410 && rx.status === 410, `${rv.status} ${rx.status}`);
    const t6 = Date.now(); await tarefa();
    const hCerto = emailsDe(certo, t6).at(-1) || '';
    ok('lembrete vai de novo, agora para o e-mail certo', linksDo(hCerto).length === 2);
    const lCerto = new URL(linksDo(hCerto)[0]);
    const r6 = await fetch(`${SITE}/api/pedido-sem-conta/retomar`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip() }, body: JSON.stringify({ id: lCerto.searchParams.get('retomar'), t: lCerto.searchParams.get('t'), acao: 'confirmar' }) });
    const d6 = await r6.json();
    ok('link do e-mail certo confirma e entra (conta nova)', r6.status === 200 && !!d6.tokenHash && !!d6.solicitacaoId, JSON.stringify(d6));
  }
  const f = (await admin.from('funil_contagem').select('etapa, total').eq('funil', 'pedido_lembrete')).data || [];
  ok('funil do lembrete conta enviado/confirmado/cancelado', ['enviado', 'confirmado', 'cancelado'].every((e) => f.some((x) => x.etapa === e)), JSON.stringify(f));
} catch (e) {
  falhas++;
  console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  for (const id of contas) {
    const { data: sols } = await admin.from('solicitacoes').select('id').eq('cliente_id', id);
    for (const s of sols || []) { await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', s.id); await admin.from('solicitacao_fotos').delete().eq('solicitacao_id', s.id); }
    await admin.from('solicitacoes').delete().eq('cliente_id', id);
    await admin.from('veiculos').delete().eq('profile_id', id);
    await admin.from('pedidos_pendentes').delete().eq('user_id', id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  // pedidos novos feitos no teste (o "pedir de novo")
  const { data: sobras } = await admin.from('pedidos_pendentes').select('id, user_id').ilike('email', `%${tag}@example.test`);
  for (const p of sobras || []) { await admin.from('pedidos_pendentes').delete().eq('id', p.id); await admin.auth.admin.deleteUser(p.user_id).catch(() => {}); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
