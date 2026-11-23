// E2E LOCAL (23/11): funcionario no 1.o login. Bug visto em producao: depois de definir a senha em /definir-senha,
// o PATCH /api/funcionarios {id, primeiro_login:false} dava 403 (so o dono podia), a marca ficava true e a home
// mandava o funcionario de volta a /definir-senha. Correcao: o PROPRIO funcionario pode marcar SO
// primeiro_login=false no SEU registro; todo o resto continua so para o dono da oficina.
//   F1 dono cadastra funcionario com acesso (cargo admin) pela API
//   F2 funcionario entra pela tela (Chromium 390) -> /definir-senha -> nova senha -> PATCH 200, banco false,
//      home -> /oficina/pedidos (nao /definir-senha); 2o login -> painel
//   F3 limites: o funcionario nao muda cargo/ativo/nome nem volta a marca; outra oficina -> 403; sem login -> 401;
//      dono continua editando (200)
// So banco LOCAL + site local (SITE=http://localhost:3108 node funcionario-primeiro-login.mjs [<.env.local>]).
// Cria contas @example.test (TESTE-ACESSO ...) e apaga tudo no fim.
import { lerEnv, ambiente, abrirNavegadores, contador, SITE, vigiar, entrarPelaTela, PRINTS, ENV_PADRAO } from './acesso-oficinas-lib.mjs';

const env = lerEnv(process.argv[2] || ENV_PADRAO);
const A = ambiente(env);
const { ok, fim, tentar } = contador();
const erros = [];
const nav = await abrirNavegadores(false);
const PAINEL = /\/oficina\/pedidos(\/|\?|$)/;
const naoDefinirSenha = (u) => !/definir-senha/.test(new URL(u).pathname);
const funcDe = async (id) => (await A.admin.from('funcionarios').select('*').eq('id', id).maybeSingle()).data;
let W = null;

