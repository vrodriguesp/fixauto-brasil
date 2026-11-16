// REGRESSAO LOCAL do lote "acesso direto das oficinas pelo e-mail + lembrete" (17/11): o que NAO pode mudar.
// Plano: Documentos/Analises/Acesso_oficinas_2026-11-17/Plano_testes.md (ids R-*).
//   R-A link de acesso do CLIENTE (080): e-mail -> /r/<n>?k= -> ver-pedido -> entra -> /cliente/orcamentos
//   R-B /r/<n>?o=<idioma> sem token, ?p=1 e sem parametro: iguais a hoje
//   R-C login com senha pela tela (390) volta a pagina pedida; R-D login por codigo (API)
//   R-E "nao tenho interesse" no painel (390) grava e desfaz; R-F destinatarios do pedido novo iguais
//   R-G rotas do admin recusam quem nao e admin; R-H menu publico na home continua; login padrao sem caixa
//   R-I paginas do admin (pedido e lista) continuam abrindo com os blocos de hoje
// Cria contas @example.test (TESTE-ACESSO ...) e apaga tudo no fim.
//   node acesso-oficinas-regressao.mjs [<.env.local>]
import crypto from 'node:crypto';
import { lerEnv, ambiente, abrirNavegadores, contador, tradutor, SITE, TOKEN_RE, semRolagemLateral, vigiar, entrarPelaTela, PRINTS, sleep, ENV_PADRAO, comLinksMotoristaHtml } from './acesso-oficinas-lib.mjs';

const env = lerEnv(process.argv[2] || ENV_PADRAO);
const A = ambiente(env);
const { ok, fim, tentar } = contador();
const T = tradutor('et');
const erros = [];
const nav = await abrirNavegadores(false);

