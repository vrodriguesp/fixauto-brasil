// Oficina aprovada pelo admin (dono 20/11): ao ativar uma oficina que estava inativa, ela recebe
// UM e-mail no idioma dela com: como entrar (login), onde ficam os pedidos e o link do guia.
//  - inativa -> ativa: 1 e-mail (ET: guia PDF et; RU: guia PDF ru; EN: pagina de ajuda)
//  - ja ativa e "ativada" de novo: nenhum e-mail
//  - desativar: nenhum e-mail
//  - o botao "ver pedidos" usa o link neutro /v/... e ele leva a caixa de pedidos (nao a home)
//  - nao-admin nao ativa ninguem
//   SITE=http://localhost:3105 node oficina-aprovada-email.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const { createClient } = req('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const PASTA = env.EMAIL_PASTA_TESTE;
if (!PASTA) throw new Error('EMAIL_PASTA_TESTE nao configurado: o teste nao pode mandar e-mail de verdade');
const SITE = process.env.SITE || 'http://localhost:3100';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 240) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const ofs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emailsPara = (email) => (fs.existsSync(PASTA) ? fs.readdirSync(PASTA) : []).filter((f) => f.includes(email)).map((f) => fs.readFileSync(path.join(PASTA, f), 'utf8'));

const conta = async (tipo, idioma) => {
  const email = `ofaprov-${tipo}${contas.length}-${tag}@example.test`; const senha = `Ofa${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo} ${idioma}`, email, idioma });
  return { id: data.user.id, email, senha };
};
const oficina = async (dono, ativa) => {
  const { data: o } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `OFAPROV ${tag} <b>`, endereco: 'Narva mnt 5', cidade: 'Tallinn', estado: 'Harju', cep: '10117', pais: 'EE', latitude: 59.43, longitude: 24.76, ativa, raio_atendimento_km: 20, especialidades: ['funilaria'] }).select('id').single();
  ofs.push(o.id); return o.id;
};
const token = async (c) => { const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data } = await a.auth.signInWithPassword({ email: c.email, password: c.senha }); return data.session.access_token; };
const patch = (tk, body) => fetch(`${SITE}/api/admin/usuarios`, { method: 'PATCH', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

try {
  const adm = await conta('admin', 'pt');
  const tkAdm = await token(adm);
  const casos = [['et', 'perfil-oficina-et.pdf', 'Teie töökoda on BipFixis kinnitatud', '/ee/et/login'], ['ru', 'perfil-oficina-ru.pdf', 'Ваш автосервис одобрен в BipFix', '/ee/ru/login'], ['en', '/help/repair-shops', 'Your repair shop is approved on BipFix', '/en/login']];
  for (const [idioma, guia, assunto, login] of casos) {
    const of = await conta('oficina', idioma);
    const oid = await oficina(of, false);
    await sb.from('profiles').update({ ativo: false }).eq('id', of.id);
    const r = await patch(tkAdm, { id: of.id, ativo: true });
    ok(`${idioma}: admin ativa a oficina`, r.status === 200, r.status);
    await sleep(1500);
    const { data: o } = await sb.from('oficinas').select('ativa').eq('id', oid).single();
    ok(`${idioma}: oficina fica ativa`, o.ativa === true);
    const em = emailsPara(of.email);
    ok(`${idioma}: chega exatamente 1 e-mail`, em.length === 1, em.length);
    const h = em[0] || '';
    ok(`${idioma}: assunto no idioma dela`, h.includes(assunto), h.slice(0, 200));
    ok(`${idioma}: tem o link de login`, h.includes(login), (h.match(/href="[^"]*"/g) || []).join(' '));
    ok(`${idioma}: tem o link do guia`, h.includes(guia));
    ok(`${idioma}: nome da oficina escapado`, h.includes('&lt;b&gt;') && !h.includes(`${tag} <b>`));
    const neutro = (h.match(/href="([^"]*\/v\/[^"]*)"/) || [])[1];
    ok(`${idioma}: botao usa link neutro sem slug em portugues`, !!neutro && !/oficina|pedidos/.test(neutro), neutro);
    if (neutro) {
      const rv = await fetch(neutro.replace(/^https?:\/\/[^/]+/, SITE), { redirect: 'manual' });
      const destino = rv.headers.get('location') || '';
      ok(`${idioma}: link neutro leva a caixa de pedidos`, rv.status === 302 && /\/oficina\/pedidos$/.test(new URL(destino, SITE).pathname), destino);
    }
    // ativar de novo (ja ativa): nada
    await patch(tkAdm, { id: of.id, ativo: true }); await sleep(1000);
    ok(`${idioma}: reativar oficina ja ativa nao manda outro e-mail`, emailsPara(of.email).length === 1);
    // desativar: nada
    await patch(tkAdm, { id: of.id, ativo: false }); await sleep(1000);
    ok(`${idioma}: desativar nao manda e-mail`, emailsPara(of.email).length === 1);
  }
  // nao-admin nao ativa
  const cli = await conta('cliente', 'et'); const of2 = await conta('oficina', 'et'); const oid2 = await oficina(of2, false);
  const r2 = await patch(await token(cli), { id: of2.id, ativo: true });
  const { data: o2 } = await sb.from('oficinas').select('ativa').eq('id', oid2).single();
  ok('cliente nao ativa oficina (nem manda e-mail)', (r2.status === 401 || r2.status === 403) && o2.ativa === false && emailsPara(of2.email).length === 0, r2.status);
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 700)); }
finally {
  for (const oid of ofs) await sb.from('oficinas').delete().eq('id', oid);
  for (const id of contas) { await sb.from('admin_auditoria').delete().eq('admin_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  for (const f of (fs.existsSync(PASTA) ? fs.readdirSync(PASTA) : []).filter((f) => f.includes(tag))) fs.unlinkSync(path.join(PASTA, f));
  console.log(`\n${falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S)`}`);
  process.exit(falhas ? 1 : 0);
}
