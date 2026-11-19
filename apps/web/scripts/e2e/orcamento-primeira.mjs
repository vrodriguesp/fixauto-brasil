// E2E LOCAL: PRIMEIRO orcamento de uma oficina nova (caso real 19/11: Autokere Meister, RU, PC - pos 300 EUR numa
// posicao, tocou nos (i) das datas e da validade e saiu em "Cancelar"; nunca enviou orcamento). Cobre:
//  A ru 1366 (como no caso real): resumo dos 3 passos no alto; passos 1/2/3 nos cartoes; preco SEM nome do item;
//    data de check-in pelo seletor -> a dica da validade mostra o botao "Poor <data>" ANTES do erro; toque -> validade
//    preenchida (>= data + 7); enviar -> orcamento no banco com o item nomeado pelo tipo do pedido (nunca em branco)
//  B et 390 (celular): mesmo caminho com nome digitado; sem rolagem lateral; enviado; o nome digitado e o que vale
//  C enviar sem nada: caixa vermelha das datas + validade vermelha (comportamento antigo mantido), nada gravado
//  D revisao do mesmo orcamento: o resumo dos 3 passos NAO aparece (so no primeiro envio); passos continuam
//  E en 1366 + en 390: chaves novas sem "??"/chave crua (os 6 idiomas sao conferidos pelo checar-traducoes)
//  PRINTS=antes|depois: so tira os prints (ru/et x 1366/390) para Documentos/Analises/Orcamento_oficina_2026-11-19
//   SITE=http://localhost:3105 node orcamento-primeira.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { escolherCheckin } from './ajuda-checkin.mjs';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(SITE)) throw new Error('SITE nao e local');
const PRINTS = process.env.PRINTS || '';
const OUT = PRINTS
  ? 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/Analises/Orcamento_oficina_2026-11-19'
  : 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/orcamento-ux';