try {
  // ---------- dados ----------
  const cli = await A.conta('cliente', 'cliente', { idioma: 'et' });
  const adm = await A.conta('admin', 'admin', { idioma: 'pt' });
  const P = await A.pedido(cli, { tipo: 'mecanica', descricao: 'regressao' });
  const d1 = await A.conta('oficina', 'dono1'); const W1 = await A.oficina(d1, 'W1 orca', { km: 1, esp: ['mecanica'] });
  const d2 = await A.conta('oficina', 'dono2'); const W2 = await A.oficina(d2, 'W2 painel', { km: 2, esp: ['mecanica'] });
  // pedido 2 (funilaria) para a previa de destinatarios
  const P2 = await A.pedido(cli, { tipo: 'funilaria', descricao: 'destinatarios' });
  const d3 = await A.conta('oficina', 'dono3'); const W3 = await A.oficina(d3, 'W3 no raio', { km: 3, esp: ['funilaria'] });
  const d4 = await A.conta('oficina', 'dono4'); const W4 = await A.oficina(d4, 'W4 longe', { km: 60, esp: ['funilaria'] });
  const d5 = await A.conta('oficina', 'dono5'); const W5 = await A.oficina(d5, 'W5 inativa', { km: 3, esp: ['funilaria'], ativa: false });
  const d6 = await A.conta('oficina', 'dono6'); const W6 = await A.oficina(d6, 'W6 outro tipo', { km: 3, esp: ['eletrica'] });
  const d7 = await A.conta('oficina', 'dono7'); const W7 = await A.oficina(d7, 'W7 dispensou', { km: 3, esp: ['funilaria'] });
  const d8 = await A.conta('oficina', 'dono8'); const W8 = await A.oficina(d8, 'W8 orcou', { km: 3, esp: ['funilaria'] });
  await A.admin.from('pedido_dispensas').insert({ solicitacao_id: P2.id, oficina_id: W7.id, motivo: 'longe' });
  await A.orcamento(P2, W8);

  // ---------- R-A: link de acesso do cliente (080) ----------
  await tentar('R-A', async () => {
    const sW1 = await A.sessao(d1);
    const orcId = await A.orcamento(P, W1);
    const t0 = Date.now();
    const n = await A.api('POST', '/api/notificar-orcamento', { orcamentoId: orcId }, sW1.token);
    ok('R-A1 notificar-orcamento -> 200', n.status === 200, JSON.stringify(n.d));
    const mail = await A.esperarEmail(cli.email, t0, (e) => /\/r\/\d+\?k=/.test(e.html));
    const link = mail && A.linksDe(mail.html).find((l) => /\?k=/.test(l));
    ok('R-A2 e-mail do cliente com /r/<n>?k=<token>&l=et (sem ?o=)', !!link && link.includes(`/r/${P.numero}?k=`) && /[&?]l=et/.test(link) && !/[?&]o=/.test(link), link);
    const tok = link && new URL(link).searchParams.get('k');
    ok('R-A3 token de 43 chars', TOKEN_RE.test(tok || ''), tok);
    const l = tok && await A.linha(tok);
    ok('R-A4 links_acesso: user = cliente, pedido, nao usado, 7 dias', !!l && l.user_id === cli.id && l.solicitacao_id === P.id && !l.usado_em && Math.round((new Date(l.expira_em) - Date.now()) / 86400e3) === 7, JSON.stringify(l));
    const r = await A.get302(`/r/${P.numero}?k=${tok}`);
    ok('R-A5 /r/<n>?k= -> 302 /ee/et/vaata-paringut?k=', r.status === 302 && r.location.includes(`/ee/et/vaata-paringut?k=${tok}`), r.location);
    const ver = await A.linkAcesso({ k: tok, acao: 'ver' });
    ok('R-A6 "ver" devolve nome/numero sem gastar (e nunca em modo oficina)', ver.status === 200 && ver.d.nome === cli.nome && String(ver.d.numero) === String(P.numero) && ver.d.finalidade !== 'oficina' && !(await A.linha(tok)).usado_em, JSON.stringify(ver.d));
    const ctx = await nav.contexto('chromium', 390, A.ip);
    const page = await ctx.newPage(); vigiar(page, erros, 'R-A');
    await page.goto(`${SITE}/r/${P.numero}?k=${tok}`, { waitUntil: 'networkidle' });
    await page.getByTestId('ver-pedido-ola').waitFor();
    ok('R-A7 pagina do cliente: saudacao e numero, token fora da barra, nao gastou', (await page.innerText('body')).includes(T('verPedido.titulo', { nome: cli.nome })) && !page.url().includes('k=') && !(await A.linha(tok)).usado_em, page.url());
    ok('R-A8 390 px sem rolagem lateral', await semRolagemLateral(page));
    await page.getByTestId('ver-pedido-entrar').click();
    await page.waitForURL(/cliente\/orcamentos\//, { timeout: 30000 }).catch(() => {});
    ok('R-A9 toque entra e abre /cliente/orcamentos/<id> (conta com senha, sem "crie a senha")', page.url().includes(`/cliente/orcamentos/${P.id}`), page.url());
    // ja logado como o dono: o mesmo link (ja gasto) vai direto ao pedido, sem tela intermediaria
    await page.goto(`${SITE}/r/${P.numero}?k=${tok}`, { waitUntil: 'networkidle' });
    await page.waitForURL(/cliente\/orcamentos\//, { timeout: 20000 }).catch(() => {});
    ok('R-A9b ja logado: o link vai direto a /cliente/orcamentos/<id>', page.url().includes(`/cliente/orcamentos/${P.id}`) && (await page.getByTestId('ver-pedido-ola').count()) === 0, page.url());
    ok('R-A10 token gasto', !!(await A.linha(tok))?.usado_em);
    ok('R-A11 "entrar" de novo -> 410', (await A.linkAcesso({ k: tok, acao: 'entrar' })).status === 410);
    await ctx.close();
    const ctx2 = await nav.contexto('chromium', 390, A.ip);
    const p2 = await ctx2.newPage(); vigiar(p2, erros, 'R-A');
    await p2.goto(`${SITE}/r/${P.numero}?k=${crypto.randomBytes(32).toString('base64url')}`, { waitUntil: 'networkidle' });
    await p2.getByTestId('ver-pedido-invalido').waitFor();
    await p2.getByTestId('ver-pedido-codigo').click();
    await p2.getByTestId('login-codigo-email').waitFor();
    ok('R-A12 token invalido: tela amigavel -> login ja em "receber codigo"', p2.url().includes('/ee/et/login') && p2.url().includes('codigo=1'), p2.url());
    await ctx2.close();
    // limite por IP da rota (30/h): a 31a chamada do mesmo IP recebe 429 (contrato item 4: "mantido")
    const codigos = [];
    const ipLimite = `10.78.${crypto.randomInt(1, 250)}.${crypto.randomInt(1, 250)}`; // um IP novo por rodada (janela de 1 h no servidor)
    for (let i = 0; i < 31; i++) {
      const r = await fetch(`${SITE}/api/link-acesso`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ipLimite }, body: JSON.stringify({ k: 'B'.repeat(43), acao: 'ver' }) });
      codigos.push(r.status);
    }
    ok('R-A13 /api/link-acesso: 30 por hora por IP, a 31a -> 429', codigos.slice(0, 30).every((c) => c === 410) && codigos[30] === 429, codigos.join(','));
  });

  // ---------- R-B: /r/<n> sem token ----------
  await tentar('R-B', async () => {
    const r1 = await A.get302(`/r/${P.numero}?o=et`);
    ok('R-B1 /r/<n>?o=et -> 302 /ee/et/oficina/enviar-orcamento/<id>', r1.status === 302 && r1.location.includes(`/ee/et/oficina/enviar-orcamento/${P.id}`), r1.location);
    const r1b = await A.get302(r1.location.replace(/^https?:\/\/[^/]+/, ''));
    ok('R-B2 sem sessao: middleware manda ao login com voltar=.../oficina/enviar-orcamento/...', [302, 307].includes(r1b.status) && /\/ee\/et\/login\?voltar=/.test(r1b.location) && decodeURIComponent(r1b.location).includes(`/oficina/enviar-orcamento/${P.id}`), `${r1b.status} ${r1b.location}`);
    const r2 = await A.get302(`/r/${P.numero}?o=ru&p=1`);
    ok('R-B3 /r/<n>?o=ru&p=1 -> /ee/ru/oficina/pedidos/<id> (novas datas)', r2.status === 302 && r2.location.includes(`/ee/ru/oficina/pedidos/${P.id}`), r2.location);
    const r3 = await A.get302(`/r/${P.numero}`);
    ok('R-B4 /r/<n> sem parametro -> /ee/et/cliente/orcamentos/<id>', r3.status === 302 && r3.location.includes(`/ee/et/cliente/orcamentos/${P.id}`), r3.location);
    const r4 = await A.get302('/r/0');
    ok('R-B5 numero inexistente -> site', r4.status === 302 && !/orcamento|pedido/.test(r4.location), r4.location);
    // os outros ramos do cliente (080) continuam: ?k=&c=1 (chat) e ?l=<idioma> (outro motorista do acidente)
    const kf = 'C'.repeat(43);
    const r5 = await A.get302(`/r/${P.numero}?k=${kf}&c=1`);
    ok('R-B6 /r/<n>?k=&c=1 -> ver-pedido com k e c=1 (chat com a oficina)', r5.status === 302 && r5.location.includes(`/ee/et/vaata-paringut?k=${kf}`) && /[&?]c=1/.test(r5.location) && !/[&?]o=1/.test(r5.location), r5.location);
    const r6 = await A.get302(`/r/${P.numero}?l=ru`);
    ok('R-B7 /r/<n>?l=ru -> /ee/ru/cliente/orcamentos/<id>', r6.status === 302 && r6.location.includes(`/ee/ru/cliente/orcamentos/${P.id}`), r6.location);
  });

  // ---------- R-C: login com senha pela tela volta a pagina pedida ----------
  const ctxW2 = await nav.contexto('chromium', 390, A.ip);
  const pW2 = await ctxW2.newPage(); vigiar(pW2, erros, 'R-C');
  await tentar('R-C', async () => {
    await pW2.goto(`${SITE}/ee/et/login?voltar=${encodeURIComponent(`/ee/et/oficina/enviar-orcamento/${P.id}`)}`, { waitUntil: 'networkidle' });
    ok('R-C1 tela de login: e-mail, senha, "receber codigo" presentes', await pW2.locator('#c0862-2').isVisible() && await pW2.locator('#login-senha').isVisible() && await pW2.getByTestId('login-receber-codigo').isVisible());
    ok('R-C2 390 px sem rolagem lateral', await semRolagemLateral(pW2));
    await pW2.screenshot({ path: `${PRINTS}/reg-login-et-390.png`, fullPage: true });
    await entrarPelaTela(pW2, '/ee/et', d2, `/ee/et/oficina/enviar-orcamento/${P.id}`);
    await pW2.waitForURL(/oficina\/orcamento\//, { timeout: 30000 }).catch(() => {});
    ok('R-C3 entrou e caiu em /oficina/orcamento/<id> (enviar-orcamento redireciona)', pW2.url().includes(`/ee/et/oficina/orcamento/${P.id}`), pW2.url());
  });

  // ---------- R-D: login por codigo (API) ----------
  await tentar('R-D', async () => {
    const t0 = Date.now();
    const r = await A.api('POST', '/api/conta/codigo-login', { email: d1.email, idioma: 'et' });
    ok('R-D1 pedir codigo -> 200 com id', r.status === 200 && !!r.d.id, JSON.stringify(r.d));
    const mail = await A.esperarEmail(d1.email, t0);
    const cod = A.codigoDe(mail);
    ok('R-D2 e-mail com codigo de 6 digitos em estoniano', !!cod && /kood/i.test(mail?.texto || ''), mail?.assunto);
    const c = await A.api('POST', '/api/conta/codigo-login/confirmar', { id: r.d.id, codigo: cod || '000000' });
    ok('R-D3 confirmar -> tokenHash', c.status === 200 && !!c.d.tokenHash, JSON.stringify(c.d));
    const cl = A.anon();
    const { data, error } = await cl.auth.verifyOtp({ token_hash: c.d.tokenHash, type: 'email' });
    ok('R-D4 verifyOtp cria sessao do dono da oficina', !error && data?.user?.id === d1.id, error?.message);
  });

  // ---------- R-E: "nao tenho interesse" no painel ----------
  await tentar('R-E', async () => {
    await pW2.goto(`${SITE}/ee/et/oficina/pedidos`, { waitUntil: 'networkidle' });
    const cartao = pW2.getByTestId('pedido-cartao').filter({ hasText: `regressao ${A.tag}` });
    await cartao.first().waitFor();
    await cartao.getByTestId('nao-tenho-interesse').click();
    await cartao.getByTestId('motivo-nao_faz').check();
    await cartao.getByTestId('dispensa-comentario').fill('TESTE-ACESSO painel');
    await cartao.getByTestId('confirmar-dispensa').click();
    let d = null; for (let i = 0; i < 20 && !d; i++) { d = (await A.admin.from('pedido_dispensas').select('*').eq('solicitacao_id', P.id).eq('oficina_id', W2.id).maybeSingle()).data; if (!d) await sleep(300); }
    // (coluna `origem` da 089: o painel nao a envia e fica no default 'painel'; antes da 089 a coluna nao existe)
    ok('R-E1 painel grava pedido_dispensas (nao_faz, comentario, autor = dono; origem painel)', !!d && d.motivo === 'nao_faz' && d.comentario === 'TESTE-ACESSO painel' && d.autor_id === d2.id && (!('origem' in d) || d.origem === 'painel'), JSON.stringify(d));
    ok('R-E2 pedido some de "para responder"', (await cartao.count()) === 0);
    await pW2.goto(`${SITE}/ee/et/oficina/pedidos?aba=encerrados`, { waitUntil: 'networkidle' });
    const enc = pW2.getByTestId('pedido-cartao').filter({ hasText: `regressao ${A.tag}` });
    await enc.first().waitFor();
    ok('R-E3 em "encerrados" com o motivo', (await enc.innerText()).includes(T('oficinaPedidos.voceDispensou', { motivo: T('oficinaPedidos.motivo_nao_faz') })));
    await pW2.screenshot({ path: `${PRINTS}/reg-dispensa-painel-390.png`, fullPage: true });
    await enc.getByTestId('desfazer-dispensa').click();
    let sumiu = false; for (let i = 0; i < 20 && !sumiu; i++) { sumiu = !(await A.admin.from('pedido_dispensas').select('motivo').eq('solicitacao_id', P.id).eq('oficina_id', W2.id).maybeSingle()).data; if (!sumiu) await sleep(300); }
    ok('R-E4 "responder mesmo assim" apaga a dispensa', sumiu);
  });
  await ctxW2.close();

  // ---------- R-F: destinatarios do pedido novo (mesma funcao do aviso automatico) ----------
  await tentar('R-F', async () => {
    const sA = await A.sessao(adm);
    const r = await A.api('GET', `/api/admin/solicitacoes/${P2.id}/avisar`, undefined, sA.token);
    const ids = (r.d.seriam || []).map((o) => o.oficina_id);
    const ja = Object.fromEntries((r.d.jaReceberam || []).map((j) => [j.oficina_id, j.motivo]));
    ok('R-F1 previa -> 200', r.status === 200, JSON.stringify(r.d).slice(0, 300));
    ok('R-F2 recebe: so a oficina ativa, no raio, do tipo (W3)', ids.includes(W3.id) && !ids.includes(W4.id) && !ids.includes(W5.id) && !ids.includes(W6.id) && !ids.includes(W1.id) && !ids.includes(W2.id), JSON.stringify(ids));
    ok('R-F3 ja receberam: W7 (dispensa) e W8 (orcamento), fora da lista', ja[W7.id] === 'dispensa' && ja[W8.id] === 'orcamento' && !ids.includes(W7.id) && !ids.includes(W8.id), JSON.stringify(ja));
    const t0 = Date.now();
    const env1 = await A.api('POST', `/api/admin/solicitacoes/${P2.id}/avisar`, { esperados: ids }, sA.token);
    ok('R-F4 confirmar e avisar -> 200, 1 avisada', env1.status === 200 && (env1.d.avisadas ?? env1.d.inseridas ?? env1.d.enviadas ?? 1) >= 1, JSON.stringify(env1.d));
    const avisos = (await A.admin.from('notificacoes').select('profile_id, tipo').eq('dados->>solicitacao_id', P2.id).eq('tipo', 'nova_solicitacao')).data || [];
    ok('R-F5 sino nova_solicitacao so para o dono de W3', avisos.length === 1 && avisos[0].profile_id === d3.id, JSON.stringify(avisos));
    const mail = await A.esperarEmail(d3.email, t0);
    ok('R-F6 e-mail de pedido novo chega ao dono de W3 com link /r/<n>?o=et', !!mail && A.linksDe(mail.html).some((l) => l.includes(`/r/${P2.numero}?o=et`)), mail?.assunto);
  });

  // ---------- R-G: rotas do admin exigem admin ----------
  await tentar('R-G', async () => {
    const sD = await A.sessao(d1);
    // POST das rotas de envio e GET das previas (lembrar/lembretes/avisar): nem sem login nem como oficina
    const rotas = [['POST', `/api/admin/solicitacoes/${P2.id}/cobrar`], ['POST', `/api/admin/solicitacoes/${P2.id}/lembrar`], ['GET', `/api/admin/solicitacoes/${P2.id}/lembrar`], ['POST', '/api/admin/lembretes'], ['GET', '/api/admin/lembretes'], ['POST', `/api/admin/solicitacoes/${P2.id}/avisar`], ['GET', `/api/admin/solicitacoes/${P2.id}/avisar`], ['POST', `/api/admin/solicitacoes/${P2.id}/convidar`], ['GET', `/api/admin/solicitacoes/${P2.id}`]];
    for (const [metodo, rota] of rotas) {
      const corpo = metodo === 'POST' ? {} : undefined;
      const semLogin = await A.api(metodo, rota, corpo);
      const oficina = await A.api(metodo, rota, corpo, sD.token);
      ok(`R-G ${metodo} ${rota.replace(P2.id, '<id>')}: sem login e como oficina -> nunca 200`, semLogin.status !== 200 && oficina.status !== 200, `${semLogin.status}/${oficina.status}`);
    }
  });

  // ---------- R-H: menu publico e login padrao ----------
  await tentar('R-H', async () => {
    // (no cabecalho, sem o rodape: o rodape tambem tem "Töökodadele" e nao prova nada)
    const home = await (await fetch(`${SITE}/ee/et`, { headers: { 'x-real-ip': A.ip() } })).text();
    ok('R-H1 home (visitante) continua com os 3 links de motorista no cabecalho', comLinksMotoristaHtml(home, T));
    const login = await (await fetch(`${SITE}/ee/et/login`, { headers: { 'x-real-ip': A.ip() } })).text();
    ok('R-H2 login sem ?voltar: sem a caixa de oficina', !login.includes('login-oficina-aviso'));
    const ru = await (await fetch(`${SITE}/ee/ru/login`, { headers: { 'x-real-ip': A.ip() } })).text();
    ok('R-H3 login RU abre (200) com o formulario', ru.includes('login-senha') && ru.includes('login-receber-codigo'));
    const paraOficinas = await (await fetch(`${SITE}/ee/et/tookodadele`, { headers: { 'x-real-ip': A.ip() } })).text();
    ok('R-H4 pagina publica (para oficinas) continua com os links de motorista no cabecalho', comLinksMotoristaHtml(paraOficinas, T));
  });

  // ---------- R-I: paginas do admin continuam abrindo (o lote mexe nelas) ----------
  await tentar('R-I', async () => {
    const ctx = await nav.contexto('chromium', 1366, A.ip);
    const p = await ctx.newPage(); vigiar(p, erros, 'R-I');
    await entrarPelaTela(p, '/br/pt', adm, `/admin/solicitacoes/${P2.id}`);
    await p.waitForURL(/\/admin\/solicitacoes\//, { timeout: 30000 }).catch(() => {});
    await p.getByTestId('admin-dispensas').waitFor();
    const corpo = await p.innerText('body');
    ok('R-I1 /admin/solicitacoes/<id>: numero do pedido, bloco "sem interesse" com W7 (longe) e bloco de convites', corpo.includes(`Pedido ${P2.numero}`) && (await p.getByTestId('admin-dispensas').innerText()).includes(W7.nome) && (await p.getByTestId('admin-convites').count()) === 1, corpo.slice(0, 200));
    ok('R-I2 /admin/solicitacoes/<id>: tipo do pedido (triagem 085) continua visivel', (await p.getByTestId('tipo-atual').count()) === 1 && (await p.getByTestId('tipo-atual').innerText()).trim().length > 0);
    await p.screenshot({ path: `${PRINTS}/reg-admin-pedido-1366.png`, fullPage: true });
    await p.goto(`${SITE}/admin/solicitacoes`, { waitUntil: 'networkidle' });
    const linha = p.locator(`a[href="/admin/solicitacoes/${P2.id}"]`);
    await linha.first().waitFor({ timeout: 20000 }).catch(() => {});
    ok('R-I3 /admin/solicitacoes: lista abre e traz o pedido de teste', (await linha.count()) >= 1 && (await p.getByTestId('admin-vistos-dispensas').count()) >= 1, p.url());
    await ctx.close();
  });

  ok('sem erro de pagina nos navegadores', erros.length === 0, erros.join(' | '));
} catch (e) {
  ok('excecao geral', false, e?.stack || e?.message);
} finally {
  await nav.fechar();
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  ok('limpeza: nada desta rodada ficou no banco nem na pasta de e-mails', errosLimpeza.length === 0 && sobras.length === 0, [...errosLimpeza, ...sobras].join(' | '));
  process.exitCode = fim() ? 1 : 0;
}
