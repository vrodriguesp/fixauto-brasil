// Bateria do APP NATIVO no emulador Android (Expo Go), tocando na tela:
// 2 tamanhos de celular x 6 idiomas (idioma do APARELHO + escolha no app).
// Por idioma: entrada, acidente (abre, preenche, sugestao de endereco),
// login, inicio, novo pedido (cria), pedido com orcamento (aceita com data),
// conversa (manda mensagem), veiculos (cadastra), perfil, sair.
// Foto de cada tela em ./nativo-fotos. Contas de teste apagadas no fim.
//   node nativo-bateria.mjs <.env.local> [tamanhos=pequeno,grande] [idiomas=pt,pt-PT,en,et,it,ru]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ADB = 'C:/Android/platform-tools/adb.exe';
const MOB = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/mobile/i18n/locales';
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'nativo-fotos');
fs.mkdirSync(DIR, { recursive: true });
const TAMANHOS = { pequeno: ['720x1280', '320'], grande: ['1080x2400', '420'] };
const tamanhos = (process.argv[3] || 'pequeno,grande').split(',');
const idiomas = (process.argv[4] || 'pt,pt-PT,en,et,it,ru').split(',');
const LOCALE_APARELHO = { pt: 'pt-BR', 'pt-PT': 'pt-PT', en: 'en-GB', et: 'et-EE', it: 'it-IT', ru: 'ru-RU' };
const NOME_IDIOMA = { pt: 'Português (Brasil)', 'pt-PT': 'Português (Portugal)', en: 'English', et: 'Eesti', it: 'Italiano', ru: 'Русский' };

const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', maxBuffer: 50e6 });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (loc) => { const j = JSON.parse(fs.readFileSync(`${MOB}/${loc}.json`, 'utf8')); return (k) => String(k.split('.').reduce((o, p) => o?.[p], j) ?? `??${k}`); };

