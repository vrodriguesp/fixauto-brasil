// App (web): cartao da garantia abre o pedido (historico) e dali a conversa com a oficina
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js'); const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const MOB = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/mobile/i18n/locales';
const tx = (l) => { const j = JSON.parse(fs.readFileSync(`${MOB}/${l}.json`, 'utf8')); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], j)).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? ''); };
const IT = tx('it'); const PT = tx('pt');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tag = crypto.randomBytes(3).toString('hex');
let falhas = 0; const ok = (n, c, x = '') => { if (!c) falhas++; console.log(c ? 'ok  ' : 'FALHA', n, c ? '' : x); };
const conta = async (tipo) => { const email = `app-gar-${tipo}-${tag}@example.test`; const senha = `Ga${tag}Senha9`; const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true }); await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `Teste ${tipo}`, email, idioma: 'it' }); return { id: data.user.id, email, senha }; };
const cli = await conta('cliente'); const dono = await conta('oficina');
const { data: of } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `Officina Garanzia ${tag}`, endereco: 'Via Roma, 1', cidade: 'Milano', estado: 'MI', cep: '20121', pais: 'IT', latitude: 45.46, longitude: 9.19, ativa: true, raio_atendimento_km: 50 }).select('id').single();
const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Fiat', fipe_modelo: 'Panda', fipe_ano: '2020' }).select('id').single();
const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'Cambio distribuzione', urgencia: 'media', latitude: 45.46, longitude: 9.19, endereco: 'Milano' }).select('id').single();
await sb.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: of.id, valor_total: 1800, prazo_dias: 3, status: 'aceito', validade: '2030-01-01', garantia_dias: 180 });
const ontem = new Date(Date.now() - 86400000).toISOString();
const { error: eAg } = await sb.from('agenda').insert({ oficina_id: of.id, solicitacao_id: s.id, titulo: 'Fiat Panda', data_inicio: new Date(Date.now() - 4 * 86400000).toISOString(), data_fim: ontem, tipo: 'plataforma', status: 'concluido' });
if (eAg) console.log('agenda:', eAg.message);
await sb.from('solicitacoes').update({ status: 'concluida' }).eq('id', s.id);
const b = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
try {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'it-IT' });
  const p = await c.newPage(); const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('http://localhost:8090', { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  const T = (await p.innerText('body')).includes(IT('auth.entrar')) ? IT : PT;
  await p.getByLabel(T('auth.email'), { exact: true }).locator('visible=true').first().fill(cli.email);
  await p.getByLabel(T('auth.senha'), { exact: true }).locator('visible=true').first().fill(cli.senha);
  await p.getByText(T('auth.entrar'), { exact: true }).locator('visible=true').last().click(); await p.waitForTimeout(5000);
  const cartao = p.getByText(IT('garantia.verServico'), { exact: false }).locator('visible=true').first();
  ok('1 cartao da garantia na tela inicial com "ver servico"', (await cartao.count()) > 0, (await p.innerText('body')).slice(0, 300));
  await cartao.click(); await p.waitForTimeout(3500);
  const tela = await p.innerText('body');
  ok('2 toque no cartao abre o pedido da garantia', p.url().includes(`/solicitacao/${s.id}`), p.url());
  ok('3 pedido mostra a garantia, o orcamento escolhido e a oficina', tela.includes(IT('garantia.desteServico')) && tela.includes(IT('orcamentos.escolhido')) && tela.includes(`Officina Garanzia ${tag}`), tela.slice(0, 400));
  await p.getByText(IT('garantia.falarComOficina'), { exact: false }).locator('visible=true').first().click(); await p.waitForTimeout(3500);
  ok('4 botao abre a conversa com a oficina', p.url().includes(`/conversa/${s.id}`) && p.url().includes(of.id), p.url());
  ok('5 conversa aberta (nao encerrada) durante a garantia', !(await p.innerText('body')).includes(IT('garantia.conversaEncerrada')));
  const campo = p.locator('textarea, input[type=text]').locator('visible=true').last();
  await campo.fill(`Rumore dopo la riparazione ${tag}`); await campo.press('Enter'); await p.waitForTimeout(800);
  const enviar = p.getByLabel(IT('mensagens.enviar'), { exact: false }).locator('visible=true');
  if (await enviar.count()) await enviar.first().click().catch(() => {});
  await p.waitForTimeout(3000);
  const { data: m } = await sb.from('mensagens').select('oficina_id, remetente_id').eq('solicitacao_id', s.id).ilike('texto', `%${tag}%`);
  ok('6 mensagem chega para a oficina da garantia', (m || []).length === 1 && m[0].oficina_id === of.id && m[0].remetente_id === cli.id, JSON.stringify(m));
  await p.screenshot({ path: 'app-garantia.png' });
  ok('7 sem erros de JavaScript', !erros.length, erros.slice(0, 3).join(' | '));
} finally {
  await b.close();
  for (const t of ['mensagens', 'agenda', 'orcamentos', 'notificacoes']) await sb.from(t).delete().eq(t === 'notificacoes' ? 'profile_id' : 'solicitacao_id', t === 'notificacoes' ? cli.id : s.id);
  await sb.from('solicitacoes').delete().eq('id', s.id); await sb.from('veiculos').delete().eq('id', v.id);
  await sb.from('agenda').delete().eq('oficina_id', of.id); await sb.from('comissao_config').delete().eq('oficina_id', of.id); await sb.from('oficinas').delete().eq('id', of.id);
  for (const u of [cli, dono]) { await sb.from('notificacoes').delete().eq('profile_id', u.id); await sb.from('profiles').delete().eq('id', u.id); await sb.auth.admin.deleteUser(u.id); }
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
