// Quem recebe o que (producao) - teste do dono 09/10, pontos 1 e 13:
//  A carroceria (funilaria)  B so mecanica  C so pintura  D sem especialidade
//  E carroceria em Milao (longe)
//  1 "acabei de bater" em Tallinn: avisos so para A, C e D (perto e de
//    carroceria); B e E nada
//  2 pela regra do banco: A le o pedido e orca; B NAO le pelo link direto e
//    NAO consegue mandar orcamento; E (longe) tambem nao
//  3 pedido comum de mecanica em Tallinn: B e D recebem, A nao (nao faz mecanica)
//  4 tela: B abrindo o link do acidente nao ve os dados
//   node site-atendimento.mjs <.env.local>
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
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).slice(0, 220) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const ofs = []; const sols = []; const ems = [];
const TLL = { lat: 59.4444, lon: 24.7357 };
const conta = async (tipo, idioma = 'et') => {
  const email = `atend-${tipo}${contas.length}-${tag}@example.test`; const senha = `At${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo}`, email, idioma });
  const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await a.auth.signInWithPassword({ email, password: senha });
  return { id: data.user.id, email, senha, a, token: s.session.access_token };
};
const oficina = async (nome, esp, lat, lon) => {
  const u = await conta('oficina');
  const { data, error } = await sb.from('oficinas').insert({ profile_id: u.id, nome_fantasia: `${nome} ${tag}`, endereco: 'x', cidade: 'T', estado: '-', cep: '1', pais: lat > 50 ? 'EE' : 'IT', latitude: lat, longitude: lon, ativa: true, raio_atendimento_km: 30, especialidades: esp }).select('id').single();
  if (error) throw new Error(error.message);
  ofs.push(data.id); return { ...u, oficinaId: data.id, nome };
};

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
try {
  const A = await oficina('Carroceria', ['colisao', 'funilaria', 'pintura'], TLL.lat + 0.01, TLL.lon);
  const B = await oficina('Mecanica', ['mecanica', 'eletrica'], TLL.lat - 0.01, TLL.lon);
  const C = await oficina('Pintura', ['pintura'], TLL.lat, TLL.lon + 0.02);
  const D = await oficina('Tudo', [], TLL.lat, TLL.lon - 0.02);
  const E = await oficina('Milao', ['colisao', 'funilaria'], 45.46, 9.19);
  const cli = await conta('cliente');

  // 1 acidente pela rota real (com login do cliente)
  const fd = new FormData();
  fd.append('dados', JSON.stringify({ tipoAcidente: 'outro_causou', descricao: `Teste ${tag}: porta amassada`, latitude: TLL.lat, longitude: TLL.lon, endereco: 'Tööstuse 5, Tallinn', idioma: 'et', veiculoInfo: { marca: 'Honda', modelo: 'Civic' } }));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  fd.append('fotos', new Blob([png], { type: 'image/png' }), 'dano.png');
  const r = await fetch(`${SITE}/api/emergencia`, { method: 'POST', headers: { Authorization: `Bearer ${cli.token}` }, body: fd });
  const d = await r.json();
  ok('1 acidente registrado', r.ok && d.solicitacaoId, JSON.stringify(d));
  const solId = d.solicitacaoId; sols.push(solId); ems.push(d.id);
  const { data: nots } = await sb.from('notificacoes').select('profile_id, tipo').in('profile_id', [A, B, C, D, E].map((x) => x.id));
  const recebeu = (x) => (nots || []).some((n) => n.profile_id === x.id);
  ok('1 Carroceria (perto) recebe', recebeu(A));
  ok('1 Pintura (perto, grupo carroceria) recebe', recebeu(C));
  ok('1 Sem especialidade (perto) recebe', recebeu(D));
  ok('1 Mecanica (perto) NAO recebe', !recebeu(B), JSON.stringify(nots));
  ok('1 Carroceria em Milao (longe) NAO recebe', !recebeu(E));

  // 2 regra do banco
  const ler = async (x) => (await x.a.from('solicitacoes').select('id, descricao').eq('id', solId)).data || [];
  ok('2 Carroceria le o pedido', (await ler(A)).length === 1);
  ok('2 Mecanica NAO le o pedido (link direto)', (await ler(B)).length === 0);
  ok('2 Milao NAO le o pedido', (await ler(E)).length === 0);
  const orcar = async (x) => (await x.a.from('orcamentos').insert({ solicitacao_id: solId, oficina_id: x.oficinaId, valor_total: 100, prazo_dias: 2, validade: '2030-01-01' }).select('id')).error;
  ok('2 Mecanica NAO consegue mandar orcamento', !!(await orcar(B)));
  ok('2 Milao NAO consegue mandar orcamento', !!(await orcar(E)));
  ok('2 Carroceria consegue mandar orcamento', !(await orcar(A)));

  // 3 pedido comum de mecanica
  const { data: v } = await cli.a.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Fiat', fipe_modelo: 'Uno', fipe_ano: '2019' }).select('id').single();
  const { data: s2 } = await cli.a.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: `Teste ${tag}: motor`, urgencia: 'media', latitude: TLL.lat, longitude: TLL.lon, endereco: 'Tallinn' }).select('id').single();
  sols.push(s2.id);
  await fetch(`${SITE}/api/pedido-criado`, { method: 'POST', headers: { Authorization: `Bearer ${cli.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ solicitacaoId: s2.id }) });
  const { data: n2 } = await sb.from('notificacoes').select('profile_id').eq('tipo', 'nova_solicitacao').eq('dados->>solicitacao_id', s2.id);
  const r2 = (x) => (n2 || []).some((n) => n.profile_id === x.id);
  ok('3 pedido de mecanica: Mecanica e Sem especialidade recebem', r2(B) && r2(D), JSON.stringify(n2));
  ok('3 pedido de mecanica: Carroceria e Pintura NAO recebem', !r2(A) && !r2(C));

  // 4 tela: a de mecanica abrindo o link do acidente
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  const p = await ctx.newPage();
  await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', B.email); await p.fill('input[type=password]', B.senha); await p.click('button[type=submit]'); await p.waitForTimeout(4000);
  await p.goto(`${SITE}/ee/et/oficina/solicitacoes/${solId}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  const t = await p.innerText('body');
  ok('4 Mecanica abrindo o link do acidente nao ve os dados', !t.includes('porta amassada') && !/Civic/.test(t), t.replace(/\s+/g, ' ').slice(0, 200));
  await p.goto(`${SITE}/ee/et/oficina/solicitacoes`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  const lista = await p.innerText('body');
  ok('4 lista da Mecanica: ve o pedido de mecanica e nao o acidente', lista.includes('motor') && !lista.includes('porta amassada'), lista.replace(/\s+/g, ' ').slice(0, 200));
  await ctx.close();
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 600)); }
finally {
  await browser.close();
  for (const s of sols) {
    const { data: o } = await sb.from('orcamentos').select('id').eq('solicitacao_id', s);
    for (const x of o || []) { await sb.from('orcamento_itens').delete().eq('orcamento_id', x.id); await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', x.id); }
    for (const t of ['orcamentos', 'mensagens', 'solicitacao_fotos']) await sb.from(t).delete().eq('solicitacao_id', s);
    await sb.from('emergencias').update({ solicitacao_id: null }).eq('solicitacao_id', s);
    await sb.from('solicitacoes').delete().eq('id', s);
  }
  for (const e of ems) { for (const t of ['emergencia_oficinas_notificadas', 'emergencia_fotos']) await sb.from(t).delete().eq('emergencia_id', e); await sb.from('emergencias').delete().eq('id', e); }
  for (const o of ofs) await sb.from('oficinas').delete().eq('id', o);
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
