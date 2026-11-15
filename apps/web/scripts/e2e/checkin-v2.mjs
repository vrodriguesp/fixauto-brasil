// E2E LOCAL: check-in v2 (decisoes finais do dono 14/11 noite - Documentos/Analises/Checkin_v2_decisoes_finais_2026-11-14.md).
//  P perfil + convite: banner em Pedidos (✕ adia 7 dias; "o horario serve" some para sempre), "Recepcao de carros"
//    (hora fixa no almoco = erro ao salvar) + "Fechado no almoco" 12-13, previa das faixas
//  F formulario do orcamento (390 px): datas e validade vazias; enviar sem nada = caixa vermelha + validade vermelha,
//    nada gravado; (i) por toque; mini calendario com sabado/domingo/passado desativados e o proximo dia aberto
//    realcado; faixas de 2 h pulando o almoco; "Outro horario" 30 min; faixa repetida desativada; validade antes da
//    ultima data = vermelha com o texto do dono e "usar ultima + 7"; envio grava hora_inicio/hora_fim e turno derivado
//  T trigger da validade (082) e linha antiga (sem horas) = 13:00-17:00 para o motorista
//  D motorista (site): ve as janelas, aceita 13:00-15:00 -> agenda data_inicio/checkin_ate; e-mail + .ics com
//    DTSTART/DTEND da janela; painel/resumo/Pedidos/Hoje da oficina iguais; falta antes do fim = JANELA_NAO_ACABOU
//  M 077 (mudanca de data pela oficina, "ja combinei"): mesmo seletor; agenda, revisao, e-mail (SEQUENCE 1), chat,
//    aviso, telas do motorista e da oficina com a janela nova
//  N 079: motorista ve a faixa da oficina em cada turno; oficina confirma (grava a faixa) ou manda outras datas pelo
//    seletor (vazio = erro)
//  I idiomas: o seletor e os (i) nos 6 idiomas, sem chave faltando
//  15/11 (auditoria Fable + QA do check-in v2): R revisao pelo navegador sem itens duplicados (D4, RLS) e
//    sessionStorage limpo (R-02); B triggers da 083/082 pelo caminho do navegador (anon logado como oficina:
//    dia fechado recusado, validade empurrada, passado/em_andamento/service role liberados, apagar orfao - R-08,
//    D16, R-12); aceite: e-mail + aviso da oficina com a janela (D9); C 077 contestar e aceitar mantem a janela
//    real na agenda, e-mail/.ics, telas e no horario da falta (D1, D2)
//   node checkin-v2.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(SITE)) throw new Error('SITE nao e local');
const EMAILS = env.EMAIL_PASTA_TESTE;
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/checkin-v2';
fs.mkdirSync(OUT, { recursive: true });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const MSG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../messages');
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8'))));
const tr = (l) => { const m = msgs(l); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? `{${x}}`); };
const T = tr('et');
let falhas = 0, oks = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; else oks++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 300) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const sols = []; let ofId;

// dias no fuso de Tallinn (seg = proxima segunda depois de hoje)
const hojeTallinn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date());
const somar = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const proximo = (dow, depois = hojeTallinn) => { let d = somar(depois, 1); while (new Date(`${d}T12:00:00Z`).getUTCDay() !== dow) d = somar(d, 1); return d; };
const SEG = proximo(1), TER = somar(SEG, 1), QUA = somar(SEG, 2), SAB = somar(SEG, 5), DOM = somar(SEG, 6), SEG2 = somar(SEG, 7), TER2 = somar(SEG, 8);
const ONTEM = somar(hojeTallinn, -1);
const tallinn = (ymd, hm) => { for (const off of ['+02:00', '+03:00']) { const d = new Date(`${ymd}T${hm}:00${off}`); if (d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit' }) === hm) return d.toISOString(); } return null; };
const icsData = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const HORARIO = {
  seg: { aberto: true, inicio: '08:00', fim: '18:00' }, ter: { aberto: true, inicio: '08:00', fim: '18:00' },
  qua: { aberto: true, inicio: '08:00', fim: '18:00' }, qui: { aberto: true, inicio: '08:00', fim: '18:00' },
  sex: { aberto: true, inicio: '08:00', fim: '12:00' }, sab: { aberto: false, inicio: '', fim: '' }, dom: { aberto: false, inicio: '', fim: '' },
};
const emailsDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort().map((f) => ({ f, html: fs.readFileSync(path.join(EMAILS, f), 'utf8') }));
const icsDe = (htmlArq) => { const a = path.join(EMAILS, htmlArq.replace(/\.html$/, '') + '__bipfix-agendamento.ics'); return fs.existsSync(a) ? fs.readFileSync(a, 'utf8') : null; };
const esperarEmail = async (email, depois, filtro = () => true) => { for (let i = 0; i < 40; i++) { const e = emailsDe(email, depois).filter(filtro).at(-1); if (e) return e; await sleep(300); } return null; };

const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
const browser = await chromium.launch({ executablePath: exe });
const contexto = async (largura = 390) => {
  const movel = largura < 700;
  const c = await browser.newContext({ viewport: { width: largura, height: movel ? 844 : 900 }, deviceScaleFactor: movel ? 2 : 1, isMobile: movel, hasTouch: movel });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const entrar = async (p, u, pre = '/ee/et') => {
  await p.goto(`${SITE}${pre}/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]');
  await p.waitForURL((x) => !x.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {});
  await sleep(2000);
};
const conta = async (tipo, nome) => {
  const email = `ck2-${tipo}${contas.length}-${tag}@example.test`; const senha = `Ck${tag}Senha9`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma: 'et', telefone: '+372 5000 0000' });
  return { id: data.user.id, email, senha };
};
const token = async (u) => { const c = anon(); const { data } = await c.auth.signInWithPassword({ email: u.email, password: u.senha }); return data.session?.access_token; };
const post = async (p, tok, corpo) => { const r = await fetch(`${SITE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify(corpo) }); return { status: r.status, d: await r.json().catch(() => ({})) }; };
const semRolagem = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const visivel = (p, id) => p.getByTestId(id).isVisible().catch(() => false);
const texto = (p, id) => p.getByTestId(id).innerText().catch(() => '');
const novoPedido = async (cli, vId, n) => {
  const { data: sol, error } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: vId, tipo: 'mecanica', descricao: `teste checkin v2 ${n} ${tag}`, urgencia: 'media', status: 'aberta', latitude: 59.44, longitude: 24.76, endereco: 'Kesklinn', pais: 'EE' }).select('id, numero').single();
  if (error) throw new Error(error.message);
  sols.push(sol.id);
  return sol;
};
// orcamento direto no banco (cenarios do 079 / trigger / linha antiga)
const orcamentoNoBanco = async (solId, validade, slots) => {
  const { data: o, error } = await sb.from('orcamentos').insert({ solicitacao_id: solId, oficina_id: ofId, valor_total: 80, prazo_dias: 1, tempo_execucao_horas: 2, validade, status: 'enviado', observacoes: '[COMISSAO:absorver:10]' }).select('id').single();
  if (error) throw new Error(error.message);
  await sb.from('orcamento_itens').insert({ orcamento_id: o.id, descricao: 'Töö', tipo: 'mao_de_obra', valor_unitario: 80, quantidade: 1, valor_total: 80 });
  for (const s of slots) { const { error: e } = await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_previsao_entrega: somar(s.data_checkin, 1), ...s }); if (e) throw new Error(e.message); }
  await sb.from('solicitacoes').update({ status: 'em_orcamento' }).eq('id', solId);
  return o.id;
};
// mini calendario: vai ate o mes do dia e toca nele
const irAoDia = async (p, pre, ymd) => {
  for (let i = 0; i < 4 && !(await p.getByTestId(`${pre}-dia-${ymd}`).count()); i++) { await p.getByTestId(`${pre}-mes-seguinte`).click(); await sleep(150); }
};
const escolher = async (p, pre, ymd, faixa) => {
  await p.getByTestId(`${pre}-adicionar`).click(); await sleep(300);
  await irAoDia(p, pre, ymd);
  await p.getByTestId(`${pre}-dia-${ymd}`).click(); await sleep(250);
  if (faixa) { await p.getByTestId(`${pre}-faixa-${faixa}`).click(); await sleep(300); }
};

