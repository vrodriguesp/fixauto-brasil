// E2E "quem paga o reparo" em PRODUCAO (limpa tudo): acidente com seguro,
// numero do sinistro depois, validacao, e a oficina vendo no pedido (et, 390 px).
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
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + x : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = [];
let emergId, solId, oficinaId;
try {
  // oficina de teste ativa perto do acidente
  const emailO = `seguro-ofi-${tag}@example.test`, senhaO = crypto.randomBytes(12).toString('base64url') + 'A1';
  const { data: uo } = await admin.auth.admin.createUser({ email: emailO, password: senhaO, email_confirm: true });
  contas.push(uo.user.id);
  await admin.from('profiles').insert({ id: uo.user.id, tipo: 'oficina', nome: 'TESTE SEGURO', email: emailO, idioma: 'et' });
  const { data: of } = await admin.from('oficinas').insert({ profile_id: uo.user.id, nome_fantasia: 'TESTE SEGURO', endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '1', pais: 'EE', latitude: 59.437, longitude: 24.745, ativa: true, especialidades: ['colisao'] }).select('id').single();
  oficinaId = of.id;

  // acidente sem login, com "seguro do outro" e seguradora
  const form = new FormData();
  form.append('dados', JSON.stringify({ nome: 'TESTE AUTOMATICO', email: `delivered+seg${tag}@resend.dev`, telefone: '5555', idioma: 'et', tipoAcidente: 'outro_causou', descricao: 'teste seguro', endereco: 'Tallinn', latitude: 59.437, longitude: 24.745, pagamento_reparo: 'seguro_terceiro', seguradora: 'ERGO', sinistro_numero: '', franquia: '999' }));
  form.append('fotos', new Blob([fs.readFileSync('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/public/apple-touch-icon.png')], { type: 'image/png' }), 'f.png');
  const r = await fetch(`${SITE}/api/emergencia`, { method: 'POST', body: form });
  const j = await r.json();
  ok('acidente registrado', r.status === 200 && !!j.id, String(r.status));
  emergId = j.id; solId = j.solicitacaoId;
  const { data: e } = await admin.from('emergencias').select('profile_id').eq('id', emergId).single();
  contas.push(e.profile_id);
  const { data: s1 } = await admin.from('solicitacoes').select('pagamento_reparo, seguradora, sinistro_numero, franquia').eq('id', solId).single();
  ok('gravado: seguro do outro + ERGO', s1.pagamento_reparo === 'seguro_terceiro' && s1.seguradora === 'ERGO');
  ok('franquia ignorada quando o seguro e do outro', s1.franquia === null);

  const h = { 'x-emergencia-token': j.token, 'Content-Type': 'application/json' };
  const g = await (await fetch(`${SITE}/api/emergencia/${emergId}`, { headers: h })).json();
  ok('pagina do acidente devolve o seguro', g.seguro?.seguradora === 'ERGO');

  // numero do sinistro depois
  const u = await fetch(`${SITE}/api/emergencia/${emergId}/seguro`, { method: 'POST', headers: h, body: JSON.stringify({ pagamento_reparo: 'seguro_proprio', seguradora: 'If', sinistro_numero: 'KA-12345', franquia: '200,50' }) });
  ok('atualizar seguro -> 200', u.status === 200);
  const { data: s2 } = await admin.from('solicitacoes').select('pagamento_reparo, seguradora, sinistro_numero, franquia').eq('id', solId).single();
  ok('atualizado: kasko If KA-12345 franquia 200.5', s2.pagamento_reparo === 'seguro_proprio' && s2.seguradora === 'If' && s2.sinistro_numero === 'KA-12345' && Number(s2.franquia) === 200.5);
  ok('valor invalido -> 400', (await fetch(`${SITE}/api/emergencia/${emergId}/seguro`, { method: 'POST', headers: h, body: JSON.stringify({ pagamento_reparo: 'banco' }) })).status === 400);
  ok('sem codigo de acesso -> 403', (await fetch(`${SITE}/api/emergencia/${emergId}/seguro`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"pagamento_reparo":"proprio"}' })).status === 403);

  // a oficina ve no pedido e na lista
  const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  await page.goto(`${SITE}/et/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', emailO); await page.fill('input[type=password]', senhaO); await page.click('button[type=submit]');
  await page.waitForTimeout(4000);
  await page.goto(`${SITE}/et/oficina/enviar-orcamento/${solId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const txt = await page.innerText('body');
  ok('oficina ve "Kes maksab remondi eest" com If e KA-12345', txt.includes('Kes maksab remondi eest') && txt.includes('KA-12345') && txt.includes('Kliendi kaskokindlustus') && /200[,.]50/.test(txt));
  ok('tipo traduzido (sem "colisao" cru)', !/\bcolisao\b/.test(txt));
  await page.screenshot({ path: 'e2e-oficina-seguro.png' });
  await page.goto(`${SITE}/et/oficina/solicitacoes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const lista = await page.innerText('body');
  ok('lista mostra selo Kindlustus', lista.includes('Kindlustus'));
  ok('lista sem codigos crus (alta/colisao)', !/\b(alta|colisao)\b/.test(lista));
  await browser.close();
} finally {
  if (solId) { await admin.from('solicitacao_fotos').delete().eq('solicitacao_id', solId); await admin.from('notificacoes').delete().contains('dados', { solicitacao_id: solId }); }
  if (emergId) {
    const { data: fotos } = await admin.from('emergencia_fotos').select('foto_url').eq('emergencia_id', emergId);
    const caminhos = (fotos || []).map((f) => f.foto_url.split('/damage-photos/')[1]).filter(Boolean);
    if (caminhos.length) await admin.storage.from('damage-photos').remove(caminhos);
    await admin.from('emergencia_fotos').delete().eq('emergencia_id', emergId);
    await admin.from('emergencia_oficinas_notificadas').delete().eq('emergencia_id', emergId);
    await admin.from('emergencias').update({ solicitacao_id: null }).eq('id', emergId);
  }
  if (solId) await admin.from('solicitacoes').delete().eq('id', solId);
  if (emergId) await admin.from('emergencias').delete().eq('id', emergId);
  for (const id of contas) {
    await admin.from('veiculos').delete().eq('profile_id', id);
    await admin.from('notificacoes').delete().eq('profile_id', id);
    await admin.from('oficinas').delete().eq('profile_id', id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`limpeza ok (${contas.length} contas)`);
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
