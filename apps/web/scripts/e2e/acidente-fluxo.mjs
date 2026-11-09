// Fluxo do acidente no site como o dono pediu (09/11), no motor do Safari (WebKit), celular 390:
//  48 Inicio do cliente com o botao vermelho "Acabei de bater";
//  31 formulario com "Seu carro" claro (toca no carro da conta);
//  25 trocar a lingua no meio do formulario mantem a foto e o texto;
//  28 depois de enviar, o voltar nao leva de novo ao formulario;
//  30 outro motorista registrado aparece como resumo com "Editar" (tambem vindo das Mensagens);
//  29 "Meus veiculos" sem carro so com placa; 49 Inicio com o pedido de acidente em vermelho
//     ao lado do pedido normal; 40 o cartao "pedidos abertos" leva aos pedidos.
//   HOST_LAN=<ip-da-rede> node acidente-fluxo.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { webkit } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local');
const SITE = `http://${process.env.HOST_LAN || 'localhost'}:3100`;
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/acidente-fluxo`; fs.mkdirSync(OUT, { recursive: true });
const WEBMSG = `${RAIZ}/site/apps/web/messages`;
const msgWeb = (l) => {
  const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.json`, 'utf8'));
  for (const area of ['cliente', 'oficina', 'misc', 'auth']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.${area}.json`, 'utf8')));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};
const TE = msgWeb('en'); const T = msgWeb('et');
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tag = crypto.randomBytes(3).toString('hex'); const senha = 'Af-' + crypto.randomBytes(6).toString('hex');
const email = `acid-fluxo-${tag}@example.test`;
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
// foto pequena (png 1x1)
const FOTO = path.join(OUT, 'foto-teste.png');
fs.writeFileSync(FOTO, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
const uid = u.user.id;
await admin.from('profiles').upsert({ id: uid, email, tipo: 'cliente', nome: 'Kliendi Test', idioma: 'en', telefone: '+372 5999 1111' });
const { data: carro } = await admin.from('veiculos').insert({ profile_id: uid, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018', placa: '111AAA' }).select('id').single();
// pedido normal aberto (para ver os dois no Inicio) e um carro so com placa (nao pode aparecer)
const { data: normal } = await admin.from('solicitacoes').insert({ cliente_id: uid, veiculo_id: carro.id, tipo: 'mecanica', descricao: 'Pidurid kriuksuvad', urgencia: 'media', endereco: 'Tallinn', latitude: 59.43, longitude: 24.74, status: 'aberta' }).select('id').single();
const { data: soPlaca } = await admin.from('veiculos').insert({ profile_id: uid, fipe_tipo: 'cars', fipe_marca: '', fipe_modelo: '', fipe_ano: '', placa: 'ZZ999' }).select('id').single();
const b = await webkit.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe') });
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'en-GB' });
  // cada rodada com um endereco proprio (o registro do outro motorista tem limite de 5/hora por endereco)
  await ctx.route('**/api/emergencia/**', (r) => r.continue({ headers: { ...r.request().headers(), 'x-real-ip': '10.71.' + crypto.randomInt(0, 250) + '.' + crypto.randomInt(1, 250) } }));
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await ctx.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  const p = await ctx.newPage();
  const dialogos = []; p.on('dialog', (d) => { dialogos.push(d.message()); d.dismiss().catch(() => {}); });
  await p.goto(`${SITE}/ee/en/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha); await p.click('button[type=submit]'); await p.waitForTimeout(4500);
  await p.goto(`${SITE}/ee/en/cliente/dashboard`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  // 48: botao vermelho no Inicio
  ok('48: Inicio do cliente com o botao "Acabei de bater"', (await p.getByTestId('botao-acidente').count()) === 1 && (await p.getByTestId('botao-acidente').innerText()).includes(TE('clienteDashboard.botaoAcidente')));
  await p.getByTestId('botao-acidente').click(); await p.waitForTimeout(3000);
  ok('48: o botao abre o formulario do acidente', /\/accident/.test(p.url()), p.url());
  // 31: seu carro claro
  const sc = p.getByTestId('seu-carro');
  ok('31: secao "Seu carro" com o carro da conta para tocar', (await sc.count()) === 1 && (await sc.innerText()).includes(TE('emergencia.seuCarroTitulo')) && (await p.getByTestId('meu-carro').count()) === 1);
  ok('31: com 1 carro, ele ja vem escolhido', (await p.getByTestId('meu-carro').getAttribute('aria-checked')) === 'true');
  await p.getByTestId('outro-carro-meu').click(); await p.waitForTimeout(300);
  ok('31: "outro carro meu" mostra marca e modelo (sem depender da placa)', (await p.locator('#cc5ef-marca').count()) === 1 && (await p.locator('#cc5ef-modelo').count()) === 1);
  await p.getByTestId('meu-carro').click();
  // 25: foto + texto e troca de lingua
  await p.locator('input[type=file][multiple]').setInputFiles(FOTO); await p.waitForTimeout(1500);
  await p.locator('textarea').first().fill('Tagant sõideti sisse');
  await p.evaluate(() => document.querySelector('a[hreflang="et-EE"]')?.click());
  await p.waitForTimeout(6000);
  ok('25: trocou para estoniano', /\/ee\/et\//.test(p.url()), p.url());
  ok('25: a foto continua depois de trocar a lingua', (await p.locator('img[alt]').filter({ hasNot: p.locator('xx') }).evaluateAll((els) => els.filter((e) => e.src.startsWith('blob:')).length)) >= 1);
  ok('25: o texto continua', (await p.locator('textarea').first().inputValue().catch(() => '')) === 'Tagant sõideti sisse');
  await p.screenshot({ path: path.join(OUT, 'troca_lingua_foto.png'), fullPage: true });
  // segue ate enviar
  const passoFotos = await p.getByRole('button', { name: T('emergencia.nextBtn') }).count();
  if (passoFotos) { await p.getByRole('button', { name: T('emergencia.nextBtn') }).first().click(); await p.waitForTimeout(1000); }
  await p.locator('#cc5ef-6').fill('Pärnu mnt 10, Tallinn'); await p.waitForTimeout(800);
  await p.getByRole('button', { name: T('emergencia.sendBtn') }).click(); await p.waitForTimeout(9000);
  const tSuc = await p.innerText('main');
  ok('envio do acidente chega a tela de sucesso', tSuc.includes(T('emergencia.successTitle')), tSuc.slice(0, 200) + ' ' + dialogos.join('/'));
  ok('31: botao claro "Adicionar os dados do OUTRO motorista"', (await p.getByTestId('adicionar-outro-motorista').innerText().catch(() => '')).includes(T('emergencia.registerOtherVehicleBtn')));
  await p.getByTestId('adicionar-outro-motorista').click(); await p.waitForTimeout(5000);
  const urlAcidente = p.url();
  ok('30: pagina do acidente com "Seu carro" (o carro escolhido)', (await p.getByTestId('card-seu-carro').innerText().catch(() => '')).includes('Toyota Corolla'));
  ok('30: sem registro ainda, mostra o formulario do OUTRO motorista', (await p.getByTestId('form-outro-motorista').count()) === 1 && (await p.getByTestId('form-outro-motorista').innerText()).includes(T('emergenciaAcidenteDetalhe.formTitle')));
  await p.locator('#cbacc-1').fill('Teine Juht'); await p.locator('#cbacc-4').fill('222BBB'); await p.locator('#cbacc-5').fill('Fiat Argo');
  await p.getByTestId('registrar-outro').click(); await p.waitForTimeout(3000);
  const co = await p.getByTestId('card-outro-motorista').innerText().catch(() => '');
  ok('30: registrado, vira resumo com "Editar" (sem formulario)', co.includes('Teine Juht') && co.includes('222BBB') && (await p.getByTestId('editar-outro').count()) === 1 && (await p.getByTestId('form-outro-motorista').count()) === 0, co);
  await p.getByTestId('editar-outro').click(); await p.waitForTimeout(500);
  await p.locator('#cbacc-5').fill('Fiat Argo 2020'); await p.getByTestId('registrar-outro').click(); await p.waitForTimeout(3000);
  ok('30: "Editar" salva e volta ao resumo', (await p.getByTestId('card-outro-motorista').innerText().catch(() => '')).includes('Fiat Argo 2020'));
  await p.screenshot({ path: path.join(OUT, 'acidente_resumo.png'), fullPage: true });
  {
    const eid = urlAcidente.split('/').pop();
    const { data: gravado } = await admin.from('emergencia_outro_veiculo').select('nome, placa, veiculo_descricao').eq('emergencia_id', eid);
    ok('30: outro motorista gravado no banco (nao so na tela)', (gravado || []).some((g) => g.placa === '222BBB'), JSON.stringify(gravado));
    const { data: emgs } = await admin.from('emergencias').select('id, created_at, solicitacao_id').eq('profile_id', uid);
    ok('um acidente enviado = um registro so (sem duplicar)', (emgs || []).length === 1, JSON.stringify(emgs));
  }
  // 28: voltar nao leva ao formulario enviado
  await p.goBack(); await p.waitForTimeout(3000);
  ok('28: voltar depois do acidente nao abre de novo o formulario', (await p.locator('#cc5ef-6').count()) === 0 && (await p.getByTestId('seu-carro').count()) === 0, p.url());
  // 30: vindo das Mensagens
  await p.goto(`${SITE}/ee/et/cliente/mensagens`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  const emergId = urlAcidente.split('/').pop();
  const link = p.locator(`a[href*="${emergId}"]`).first();
  ok('30: a conversa do acidente esta nas Mensagens', (await link.count()) === 1);
  { const { data: g2 } = await admin.from('emergencia_outro_veiculo').select('id, emergencia_id').eq('emergencia_id', emergId); console.log('   no banco antes do clique:', JSON.stringify(g2), 'emergId=', emergId); }
  const respostas = []; p.on('response', async (r) => { if (/\/api\/emergencia\/[0-9a-f-]+$/.test(r.url().split('?')[0])) { const tx = await r.text().catch(() => ''); respostas.push(r.url().split('/').pop() + ' ' + r.status() + ' outro=' + (tx.match(/"outro":(null|{[^}]*})/) || [])[1]); }; });
  if (await link.count()) { await link.click(); await p.waitForTimeout(5000); }
  console.log('   api:', respostas.slice(0, 2).join(' || '));
  await p.screenshot({ path: path.join(process.env.TEMP, 'acidente-pelas-mensagens.png'), fullPage: true }).catch(() => {});
  console.log('   url pelas mensagens:', p.url());
  ok('30: aberto pelas Mensagens mostra o resumo do outro motorista, nao o formulario', (await p.getByTestId('card-outro-motorista').count()) === 1 && (await p.getByTestId('form-outro-motorista').count()) === 0);
  // 29: meus veiculos
  await p.goto(`${SITE}/ee/et/cliente/veiculos`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  const tv = await p.innerText('main');
  ok('29: "Meus veiculos" sem o carro so com placa', tv.includes('Toyota') && !tv.includes('ZZ999'), tv.slice(0, 200));
  // 49/40: Inicio
  await p.goto(`${SITE}/ee/et/cliente/dashboard`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  ok('49: Inicio mostra o pedido de acidente (vermelho) e o pedido normal', (await p.getByTestId('pedido-acidente').count()) === 1 && (await p.getByTestId('pedido-aberto').count()) >= 1);
  ok('49: pedido de acidente com o selo "Avarii"', (await p.getByTestId('pedido-acidente').innerText()).includes(T('clienteDashboard.badgeAcidente')));
  ok('40: pedido sem orcamento diz "esperando orcamentos"', (await p.getByTestId('pedido-aberto').first().innerText()).includes(T('clienteDashboard.aguardandoOrcamentos')));
  ok('40: cartao "pedidos abertos" leva a lista dos pedidos', ((await p.getByTestId('card-pedidos-abertos').getAttribute('href')) || '').includes('#pedidos-abertos'));
  await p.screenshot({ path: path.join(OUT, 'inicio_cliente.png'), fullPage: true });
  await p.goto(`${SITE}/ee/et/cliente/orcamentos`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  ok('40: pagina de orcamentos mostra os pedidos esperando (nao "crie um pedido")', (await p.getByTestId('esperando-orcamentos').count()) === 1);
  await ctx.close();
} catch (e) {
  falhas++; console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await b.close();
  const { data: sols } = await admin.from('solicitacoes').select('id').eq('cliente_id', uid);
  const { data: emgs } = await admin.from('emergencias').select('id').eq('profile_id', uid);
  for (const e of emgs || []) {
    const { data: ov } = await admin.from('emergencia_outro_veiculo').select('id').eq('emergencia_id', e.id);
    for (const o of ov || []) await admin.from('emergencia_outro_veiculo_fotos').delete().eq('outro_veiculo_id', o.id);
    for (const t of ['emergencia_outro_veiculo', 'emergencia_fotos', 'emergencia_mensagens', 'emergencia_oficinas_notificadas']) await admin.from(t).delete().eq('emergencia_id', e.id);
    await admin.from('emergencias').update({ solicitacao_id: null }).eq('id', e.id);
  }
  for (const s of sols || []) {
    for (const t of ['solicitacao_fotos', 'mensagens', 'orcamentos']) await admin.from(t).delete().eq('solicitacao_id', s.id);
    await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', s.id);
    await admin.from('solicitacoes').delete().eq('id', s.id);
  }
  for (const e of emgs || []) await admin.from('emergencias').delete().eq('id', e.id);
  await admin.from('veiculos').delete().eq('profile_id', uid);
  await admin.from('notificacoes').delete().eq('profile_id', uid);
  await admin.from('profiles').delete().eq('id', uid); await admin.auth.admin.deleteUser(uid).catch(() => {});
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
