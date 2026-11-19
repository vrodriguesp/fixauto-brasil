// E2E LOCAL: PRIMEIRO orcamento de uma oficina nova (caso real 19/11: Autokere Meister, RU, PC - pos 300 EUR numa
// posicao, tocou nos (i) das datas e da validade e saiu em "Cancelar"; nunca enviou orcamento) + decisoes do dono
// 19/11 (P3-P7, dica do preco maximo, privacidade do cliente, pausa dos avisos). Cobre:
//  A ru 1366 (como no caso real): resumo dos 3 passos; passos 1/2/3; cartao foto/PDF marcado "Необязательно";
//    exemplo do 1o orcamento (P7) aberto e com a frase do preco maximo; dica do preco maximo com link para a conversa;
//    privacidade: "Клиент · codigo | area" sem nome e sem rua; preco SEM nome do item; data pelo seletor -> validade
//    PRE-PREENCHIDA = ultima data + 7 (P5) com a dica; enviar -> orcamento no banco com o item nomeado pelo tipo
//  B et 390 (celular): nome digitado; validade mexida a mao NAO e recalculada pela 2a data; sem rolagem lateral
//  C enviar sem nada: caixa vermelha das datas + validade vermelha, nada gravado
//  D revisao de A: sem resumo/exemplo; validade gravada mantida; cartoes numerados
//  E en 1366/390: textos novos traduzidos, sem chave crua
//  G P4: "Nao tenho interesse" no formulario -> motivo -> volta a lista; pedido_dispensas no banco; no detalhe o
//    botao e visivel (btn-secondary)
//  H privacidade no detalhe: antes do aceite "Cliente · codigo" + area + aviso; depois do aceite nome + endereco
//    (ru 1366 e et 390)
//  P pausa dos avisos (P6): cartao "Conta" no perfil (ru 1366, et 390) -> pausar 7 dias -> banco; pagina
//    /excluir-conta mostra a pausa antes do botao de apagar; retomar
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
  sex: { aberto: true, inicio: '08:00', fim: '18:00' }, sab: { aberto: true, inicio: '08:00', fim: '18:00' }, dom: { aberto: true, inicio: '08:00', fim: '18:00' },
};
const RUA = 'Peterburi tee 2';
const ENDERECO = `${RUA}, Lasnamäe, Tallinn`;
const AREA = 'Lasnamäe, Tallinn';

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
  await p.waitForTimeout(800);
};
const abrirDetalhe = async (p, lang, solId) => {
  await p.goto(`${SITE}/ee/${lang}/oficina/pedidos/${solId}`, { waitUntil: 'networkidle' });
  await p.getByTestId('cliente-nome').waitFor({ timeout: 20000 });
  await p.waitForTimeout(600);
};
const orcamentoDe = async (solId, ofId) => {
  const { data: o } = await sb.from('orcamentos').select('id, valor_total, validade, revisao_numero, status').eq('solicitacao_id', solId).eq('oficina_id', ofId).maybeSingle();
  if (!o) return null;
  const { data: it } = await sb.from('orcamento_itens').select('descricao, valor_unitario, quantidade').eq('orcamento_id', o.id);
  const { data: d } = await sb.from('orcamento_disponibilidade').select('data_checkin, hora_inicio').eq('orcamento_id', o.id);
  return { o, it: it || [], d: d || [] };
};

// ---------- dados: oficina de carroceria nova (nunca orcou) + pedidos de funilaria do mesmo cliente
const dono = await conta('oficina', `Ruvim ${tag}`, 'ru');
const { data: of, error: eOf } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `Kere Meister ${tag}`, endereco: 'Peterburi tee 2', cidade: 'Tallinn', estado: 'Harju', cep: '11415', pais: 'EE', latitude: 59.437, longitude: 24.80, ativa: true, raio_atendimento_km: 40, especialidades: ['funilaria', 'pintura', 'colisao'], seguradoras_convencionadas: [], horario_funcionamento: HORARIO }).select('id').single();
if (eOf) throw new Error(eOf.message);
const ofId = of.id;
const cli = await conta('cliente', `Sofia ${tag}`, 'et');
const { data: cliPerfil } = await sb.from('profiles').select('codigo').eq('id', cli.id).single();
const { data: carro } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Kia', fipe_modelo: 'Ceed', fipe_ano: '2019', placa: `${tag.slice(0, 3).toUpperCase()}123` }).select('id').single();
const pedido = async (n) => {
  const { data: s, error } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: carro.id, tipo: 'funilaria', descricao: `Сзади вмятина, лопнувшая краска после небольшого столкновения на парковке (${n} ${tag})`, urgencia: 'media', status: 'aberta', latitude: 59.44, longitude: 24.76, endereco: ENDERECO, pais: 'EE' }).select('id, numero, area').single();
  if (error) throw new Error(error.message);
  sols.push(s.id); return s;
};
const s1 = await pedido(1), s2 = await pedido(2), s3 = await pedido(3), s4 = await pedido(4), s5 = await pedido(5);
const TRU = tr('ru'), TET = tr('et');
const precoDe = (T) => `input[placeholder="${T('oficinaEnviarOrcamento.placeholderValor')}"]`;
const nomeDe = (T) => `input[placeholder="${T('oficinaEnviarOrcamento.placeholderDescricaoItem')}"]`;

