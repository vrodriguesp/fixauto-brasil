// Fluxo de acidente de ponta a ponta no site LOCAL, sem login: registrar
// com foto, acessar com e sem o codigo secreto, mensagem, outro veiculo,
// pagina no navegador (com e sem codigo). Apaga tudo no fim.
//   node e2e-acidente.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');

const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const BASE = 'http://localhost:3100';
let falhas = 0;
const confere = (n, ok) => { if (!ok) falhas++; console.log(`${ok ? 'ok   ' : 'FALHA'} ${n}`); };

// PNG 1x1
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const tag = crypto.randomBytes(3).toString('hex');
const emailA = `e2e-acid-${tag}@example.test`;
const emailB = `e2e-outro-${tag}@example.test`;
let id = null;

try {
  const form = new FormData();
  form.append('dados', JSON.stringify({ nome: 'Teste Acidente', email: emailA, telefone: '+3725000', idioma: 'et', tipoAcidente: 'outro_causou', descricao: 'teste e2e', endereco: 'Tallinn', latitude: 59.437, longitude: 24.745 }));
  form.append('fotos', new Blob([png], { type: 'image/png' }), 'dano.png');
  const r = await fetch(`${BASE}/api/emergencia`, { method: 'POST', body: form, headers: { 'x-real-ip': `10.9.${tag.slice(0,2).charCodeAt(0)}.1` } });
  const d = await r.json();
  id = d.id;
  confere(`registro sem login -> ${r.status}, conta criada ${d.contaCriada}`, r.status === 200 && !!d.id && !!d.token && d.contaCriada === true);

  const sem = await fetch(`${BASE}/api/emergencia/${id}`);
  confere(`ler sem codigo -> ${sem.status}`, sem.status === 403);
  const errado = await fetch(`${BASE}/api/emergencia/${id}`, { headers: { 'x-emergencia-token': 'errado' } });
  confere(`ler com codigo errado -> ${errado.status}`, errado.status === 403);
  const com = await fetch(`${BASE}/api/emergencia/${id}`, { headers: { 'x-emergencia-token': d.token } });
  const cd = await com.json();
  confere(`ler com codigo -> ${com.status} papel ${cd.papel}, solicitacao ${!!cd.emergencia?.solicitacao_id}`, com.status === 200 && cd.papel === 'proprietario' && !!cd.emergencia?.solicitacao_id);

  const { data: fotos } = await admin.from('emergencia_fotos').select('foto_url').eq('emergencia_id', id);
  confere(`foto gravada no espaco privado (${fotos?.length})`, fotos?.length === 1 && fotos[0].foto_url.includes('/damage-photos/emergencia/'));
  const pub = await fetch(fotos[0].foto_url);
  confere(`foto NAO abre pelo endereco publico (${pub.status})`, pub.status >= 400);

  const msg = await fetch(`${BASE}/api/emergencia/${id}/mensagens`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-emergencia-token': d.token }, body: JSON.stringify({ texto: 'ola' }) });
  confere(`mensagem com codigo -> ${msg.status}`, msg.status === 200);
  const msgSem = await fetch(`${BASE}/api/emergencia/${id}/mensagens`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: 'hack' }) });
  confere(`mensagem sem codigo -> ${msgSem.status}`, msgSem.status === 403);

  const f2 = new FormData();
  f2.append('dados', JSON.stringify({ nome: 'Outro', email: emailB, placa: 'ABC123', idioma: 'et' }));
  const o = await fetch(`${BASE}/api/emergencia/${id}/outro-veiculo`, { method: 'POST', body: f2, headers: { 'x-emergencia-token': d.token } });
  confere(`outro veiculo -> ${o.status}`, o.status === 200);
  const { data: outro } = await admin.from('emergencia_outro_veiculo').select('profile_id').eq('emergencia_id', id).single();
  confere('conta do outro motorista ligada ao acidente', !!outro?.profile_id);

  const tipoRuim = new FormData();
  tipoRuim.append('dados', JSON.stringify({ nome: 'x', email: `e2e-x-${tag}@example.test`, latitude: 1, longitude: 1 }));
  tipoRuim.append('fotos', new Blob(['<script>'], { type: 'text/html' }), 'x.html');
  const tr = await fetch(`${BASE}/api/emergencia`, { method: 'POST', body: tipoRuim, headers: { 'x-real-ip': '10.99.99.2' } });
  confere(`arquivo que nao e imagem recusado -> ${tr.status}`, tr.status === 400);

  // navegador: pagina do acidente com e sem o codigo
  const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const erros = [];
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.goto(`${BASE}/ee/et/avarii/teade/${id}`, { waitUntil: 'networkidle' });
  const semTxt = await page.evaluate(() => document.body.innerText);
  confere('pagina sem codigo pede login', /Logi sisse/.test(semTxt));
  await page.evaluate(([i, t]) => localStorage.setItem(`bipfix_emergencia_${i}`, t), [id, d.token]);
  await page.reload({ waitUntil: 'networkidle' });
  const comTxt = await page.evaluate(() => document.body.innerText);
  confere('pagina com codigo mostra o acidente (placa do outro veiculo)', comTxt.includes('ABC123') && !/Logi sisse, et avariid/.test(comTxt));
  const csp = erros.filter((e) => /Content Security Policy|Refused to/.test(e));
  confere(`sem bloqueios da CSP na pagina (${csp.length})`, csp.length === 0);
  if (csp.length) console.log(csp.slice(0, 3).join('\n'));
  await browser.close();
} catch (e) {
  falhas++;
  console.log('ERRO', e.message);
} finally {
  if (id) {
    const { data: e } = await admin.from('emergencias').select('solicitacao_id').eq('id', id).single();
    const { data: objs } = await admin.storage.from('damage-photos').list(`emergencia/${id}`);
    if (objs?.length) await admin.storage.from('damage-photos').remove(objs.map((o) => `emergencia/${id}/${o.name}`));
    if (e?.solicitacao_id) {
      await admin.from('solicitacao_fotos').delete().eq('solicitacao_id', e.solicitacao_id);
      await admin.from('emergencias').update({ solicitacao_id: null }).eq('id', id);
      await admin.from('solicitacoes').delete().eq('id', e.solicitacao_id);
    }
    await admin.from('emergencias').delete().eq('id', id);
  }
  const { data: perfis } = await admin.from('profiles').select('id').like('email', `e2e-%-${tag}@example.test`);
  for (const p of perfis || []) {
    await admin.from('notificacoes').delete().eq('profile_id', p.id);
    await admin.from('veiculos').delete().eq('profile_id', p.id);
    await admin.from('profiles').delete().eq('id', p.id);
    await admin.auth.admin.deleteUser(p.id);
  }
  console.log(`limpeza: acidente e ${perfis?.length || 0} contas apagados`);
}
console.log(falhas === 0 ? 'TUDO CERTO' : `${falhas} FALHA(S)`);