function nos() {
  for (let i = 0; i < 3; i++) {
    try {
      adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
      const xml = adb('exec-out', 'cat', '/sdcard/ui.xml');
      const r = [];
      for (const m of xml.matchAll(/<node [^>]*?text="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)) {
        r.push({ texto: m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"), desc: m[2], x1: +m[3], y1: +m[4], x2: +m[5], y2: +m[6] });
      }
      return r;
    } catch { /* dump falha as vezes durante animacao */ }
  }
  return [];
}
const textos = () => nos().map((n) => n.texto || n.desc).filter(Boolean);
const tem = (alvo) => textos().some((t) => (alvo instanceof RegExp ? alvo.test(t) : t.includes(alvo)));
async function aparece(alvo, ms = 15000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (tem(alvo)) return true; await espera(800); }
  return false;
}
// procura descendo a tela (itens abaixo da dobra)
async function abaixo(alvo, vezes = 5) {
  for (let i = 0; i <= vezes; i++) { if (tem(alvo)) return true; await rolar(); }
  return false;
}
async function tocar(alvo, { ultimo = false, esquerda = false } = {}) {
  const casa = (v) => (alvo instanceof RegExp ? alvo.test(v) : v === alvo);
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const todos = nos();
    const porDesc = todos.filter((n) => n.desc && casa(n.desc));
    const lista = porDesc.length ? porDesc : todos.filter((n) => casa(n.texto));
    if (lista.length) {
      const n = ultimo ? lista[lista.length - 1] : lista[0];
      // esquerda: evita o botao flutuante de ferramentas do Expo Go (canto superior direito)
      const x = esquerda ? n.x1 + 12 : (n.x1 + n.x2) >> 1;
      adb('shell', 'input', 'tap', String(x), String((n.y1 + n.y2) >> 1));
      await espera(1300);
      return;
    }
    await rolar(); // pode estar abaixo da dobra
  }
  throw new Error(`nao achei: ${alvo}`);
}
async function fecharTeclado() {
  if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await espera(700); }
}
async function digitar(rotulo, texto) {
  await tocar(rotulo);
  adb('shell', 'input', 'text', texto.replace(/ /g, '%s').replace(/([()&;|<>'"$`\\])/g, '\\$1'));
  await espera(500);
  await fecharTeclado();
}
async function rolar(cima = false) {
  const [w, h] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)\s*$/m).slice(1).map(Number);
  const x = String(w >> 1);
  if (cima) adb('shell', 'input', 'swipe', x, String(h * 0.3 | 0), x, String(h * 0.8 | 0), '300');
  else adb('shell', 'input', 'swipe', x, String(h * 0.8 | 0), x, String(h * 0.3 | 0), '300');
  await espera(900);
}
const voltar = async () => { adb('shell', 'input', 'keyevent', '4'); await espera(1400); };
async function permissoes() {
  // dialogos do sistema (localizacao etc.)
  for (let i = 0; i < 2; i++) {
    const t = textos();
    const b = t.find((x) => /^(While using the app|Only this time|Allow|ALLOW)$/i.test(x));
    if (!b) return;
    await tocar(b); await espera(1500);
  }
}
async function abrirApp() {
  adb('shell', 'am', 'force-stop', 'host.exp.exponent');
  await espera(1200);
  adb('reverse', 'tcp:8081', 'tcp:8081');
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'exp://127.0.0.1:8081', 'host.exp.exponent');
  await aparece(/BipFix|Sign in|Entrar|Logi|Accedi|Войти|Iniciar/, 60000);
  await espera(2500);
  // apresentacao do menu de desenvolvedor do Expo Go (aparece depois de limpar os dados)
  for (let i = 0; i < 3 && tem(/This is the developer menu|developer menu/); i++) {
    const b = textos().find((x) => /^(Continue|Close|Got it|OK)$/i.test(x));
    if (b) await tocar(b); else { adb('shell', 'input', 'keyevent', '4'); await espera(1200); }
  }
}

const resultado = []; let atual = '';
const ok = (nome, cond, extra = '') => { resultado.push({ caso: `${atual} ${nome}`, ok: !!cond }); console.log(`${cond ? 'ok  ' : 'FALHA'} ${atual} ${nome}${extra ? ' - ' + String(extra).slice(0, 120) : ''}`); };
async function tela(nome) {
  await espera(1500);
  await permissoes();
  const erro = tem(/Render Error|Maximum update depth|Something went wrong|Uncaught|TypeError|undefined is not|is not a function|\?\?[a-z]+\./);
  const crua = textos().find((t) => /^[a-z]+[A-Z]?\w*\.[a-z]\w+$/.test(t) && !/\.(com|ee|br|it|ru|pt)$/.test(t));
  const buf = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 50e6 });
  fs.writeFileSync(path.join(DIR, `${atual.replace(/[^\w-]+/g, '_')}_${nome}.png`), buf);
  ok(`${nome}: sem erro`, !erro && !crua, erro ? textos().slice(0, 4).join(' | ') : crua || '');
}

// ---------- dados de teste (uma conta por idioma)
const tag = crypto.randomBytes(3).toString('hex');
const limpar = { contas: [], sols: [], oficinas: [] };
async function prepararConta(loc) {
  const email = `nat-${loc.toLowerCase()}-${tag}@example.test`; const senha = `Nat${tag}Senha9`;
  const { data: u } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  limpar.contas.push(u.user.id);
  await sb.from('profiles').insert({ id: u.user.id, tipo: 'cliente', nome: `NATIVO ${loc}`, email, idioma: loc, termos_aceitos_em: new Date().toISOString(), termos_versao: '2026-09-30' });
  const { data: v } = await sb.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2019' }).select('id').single();
  const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: u.user.id, veiculo_id: v.id, tipo: 'mecanica', descricao: `Orcamento ${loc}`, urgencia: 'media', latitude: 59.43, longitude: 24.75, endereco: 'Tallinn' }).select('id').single();
  limpar.sols.push(s.id);
  const { data: o } = await sb.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: limpar.oficinas[0], valor_total: 120, prazo_dias: 2, status: 'enviado', validade: '2030-01-01' }).select('id').single();
  const d1 = new Date(Date.now() + 86400000).toISOString().slice(0, 10), d2 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_checkin: d1, turno: 'manha', data_previsao_entrega: d2 });
  return { email, senha, id: u.user.id, sol: s.id, orc: o.id };
}

