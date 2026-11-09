// Capturas para a ficha da Google Play + gravacao de tela para o video (so banco LOCAL).
// uso: node telas-loja.mjs <.env.local> <et|ru|en> <pasta-saida>
// Cria dados ficticios (cliente, 3 oficinas inventadas, 2 pedidos com foto), tira 1080x1920 e grava .webm; apaga tudo no fim.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js'); const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const L = process.argv[3] || 'et'; const OUT = process.argv[4]; fs.mkdirSync(OUT, { recursive: true });
const FOTOS = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/App_Android/_fotos';
const MOB = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/mobile/i18n/locales';
const j = JSON.parse(fs.readFileSync(`${MOB}/${L}.json`, 'utf8'));
const T = (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], j)).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '');
const APP = 'http://localhost:8090';
const D = {
  et: { nome: 'Kadri', s1: 'Tagumine põrkeraud sai parkimisel löögi, plastitükid on maas.', s3: 'Esirehv on tühi, auto seisab parklas.', s2: 'Piduri märgutuli põleb ja pidurdades kostab kriuksumist.',
    itens: [['Tagumise põrkeraua vahetus', 'peca', 180], ['Värvimine', 'mao_de_obra', 120], ['Paigaldus', 'mao_de_obra', 40]],
    itens2: [['Esimesed piduriklotsid', 'peca', 65], ['Töö', 'mao_de_obra', 55]],
    msgs: [['c', 'Tere! Kas saan auto homme hommikul tuua?'], ['o', 'Tere, Kadri! Jah, kell 9 sobib. Võtame piduriklotsid kohe tellimusse.'], ['c', 'Suurepärane, aitäh! Näeme homme.'], ['o', 'Auto on valmis, võite selle kätte saada 👍']] },
  ru: { nome: 'Ольга', s1: 'Задний бампер повреждён при парковке, на земле куски пластика.', s3: 'Спустило переднее колесо, машина стоит на парковке.', s2: 'Горит индикатор тормозов, при торможении слышен скрип.',
    itens: [['Замена заднего бампера', 'peca', 180], ['Покраска', 'mao_de_obra', 120], ['Установка', 'mao_de_obra', 40]],
    itens2: [['Передние тормозные колодки', 'peca', 65], ['Работа', 'mao_de_obra', 55]],
    msgs: [['c', 'Здравствуйте! Можно привезти машину завтра утром?'], ['o', 'Здравствуйте, Ольга! Да, в 9:00 подойдёт. Колодки закажем сразу.'], ['c', 'Отлично, спасибо! До завтра.'], ['o', 'Машина готова, можете забирать 👍']] },
  en: { nome: 'Anna', s1: 'Rear bumper got hit while parking, plastic pieces on the ground.', s3: 'Front tyre is flat, the car is in the car park.', s2: 'Brake warning light is on and the brakes squeak.',
    itens: [['Rear bumper replacement', 'peca', 180], ['Painting', 'mao_de_obra', 120], ['Fitting', 'mao_de_obra', 40]],
    itens2: [['Front brake pads', 'peca', 65], ['Labour', 'mao_de_obra', 55]],
    msgs: [['c', 'Hi! Can I bring the car tomorrow morning?'], ['o', 'Hi Anna! Yes, 9:00 works. We will order the brake pads right away.'], ['c', 'Great, thank you! See you tomorrow.'], ['o', 'Your car is ready, you can pick it up 👍']] },
}[L];
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const arquivos = [];
const conta = async (tipo, nome) => { const email = `loja-${tipo}${contas.length}-${tag}@example.test`; const senha = `Lo${tag}Senha9`; const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true }); if (error) throw error; await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma: L }); contas.push(data.user.id); return { id: data.user.id, email, senha }; };
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const foto = async (arq) => { const nome = `loja-${tag}/${arq}`; const { error } = await sb.storage.from('damage-photos').upload(nome, fs.readFileSync(path.join(FOTOS, arq)), { contentType: 'image/jpeg' }); if (error) throw error; arquivos.push(nome); return sb.storage.from('damage-photos').getPublicUrl(nome).data.publicUrl; };
const ins = async (t, row) => { const { data, error } = await sb.from(t).insert(row).select().single(); if (error) throw new Error(`${t}: ${error.message}`); return data; };