try {
  console.log(`hoje ${hojeTallinn} | seg ${SEG} ter ${TER} qua ${QUA} sab ${SAB} dom ${DOM} seg2 ${SEG2}`);
  const dono = await conta('oficina', 'Dono Checkin');
  const { data: of, error: eOf } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `CHECKIN ${tag}`, endereco: 'Kesktee 1', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: 59.437, longitude: 24.75, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica'], seguradoras_convencionadas: [], horario_funcionamento: HORARIO }).select('id').single();
  if (eOf) throw new Error(eOf.message);
  ofId = of.id;
  const cli = await conta('cliente', 'Klient Checkin');
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: `Octavia ${tag}`, fipe_ano: '2015', placa: `K${tag}`.toUpperCase() }).select('id').single();
  const sol1 = await novoPedido(cli, v.id, 1);
  const sol2 = await novoPedido(cli, v.id, 2);
  const sol3 = await novoPedido(cli, v.id, 3);
  const sol4 = await novoPedido(cli, v.id, 4);
  const sol5 = await novoPedido(cli, v.id, 5);

  const sol6 = await novoPedido(cli, v.id, 6);

  const ctxO = await contexto(390); const p = await ctxO.newPage();
  await entrar(p, dono);

  // ---------- P: convite em Pedidos + perfil ----------
  await p.goto(`${SITE}/ee/et/oficina/pedidos`, { waitUntil: 'networkidle' }); await sleep(1500);
  ok('P: convite aparece para o dono (perfil sem recepcao)', await visivel(p, 'convite-recepcao'));
  ok('P: convite com os 3 controles', (await p.getByTestId('convite-recepcao-preencher').count()) === 1 && (await p.getByTestId('convite-recepcao-serve').count()) === 1 && (await p.getByTestId('convite-recepcao-fechar').count()) === 1);
  await p.screenshot({ path: `${OUT}/P_convite_390.png`, fullPage: false });
  await p.getByTestId('convite-recepcao-fechar').click(); await sleep(400);
  const ate = await p.evaluate(() => Number(localStorage.getItem('bipfix_convite_recepcao_ate') || 0));
  ok('P: ✕ esconde e adia 7 dias (no aparelho)', !(await visivel(p, 'convite-recepcao')) && ate > Date.now() + 6.9 * 864e5 && ate < Date.now() + 7.1 * 864e5, String(ate));
  await p.reload({ waitUntil: 'networkidle' }); await sleep(1200);
  ok('P: adiado continua escondido depois de recarregar', !(await visivel(p, 'convite-recepcao')));
  await p.evaluate(() => localStorage.removeItem('bipfix_convite_recepcao_ate'));
  await p.reload({ waitUntil: 'networkidle' }); await sleep(1200);
  await p.getByTestId('convite-recepcao-preencher').click();
  await p.waitForURL(/\/oficina\/perfil/, { timeout: 15000 }).catch(() => {}); await sleep(2000);
  ok('P: "Preencher" abre o perfil em #recepcao', p.url().endsWith('/oficina/perfil#recepcao') && await visivel(p, 'perfil-recepcao'), p.url());
  ok('P: secao com 3 modos + almoco', (await p.getByTestId('recepcao-funcionamento').count()) === 1 && (await p.getByTestId('recepcao-faixa').count()) === 1 && (await p.getByTestId('recepcao-hora').count()) === 1 && (await p.getByTestId('almoco-ativo').count()) === 1);
  await p.getByTestId('almoco-ativo').check(); await sleep(200);
  await p.getByTestId('recepcao-hora').check(); await sleep(200);
  await p.getByTestId('recepcao-hora-valor').fill('12:30');
  await p.getByRole('button', { name: T('oficinaPerfil.salvarAlteracoes') }).click(); await sleep(1500);
  let { data: ofDb } = await sb.from('oficinas').select('recepcao_inicio, recepcao_fim, almoco_inicio, almoco_fim, recepcao_confirmada_em').eq('id', ofId).single();
  ok('P: hora fixa 12:30 dentro do almoco 12-13 = erro ao salvar, nada gravado', (await texto(p, 'erro-recepcao')).includes(T('oficinaPerfil.erro_recepcao_almoco')) && !ofDb.recepcao_inicio && !ofDb.almoco_inicio, JSON.stringify(ofDb));
  await p.getByTestId('recepcao-faixa').check(); await sleep(200);
  await p.getByTestId('recepcao-inicio').fill('09:00'); await p.getByTestId('recepcao-fim').fill('09:20');
  await p.getByRole('button', { name: T('oficinaPerfil.salvarAlteracoes') }).click(); await sleep(1200);
  ok('P: faixa de 20 min = erro (minimo 30)', (await texto(p, 'erro-recepcao')).includes(T('oficinaPerfil.erro_recepcao_curta')));
  await p.getByTestId('recepcao-funcionamento').check(); await sleep(300);
  ok('P: previa das faixas pula o almoco', (await texto(p, 'recepcao-previa')).includes('10:00–12:00, 13:00–15:00'), await texto(p, 'recepcao-previa'));
  await p.getByRole('button', { name: T('oficinaPerfil.salvarAlteracoes') }).click(); await sleep(2000);
  ({ data: ofDb } = await sb.from('oficinas').select('recepcao_inicio, recepcao_fim, almoco_inicio, almoco_fim, recepcao_confirmada_em').eq('id', ofId).single());
  ok('P: salvo: almoco 12-13, recepcao = funcionamento, convite respondido', ofDb.almoco_inicio === '12:00:00' && ofDb.almoco_fim === '13:00:00' && !ofDb.recepcao_inicio && !!ofDb.recepcao_confirmada_em, JSON.stringify(ofDb));
  await p.goto(`${SITE}/ee/et/oficina/pedidos`, { waitUntil: 'networkidle' }); await sleep(1500);
  ok('P: depois de salvar "usar o horario de funcionamento" o convite nao aparece', !(await visivel(p, 'convite-recepcao')));
  // "o horario de funcionamento serve" (com o perfil em branco de novo)
  await sb.from('oficinas').update({ recepcao_confirmada_em: null }).eq('id', ofId);
  await p.reload({ waitUntil: 'networkidle' }); await sleep(1500);
  const temConvite = await visivel(p, 'convite-recepcao');
  if (temConvite) { await p.getByTestId('convite-recepcao-serve').click(); await sleep(1500); }
  ({ data: ofDb } = await sb.from('oficinas').select('recepcao_confirmada_em').eq('id', ofId).single());
  ok('P: "o horario serve" grava e some', temConvite && !!ofDb.recepcao_confirmada_em && !(await visivel(p, 'convite-recepcao')), JSON.stringify(ofDb));
  await p.reload({ waitUntil: 'networkidle' }); await sleep(1200);
  ok('P: e nao volta depois de recarregar', !(await visivel(p, 'convite-recepcao')));

  // ---------- F: formulario do orcamento ----------
  await p.goto(`${SITE}/ee/et/oficina/orcamento/${sol1.id}`, { waitUntil: 'networkidle' }); await sleep(2000);
  ok('F: datas de check-in comecam vazias', (await p.getByTestId('ck-adicionar').count()) === 1 && (await p.getByTestId('ck-linha-0').count()) === 0 && (await p.getByTestId('ck-adicionar').innerText()).includes(T('seletorCheckin.adicionar').replace('+ ', '')));
  ok('F: validade comeca vazia', (await p.locator('#cacb1-103').inputValue()) === '');
  await p.getByPlaceholder(T('oficinaEnviarOrcamento.placeholderDescricaoItem')).first().fill('Õlivahetus');
  await p.getByPlaceholder(T('oficinaEnviarOrcamento.placeholderValor')).first().fill('60');
  await p.getByTestId('enviar-orcamento').click(); await sleep(1500);
  let { data: oSol1 } = await sb.from('orcamentos').select('id').eq('solicitacao_id', sol1.id);
  ok('F: enviar sem data = caixa vermelha + texto, nada gravado', await visivel(p, 'erro-sem-checkin') && (await p.getByTestId('ck-adicionar').getAttribute('aria-invalid')) === 'true' && !oSol1?.length);
  ok('F: com ZERO datas a dica "pode enviar assim" nao aparece (QA D8)', !(await visivel(p, 'dica-mais-datas')));
  ok('F: foco no 1o campo com erro = "+" das datas, nao um (i) (QA D11)', (await p.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'ck-adicionar', await p.evaluate(() => document.activeElement?.outerHTML?.slice(0, 120)));
  ok('F: validade vazia fica vermelha (obrigatoria)', (await p.getByTestId('erro-validade').getAttribute('data-tipo').catch(() => '')) === 'vazia' && (await texto(p, 'erro-validade')).includes(T('oficinaEnviarOrcamento.validadeVaziaErro')));
  await p.screenshot({ path: `${OUT}/F_vazio_vermelho_390.png`, fullPage: true });
  // (i): botao com rotulo, abre por toque, fecha com Esc e tocando fora
  for (const [id, chave] of [['info-checkin', 'info_checkin'], ['info-validade', 'info_validadeOrcamento'], ['info-prazo', 'info_prazoTotalDias'], ['info-tempo', 'info_tempoExecucaoHoras'], ['info-garantia', 'info_garantia']]) {
    const b = p.getByTestId(id);
    await b.scrollIntoViewIfNeeded(); await b.click(); await sleep(200);
    const aberto = await visivel(p, `${id}-texto`) && (await texto(p, `${id}-texto`)).includes(T(`oficinaEnviarOrcamento.${chave}`).slice(0, 40)) && (await b.getAttribute('aria-expanded')) === 'true' && !!(await b.getAttribute('aria-label'));
    await p.keyboard.press('Escape'); await sleep(150);
    ok(`F: (i) ${id} abre por toque com o texto e fecha com Esc`, aberto && !(await visivel(p, `${id}-texto`)));
  }
  await p.getByTestId('ck-info-adicionar').click(); await sleep(200);
  const infoMais = await texto(p, 'ck-info-adicionar-texto');
  await p.mouse.click(5, 5); await sleep(200);
  ok('F: (i) do "+" explica outra data / 2 em dias diferentes; fecha tocando fora', infoMais.includes(T('seletorCheckin.infoAdicionar').slice(0, 40)) && !(await visivel(p, 'ck-info-adicionar-texto')), infoMais);
  // folha do calendario
  await p.getByTestId('ck-adicionar').click(); await sleep(400);
  ok('F: "+" abre a folha (dialog) com o calendario', await visivel(p, 'ck-folha') && (await p.getByTestId('ck-folha').getAttribute('role')) === 'dialog');
  await p.screenshot({ path: `${OUT}/F_folha_390.png` });
  // realce = 1o dia aberto depois de hoje (nunca escolhido sozinho)
  let realce = somar(hojeTallinn, 1); while (!HORARIO[['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][new Date(`${realce}T12:00:00Z`).getUTCDay()]].aberto) realce = somar(realce, 1);
  ok('F: proximo dia aberto realcado (nao escolhido)', (await p.getByTestId(`ck-dia-${realce}`).getAttribute('data-estado').catch(() => '')) === 'realce' && (await p.getByTestId('ck-linha-0').count()) === 0);
  if (ONTEM.slice(0, 7) === hojeTallinn.slice(0, 7)) ok('F: ontem desativado', await p.getByTestId(`ck-dia-${ONTEM}`).isDisabled());
  await irAoDia(p, 'ck', SAB);
  ok('F: sabado e domingo (fechados no perfil) desativados', await p.getByTestId(`ck-dia-${SAB}`).isDisabled() && await p.getByTestId(`ck-dia-${DOM}`).isDisabled() && (await p.getByTestId(`ck-dia-${SAB}`).getAttribute('aria-disabled')) === 'true');
  await p.getByTestId(`ck-dia-${SAB}`).click({ force: true }).catch(() => {}); await sleep(200);
  ok('F: tocar no sabado nao abre faixas', !(await visivel(p, 'ck-faixas')));
  await irAoDia(p, 'ck', SEG);
  await p.getByTestId(`ck-dia-${SEG}`).click(); await sleep(300);
  const chips = await p.getByTestId('ck-faixas').locator('[data-testid^="ck-faixa-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  ok('F: segunda 08-18 com almoco 12-13 -> 08-10, 10-12, 13-15, 15-17, 17-18', JSON.stringify(chips) === JSON.stringify(['ck-faixa-0800-1000', 'ck-faixa-1000-1200', 'ck-faixa-1300-1500', 'ck-faixa-1500-1700', 'ck-faixa-1700-1800']), JSON.stringify(chips));
  await p.getByTestId('ck-info-faixas').click(); await sleep(150);
  ok('F: (i) das faixas (2 h, almoco fora, perfil)', (await texto(p, 'ck-info-faixas-texto')).includes(T('seletorCheckin.infoValiAegGrade').slice(0, 30)));
  await p.getByTestId('ck-info-faixas').click();
  await p.getByTestId('ck-faixa-0800-1000').click(); await sleep(400);
  ok('F: tocar na faixa adiciona a linha e fecha a folha', !(await visivel(p, 'ck-folha')) && (await p.getByTestId('ck-linha-0').getAttribute('data-inicio')) === '08:00' && (await texto(p, 'ck-linha-0-texto')).includes('08:00–10:00'));
  ok('F: erro da caixa vermelha some com a 1a data', !(await visivel(p, 'erro-sem-checkin')));
  ok('F: uma data so -> dica de 2+ datas', await visivel(p, 'dica-mais-datas'));
  // validade = ultima data e depois uma data mais tarde -> vermelha ao enviar
  await p.locator('#cacb1-103').fill(SEG); await sleep(200);
  ok('F: minimo da validade = ultima data de check-in', (await p.locator('#cacb1-103').getAttribute('min')) === SEG);
  await escolher(p, 'ck', QUA, '1300-1500');
  ok('F: 2a data (quarta 13-15)', (await p.getByTestId('ck-linhas').locator('li').count()) === 2);
  await p.getByTestId('enviar-orcamento').click(); await sleep(1500);
  ({ data: oSol1 } = await sb.from('orcamentos').select('id').eq('solicitacao_id', sol1.id));
  const eVal = await texto(p, 'erro-validade');
  const fmt = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('et-EE', { timeZone: 'UTC', day: 'numeric', month: 'numeric', year: 'numeric' });
  ok('F: validade antes da ultima data = vermelha com o texto do dono, nada gravado', (await p.getByTestId('erro-validade').getAttribute('data-tipo')) === 'antes' && eVal.includes(T('oficinaEnviarOrcamento.validadeAntesErro', { ultima: fmt(QUA), recomendada: fmt(somar(QUA, 7)), dias: 7 })) && !oSol1?.length, eVal);
  await p.screenshot({ path: `${OUT}/F_validade_vermelha_390.png`, fullPage: true });
  await p.getByTestId('usar-validade-recomendada').click(); await sleep(200);
  ok('F: "usar" poe ultima + 7 e tira o vermelho', (await p.locator('#cacb1-103').inputValue()) === somar(QUA, 7) && !(await visivel(p, 'erro-validade')));
  // outro horario (30 min) na terca
  await escolher(p, 'ck', TER);
  await p.getByTestId('ck-outro').click(); await sleep(200);
  await p.getByTestId('ck-outro-inicio').selectOption('09:30'); await sleep(150);
  ok('F: "Outro horario": fim sugerido = inicio + 30', (await p.getByTestId('ck-outro-fim').inputValue()) === '10:00');
  await p.getByTestId('ck-outro-adicionar').click(); await sleep(400);
  const linhas = await p.getByTestId('ck-linhas').locator('li').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-data')} ${e.getAttribute('data-inicio')}-${e.getAttribute('data-fim')}`));
  ok('F: 3 linhas em ordem; 30 min aparece como hora unica', JSON.stringify(linhas) === JSON.stringify([`${SEG} 08:00-10:00`, `${TER} 09:30-10:00`, `${QUA} 13:00-15:00`]) && (await texto(p, 'ck-linha-1-texto')).trim().endsWith('09:30'), JSON.stringify(linhas));
  // mesma faixa no mesmo dia = desativada
  await escolher(p, 'ck', SEG);
  ok('F: faixa ja escolhida no mesmo dia fica desativada', await p.getByTestId('ck-faixa-0800-1000').isDisabled());
  await p.keyboard.press('Escape'); await sleep(300);
  ok('F: Esc fecha a folha', !(await visivel(p, 'ck-folha')));
  ok('F: sem rolagem lateral a 390 px', await semRolagem(p));
  await p.getByTestId('enviar-orcamento').click(); await sleep(4500);
  const { data: o1 } = await sb.from('orcamentos').select('id, validade').eq('solicitacao_id', sol1.id).maybeSingle();
  const { data: d1 } = await sb.from('orcamento_disponibilidade').select('id, data_checkin, turno, hora_inicio, hora_fim').eq('orcamento_id', o1?.id || '').order('data_checkin');
  ok('F: enviado; validade = ultima + 7', !!o1 && String(o1.validade) === somar(QUA, 7), JSON.stringify(o1));
  ok('F: horarios gravados com a janela e o turno derivado', JSON.stringify((d1 || []).map((s) => [s.data_checkin, s.turno, s.hora_inicio, s.hora_fim])) === JSON.stringify([[SEG, 'manha', '08:00:00', '10:00:00'], [TER, 'manha', '09:30:00', '10:00:00'], [QUA, 'tarde', '13:00:00', '15:00:00']]), JSON.stringify(d1));

  ok('F: enviado -> linhas guardadas para a troca de lingua apagadas (R-02)', (await p.evaluate((id) => sessionStorage.getItem(`bipfix_ui:orc-checkin:${id}`), sol1.id)) === null);

  // ---------- R: revisao pelo navegador (RLS): itens NAO duplicam (QA D4), datas do banco voltam (R-02) ----------
  await p.goto(`${SITE}/ee/et/oficina/orcamento/${sol1.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  const linhasRev = await p.getByTestId('ck-linhas').locator('li').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-data')} ${e.getAttribute('data-inicio')}`));
  ok('R: revisao traz as 3 datas do banco', JSON.stringify(linhasRev) === JSON.stringify([`${SEG} 08:00`, `${TER} 09:30`, `${QUA} 13:00`]), JSON.stringify(linhasRev));
  await p.getByPlaceholder(T('oficinaEnviarOrcamento.placeholderValor')).first().fill('65');
  await p.getByTestId('enviar-orcamento').click(); await sleep(4500);
  const { data: o1r } = await sb.from('orcamentos').select('valor_total, revisao_numero, validade').eq('id', o1.id).single();
  const { data: it1 } = await sb.from('orcamento_itens').select('descricao, valor_total').eq('orcamento_id', o1.id);
  const { data: d1r } = await sb.from('orcamento_disponibilidade').select('data_checkin, hora_inicio, hora_fim').eq('orcamento_id', o1.id).order('data_checkin');
  ok('R: revisao gravada (65 EUR, revisao 1, validade mantida)', Number(o1r.valor_total) === 65 && o1r.revisao_numero === 1 && String(o1r.validade) === somar(QUA, 7), JSON.stringify(o1r));
  ok('R: UM item depois da revisao (antes duplicava - QA D4)', (it1 || []).length === 1 && Number(it1[0].valor_total) === 65, JSON.stringify(it1));
  ok('R: as mesmas 3 datas (horarios novos gravados, antigos apagados)', JSON.stringify((d1r || []).map((s) => `${s.data_checkin} ${s.hora_inicio}-${s.hora_fim}`)) === JSON.stringify([`${SEG} 08:00:00-10:00:00`, `${TER} 09:30:00-10:00:00`, `${QUA} 13:00:00-15:00:00`]), JSON.stringify(d1r));

  // computador: folha centralizada, sem nada por cima
  const ctxD = await contexto(1280); const pd = await ctxD.newPage();
  await entrar(pd, dono);
  await pd.goto(`${SITE}/ee/et/oficina/orcamento/${sol5.id}`, { waitUntil: 'networkidle' }); await sleep(1800);
  await pd.getByTestId('ck-adicionar').click(); await sleep(300); await pd.getByTestId(`ck-dia-${realce}`).click(); await sleep(300);
  const caixa = await pd.getByTestId('ck-folha').boundingBox();
  ok('F(1280): folha no centro, inteira na tela', !!caixa && caixa.x > 300 && caixa.x + caixa.width < 980 && caixa.y >= 0 && caixa.y + caixa.height <= 900, JSON.stringify(caixa));
  await pd.screenshot({ path: `${OUT}/F_folha_1280.png` });
  await pd.keyboard.press('Escape');

  // ---------- T: trigger da validade + linha antiga ----------
  const o4 = await orcamentoNoBanco(sol4.id, SEG, [{ data_checkin: SEG, turno: 'manha', hora_inicio: '08:00', hora_fim: '10:00' }]);
  await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o4, data_checkin: SEG2, turno: 'tarde', data_previsao_entrega: SEG2 });
  const { data: v4 } = await sb.from('orcamentos').select('validade').eq('id', o4).single();
  ok('T: horario depois da validade empurra a validade (trigger 082)', String(v4.validade) === SEG2, JSON.stringify(v4));
  const bad = await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o4, data_checkin: SEG2, turno: 'manha', hora_inicio: '09:00', hora_fim: '09:20', data_previsao_entrega: SEG2 });
  ok('T: janela < 30 min recusada pelo banco', !!bad.error);
  const bad2 = await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o4, data_checkin: SEG2, turno: 'manha', hora_inicio: '13:00', hora_fim: '15:00', data_previsao_entrega: SEG2 });
  ok('T: turno incoerente com a janela recusado pelo banco', !!bad2.error);

  // ---------- B: triggers pelo caminho do navegador (anon logado como a oficina, RLS + triggers de protecao) ----------
  {
    const ca = anon(); await ca.auth.signInWithPassword({ email: dono.email, password: dono.senha });
    const o6 = await orcamentoNoBanco(sol6.id, SEG, [{ data_checkin: SEG, turno: 'manha', hora_inicio: '08:00', hora_fim: '10:00' }]);
    const ins = (data_checkin, turno = 'tarde', h = ['13:00', '15:00']) => ca.from('orcamento_disponibilidade').insert({ orcamento_id: o6, data_checkin, turno, hora_inicio: h[0], hora_fim: h[1], data_previsao_entrega: data_checkin });
    const r1 = await ins(SEG2);
    const { data: v6 } = await sb.from('orcamentos').select('validade').eq('id', o6).single();
    ok('B: horario depois da validade pelo navegador -> aceito e validade empurrada (trigger 082, R-08)', !r1.error && String(v6.validade) === SEG2, `${r1.error?.message} ${JSON.stringify(v6)}`);
    const r2 = await ins(SAB);
    ok('B: sabado (fechado no perfil) pelo navegador -> recusado DIA_FECHADO (trigger 083, QA D16)', !!r2.error && /DIA_FECHADO/.test(r2.error.message), r2.error?.message || 'gravado');
    let sabPassado = somar(hojeTallinn, -1); while (new Date(`${sabPassado}T12:00:00Z`).getUTCDay() !== 6) sabPassado = somar(sabPassado, -1);
    const r3 = await ins(sabPassado);
    ok('B: sabado PASSADO (revisao regrava datas salvas) -> liberado', !r3.error, r3.error?.message);
    const r4 = await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o6, data_checkin: DOM, turno: 'manha', data_previsao_entrega: DOM });
    ok('B: domingo pelo servidor/fixture (service role) -> liberado', !r4.error, r4.error?.message);
    await sb.from('solicitacoes').update({ status: 'em_andamento' }).eq('id', sol6.id);
    const r5 = await ins(SAB, 'manha', ['08:00', '10:00']);
    ok('B: pedido em_andamento (datas salvas regravadas sem validar, e769e31) -> sabado liberado', !r5.error, r5.error?.message);
    await sb.from('solicitacoes').update({ status: 'em_orcamento' }).eq('id', sol6.id);
    // apagar orcamento orfao (R-12): so o recem-criado e sem horario
    const dOrc = await ca.from('orcamentos').delete().eq('id', o6).select('id');
    ok('B: orcamento COM horarios nao pode ser apagado pelo navegador', !dOrc.error && !(dOrc.data || []).length && !!(await sb.from('orcamentos').select('id').eq('id', o6).maybeSingle()).data);
    const { data: orfao } = await ca.from('orcamentos').insert({ solicitacao_id: sol5.id, oficina_id: ofId, valor_total: 10, prazo_dias: 1, tempo_execucao_horas: 1, validade: SEG2 }).select('id').single();
    const rOrf = await ca.from('orcamento_disponibilidade').insert({ orcamento_id: orfao?.id, data_checkin: SAB, turno: 'manha', hora_inicio: '08:00', hora_fim: '10:00', data_previsao_entrega: SAB });
    const dOrf = await ca.from('orcamentos').delete().eq('id', orfao?.id).select('id');
    ok('B: orcamento recem-criado cujo horario foi recusado -> o navegador apaga (R-12)', !!rOrf.error && (dOrf.data || []).length === 1, `${rOrf.error?.message} ${JSON.stringify(dOrf)}`);
    const { data: velho } = await sb.from('orcamentos').insert({ solicitacao_id: sol5.id, oficina_id: ofId, valor_total: 10, prazo_dias: 1, validade: SEG2, status: 'enviado' }).select('id').single();
    await sb.from('orcamentos').update({ created_at: new Date(Date.now() - 3600e3).toISOString() }).eq('id', velho.id);
    const dVelho = await ca.from('orcamentos').delete().eq('id', velho.id).select('id');
    ok('B: orcamento sem horario mas antigo (> 10 min) -> NAO apaga', !(dVelho.data || []).length);
    await sb.from('orcamentos').delete().eq('id', velho.id);
    // itens: o dono apaga num orcamento enviado (revisao), nunca num aceito
    const dIt = await ca.from('orcamento_itens').delete().eq('orcamento_id', o6).select('id');
    ok('B: itens de orcamento enviado: DELETE pelo navegador funciona (politica itens_delete, D4)', (dIt.data || []).length === 1, JSON.stringify(dIt));
    await sb.from('orcamentos').update({ status: 'aceito' }).eq('id', o6);
    await sb.from('orcamento_itens').insert({ orcamento_id: o6, descricao: 'Töö', tipo: 'mao_de_obra', valor_unitario: 80, quantidade: 1, valor_total: 80 });
    const dIt2 = await ca.from('orcamento_itens').delete().eq('orcamento_id', o6).select('id');
    ok('B: itens de orcamento ACEITO: o navegador nao apaga', !(dIt2.data || []).length);
    await sb.from('orcamentos').update({ status: 'recusado' }).eq('id', o6);
  }

  // ---------- D: motorista (site) ----------
  const ctxC = await contexto(390); const pc = await ctxC.newPage();
  await entrar(pc, cli);
  await pc.goto(`${SITE}/ee/et/cliente/orcamentos/${sol4.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  const of4 = await pc.getByTestId('datas-oferecidas').innerText().catch(() => '');
  ok('T: linha antiga (sem horas, tarde) aparece 13:00–17:00 para o motorista', of4.includes('08:00–10:00') && of4.includes('13:00–17:00'), of4);
  await pc.goto(`${SITE}/ee/et/cliente/orcamentos/${sol1.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  const ofer = await pc.getByTestId('datas-oferecidas').innerText().catch(() => '');
  ok('D: motorista ve as 3 janelas (30 min = hora unica)', ofer.includes('08:00–10:00') && ofer.includes('09:30') && !ofer.includes('09:30–') && ofer.includes('13:00–15:00') && !ofer.includes('08:00-12:00'), ofer);
  const orc = pc.locator(`#orc-${o1.id}`);
  await orc.getByText(T('clienteOrcamentoDetalhe.acceptAndSchedule')).click(); await sleep(800);
  const ops = await orc.getByTestId('opcao-janela').allInnerTexts();
  ok('D: cartoes de escolha com a janela + frase "tule valitud aja sees"', JSON.stringify(ops.map((x) => x.trim())) === JSON.stringify(['08:00–10:00', '09:30', '13:00–15:00']) && (await orc.innerText()).includes(T('agendaMudanca.vemNaJanela')), JSON.stringify(ops));
  const tAceite = Date.now();
  await orc.locator('button.w-full.p-4').nth(2).click();
  await orc.getByText(T('clienteOrcamentoDetalhe.confirmAppointment')).click(); await sleep(4000);
  ok('D: tela de confirmacao com quarta 13:00–15:00', (await pc.locator('body').innerText()).includes('13:00–15:00'));
  const { data: ag1 } = await sb.from('agenda').select('id, data_inicio, checkin_ate').eq('solicitacao_id', sol1.id).eq('status', 'agendado').single();
  ok('D: agenda = inicio e fim da janela (fonte unica depois do aceite)', new Date(ag1.data_inicio).toISOString() === tallinn(QUA, '13:00') && new Date(ag1.checkin_ate).toISOString() === tallinn(QUA, '15:00'), JSON.stringify(ag1));
  const em1 = await esperarEmail(cli.email, tAceite - 1000);
  const ics1 = em1 ? icsDe(em1.f) : null;
  ok('D: e-mail do agendamento com a janela e a frase', !!em1 && em1.html.includes('13:00–15:00') && em1.html.includes('Tule selle aja sees'), em1?.f);
  ok('D: .ics DTSTART/DTEND = janela, SEQUENCE 0', !!ics1 && ics1.includes(`UID:agenda-${ag1.id}@bipfix.com`) && ics1.includes(`DTSTART:${icsData(tallinn(QUA, '13:00'))}`) && ics1.includes(`DTEND:${icsData(tallinn(QUA, '15:00'))}`) && /SEQUENCE:0\r\n/.test(ics1));
  const emOf1 = await esperarEmail(dono.email, tAceite - 1000);
  ok('D: e-mail da OFICINA no aceite com o dia e a janela (QA D9)', !!emOf1 && emOf1.html.includes('13:00–15:00'), emOf1?.f);
  const { data: notOf1 } = await sb.from('notificacoes').select('mensagem').eq('profile_id', dono.id).eq('tipo', 'orcamento_aceito').order('created_at', { ascending: false }).limit(1);
  ok('D: aviso da oficina no aceite com o dia e a janela (QA D9)', (notOf1?.[0]?.mensagem || '').includes('13:00–15:00'), JSON.stringify(notOf1));
  ok('D: link do Google Calendar com as duas horas', !!em1 && em1.html.includes(`${icsData(tallinn(QUA, '13:00'))}%2F${icsData(tallinn(QUA, '15:00'))}`));
  await pc.goto(`${SITE}/ee/et/cliente/orcamentos/${sol1.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  ok('D: painel do pedido (agenda) com a janela', (await texto(pc, 'agendamento-chegada')).includes('13:00–15:00') && await visivel(pc, 'vem-na-janela'), await texto(pc, 'agendamento-chegada'));
  await pc.goto(`${SITE}/ee/et/cliente/dashboard`, { waitUntil: 'networkidle' }); await sleep(2500);
  ok('D: dashboard do motorista com a janela', (await pc.locator('body').innerText()).includes('13:00–15:00'));
  // oficina
  await p.goto(`${SITE}/ee/et/oficina/pedidos?aba=respondidos`, { waitUntil: 'networkidle' }); await sleep(2000);
  ok('D: lista de Pedidos da oficina com a janela', (await p.locator('body').innerText()).includes('13:00–15:00'));
  await p.goto(`${SITE}/ee/et/oficina/pedidos/${sol1.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  ok('D: resumo do agendamento (oficina) com a janela', (await texto(p, 'resumo-chegada')).includes('13:00–15:00'), await texto(p, 'resumo-chegada'));
  await p.goto(`${SITE}/ee/et/oficina/hoje?dia=${QUA}&filtro=chegam`, { waitUntil: 'networkidle' }); await sleep(2500);
  ok('D: Hoje (dia da chegada) "Saabub ..., 13:00–15:00"', (await p.locator('body').innerText()).includes('13:00–15:00'));
  const ns = await p.evaluate(async (id) => { const r = await fetch('/api/registrar-no-show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agendaId: id }) }); return { s: r.status, d: await r.json().catch(() => ({})) }; }, ag1.id);
  ok('D: falta antes do fim da janela recusada (JANELA_NAO_ACABOU)', ns.s === 409 && ns.d.codigo === 'JANELA_NAO_ACABOU', JSON.stringify(ns));

  // ---------- M: 077 mudanca de data ("ja combinei") ----------
  await p.goto(`${SITE}/ee/et/oficina/orcamento/${sol1.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  await p.getByTestId('opcao-mudar-data').click(); await sleep(1500);
  await p.getByTestId('pnd-enviar').click(); await sleep(400);
  ok('M: propor sem dia/faixa = vermelho (obrigatorio)', await visivel(p, 'pnd-erro-sem-data'));
  await escolher(p, 'pnd', SEG2, '1000-1200');
  ok('M: mesmo seletor (dia + faixa) na mudanca de data', (await texto(p, 'pnd-linha-0-texto')).includes('10:00–12:00'));
  await p.getByTestId('serve-sim').check(); await p.getByTestId('ja-combinei').check();
  await p.locator('#nd-motivo').fill('Varuosa saabub esmaspäeval');
  const tMud = Date.now();
  await p.getByTestId('pnd-enviar').click(); await sleep(4000);
  const { data: ag2 } = await sb.from('agenda').select('id, data_inicio, checkin_ate').eq('id', ag1.id).single();
  const { data: rv } = await sb.from('orcamento_revisoes').select('nova_hora, nova_hora_fim, novo_turno, checkin_ate_anterior').eq('solicitacao_id', sol1.id).eq('tipo', 'data').order('created_at', { ascending: false }).limit(1).single();
  ok('M: agenda movida inteira (inicio e fim da janela)', new Date(ag2.data_inicio).toISOString() === tallinn(SEG2, '10:00') && new Date(ag2.checkin_ate).toISOString() === tallinn(SEG2, '12:00'), JSON.stringify(ag2));
  ok('M: revisao grava nova_hora/nova_hora_fim e guarda o fim anterior', rv?.nova_hora === '10:00' && rv?.nova_hora_fim === '12:00:00' && rv?.novo_turno === 'manha' && new Date(rv?.checkin_ate_anterior).toISOString() === tallinn(QUA, '15:00'), JSON.stringify(rv));
  const em2 = await esperarEmail(cli.email, tMud - 500, (e) => e.f !== em1?.f);
  const ics2 = em2 ? icsDe(em2.f) : null;
  ok('M: novo e-mail com o mesmo evento, SEQUENCE 1 e a janela nova', !!ics2 && ics2.includes(`UID:agenda-${ag1.id}@bipfix.com`) && /SEQUENCE:1\r\n/.test(ics2) && ics2.includes(`DTSTART:${icsData(tallinn(SEG2, '10:00'))}`) && ics2.includes(`DTEND:${icsData(tallinn(SEG2, '12:00'))}`) && em2.html.includes('10:00–12:00'), em2?.f);
  const { data: chat } = await sb.from('mensagens').select('texto').eq('solicitacao_id', sol1.id).order('created_at', { ascending: false }).limit(3);
  ok('M: chat com o dia e a janela nova', (chat || []).some((m) => m.texto.includes('10:00–12:00')), JSON.stringify(chat));
  const { data: nt } = await sb.from('notificacoes').select('mensagem').eq('profile_id', cli.id).eq('tipo', 'revisao_orcamento').order('created_at', { ascending: false }).limit(1);
  ok('M: aviso ao motorista com a janela nova', (nt?.[0]?.mensagem || '').includes('10:00–12:00'), JSON.stringify(nt));
  await pc.goto(`${SITE}/ee/et/cliente/orcamentos/${sol1.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  const chegada2 = await texto(pc, 'agendamento-chegada');
  ok('M: painel do motorista mostra so a janela nova', chegada2.includes('10:00–12:00') && !chegada2.includes('13:00–15:00'), chegada2);
  await pc.goto(`${SITE}/ee/et/cliente/dashboard`, { waitUntil: 'networkidle' }); await sleep(2500);
  ok('M: dashboard do motorista com a janela nova', (await pc.locator('body').innerText()).includes('10:00–12:00'));
  await p.goto(`${SITE}/ee/et/oficina/pedidos/${sol1.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  ok('M: resumo da oficina com a janela nova', (await texto(p, 'resumo-chegada')).includes('10:00–12:00'), await texto(p, 'resumo-chegada'));
  await p.goto(`${SITE}/ee/et/oficina/pedidos?aba=respondidos`, { waitUntil: 'networkidle' }); await sleep(2000);
  const lista = await p.locator('body').innerText();
  ok('M: lista de Pedidos com a janela nova', lista.includes('10:00–12:00') && !lista.includes('13:00–15:00'));

  // ---------- C: 077 contestar ("nao combinei") e aceitar a proposta mantem a janela REAL (QA D1, D2) ----------
  {
    const tokC0 = await token(cli);
    const { data: rvC } = await sb.from('orcamento_revisoes').select('id').eq('solicitacao_id', sol1.id).eq('tipo', 'data').eq('status', 'aprovada').order('created_at', { ascending: false }).limit(1).single();
    const tCont = Date.now();
    const rc = await post('/api/orcamento-revisao/decidir', tokC0, { revisaoId: rvC.id, decisao: 'contestar' });
    const { data: agC } = await sb.from('agenda').select('data_inicio, checkin_ate').eq('id', ag1.id).single();
    ok('C: contestar volta inicio E fim da janela anterior (qua 13:00–15:00, nao 13–17 - D2)', rc.status === 200 && new Date(agC.data_inicio).toISOString() === tallinn(QUA, '13:00') && new Date(agC.checkin_ate).toISOString() === tallinn(QUA, '15:00'), JSON.stringify({ rc, agC }));
    const emC = await esperarEmail(cli.email, tCont - 500, (e) => e.f !== em2?.f && e.f !== em1?.f);
    const icsC = emC ? icsDe(emC.f) : null;
    ok('C: e-mail/.ics depois de contestar = 13:00–15:00 (DTEND 15:00)', !!icsC && icsC.includes(`DTSTART:${icsData(tallinn(QUA, '13:00'))}`) && icsC.includes(`DTEND:${icsData(tallinn(QUA, '15:00'))}`) && emC.html.includes('13:00–15:00'), emC?.f);
    await pc.goto(`${SITE}/ee/et/cliente/orcamentos/${sol1.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
    ok('C: painel do motorista depois de contestar = 13:00–15:00', (await texto(pc, 'agendamento-chegada')).includes('13:00–15:00'), await texto(pc, 'agendamento-chegada'));
    // a proposta (seg2 10-12) voltou a esperar o motorista: ele aceita
    const tAc = Date.now();
    const ra = await post('/api/orcamento-revisao/decidir', tokC0, { revisaoId: rvC.id, decisao: 'aprovar' });
    const { data: agA } = await sb.from('agenda').select('data_inicio, checkin_ate').eq('id', ag1.id).single();
    ok('C: aceitar a proposta grava a janela inteira (seg2 10:00–12:00, nao 10:00–10:30 - D1)', ra.status === 200 && new Date(agA.data_inicio).toISOString() === tallinn(SEG2, '10:00') && new Date(agA.checkin_ate).toISOString() === tallinn(SEG2, '12:00'), JSON.stringify({ ra, agA }));
    const emA = await esperarEmail(cli.email, tAc - 500, (e) => e.f !== emC?.f);
    const icsA = emA ? icsDe(emA.f) : null;
    ok('C: e-mail/.ics depois de aceitar = 10:00–12:00 (DTEND 12:00)', !!icsA && icsA.includes(`DTSTART:${icsData(tallinn(SEG2, '10:00'))}`) && icsA.includes(`DTEND:${icsData(tallinn(SEG2, '12:00'))}`) && emA.html.includes('10:00–12:00'), emA?.f);
    await pc.goto(`${SITE}/ee/et/cliente/orcamentos/${sol1.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
    ok('C: painel do motorista = 10:00–12:00', (await texto(pc, 'agendamento-chegada')).includes('10:00–12:00'), await texto(pc, 'agendamento-chegada'));
    await p.goto(`${SITE}/ee/et/oficina/pedidos/${sol1.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
    ok('C: resumo da oficina = 10:00–12:00', (await texto(p, 'resumo-chegada')).includes('10:00–12:00'), await texto(p, 'resumo-chegada'));
    // horario da falta segue a janela real: com o inicio 45 min atras (o bug dava fim = inicio + 30) ainda nao pode
    const delta = Date.now() - 45 * 60e3 - Date.parse(agA.data_inicio);
    await sb.from('agenda').update({ data_inicio: new Date(Date.parse(agA.data_inicio) + delta).toISOString(), checkin_ate: new Date(Date.parse(agA.checkin_ate) + delta).toISOString() }).eq('id', ag1.id);
    const nsC = await p.evaluate(async (id) => { const r = await fetch('/api/registrar-no-show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agendaId: id }) }); return { s: r.status, d: await r.json().catch(() => ({})) }; }, ag1.id);
    ok('C: inicio ha 45 min, janela de 2 h -> falta ainda recusada (JANELA_NAO_ACABOU)', nsC.s === 409 && nsC.d.codigo === 'JANELA_NAO_ACABOU', JSON.stringify(nsC));
    await sb.from('agenda').update({ data_inicio: agA.data_inicio, checkin_ate: agA.checkin_ate }).eq('id', ag1.id);
  }

  // ---------- N: 079 novas datas ----------
  const o2 = await orcamentoNoBanco(sol2.id, SEG2, [{ data_checkin: ONTEM, turno: 'manha', hora_inicio: '08:00', hora_fim: '10:00' }]);
  await pc.goto(`${SITE}/ee/et/cliente/orcamentos/${sol2.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  ok('N: datas vencidas -> "pedir novas datas"', await visivel(pc, 'pedir-novas-datas'));
  await pc.getByTestId('abrir-pedir-datas').click(); await sleep(500);
  const chipT = await texto(pc, `chip-${TER}-tarde`);
  const chipM = await texto(pc, `chip-${TER}-manha`);
  ok('N: cada turno mostra a faixa da oficina (almoco pulado)', chipT.includes('13:00–15:00') && chipM.includes('08:00–10:00'), `${chipM} | ${chipT}`);
  ok('N: sabado fechado nao aparece', (await pc.getByTestId(`chip-${SAB}-manha`).count()) === 0);
  await pc.getByTestId(`chip-${TER}-tarde`).click(); await pc.getByTestId(`chip-${TER}-manha`).click();
  await pc.getByTestId('enviar-pedir-datas').click(); await sleep(2500);
  await p.goto(`${SITE}/ee/et/oficina/pedidos/${sol2.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  ok('N: oficina ve as sugestoes com a faixa que vai valer', (await texto(p, 'sugestao-0-texto')).includes('08:00–10:00') && (await texto(p, 'sugestao-1-texto')).includes('13:00–15:00'), `${await texto(p, 'sugestao-0-texto')} | ${await texto(p, 'sugestao-1-texto')}`);
  await p.getByTestId('confirmar-sugestao-1').click(); await sleep(4000);
  const { data: sCli } = await sb.from('orcamento_disponibilidade').select('data_checkin, turno, hora_inicio, hora_fim, origem').eq('orcamento_id', o2).eq('origem', 'cliente');
  const { data: ag3 } = await sb.from('agenda').select('data_inicio, checkin_ate').eq('solicitacao_id', sol2.id).eq('status', 'agendado').maybeSingle();
  ok('N: confirmar grava a faixa (13-15) e agenda com inicio e fim', JSON.stringify(sCli) === JSON.stringify([{ data_checkin: TER, turno: 'tarde', hora_inicio: '13:00:00', hora_fim: '15:00:00', origem: 'cliente' }]) && !!ag3 && new Date(ag3.data_inicio).toISOString() === tallinn(TER, '13:00') && new Date(ag3.checkin_ate).toISOString() === tallinn(TER, '15:00'), JSON.stringify({ sCli, ag3 }));
  // outras datas pelo seletor
  const o3 = await orcamentoNoBanco(sol3.id, TER, [{ data_checkin: ONTEM, turno: 'tarde', hora_inicio: '13:00', hora_fim: '15:00' }]);
  const tokC = await token(cli);
  const pd3 = await post(`/api/orcamento/${o3}/pedir-datas`, tokC, { sugestoes: [] });
  ok('N: pedido de datas sem sugestao (API)', pd3.status === 200, JSON.stringify(pd3));
  await p.goto(`${SITE}/ee/et/oficina/pedidos/${sol3.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  ok('N: "outras datas" comecam vazias', (await p.getByTestId('nd-linha-0').count()) === 0 && (await p.getByTestId('nd-adicionar').count()) === 1);
  await p.getByTestId('nd-enviar').click(); await sleep(400);
  ok('N: enviar sem data = vermelho', await visivel(p, 'nd-erro-sem-data'));
  await escolher(p, 'nd', QUA, '1500-1700');
  ok('N: previsao de entrega = data + prazo', (await p.getByTestId('nd-previsao-0').inputValue()) === somar(QUA, 1));
  await p.getByTestId('nd-enviar').click(); await sleep(3500);
  const { data: s3 } = await sb.from('orcamento_disponibilidade').select('data_checkin, turno, hora_inicio, hora_fim').eq('orcamento_id', o3).eq('origem', 'oficina').eq('data_checkin', QUA);
  const { data: v3 } = await sb.from('orcamentos').select('validade').eq('id', o3).single();
  ok('N: outras datas gravadas com a janela; validade empurrada ate a data', JSON.stringify(s3) === JSON.stringify([{ data_checkin: QUA, turno: 'tarde', hora_inicio: '15:00:00', hora_fim: '17:00:00' }]) && String(v3.validade) >= QUA, JSON.stringify({ s3, v3 }));

  // ---------- I: idiomas ----------
  for (const [l, pre] of [['et', '/ee/et'], ['ru', '/ee/ru'], ['en', '/ee/en'], ['it', '/it/it'], ['pt', '/br/pt'], ['pt-PT', '/pt/pt']]) {
    const L = tr(l);
    await pd.goto(`${SITE}${pre}/oficina/orcamento/${sol5.id}`, { waitUntil: 'networkidle' }); await sleep(1800);
    const corpo = await pd.locator('body').innerText();
    await pd.getByTestId('ck-adicionar').click(); await sleep(300);
    await pd.getByTestId(`ck-dia-${realce}`).click(); await sleep(250);
    const folha = await texto(pd, 'ck-folha');
    ok(`I(${l}): seletor e cartao traduzidos, sem chave faltando`, corpo.includes(L('seletorCheckin.adicionar')) && folha.includes(L('seletorCheckin.tituloFolha')) && folha.includes(L('seletorCheckin.outroHorario')) && !/\?\?[a-zA-Z]/.test(corpo + folha) && !/[a-z]+\.[a-z]+[A-Z][a-zA-Z]+/.test(folha.replace(/\s/g, ' ').slice(0, 0)), `${corpo.slice(0, 80)} | ${folha.slice(0, 120)}`);
    await pd.keyboard.press('Escape'); await sleep(200);
    await pd.getByTestId('info-validade').click(); await sleep(150);
    ok(`I(${l}): (i) da validade traduzido`, (await texto(pd, 'info-validade-texto')).includes(L('oficinaEnviarOrcamento.info_validadeOrcamento').slice(0, 30)));
  }
} catch (e) {
  falhas++;
  console.log('FALHA excecao:', e?.stack || e);
} finally {
  await browser.close();
  // limpeza (pedidos, oficina e contas deste teste)
  for (const s of sols) {
    const { data: os } = await sb.from('orcamentos').select('id').eq('solicitacao_id', s);
    await sb.from('orcamento_pedido_datas').delete().eq('solicitacao_id', s);
    await sb.from('orcamento_revisoes').delete().eq('solicitacao_id', s);
    const { data: ags } = await sb.from('agenda').select('id').eq('solicitacao_id', s);
    for (const a of ags || []) { await sb.from('agenda_historico').delete().eq('agenda_id', a.id); await sb.from('manutencao_etapas').delete().eq('agenda_id', a.id); }
    await sb.from('agenda').delete().eq('solicitacao_id', s);
    for (const o of os || []) { await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await sb.from('orcamento_itens').delete().eq('orcamento_id', o.id); }
    await sb.from('mensagens').delete().eq('solicitacao_id', s);
    await sb.from('orcamentos').delete().eq('solicitacao_id', s); await sb.from('pedido_vistos').delete().eq('solicitacao_id', s);
    const { error } = await sb.from('solicitacoes').delete().eq('id', s);
    if (error) console.log('limpeza: pedido', s, error.message);
  }
  if (ofId) { await sb.from('comissao_config').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id).catch(() => {}); }
  console.log(`\n${oks} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
}