try {
  // ======================= F1: dados =======================
  const dono = await A.conta('oficina', 'fpl-dono', { idioma: 'et' });
  W = await A.oficina(dono, 'FPL oficina', { km: 3 });
  const dono2 = await A.conta('oficina', 'fpl-outro', { idioma: 'et' });
  await A.oficina(dono2, 'FPL outra', { km: 4 });
  const sDono = await A.sessao(dono);
  const sOutro = await A.sessao(dono2);

  const func = { email: `teste-acesso-fpl-func-${A.tag}@example.test`, senha: `Temp-${A.tag}-x9A`, nome: 'TESTE-ACESSO fpl func' };
  const novaSenha = `Nova-${A.tag}-k7Q`;
  A.criado.emails.push(func.email);
  const cad = await A.api('POST', '/api/funcionarios', { nome: func.nome, email: func.email, senha: func.senha, cargo: 'admin', oficina_id: W.id }, sDono.token);
  const fId = cad.d?.funcionario?.id;
  if (cad.d?.funcionario?.profile_id) A.criado.contas.push(cad.d.funcionario.profile_id);
  ok('F1.1 dono cadastra funcionario com acesso (cargo admin) -> 200', cad.status === 200 && !!fId, JSON.stringify(cad));
  if (!fId) throw new Error('sem funcionario');
  const f0 = await funcDe(fId);
  ok('F1.2 banco: primeiro_login=true, cargo admin, ativo', f0?.primeiro_login === true && f0?.cargo === 'admin' && f0?.ativo === true, JSON.stringify(f0));

  // ======================= F2: tela =======================
  await tentar('F2', async () => {
    const ctx = await nav.contexto('chromium', 390, A.ip);
    const p = await ctx.newPage(); vigiar(p, erros, 'F2');
    await entrarPelaTela(p, '/ee/et', func);
    await p.waitForURL(/\/definir-senha/, { timeout: 30000 }).catch(() => {});
    ok('F2.1 1.o login -> /definir-senha', /\/definir-senha/.test(p.url()), p.url());
    await p.locator('#c52c9-1').fill(novaSenha);
    await p.locator('#c52c9-2').fill(novaSenha);
    const resp = p.waitForResponse((r) => r.url().includes('/api/funcionarios') && r.request().method() === 'PATCH', { timeout: 30000 });
    await p.locator('form button[type=submit]').click();
    const r = await resp;
    ok('F2.2 PATCH /api/funcionarios {id, primeiro_login:false} da tela -> 200', r.status() === 200, `${r.status()} ${await r.text().catch(() => '')}`);
    await p.waitForURL((u) => naoDefinirSenha(u.href), { timeout: 30000 }).catch(() => {});
    ok('F2.3 depois de salvar sai de /definir-senha (painel)', naoDefinirSenha(p.url()) && /\/oficina\//.test(p.url()), p.url());
    const f1 = await funcDe(fId);
    ok('F2.4 banco: funcionarios.primeiro_login=false (cargo/ativo iguais)', f1?.primeiro_login === false && f1?.cargo === 'admin' && f1?.ativo === true, JSON.stringify(f1));
    await p.goto(`${SITE}/ee/et`, { waitUntil: 'networkidle' });
    await p.waitForURL(PAINEL, { timeout: 20000 }).catch(() => {});
    ok('F2.5 home logado -> /oficina/pedidos (nao /definir-senha)', PAINEL.test(new URL(p.url()).pathname) && naoDefinirSenha(p.url()), p.url());
    await p.screenshot({ path: `${PRINTS}/funcionario-primeiro-login-painel-390.png` });
    await ctx.close();

    // 2o login (navegador novo, senha nova) -> painel direto
    const ctx2 = await nav.contexto('chromium', 390, A.ip);
    const p2 = await ctx2.newPage(); vigiar(p2, erros, 'F2 2o login');
    await entrarPelaTela(p2, '/ee/et', { ...func, senha: novaSenha });
    await p2.waitForURL(PAINEL, { timeout: 30000 }).catch(() => {});
    ok('F2.6 2o login -> /oficina/pedidos (nao /definir-senha)', PAINEL.test(new URL(p2.url()).pathname), p2.url());
    await ctx2.close();
    const velha = await A.anon().auth.signInWithPassword({ email: func.email, password: func.senha });
    ok('F2.7 senha temporaria antiga nao entra mais', !!velha.error);
  });

  // ======================= F3: limites da excecao =======================
  await tentar('F3', async () => {
    const sFunc = await A.sessao({ email: func.email, senha: novaSenha });
    const casos = [
      ['F3.1 funcionario muda o proprio cargo {cargo:mecanico}', { id: fId, cargo: 'mecanico' }],
      ['F3.2 funcionario {primeiro_login:false, ativo:false}', { id: fId, primeiro_login: false, ativo: false }],
      ['F3.3 funcionario {primeiro_login:false, nome}', { id: fId, primeiro_login: false, nome: 'X' }],
      ['F3.4 funcionario {primeiro_login:false, resetSenha}', { id: fId, primeiro_login: false, resetSenha: true }],
      ['F3.5 funcionario volta a marca {primeiro_login:true}', { id: fId, primeiro_login: true }],
      ['F3.6 funcionario {primeiro_login:"false"} (texto)', { id: fId, primeiro_login: 'false' }],
    ];
    for (const [nome, corpo] of casos) {
      const r = await A.api('PATCH', '/api/funcionarios', corpo, sFunc.token);
      ok(`${nome} -> 403`, r.status === 403, JSON.stringify(r));
    }
    const fx = await funcDe(fId);
    const { data: pf } = await A.admin.from('profiles').select('nome').eq('id', fx.profile_id).single();
    ok('F3.7 banco intacto depois das tentativas (cargo admin, ativo, primeiro_login false, nome)', fx.cargo === 'admin' && fx.ativo === true && fx.primeiro_login === false && pf.nome === func.nome, JSON.stringify({ fx, pf }));
    const proprio = await A.api('PATCH', '/api/funcionarios', { id: fId, primeiro_login: false }, sFunc.token);
    ok('F3.8 funcionario repete {primeiro_login:false} -> 200 (idempotente)', proprio.status === 200, JSON.stringify(proprio));

    // outra oficina: dono de outra oficina tenta marcar o funcionario desta
    await A.admin.from('funcionarios').update({ primeiro_login: true }).eq('id', fId);
    const outro = await A.api('PATCH', '/api/funcionarios', { id: fId, primeiro_login: false }, sOutro.token);
    ok('F3.9 usuario de outra oficina {primeiro_login:false} no funcionario -> 403', outro.status === 403, JSON.stringify(outro));
    ok('F3.10 ... e a marca continua true', (await funcDe(fId))?.primeiro_login === true);
    const semLogin = await A.api('PATCH', '/api/funcionarios', { id: fId, primeiro_login: false });
    ok('F3.11 sem login -> 401', semLogin.status === 401, JSON.stringify(semLogin));

    // dono continua editando
    const d1 = await A.api('PATCH', '/api/funcionarios', { id: fId, primeiro_login: false, especialidade: 'TESTE-ACESSO freios' }, sDono.token);
    const fd = await funcDe(fId);
    ok('F3.12 dono edita {primeiro_login:false, especialidade} -> 200 e grava', d1.status === 200 && fd.primeiro_login === false && fd.especialidade === 'TESTE-ACESSO freios', JSON.stringify({ d1, fd }));
    const d2 = await A.api('PATCH', '/api/funcionarios', { id: fId, cargo: 'mecanico' }, sDono.token);
    ok('F3.13 dono muda cargo para mecanico -> 200 e grava', d2.status === 200 && (await funcDe(fId))?.cargo === 'mecanico', JSON.stringify(d2));
  });

  ok('sem erro de pagina no navegador', erros.length === 0, erros.join(' | '));
} catch (e) {
  ok('excecao geral', false, e?.stack || e?.message);
} finally {
  await nav.fechar();
  if (W) { const { error } = await A.admin.from('funcionarios').delete().eq('oficina_id', W.id); if (error) console.log('funcionarios: ' + error.message); }
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  ok('limpeza: nada desta rodada ficou no banco nem na pasta de e-mails', errosLimpeza.length === 0 && sobras.length === 0, [...errosLimpeza, ...sobras].join(' | '));
  process.exitCode = fim() ? 1 : 0;
}