fs.mkdirSync(OUT, { recursive: true });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const MSG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../messages');
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8'))));
const tr = (l) => { const m = msgs(l); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? `{${x}}`); };
let falhas = 0, oks = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; else oks++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 300) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const sols = [];
const hojeTallinn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date());
const somar = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const HORARIO = {
  seg: { aberto: true, inicio: '08:00', fim: '18:00' }, ter: { aberto: true, inicio: '08:00', fim: '18:00' },
  qua: { aberto: true, inicio: '08:00', fim: '18:00' }, qui: { aberto: true, inicio: '08:00', fim: '18:00' },
  sex: { aberto: true, inicio: '08:00', fim: '18:00' }, sab: { aberto: false, inicio: '', fim: '' }, dom: { aberto: false, inicio: '', fim: '' },
};

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const contexto = async (largura = 1366) => {
  const movel = largura < 700;
  const c = await browser.newContext({ viewport: { width: largura, height: movel ? 844 : 768 }, deviceScaleFactor: movel ? 2 : 1, isMobile: movel, hasTouch: movel, locale: 'ru-RU' });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const entrar = async (p, u, lang) => {
  await p.goto(`${SITE}/ee/${lang}/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]');
  await p.waitForURL((x) => !x.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
};
const conta = async (tipo, nome, idioma = 'ru') => {
  const email = `orc1-${tipo}${contas.length}-${tag}@example.test`; const senha = `Oc${tag}Senha9`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone: '+372 5000 0000' });
  return { id: data.user.id, email, senha };
};
const visivel = (p, id) => p.getByTestId(id).isVisible().catch(() => false);
const texto = (p, id) => p.getByTestId(id).innerText().catch(() => '');
const semRolagem = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const abrirForm = async (p, lang, solId) => {
  await p.goto(`${SITE}/ee/${lang}/oficina/orcamento/${solId}`, { waitUntil: 'networkidle' });
  await p.getByTestId('enviar-orcamento').waitFor({ timeout: 20000 });
  await p.waitForTimeout(600);
};
const orcamentoDe = async (solId, ofId) => {
  const { data: o } = await sb.from('orcamentos').select('id, valor_total, validade, revisao_numero').eq('solicitacao_id', solId).eq('oficina_id', ofId).maybeSingle();
  if (!o) return null;
  const { data: it } = await sb.from('orcamento_itens').select('descricao, valor_unitario, quantidade').eq('orcamento_id', o.id);
  const { data: d } = await sb.from('orcamento_disponibilidade').select('data_checkin, hora_inicio').eq('orcamento_id', o.id);
  return { o, it: it || [], d: d || [] };
};

// ---------- dados: oficina de carroceria nova (nunca orcou) + 3 pedidos de funilaria do mesmo cliente
const dono = await conta('oficina', `Ruvim ${tag}`, 'ru');
const { data: of, error: eOf } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `Kere Meister ${tag}`, endereco: 'Peterburi tee 2', cidade: 'Tallinn', estado: 'Harju', cep: '11415', pais: 'EE', latitude: 59.437, longitude: 24.80, ativa: true, raio_atendimento_km: 40, especialidades: ['funilaria', 'pintura', 'colisao'], seguradoras_convencionadas: [], horario_funcionamento: HORARIO }).select('id').single();
if (eOf) throw new Error(eOf.message);
const ofId = of.id;
const cli = await conta('cliente', `Sofia ${tag}`, 'et');
const { data: carro } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Kia', fipe_modelo: 'Ceed', fipe_ano: '2019', placa: `${tag.slice(0, 3).toUpperCase()}123` }).select('id').single();
const pedido = async (n) => {
  const { data: s, error } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: carro.id, tipo: 'funilaria', descricao: `Сзади вмятина, лопнувшая краска после небольшого столкновения на парковке (${n} ${tag})`, urgencia: 'media', status: 'aberta', latitude: 59.44, longitude: 24.76, endereco: 'Maardu, Estonia', pais: 'EE' }).select('id, numero').single();
  if (error) throw new Error(error.message);
  sols.push(s.id); return s;
};
const s1 = await pedido(1), s2 = await pedido(2), s3 = await pedido(3);
const TRU = tr('ru'), TET = tr('et');

try {
  if (PRINTS) {
    // so os prints do estado atual (antes/depois) nas 4 combinacoes - formulario vazio e com 300 EUR
    for (const [lang, larg] of [['ru', 1366], ['ru', 390], ['et', 1366], ['et', 390]]) {
      const c = await contexto(larg); const p = await c.newPage();
      await entrar(p, dono, lang);
      await abrirForm(p, lang, s1.id);
      await p.screenshot({ path: `${OUT}/${PRINTS}_form_${lang}_${larg}.png`, fullPage: true });
      // com o preco posto (como no caso real) e o botao "enviar" tocado: o que a oficina ve
      await p.locator(`input[placeholder="${tr(lang)('oficinaEnviarOrcamento.placeholderValor')}"]`).first().fill('300');
      await p.getByTestId('enviar-orcamento').click(); await p.waitForTimeout(900);
      await p.screenshot({ path: `${OUT}/${PRINTS}_form-erro_${lang}_${larg}.png`, fullPage: true });
      if (larg === 1366) {
        await p.goto(`${SITE}/ee/${lang}/oficina/pedidos`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
        await p.screenshot({ path: `${OUT}/${PRINTS}_lista_${lang}_${larg}.png`, fullPage: true });
        await p.goto(`${SITE}/ee/${lang}/oficina/pedidos/${s1.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
        await p.screenshot({ path: `${OUT}/${PRINTS}_pedido_${lang}_${larg}.png`, fullPage: true });
        await p.goto(`${SITE}/ee/${lang}/oficina/perfil`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
        await p.screenshot({ path: `${OUT}/${PRINTS}_perfil_${lang}_${larg}.png`, fullPage: true });
      }
      await c.close();
    }
    console.log('prints em', OUT);
  } else {
    // ---------- A: ru 1366, so o preco (sem nome), data pelo seletor, validade pelo botao da dica, enviar
    {
      const c = await contexto(1366); const p = await c.newPage();
      await entrar(p, dono, 'ru');
      await abrirForm(p, 'ru', s1.id);
      ok('A: resumo dos 3 passos no alto (ru)', (await texto(p, 'passos-orcamento')) === TRU('oficinaEnviarOrcamento.passosResumo'), await texto(p, 'passos-orcamento'));
      ok('A: cartoes numerados 1/2/3', (await texto(p, 'titulo-itens')).startsWith('1') && (await texto(p, 'titulo-checkin')).startsWith('2') && (await texto(p, 'titulo-validade')).startsWith('3'),
        [await texto(p, 'titulo-itens'), await texto(p, 'titulo-checkin'), await texto(p, 'titulo-validade')].join(' | '));
      ok('A: placeholder do item com exemplo (ru)', await p.locator(`input[placeholder="${TRU('oficinaEnviarOrcamento.placeholderDescricaoItem')}"]`).count() === 1);
      ok('A: sem dica da validade antes das datas', !(await visivel(p, 'dica-validade')) && !(await visivel(p, 'usar-validade-sugerida')));
      await p.locator(`input[placeholder="${TRU('oficinaEnviarOrcamento.placeholderValor')}"]`).first().fill('300');
      await p.waitForTimeout(200);
      ok('A: total 300', /300/.test(await p.getByTestId('enviar-orcamento').innerText()));
      const r = await escolherCheckin(p, { dia: somar(hojeTallinn, 2), faixa: 'manha' });
      await p.waitForTimeout(300);
      ok('A: dica da validade com o botao da data sugerida ANTES do erro', (await visivel(p, 'dica-validade')) && (await visivel(p, 'usar-validade-sugerida')));
      const rotulo = await texto(p, 'usar-validade-sugerida');
      ok('A: botao = "Poor <data>" (ru)', rotulo.startsWith(TRU('oficinaEnviarOrcamento.validadeUsar', { data: '' }).trim()), rotulo);
      await p.getByTestId('usar-validade-sugerida').click(); await p.waitForTimeout(200);
      const val = await p.locator('#cacb1-103').inputValue();
      ok('A: validade preenchida >= data + 7', val >= somar(r.dia, 7), `${val} vs ${r.dia}`);
      ok('A: botao some depois de preenchida', !(await visivel(p, 'usar-validade-sugerida')));
      await p.getByTestId('enviar-orcamento').click();
      await p.waitForTimeout(4000);
      const g = await orcamentoDe(s1.id, ofId);
      ok('A: orcamento gravado 300 com 1 data e a validade', g && Number(g.o.valor_total) === 300 && g.d.length === 1 && g.d[0].data_checkin === r.dia && g.o.validade === val, JSON.stringify(g));
      ok('A: item sem nome vai com o rotulo do tipo do pedido (ru)', g && g.it.length === 1 && g.it[0].descricao === TRU('constants.tiposServico.funilaria') && Number(g.it[0].valor_unitario) === 300, JSON.stringify(g?.it));
      await p.screenshot({ path: `${OUT}/A_enviado_ru_1366.png`, fullPage: true });
      await c.close();
    }
    // ---------- B: et 390 celular, nome digitado
    {
      const c = await contexto(390); const p = await c.newPage();
      await entrar(p, dono, 'et');
      await abrirForm(p, 'et', s2.id);
      ok('B: resumo dos 3 passos (et, 390)', (await texto(p, 'passos-orcamento')) === TET('oficinaEnviarOrcamento.passosResumo'));
      ok('B: sem rolagem lateral no alto', await semRolagem(p));
      await p.locator(`input[placeholder="${TET('oficinaEnviarOrcamento.placeholderDescricaoItem')}"]`).first().fill('Tagumise põrkeraua remont ja värvimine');
      await p.locator(`input[placeholder="${TET('oficinaEnviarOrcamento.placeholderValor')}"]`).first().fill('450');
      const r = await escolherCheckin(p, { dia: somar(hojeTallinn, 3), faixa: 'tarde' });
      await p.getByTestId('usar-validade-sugerida').click(); await p.waitForTimeout(200);
      await p.screenshot({ path: `${OUT}/B_preenchido_et_390.png`, fullPage: true });
      ok('B: sem rolagem lateral preenchido', await semRolagem(p));
      await p.getByTestId('enviar-orcamento').click(); await p.waitForTimeout(4000);
      const g = await orcamentoDe(s2.id, ofId);
      ok('B: enviado 450, nome digitado mantido', g && Number(g.o.valor_total) === 450 && g.it[0]?.descricao === 'Tagumise põrkeraua remont ja värvimine' && g.d[0]?.data_checkin === r.dia, JSON.stringify(g));
      await c.close();
    }
    // ---------- C: enviar sem nada (comportamento antigo): erros, nada gravado
    {
      const c = await contexto(1366); const p = await c.newPage();
      await entrar(p, dono, 'ru');
      await abrirForm(p, 'ru', s3.id);
      await p.locator(`input[placeholder="${TRU('oficinaEnviarOrcamento.placeholderValor')}"]`).first().fill('300');
      await p.getByTestId('enviar-orcamento').click(); await p.waitForTimeout(800);
      ok('C: sem data -> caixa vermelha das datas', await visivel(p, 'erro-sem-checkin'));
      ok('C: validade vazia -> vermelha', await visivel(p, 'erro-validade'));
      ok('C: nada gravado', !(await orcamentoDe(s3.id, ofId)));
      await p.screenshot({ path: `${OUT}/C_erros_ru_1366.png`, fullPage: true });
      await c.close();
    }
    // ---------- D: revisao do orcamento A: sem o resumo dos passos; cartoes numerados continuam
    {
      const c = await contexto(1366); const p = await c.newPage();
      await entrar(p, dono, 'ru');
      await abrirForm(p, 'ru', s1.id);
      ok('D: revisao sem o resumo dos 3 passos', !(await visivel(p, 'passos-orcamento')));
      ok('D: revisao com os cartoes numerados', (await texto(p, 'titulo-itens')).startsWith('1') && (await texto(p, 'titulo-validade')).startsWith('3'));
      ok('D: revisao com a validade ja preenchida (sem o botao)', (await p.locator('#cacb1-103').inputValue()) !== '' && !(await visivel(p, 'usar-validade-sugerida')));
      await c.close();
    }
    // ---------- E: en 1366 e it 390: texto novo sem chave crua
    for (const [lang, larg] of [['en', 1366], ['en', 390]]) {
      const c = await contexto(larg); const p = await c.newPage();
      await entrar(p, dono, lang);
      await abrirForm(p, lang, s3.id);
      const tx = await texto(p, 'passos-orcamento');
      ok(`E: ${lang} ${larg} resumo traduzido`, tx === tr(lang)('oficinaEnviarOrcamento.passosResumo') && !/\?\?|passosResumo/.test(tx), tx);
      ok(`E: ${lang} ${larg} sem rolagem lateral`, await semRolagem(p));
      await c.close();
    }
  }
} finally {
  await browser.close();
  for (const s of sols) await sb.from('solicitacoes').delete().eq('id', s);
  await sb.from('oficinas').delete().eq('id', ofId);
  for (const id of contas) { await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  if (!PRINTS) console.log(`\n${oks} ok / ${falhas} falhas`);
}
process.exit(falhas ? 1 : 0);
