// E2E do cadastro com confirmacao em PRODUCAO (limpa tudo no fim).
// E-mail: delivered+x@resend.dev (endereco de teste do Resend - entrega
// simulada, sem caixa real). node e2e-cadastro.mjs <.env.local>
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const SITE = 'https://bipfix.com';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}${extra ? ' - ' + extra : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const senha = crypto.randomBytes(12).toString('base64url') + 'A1';
const contas = [];
const post = (p, b) => fetch(SITE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

try {
  // 1) validacoes
  const semDecl = await post('/api/cadastro', { email: `delivered+v${tag}@resend.dev`, senha, nome: 'TESTE AUTOMATICO', tipo: 'oficina', idioma: 'et', aceitouTermos: true, empresa: { nome_fantasia: 'x', cnpj: '1', especialidades: ['colisao'] } });
  ok('sem declaracao -> 400 DECLARACAO_OBRIGATORIA', semDecl.status === 400 && (await semDecl.json()).codigo === 'DECLARACAO_OBRIGATORIA');
  const curta = await post('/api/cadastro', { email: `delivered+c${tag}@resend.dev`, senha: '123', nome: 'x', tipo: 'cliente', aceitouTermos: true });
  ok('senha curta -> SENHA_CURTA', (await curta.json()).codigo === 'SENHA_CURTA');
  const semRegistro = await post('/api/cadastro', { email: `delivered+r${tag}@resend.dev`, senha, nome: 'x', tipo: 'loja_pecas', aceitouTermos: true, declaracaoResponsavel: true, empresa: { nome_fantasia: 'x' } });
  ok('loja sem registro -> 400', semRegistro.status === 400);

  // 2) cadastro de oficina (estoniano)
  const email = `delivered+ofi${tag}@resend.dev`;
  const r = await post('/api/cadastro', {
    email, senha, nome: 'TESTE AUTOMATICO', telefone: '', tipo: 'oficina', idioma: 'et', aceitouTermos: true, declaracaoResponsavel: true,
    empresa: { nome_fantasia: 'TESTE AUTOMATICO OU', cnpj: '12345678', endereco: 'Test 1', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: 59.43, longitude: 24.75, especialidades: ['colisao', 'mecanica'] },
  });
  ok('cadastro oficina -> 200', r.status === 200, String(r.status));
  const { data: perfil } = await admin.from('profiles').select('id, tipo, idioma, termos_versao, responsavel_declarado_em').eq('email', email).maybeSingle();
  ok('perfil criado', !!perfil);
  if (perfil) contas.push(perfil.id);
  ok('idioma et, termos 2026-09-30, declaracao gravada', perfil?.idioma === 'et' && perfil?.termos_versao === '2026-09-30' && !!perfil?.responsavel_declarado_em);
  const { data: u } = await admin.auth.admin.getUserById(perfil.id);
  ok('e-mail ainda nao confirmado', !u.user.email_confirmed_at);
  const { data: ofi } = await admin.from('oficinas').select('id, ativa, cnpj, pais').eq('profile_id', perfil.id).single();
  ok('oficina nasce inativa, com registro', ofi.ativa === false && ofi.cnpj === '12345678' && ofi.pais === 'EE');

  // 3) login antes de confirmar
  const l1 = await anon().auth.signInWithPassword({ email, password: senha });
  ok('login bloqueado antes de confirmar', l1.error?.code === 'email_not_confirmed', l1.error?.code);

  // 4) cadastro repetido: mesma resposta
  const rep = await post('/api/cadastro', { email, senha, nome: 'x', tipo: 'cliente', aceitouTermos: true });
  ok('cadastro repetido -> 200 (nao revela)', rep.status === 200);
  ok('reenviar -> 200', (await post('/api/cadastro/reenviar', { email, idioma: 'et' })).status === 200);

  // 5) link de confirmacao aberto no celular (mesmo tipo de token do e-mail)
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  await page.goto(`${SITE}/ee/et/confirmar-email?token_hash=${encodeURIComponent(link.properties.hashed_token)}`);
  await page.waitForURL(/\/oficina\/dashboard/, { timeout: 20000 }).catch(() => {});
  ok('link abre o painel da oficina', /\/et\/oficina\/dashboard/.test(page.url()), page.url());
  await page.waitForTimeout(2500);
  const texto = await page.innerText('body');
  ok('aviso "em analise" em estoniano', texto.includes('ülevaatamisel'));
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('painel sem transbordo no celular', sw <= 0, String(sw));
  await page.screenshot({ path: 'e2e-painel-analise.png' });
  await browser.close();
  const { data: u2 } = await admin.auth.admin.getUserById(perfil.id);
  ok('e-mail confirmado', !!u2.user.email_confirmed_at);

  // 6) dono logado tenta se ativar sozinho
  const c = anon();
  const l2 = await c.auth.signInWithPassword({ email, password: senha });
  ok('login depois de confirmar', !l2.error, l2.error?.message);
  await c.from('oficinas').update({ ativa: true }).eq('id', ofi.id);
  const { data: ofi2 } = await admin.from('oficinas').select('ativa').eq('id', ofi.id).single();
  ok('dono NAO consegue se ativar', ofi2.ativa === false);

  // 7) cadastro de motorista em russo
  const emailC = `delivered+cli${tag}@resend.dev`;
  const rc = await post('/api/cadastro', { email: emailC, senha, nome: 'TESTE AUTOMATICO', tipo: 'cliente', idioma: 'ru', aceitouTermos: true });
  const { data: pc } = await admin.from('profiles').select('id, idioma, responsavel_declarado_em').eq('email', emailC).maybeSingle();
  if (pc) contas.push(pc.id);
  ok('motorista ru criado, sem declaracao de empresa', rc.status === 200 && pc?.idioma === 'ru' && !pc?.responsavel_declarado_em);
} finally {
  for (const id of contas) {
    await admin.from('oficinas').delete().eq('profile_id', id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`limpeza ok (${contas.length} contas)`);
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