try {
  if (PRINTS) {
    for (const [lang, larg] of [['ru', 1366], ['ru', 390], ['et', 1366], ['et', 390]]) {
      const c = await contexto(larg); const p = await c.newPage();
      await entrar(p, dono, lang);
      await abrirForm(p, lang, s1.id);
      await p.screenshot({ path: `${OUT}/${PRINTS}_form_${lang}_${larg}.png`, fullPage: true });
      await p.locator(precoDe(tr(lang))).first().fill('300');
      await p.getByTestId('enviar-orcamento').click(); await p.waitForTimeout(900);
      await p.screenshot({ path: `${OUT}/${PRINTS}_form-erro_${lang}_${larg}.png`, fullPage: true });
      if (larg === 1366) {
        for (const [nome, url] of [['lista', '/oficina/pedidos'], ['pedido', `/oficina/pedidos/${s1.id}`], ['perfil', '/oficina/perfil'], ['excluir', '/excluir-conta']]) {
          await p.goto(`${SITE}/ee/${lang}${url}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
          await p.screenshot({ path: `${OUT}/${PRINTS}_${nome}_${lang}_${larg}.png`, fullPage: true });
        }
      }
      await c.close();
    }
    console.log('prints em', OUT);
  } else {
    ok('banco: area do pedido = bairro/cidade, sem a rua (101)', s1.area === AREA, s1.area);
    // ---------- A: ru 1366
    {
      const c = await contexto(1366); const p = await c.newPage();
      await entrar(p, dono, 'ru');
      await abrirForm(p, 'ru', s1.id);
      ok('A: resumo dos 3 passos no alto (ru)', (await texto(p, 'passos-orcamento')) === TRU('oficinaEnviarOrcamento.passosResumo'), await texto(p, 'passos-orcamento'));
      ok('A: cartoes numerados 1/2/3', (await texto(p, 'titulo-itens')).startsWith('1') && (await texto(p, 'titulo-checkin')).startsWith('2') && (await texto(p, 'titulo-validade')).startsWith('3'));
      ok('A: cartao foto/PDF marcado como opcional (P3, ru)', (await p.locator('h2', { hasText: TRU('oficinaEnviarOrcamento.importarTitulo') }).count()) === 1 && TRU('oficinaEnviarOrcamento.importarTitulo').startsWith('Необязательно'));
      ok('A: exemplo do 1o orcamento (P7) presente e com a frase do preco maximo', (await visivel(p, 'exemplo-orcamento')) && (await texto(p, 'exemplo-orcamento')).includes(TRU('oficinaEnviarOrcamento.exemploTitulo')));
      await p.getByTestId('exemplo-orcamento').locator('summary').click(); await p.waitForTimeout(200);
      ok('A: exemplo abre com item, datas, validade e nota do maximo', (await texto(p, 'exemplo-orcamento')).includes(TRU('oficinaEnviarOrcamento.exemploItem')) && (await texto(p, 'exemplo-orcamento')).includes(TRU('oficinaEnviarOrcamento.exemploNota')));
      ok('A: dica do preco maximo com link para a conversa', (await texto(p, 'dica-preco-maximo')).includes(TRU('oficinaEnviarOrcamento.dicaPrecoMaximo').slice(0, 30)) && (await p.getByTestId('link-conversa-antes').getAttribute('href') || '').includes(`/oficina/mensagens/${s1.id}`));
      const local = await texto(p, 'cliente-local-form');
      ok('A: privacidade no formulario: "Клиент · codigo | area", sem nome e sem rua', local.includes(`${TRU('oficinaEnviarOrcamento.clienteLabel')} · ${cliPerfil.codigo}`) && local.includes(AREA) && !local.includes(RUA) && !local.includes('Sofia'), local);
      ok('A: placeholder do item com exemplo (ru)', await p.locator(nomeDe(TRU)).count() === 1);
      ok('A: validade vazia antes das datas', (await p.locator('#cacb1-103').inputValue()) === '' && !(await visivel(p, 'validade-auto')));
      await p.locator(precoDe(TRU)).first().fill('300'); await p.waitForTimeout(200);
      ok('A: total 300', /300/.test(await p.getByTestId('enviar-orcamento').innerText()));
      const r = await escolherCheckin(p, { dia: somar(hojeTallinn, 2), faixa: 'manha' });
      await p.waitForTimeout(300);
      const val = await p.locator('#cacb1-103').inputValue();
      ok('A: validade PRE-PREENCHIDA = data + 7 com a dica (P5)', val === somar(r.dia, 7) && (await visivel(p, 'validade-auto')) && !(await visivel(p, 'usar-validade-sugerida')), `${val} vs ${r.dia}`);
      const r2 = await escolherCheckin(p, { dia: somar(hojeTallinn, 4), faixa: 'tarde' });
      ok('A: 2a data mais tarde -> validade acompanha (ainda automatica)', (await p.locator('#cacb1-103').inputValue()) === somar(r2.dia, 7), await p.locator('#cacb1-103').inputValue());
      await p.getByTestId('enviar-orcamento').click();
      await p.waitForTimeout(4000);
      const g = await orcamentoDe(s1.id, ofId);
      ok('A: orcamento gravado 300 com 2 datas e validade = ultima + 7', g && Number(g.o.valor_total) === 300 && g.d.length === 2 && g.o.validade === somar(r2.dia, 7), JSON.stringify(g));
      ok('A: item sem nome vai com o rotulo do tipo do pedido (ru)', g && g.it.length === 1 && g.it[0].descricao === TRU('constants.tiposServico.funilaria') && Number(g.it[0].valor_unitario) === 300, JSON.stringify(g?.it));
      await p.screenshot({ path: `${OUT}/A_enviado_ru_1366.png`, fullPage: true });
      await c.close();
    }
    // ---------- B: et 390 celular, nome digitado, validade a mao
    {
      const c = await contexto(390); const p = await c.newPage();
      await entrar(p, dono, 'et');
      await abrirForm(p, 'et', s2.id);
      ok('B: resumo dos 3 passos (et, 390)', (await texto(p, 'passos-orcamento')) === TET('oficinaEnviarOrcamento.passosResumo'));
      ok('B: ja orcou uma vez -> sem o exemplo do 1o orcamento', !(await visivel(p, 'exemplo-orcamento')));
      ok('B: cartao foto/PDF "Valikuline" (et)', TET('oficinaEnviarOrcamento.importarTitulo').startsWith('Valikuline') && (await p.locator('h2', { hasText: TET('oficinaEnviarOrcamento.importarTitulo') }).count()) === 1);
      ok('B: sem rolagem lateral no alto', await semRolagem(p));
      await p.locator(nomeDe(TET)).first().fill('Tagumise põrkeraua remont ja värvimine');
      await p.locator(precoDe(TET)).first().fill('450');
      const r = await escolherCheckin(p, { dia: somar(hojeTallinn, 3), faixa: 'tarde' });
      ok('B: validade automatica (et)', (await p.locator('#cacb1-103').inputValue()) === somar(r.dia, 7));
      await p.locator('#cacb1-103').fill(somar(r.dia, 20)); await p.waitForTimeout(200);
      ok('B: mexida a mao -> dica "automatica" some', !(await visivel(p, 'validade-auto')));
      const r2 = await escolherCheckin(p, { dia: somar(hojeTallinn, 5), faixa: 'manha' });
      ok('B: nova data NAO sobrescreve a validade escolhida a mao', (await p.locator('#cacb1-103').inputValue()) === somar(r.dia, 20), `${await p.locator('#cacb1-103').inputValue()} (${r2.dia})`);
      await p.screenshot({ path: `${OUT}/B_preenchido_et_390.png`, fullPage: true });
      ok('B: sem rolagem lateral preenchido', await semRolagem(p));
      await p.getByTestId('enviar-orcamento').click(); await p.waitForTimeout(4000);
      const g = await orcamentoDe(s2.id, ofId);
      ok('B: enviado 450, nome digitado mantido, validade a mao', g && Number(g.o.valor_total) === 450 && g.it[0]?.descricao === 'Tagumise põrkeraua remont ja värvimine' && g.o.validade === somar(r.dia, 20), JSON.stringify(g));
      await c.close();
    }
    // ---------- C: enviar sem nada
    {
      const c = await contexto(1366); const p = await c.newPage();
      await entrar(p, dono, 'ru');
      await abrirForm(p, 'ru', s3.id);
      await p.locator(precoDe(TRU)).first().fill('300');
      await p.getByTestId('enviar-orcamento').click(); await p.waitForTimeout(800);
      ok('C: sem data -> caixa vermelha das datas', await visivel(p, 'erro-sem-checkin'));
      ok('C: validade vazia -> vermelha', await visivel(p, 'erro-validade'));
      ok('C: nada gravado', !(await orcamentoDe(s3.id, ofId)));
      await p.screenshot({ path: `${OUT}/C_erros_ru_1366.png`, fullPage: true });
      await c.close();
    }
    // ---------- D: revisao de A
    {
      const c = await contexto(1366); const p = await c.newPage();
      await entrar(p, dono, 'ru');
      await abrirForm(p, 'ru', s1.id);
      ok('D: revisao sem o resumo dos 3 passos nem exemplo', !(await visivel(p, 'passos-orcamento')) && !(await visivel(p, 'exemplo-orcamento')));
      ok('D: revisao com os cartoes numerados', (await texto(p, 'titulo-itens')).startsWith('1') && (await texto(p, 'titulo-validade')).startsWith('3'));
      ok('D: revisao com a validade gravada (sem botao, sem dica automatica)', (await p.locator('#cacb1-103').inputValue()) !== '' && !(await visivel(p, 'usar-validade-sugerida')) && !(await visivel(p, 'validade-auto')));
      ok('D: revisao sem "nao tenho interesse"', !(await visivel(p, 'dispensar-no-form')));
      await c.close();
    }
    // ---------- E: en 1366/390
    for (const [lang, larg] of [['en', 1366], ['en', 390]]) {
      const c = await contexto(larg); const p = await c.newPage();
      await entrar(p, dono, lang);
      await abrirForm(p, lang, s3.id);
      const tx = await texto(p, 'passos-orcamento');
      ok(`E: ${lang} ${larg} resumo traduzido`, tx === tr(lang)('oficinaEnviarOrcamento.passosResumo') && !/\?\?|passosResumo/.test(tx), tx);
      ok(`E: ${lang} ${larg} dica do preco traduzida`, (await texto(p, 'dica-preco-maximo')).includes('maximum'));
      ok(`E: ${lang} ${larg} sem rolagem lateral`, await semRolagem(p));
      await c.close();
    }
    // ---------- G: P4 "nao tenho interesse" no formulario e visivel no detalhe
    {
      const c = await contexto(390); const p = await c.newPage();
      await entrar(p, dono, 'ru');
      await abrirDetalhe(p, 'ru', s4.id);
      const btn = p.getByTestId('nao-tenho-interesse');
      ok('G: detalhe: botao "Не интересует" visivel com borda (btn-secondary)', (await btn.isVisible()) && ((await btn.getAttribute('class')) || '').includes('btn-secondary'));
      await abrirForm(p, 'ru', s4.id);
      ok('G: formulario: "Не интересует" ao lado de Cancelar', await visivel(p, 'dispensar-no-form'));
      await p.getByTestId('dispensar-no-form').getByTestId('nao-tenho-interesse').click(); await p.waitForTimeout(300);
      await p.getByTestId('motivo-longe').click();
      await p.getByTestId('confirmar-dispensa').click();
      await p.waitForURL((x) => /\/oficina\/pedidos$/.test(x.pathname), { timeout: 15000 }).catch(() => {});
      ok('G: volta a lista de pedidos', /\/oficina\/pedidos$/.test(new URL(p.url()).pathname), p.url());
      const { data: disp } = await sb.from('pedido_dispensas').select('motivo').eq('solicitacao_id', s4.id).eq('oficina_id', ofId).maybeSingle();
      ok('G: dispensa gravada (motivo longe)', disp?.motivo === 'longe', JSON.stringify(disp));
      ok('G: sem rolagem lateral (390)', await semRolagem(p));
      await c.close();
    }
    // ---------- H: privacidade no detalhe antes/depois do aceite
    for (const [lang, larg] of [['ru', 1366], ['et', 390]]) {
      const c = await contexto(larg); const p = await c.newPage();
      await entrar(p, dono, lang);
      await abrirDetalhe(p, lang, s5.id);
      const T = tr(lang);
      const nome = await texto(p, 'cliente-nome'); const loc = await texto(p, 'cliente-local');
      ok(`H ${lang}: antes do aceite: "Cliente · codigo", area, aviso; sem nome e sem rua`, nome === `${T('oficinaSolicitacaoDetalhe.clienteFallback')} · ${cliPerfil.codigo}` && loc === AREA && (await visivel(p, 'nome-apos-aceite')) && !(await p.content()).includes(RUA) && !(await p.content()).includes(`Sofia ${tag}`), `${nome} | ${loc}`);
      await p.screenshot({ path: `${OUT}/H_antes_${lang}_${larg}.png`, fullPage: true });
      // orcamento aceito (pelo servidor): nome e endereco aparecem
      {
        const { data: o5 } = await sb.from('orcamentos').insert({ solicitacao_id: s5.id, oficina_id: ofId, valor_total: 200, prazo_dias: 1, tempo_execucao_horas: 2, validade: somar(hojeTallinn, 10), status: 'aceito', observacoes: '[COMISSAO:absorver:10]' }).select('id').single();
        await sb.from('orcamento_itens').insert({ orcamento_id: o5.id, descricao: 'Töö', tipo: 'mao_de_obra', valor_unitario: 200, quantidade: 1, valor_total: 200 });
        await sb.from('solicitacoes').update({ status: 'aceita' }).eq('id', s5.id);
      }
      await abrirDetalhe(p, lang, s5.id);
      const nome2 = await texto(p, 'cliente-nome'); const loc2 = await texto(p, 'cliente-local');
      ok(`H ${lang}: depois do aceite: nome e endereco completos, sem o aviso`, nome2 === `Sofia ${tag}` && loc2 === ENDERECO && !(await visivel(p, 'nome-apos-aceite')), `${nome2} | ${loc2}`);
      // desfaz para o proximo idioma ver o "antes"
      await sb.from('orcamentos').delete().eq('solicitacao_id', s5.id); await sb.from('solicitacoes').update({ status: 'aberta' }).eq('id', s5.id);
      await c.close();
    }
    // ---------- V: evidencia dos obrigatorios + "onde falta" ao enviar (dono 19/11): ru 1366 e et 390
    for (const [lang, larg] of [['ru', 1366], ['et', 390]]) {
      const c = await contexto(larg); const p = await c.newPage();
      const T = tr(lang);
      await entrar(p, dono, lang);
      await abrirForm(p, lang, s3.id);
      ok(`V ${lang}: legenda "* obrigatorio" no alto`, (await texto(p, 'legenda-obrigatorio')).includes(T('oficinaEnviarOrcamento.legendaObrigatorio')));
      ok(`V ${lang}: os 3 cartoes obrigatorios com "*"; secoes opcionais marcadas`, (await texto(p, 'titulo-itens')).includes('*') && (await texto(p, 'titulo-checkin')).includes('*') && (await texto(p, 'titulo-validade')).includes('*') && (await p.locator('h2', { hasText: T('oficinaEnviarOrcamento.opcionalSufixo') }).count()) === 2);
      await p.getByTestId('enviar-orcamento').click(); await p.waitForTimeout(700);
      ok(`V ${lang}: preco vazio -> erro no proprio campo, aria-invalid e foco no preco`, (await visivel(p, 'erro-item-valor')) && (await p.locator('#orc-item-valor-0').getAttribute('aria-invalid')) === 'true' && (await p.locator('#orc-item-valor-0').getAttribute('aria-describedby')) === 'erro-item-valor' && (await p.evaluate(() => document.activeElement?.id)) === 'orc-item-valor-0', await p.evaluate(() => document.activeElement?.outerHTML?.slice(0, 100)));
      ok(`V ${lang}: datas e validade tambem vermelhas no proprio lugar`, (await visivel(p, 'erro-sem-checkin')) && (await visivel(p, 'erro-validade')));
      ok(`V ${lang}: resumo ao lado do botao com 3 links`, (await p.getByTestId('resumo-faltas').getAttribute('data-n')) === '3' && (await texto(p, 'resumo-faltas')).includes(T('oficinaEnviarOrcamento.campo_valor')) && (await texto(p, 'resumo-faltas')).includes(T('oficinaEnviarOrcamento.campo_datas')) && (await texto(p, 'resumo-faltas')).includes(T('oficinaEnviarOrcamento.campo_validade')), await texto(p, 'resumo-faltas'));
      ok(`V ${lang}: resumo sem chave crua nem plural quebrado`, !/\?\?|plural|\{n/.test(await texto(p, 'resumo-faltas')) && /\d/.test(await texto(p, 'resumo-faltas')));
      await p.getByTestId('falta-validade').click(); await p.waitForTimeout(400);
      ok(`V ${lang}: link do resumo leva o foco a validade`, (await p.evaluate(() => document.activeElement?.id)) === 'cacb1-103');
      await p.getByTestId('falta-valor').click(); await p.waitForTimeout(400);
      await p.locator(precoDe(T)).first().fill('250'); await p.waitForTimeout(300);
      ok(`V ${lang}: preco preenchido -> erro do preco some, resumo cai para 2`, !(await visivel(p, 'erro-item-valor')) && (await p.getByTestId('resumo-faltas').getAttribute('data-n')) === '2');
      await escolherCheckin(p, { dia: somar(hojeTallinn, 6), faixa: 'manha' }); await p.waitForTimeout(300);
      ok(`V ${lang}: data escolhida -> datas e validade (automatica) saem do resumo; resumo some`, !(await visivel(p, 'erro-sem-checkin')) && !(await visivel(p, 'erro-validade')) && !(await visivel(p, 'resumo-faltas')));
      ok(`V ${lang}: sem rolagem lateral`, await semRolagem(p));
      await p.screenshot({ path: `${OUT}/V_${lang}_${larg}.png`, fullPage: true });
      await c.close();
    }
    // ---------- P: pausa dos avisos (P6)
    for (const [lang, larg] of [['ru', 1366], ['et', 390]]) {
      const c = await contexto(larg); const p = await c.newPage();
      await entrar(p, dono, lang);
      await p.goto(`${SITE}/ee/${lang}/oficina/perfil`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
      ok(`P ${lang}: cartao "Conta" com pausa e link de excluir`, (await visivel(p, 'cartao-conta')) && (await visivel(p, 'pausar-7')) && (await visivel(p, 'link-excluir-conta')));
      ok(`P ${lang}: sem rolagem lateral`, await semRolagem(p));
      await p.getByTestId('pausar-7').click(); await p.waitForTimeout(1500);
      const { data: pf } = await sb.from('profiles').select('avisos_pausados_ate').eq('id', dono.id).single();
      const dias = pf?.avisos_pausados_ate ? (Date.parse(pf.avisos_pausados_ate) - Date.now()) / 86400000 : 0;
      ok(`P ${lang}: pausado por ~7 dias no banco`, dias > 6.9 && dias < 7.1 && (await visivel(p, 'avisos-pausados')), String(dias));
      await p.goto(`${SITE}/ee/${lang}/excluir-conta`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
      ok(`P ${lang}: /excluir-conta oferece a pausa antes do botao de apagar`, (await visivel(p, 'pausar-avisos')) && (await visivel(p, 'retomar-avisos')));
      await p.getByTestId('retomar-avisos').click(); await p.waitForTimeout(1500);
      const { data: pf2 } = await sb.from('profiles').select('avisos_pausados_ate').eq('id', dono.id).single();
      ok(`P ${lang}: retomar limpa a pausa`, pf2?.avisos_pausados_ate === null && (await visivel(p, 'pausar-30')));
      await p.screenshot({ path: `${OUT}/P_excluir_${lang}_${larg}.png`, fullPage: true });
      await c.close();
    }
  }
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 800)); }
finally {
  await browser.close();
  for (const s of sols) { await sb.from('pedido_dispensas').delete().eq('solicitacao_id', s); await sb.from('solicitacoes').delete().eq('id', s); }
  await sb.from('oficinas').delete().eq('id', ofId);
  for (const id of contas) { await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  if (!PRINTS) console.log(`\n${oks} ok / ${falhas} falhas`);
}
process.exit(falhas ? 1 : 0);
