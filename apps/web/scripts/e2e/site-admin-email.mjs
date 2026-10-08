// Reteste (producao): admin troca o email de acesso de uma oficina.
//  - pela tela /admin/oficinas/<id>: pede motivo e confirmacao; troca; fica na auditoria
//  - o login antigo para de funcionar, o novo entra com a mesma senha
//  - email ja usado por outra conta e recusado; nao-admin nao consegue
//   node site-admin-email.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const SITE = 'https://bipfix.com';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 240) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const ofs = [];
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const conta = async (tipo) => {
  const email = `admemail-${tipo}${contas.length}-${tag}@example.test`; const senha = `Adm${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: tipo !== 'oficina' });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo}`, email, idioma: 'pt' });
  return { id: data.user.id, email, senha };
};
const login = async (email, senha) => { const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { error } = await a.auth.signInWithPassword({ email, password: senha }); return !error; };

try {
  const adm = await conta('admin'); const of = await conta('oficina'); const outro = await conta('cliente');
  const { data: o } = await sb.from('oficinas').insert({ profile_id: of.id, nome_fantasia: `ADMEMAIL ${tag}`, endereco: 'Narva mnt 5', cidade: 'Tallinn', estado: 'Harju', cep: '10117', pais: 'EE', latitude: 59.43, longitude: 24.76, ativa: false, raio_atendimento_km: 20 }).select('id').single();
  ofs.push(o.id);
  ok('oficina com email nao confirmado nao entra', !(await login(of.email, of.senha)));

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  const p = await ctx.newPage();
  await p.goto(`${SITE}/pt-br/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', adm.email); await p.fill('input[type=password]', adm.senha); await p.click('button[type=submit]'); await p.waitForTimeout(4000);
  await p.goto(`${SITE}/admin/oficinas/${o.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  ok('pagina da oficina mostra o email de acesso', (await p.innerText('body')).includes(of.email));

  // email ja usado por outra conta
  await p.getByRole('button', { name: 'Mudar email' }).click();
  await p.getByLabel('Novo email').fill(outro.email); await p.getByLabel('Motivo').fill('teste duplicado');
  await p.getByRole('button', { name: 'Trocar' }).click();
  ok('pede confirmacao antes de trocar', (await p.locator('[role=alertdialog]').count()) === 1);
  await p.getByRole('button', { name: 'Sim, trocar' }).click(); await p.waitForTimeout(2500);
  ok('email de outra conta e recusado', /já é usado por outra conta/.test(await p.innerText('body')));

  const novo = `admemail-novo-${tag}@example.test`;
  await p.getByLabel('Novo email').fill(novo);
  await p.getByRole('button', { name: 'Trocar' }).click();
  await p.getByRole('button', { name: 'Sim, trocar' }).click(); await p.waitForTimeout(3000);
  const corpo = await p.innerText('body');
  ok('tela confirma a troca', corpo.includes(`Email trocado para ${novo}`), corpo.slice(0, 200));
  const { data: pf } = await sb.from('profiles').select('email').eq('id', of.id).single();
  const { data: u } = await sb.auth.admin.getUserById(of.id);
  ok('perfil e login com o email novo, ja confirmado', pf.email === novo && u.user.email === novo && !!u.user.email_confirmed_at);
  ok('entra com o email novo e a mesma senha', await login(novo, of.senha));
  ok('email antigo nao entra mais', !(await login(of.email, of.senha)));
  const { data: au } = await sb.from('admin_auditoria').select('acao, antes, depois, motivo').eq('entidade_id', of.id);
  ok('troca registrada na auditoria', (au || []).some((a) => a.acao === 'trocar_email' && a.antes?.email === of.email && a.depois?.email === novo), JSON.stringify(au));
  await sb.from('admin_auditoria').delete().eq('entidade_id', of.id);

  // nao-admin nao consegue
  const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await a.auth.signInWithPassword({ email: outro.email, password: outro.senha });
  const r = await fetch(`${SITE}/api/admin/usuarios/email`, { method: 'POST', headers: { Authorization: `Bearer ${s.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: of.id, email: `x-${tag}@example.test`, motivo: 'tentativa' }) });
  ok('cliente nao troca email de ninguem', r.status === 401 || r.status === 403, r.status);
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 700)); }
finally {
  await browser.close();
  for (const oid of ofs) await sb.from('oficinas').delete().eq('id', oid);
  for (const id of contas) { await sb.from('admin_auditoria').delete().eq('admin_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