try {
  const emailO = `nat-ofi-${tag}@example.test`;
  const { data: uo } = await sb.auth.admin.createUser({ email: emailO, password: `Of${tag}Senha9`, email_confirm: true });
  limpar.contas.push(uo.user.id);
  await sb.from('profiles').insert({ id: uo.user.id, tipo: 'oficina', nome: 'NAT OFI', email: emailO, idioma: 'et' });
  const { data: of } = await sb.from('oficinas').insert({ profile_id: uo.user.id, nome_fantasia: 'NATIVE TEST SHOP', endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '1', pais: 'EE', latitude: 59.43, longitude: 24.75, ativa: true, especialidades: ['mecanica'] }).select('id').single();
  limpar.oficinas.push(of.id);
  try { adb('root'); } catch { /* reinicia o adbd */ }
  await espera(4000);
  adb('wait-for-device');
  for (let i = 0; i < 30 && adb('shell', 'getprop', 'sys.boot_completed').trim() !== '1'; i++) await espera(2000);
  adb('emu', 'geo', 'fix', '24.745', '59.437');

  for (const tam of tamanhos) {
    adb('shell', 'wm', 'size', TAMANHOS[tam][0]);
    adb('shell', 'wm', 'density', TAMANHOS[tam][1]);
    for (const loc of idiomas) {
      atual = `[${tam}/${loc}]`;
      const t = T(loc);
      const c = await prepararConta(loc);
      // idioma do APARELHO; app limpo (sem escolha salva) para conferir a deteccao
      adb('shell', 'pm', 'clear', 'host.exp.exponent');
      await espera(1500);
      // idioma do aparelho para o app (Android 13+: idioma por app)
      adb('shell', 'cmd', 'locale', 'set-app-locales', 'host.exp.exponent', '--locales', LOCALE_APARELHO[loc]);
      adb('shell', 'pm', 'grant', 'host.exp.exponent', 'android.permission.ACCESS_FINE_LOCATION');
      await abrirApp();
      ok('entrada no idioma do aparelho', await aparece(t('auth.slogan'), 20000), textos().slice(0, 5).join(' | '));
      await tela('entrada');

      // acidente: abre e preenche (sem enviar - limite de 3/h sem conta)
      await tocar(t('emergencia.titulo'));
      await aparece(t('emergencia.fotoTitulo'));
      await tela('acidente');
      await tocar(t('emergencia.optionOutroCausouLabel'));
      await tocar(t('seguro.opcao_seguro_terceiro'));
      ok('acidente: dica do seguro', await abaixo(loc === 'pt' ? t('seguro.dica_seguro_terceiro_br').slice(0, 25) : t('seguro.dica_seguro_terceiro_ee').slice(0, 25)));
      await tocar(t('emergencia.localTitulo'));
      adb('shell', 'input', 'text', 'Parnu%smnt%s10');
      await espera(1500);
      ok('acidente: sugestao de endereco acima do teclado', await aparece(/mnt 10,/, 12000));
      await tela('acidente-preenchido');
      await voltar(); await fecharTeclado();
      if (!(await aparece(t('auth.loginTitulo'), 5000))) await voltar();

      // login
      await digitar(t('auth.email'), c.email);
      await digitar(t('auth.senha'), c.senha);
      await tocar(t('auth.entrar'), { ultimo: true });
      ok('login', await aparece(t('dashboard.novaSolicitacaoBotao'), 25000));
      await tela('inicio');

      // novo pedido
      await tocar(t('dashboard.novaSolicitacaoBotao'));
      await aparece(t('novaSolicitacao.passoVeiculo'));
      await tela('novo-pedido');
      await tocar(/Toyota Corolla/);
      await tocar(new RegExp(t('constants.tiposServico.mecanica')));
      await digitar(t('novaSolicitacao.passoSintomas'), `Teste nativo ${loc}`);
      await tocar(t('novaSolicitacao.passoLocal'));
      adb('shell', 'input', 'text', 'Viru%svaljak%s4');
      ok('pedido: sugestao de endereco acima do teclado', await aparece(/Tallinn/, 12000));
      await tocar(/Tallinn/);
      await fecharTeclado();
      await tocar(t('novaSolicitacao.enviarSolicitacao'));
      ok('novo pedido enviado', await aparece(t('novaSolicitacao.sucessoTitulo'), 20000));
      const { data: sols } = await sb.from('solicitacoes').select('id').eq('cliente_id', c.id);
      ok('novo pedido no banco', (sols || []).length === 2);
      (sols || []).forEach((s) => { if (!limpar.sols.includes(s.id)) limpar.sols.push(s.id); });
      await tela('pedido-enviado');
      await tocar(t('tabs.inicio'));

      // pedido com orcamento: escolhe data e aceita
      await tocar(new RegExp(`Orcamento ${loc}`));
      ok('orcamento aparece', await aparece(/120/, 15000));
      await tela('orcamento');
      await tocar(new RegExp(t('orcamentos.turno_manha')));
      await tocar(t('orcamentos.aceitar'));
      await espera(3000);
      const { data: o2 } = await sb.from('orcamentos').select('status').eq('id', c.orc).single();
      ok('orcamento aceito', o2.status === 'aceito', o2.status);
      await tela('orcamento-aceito');

      // conversa
      await tocar(t('mensagens.titulo'));
      await digitar(t('mensagens.digiteMensagem'), `Ola ${loc}`);
      await tocar(t('mensagens.enviar'));
      await espera(2500);
      const { data: ms } = await sb.from('mensagens').select('id').eq('solicitacao_id', c.sol);
      ok('mensagem enviada', (ms || []).length >= 1);
      await tela('conversa');
      await voltar(); await voltar();

      // veiculos
      await tocar(t('tabs.veiculos'));
      await tela('veiculos');
      await tocar(t('veiculos.adicionar'), { ultimo: true });
      await aparece(t('veiculos.marca'));
      await tocar(t('veiculos.marca'));
      await digitar(t('veiculos.marca'), 'Skoda');
      await tocar(/^Škoda$/, { ultimo: true });
      await tocar(t('veiculos.modelo'));
      await digitar(t('veiculos.modelo'), 'Octavia');
      await tocar(/^Octavia/, { ultimo: true });
      await digitar(t('veiculos.ano'), '2018');
      await tela('novo-veiculo');
      await tocar(t('common.salvar'));
      await espera(3000);
      const { data: vs } = await sb.from('veiculos').select('fipe_marca').eq('profile_id', c.id);
      ok('veiculo cadastrado', (vs || []).some((v) => /koda/.test(v.fipe_marca)), JSON.stringify(vs));

      // pedidos, mensagens, perfil
      if (!tem(t('tabs.solicitacoes'))) await voltar();
      await tocar(t('tabs.solicitacoes')); await tela('aba-pedidos');
      await tocar(t('tabs.mensagens')); await tela('aba-mensagens');
      await tocar(t('tabs.perfil')); await tela('perfil');
      ok('perfil com os 6 idiomas', Object.values(NOME_IDIOMA).every((n) => tem(n)));
      await tocar(t('perfil.sair'));
      await tocar(new RegExp(`^${t('perfil.sair')}$`, 'i'), { ultimo: true });
      ok('saiu', await aparece(t('auth.loginTitulo'), 15000));
    }
  }
} catch (e) {
  ok('parou no meio', false, e.message);
  try { fs.writeFileSync(path.join(DIR, `${atual.replace(/[^\w-]+/g, '_')}_PAROU.png`), execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 50e6 })); } catch {}
  console.log('tela:', textos().slice(0, 10).join(' | '));
} finally {
  for (const s of limpar.sols) {
    const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', s);
    for (const o of orcs || []) { await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await sb.from('agenda_eventos').delete().eq('orcamento_id', o.id); }
    for (const tb of ['orcamentos', 'mensagens', 'solicitacao_fotos']) await sb.from(tb).delete().eq('solicitacao_id', s);
    await sb.from('solicitacoes').delete().eq('id', s);
  }
  for (const o of limpar.oficinas) await sb.from('oficinas').delete().eq('id', o);
  for (const id of limpar.contas) {
    const { data: rest } = await sb.from('solicitacoes').select('id').eq('cliente_id', id);
    for (const s of rest || []) { await sb.from('orcamentos').delete().eq('solicitacao_id', s.id); await sb.from('solicitacoes').delete().eq('id', s.id); }
    for (const [tb, col] of [['veiculos', 'profile_id'], ['notificacoes', 'profile_id'], ['mensagens', 'remetente_id']]) await sb.from(tb).delete().eq(col, id);
    await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id);
  }
  try { adb('shell', 'wm', 'size', 'reset'); adb('shell', 'wm', 'density', 'reset'); adb('shell', 'cmd', 'locale', 'set-app-locales', 'host.exp.exponent', '--locales', 'en-US'); } catch {}
  const f = resultado.filter((r) => !r.ok);
  console.log(`\n${resultado.length - f.length}/${resultado.length} ok`);
  if (f.length) console.log('FALHAS:\n' + f.map((r) => ' - ' + r.caso).join('\n'));
}