let falhou = false;
const cli = await conta('cliente', D.nome);
const ofs = [];
// oficinas inventadas (nomes ficticios), em Tallinn
for (const [nome, nota, n, lat, lon] of [['Autokoda Nord', 4.8, 23, 59.452, 24.733], ['Remondikoda 24', 4.6, 11, 59.421, 24.709], ['Meistrikoda', 4.9, 37, 59.437, 24.79]]) {
  const d = await conta('oficina', nome);
  ofs.push(await ins('oficinas', { profile_id: d.id, nome_fantasia: nome, endereco: 'Tallinn', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: lat, longitude: lon, ativa: true, raio_atendimento_km: 20, avaliacao_media: nota, total_avaliacoes: n, especialidades: ['funilaria', 'mecanica', 'colisao', 'manutencao'] }));
}
const v = await ins('veiculos', { profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Volkswagen', fipe_modelo: 'Golf', fipe_ano: '2017', placa: '482BKM' });
const sol = (tipo, descricao, status) => ins('solicitacoes', { cliente_id: cli.id, veiculo_id: v.id, tipo, descricao, urgencia: 'media', latitude: 59.437, longitude: 24.745, endereco: 'Tallinn', pais: 'EE', status });
// pedido 1: para-choque, 3 orcamentos para comparar
const s1 = await sol('funilaria', D.s1, 'em_orcamento');
await ins('solicitacao_fotos', { solicitacao_id: s1.id, foto_url: await foto('lado.jpg') });
for (const [i, fator, d1, prazo] of [[0, 1, 2, 2], [1, 0.88, 4, 3], [2, 1.12, 1, 2]]) {
  const itens = D.itens.map(([desc, tipo, val]) => [desc, tipo, Math.round(val * fator)]);
  const total = itens.reduce((a, x) => a + x[2], 0);
  const o = await ins('orcamentos', { solicitacao_id: s1.id, oficina_id: ofs[i].id, valor_total: total, prazo_dias: prazo, status: 'enviado', validade: dia(14), garantia_dias: 365 });
  for (const [desc, tipo, val] of itens) await ins('orcamento_itens', { orcamento_id: o.id, descricao: desc, tipo, valor_unitario: val, quantidade: 1, valor_total: val });
  await ins('orcamento_disponibilidade', { orcamento_id: o.id, data_checkin: dia(d1), turno: 'manha', data_previsao_entrega: dia(d1 + prazo) });
}
// pedido 2: freios, aceito, carro na oficina, conversa
const s2 = await sol('mecanica', D.s2, 'em_andamento');
await ins('solicitacao_fotos', { solicitacao_id: s2.id, foto_url: await foto('pidurid.jpg') });
const total2 = D.itens2.reduce((a, x) => a + x[2], 0);
const o2 = await ins('orcamentos', { solicitacao_id: s2.id, oficina_id: ofs[2].id, valor_total: total2, prazo_dias: 1, status: 'aceito', validade: dia(14), garantia_dias: 180 });
for (const [desc, tipo, val] of D.itens2) await ins('orcamento_itens', { orcamento_id: o2.id, descricao: desc, tipo, valor_unitario: val, quantidade: 1, valor_total: val });
const ag = await ins('agenda', { oficina_id: ofs[2].id, solicitacao_id: s2.id, titulo: 'Volkswagen Golf', data_inicio: new Date(Date.now() - 3 * 3600e3).toISOString(), data_fim: new Date(Date.now() + 5 * 3600e3).toISOString(), tipo: 'plataforma', status: 'em_andamento' });
await ins('manutencao_etapas', { agenda_id: ag.id, status: 'em_execucao' });
const donoOf2 = (await sb.from('oficinas').select('profile_id').eq('id', ofs[2].id).single()).data.profile_id;
let t0 = Date.now() - 20 * 3600e3;
for (const [quem, texto] of D.msgs) { t0 += 25 * 60e3; await ins('mensagens', { solicitacao_id: s2.id, oficina_id: ofs[2].id, remetente_id: quem === 'c' ? cli.id : donoOf2, texto, lida: true, created_at: new Date(t0).toISOString() }); }

const b = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const loc = { et: 'et-EE', ru: 'ru-RU', en: 'en-GB' }[L];
try {
  // IPHONE=1: telas da App Store (iPhone 6,9" = 430x932 x3 = 1290x2796), sem gravacao de video
  const iphone = process.env.IPHONE === '1';
  const c = await b.newContext({ viewport: iphone ? { width: 430, height: 932 } : { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: loc, ...(iphone ? {} : { recordVideo: { dir: path.join(OUT, '_video'), size: { width: 720, height: 1280 } } }) });
  await c.addInitScript((l) => { try { localStorage.setItem('idioma', l); } catch {} }, L);
  const p = await c.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  const shot = async (n) => { await p.waitForTimeout(1200); await p.screenshot({ path: path.join(OUT, `${n}.png`) }); console.log('tela', n); };
  const visivel = (txt) => p.getByText(txt, { exact: false }).locator('visible=true').first();
  // 1 abertura (sem conta) e acidente
  await p.goto(APP, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  await shot('01_inicio_sem_conta');
  await visivel(T('emergencia.titulo')).click(); await p.waitForTimeout(1500);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), visivel(T('emergencia.galeria')).click()]);
  await fc.setFiles(path.join(FOTOS, 'lado.jpg')); await p.waitForTimeout(1500);
  await shot('06_acidente');
  // login
  await p.goto(APP, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  await p.getByLabel(T('auth.email'), { exact: true }).locator('visible=true').first().fill(cli.email);
  await p.getByLabel(T('auth.senha'), { exact: true }).locator('visible=true').first().fill(cli.senha);
  await p.getByText(T('auth.entrar'), { exact: true }).locator('visible=true').last().click(); await p.waitForTimeout(5000);
  await shot('02_inicio');
  // pedido com 3 orcamentos
  await p.goto(`${APP}/solicitacao/${s1.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  await shot('03_pedido_fotos');
  const alvo = visivel(T('orcamentos.aceitar'));
  if (await alvo.count()) { await alvo.scrollIntoViewIfNeeded(); await p.mouse.wheel(0, -380); }
  await shot('04_orcamentos');
  // carro na oficina + conversa
  await p.goto(`${APP}/solicitacao/${s2.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  await shot('05_na_oficina');
  await p.goto(`${APP}/conversa/${s2.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  await shot('07_conversa');
  // pedido novo com foto
  await p.goto(`${APP}/nova-solicitacao`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  await p.getByText(/Volkswagen Golf/).locator('visible=true').first().click().catch(() => {});
  await p.getByText(T('constants.tiposServico.pneu'), { exact: false }).locator('visible=true').first().click().catch(() => {});
  await p.getByLabel(T('novaSolicitacao.passoSintomas'), { exact: true }).locator('visible=true').first().fill(D.s3).catch(() => {});
  const [fc2] = await Promise.all([p.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null), visivel(T('novaSolicitacao.galeria')).click().catch(() => {})]);
  if (fc2) { await fc2.setFiles(path.join(FOTOS, 'rehv.jpg')); await p.waitForTimeout(1500); }
  await shot('08_pedido_novo');
  if (erros.length) { console.log('ERRO JS', erros.slice(0, 3)); falhou = true; }
  await c.close();
} catch (e) { console.log('FALHA', e.message); falhou = true; }
finally {
  await b.close();
  // limpeza
  for (const s of [s1, s2]) { for (const t of ['mensagens', 'solicitacao_fotos']) await sb.from(t).delete().eq('solicitacao_id', s.id); }
  const { data: orcs } = await sb.from('orcamentos').select('id').in('solicitacao_id', [s1.id, s2.id]);
  for (const o of orcs || []) { await sb.from('orcamento_itens').delete().eq('orcamento_id', o.id); await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); }
  await sb.from('manutencao_etapas').delete().eq('agenda_id', ag.id); await sb.from('agenda').delete().eq('id', ag.id);
  await sb.from('orcamentos').delete().in('solicitacao_id', [s1.id, s2.id]);
  await sb.from('solicitacoes').delete().in('id', [s1.id, s2.id]); await sb.from('veiculos').delete().eq('id', v.id);
  await sb.from('oficinas').delete().in('id', ofs.map((o) => o.id));
  if (arquivos.length) await sb.storage.from('damage-photos').remove(arquivos);
  for (const id of contas) { await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhou ? 'COM FALHAS' : 'OK', 'limpo');
}
