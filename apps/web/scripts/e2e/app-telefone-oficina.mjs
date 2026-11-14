// APP (versao web, tela de celular): telefone do motorista para a oficina (dono 13/11; 081)
//  1 pedido aberto: "enviar meu numero" no orcamento; vazio -> aviso; envia -> registrado
//    para aquela oficina (telefone_compartilhado) + mensagem na conversa; perfil intocado
//  2 orcamento aceito sem telefone no perfil: aviso "adicione o seu telefone" -> grava no perfil
//  3 com telefone: mostra o numero que a oficina ve
// Pre-requisito: app web em :8090 (servir-app-web.mjs) e site em :3100.
//   node app-telefone-oficina.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const APP = 'http://localhost:8090';
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados';
const MOB = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/site/apps/mobile/i18n/locales';
const txt = (loc) => { const j = JSON.parse(fs.readFileSync(`${MOB}/${loc}.json`, 'utf8')); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], j) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
const ET = txt('et');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 260) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const oficinas = []; const sols = [];
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const erros = [];
const semCortes = async (page, nome) => {
  const t = await page.innerText('body');
  ok(`${nome}: sem chave crua`, !/\b(telefoneOficina|pedidoSemConta)\.[a-zA-Z]+|\?\?[a-z]/.test(t));
  ok(`${nome}: sem rolagem lateral`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  return t;
};
try {
  const senha = `App${tag}Senha9`;
  const criar = async (email, perfil) => {
    const { data: u } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
    contas.push(u.user.id);
    await sb.from('profiles').insert({ id: u.user.id, email, ...perfil });
    return u.user.id;
  };
  const cli = await criar(`app-tel-${tag}@example.test`, { tipo: 'cliente', nome: 'Telefon App', idioma: 'et' });
  const novaOficina = async (n) => {
    const p = await criar(`app-tel-of${n}-${tag}@example.test`, { tipo: 'oficina', nome: `Of ${n}`, idioma: 'et' });
    const { data: of } = await sb.from('oficinas').insert({ profile_id: p, nome_fantasia: `Töökoda ${n} ${tag}`, endereco: 'x', cidade: 'Tallinn', estado: '-', cep: '1', pais: 'EE', latitude: 59.45, longitude: 24.74, ativa: true }).select('id, nome_fantasia').single();
    oficinas.push(of.id); return of;
  };
  const of1 = await novaOficina(1); const of2 = await novaOficina(2);
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Yaris', fipe_ano: '2015' }).select('id').single();
  const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli, veiculo_id: v.id, tipo: 'mecanica', descricao: `Telefon ${tag}`, urgencia: 'media', latitude: 59.44, longitude: 24.74, endereco: 'Tallinn', status: 'em_orcamento' }).select('id').single();
  sols.push(s.id);
  const d1 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const orc = async (of) => {
    const { data: o } = await sb.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: of.id, valor_total: 95, prazo_dias: 1, status: 'enviado', validade: '2030-01-01' }).select('id').single();
    await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_checkin: d1, turno: 'manha', data_previsao_entrega: d1 });
    return o;
  };
  const o1 = await orc(of1); const o2 = await orc(of2);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'et-EE' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erros.push(String(e.message)));
  await page.goto(APP, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.getByLabel(ET('auth.email'), { exact: true }).locator('visible=true').first().fill(`app-tel-${tag}@example.test`);
  await page.getByLabel(ET('auth.senha'), { exact: true }).locator('visible=true').first().fill(senha);
  await page.getByText(ET('auth.entrar'), { exact: true }).locator('visible=true').last().click();
  await page.waitForTimeout(4000);

  // 1 enviar o numero a uma oficina
  await page.goto(`${APP}/solicitacao/${s.id}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  const botoes = page.getByTestId('compartilhar-telefone').locator('visible=true');
  ok('1 botao "enviar meu numero" nos dois orcamentos abertos', (await botoes.count()) === 2, String(await botoes.count()));
  await botoes.first().click();
  await page.getByTestId('compartilhar-telefone-painel').locator('visible=true').first().waitFor({ timeout: 8000 });
  let t = await semCortes(page, '1 painel');
  ok('1 painel explica que so aquela oficina ve', t.includes(ET('telefoneOficina.compartilharTexto', { oficina: '' }).split(' ').slice(0, 3).join(' ')) || /ainult|only/i.test(t));
  await page.getByTestId('compartilhar-telefone-enviar').locator('visible=true').first().click();
  await page.waitForTimeout(500);
  ok('1 vazio -> aviso numero invalido', (await page.innerText('body')).includes(ET('telefoneOficina.numeroInvalido')));
  await page.getByLabel(ET('pedidoSemConta.telefone'), { exact: true }).locator('visible=true').last().fill('5321 0987');
  await page.screenshot({ path: `${OUT}/app_telefone_painel.png`, fullPage: true });
  await page.getByTestId('compartilhar-telefone-enviar').locator('visible=true').first().click();
  await page.getByTestId('telefone-compartilhado').locator('visible=true').first().waitFor({ timeout: 10000 }).catch(() => {});
  const reg = (await sb.from('telefone_compartilhado').select('oficina_id, telefone').eq('solicitacao_id', s.id)).data || [];
  const msgs = (await sb.from('mensagens').select('oficina_id, texto').eq('solicitacao_id', s.id)).data || [];
  ok('1 registrado para UMA oficina e mensagem na conversa dela', reg.length === 1 && /5321 0987/.test(reg[0].telefone) && msgs.length === 1 && msgs[0].oficina_id === reg[0].oficina_id && /5321 0987/.test(msgs[0].texto), JSON.stringify({ reg, msgs }));
  ok('1 perfil continua sem telefone', (await sb.from('profiles').select('telefone').eq('id', cli).single()).data.telefone === null);
  await page.screenshot({ path: `${OUT}/app_telefone_enviado.png`, fullPage: true });

  // 2 aceito sem telefone: aviso e grava no perfil
  await sb.from('orcamentos').update({ status: 'aceito' }).eq('id', o1.id);
  await sb.from('orcamentos').update({ status: 'recusado' }).eq('id', o2.id);
  await page.goto(`${APP}/solicitacao/${s.id}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  const aviso = page.getByTestId('telefone-depois-aceite').locator('visible=true');
  ok('2 aceito sem telefone: aviso para adicionar', (await aviso.count()) === 1);
  t = await semCortes(page, '2 aceite');
  ok('2 aviso cita a oficina e tem o cadeado', t.includes(ET('telefoneOficina.avisoTexto', { oficina: of1.nome_fantasia })) && t.includes(ET('telefoneOficina.privacidade')));
  ok('2 sem "enviar meu numero" depois do aceite', (await page.getByTestId('compartilhar-telefone').locator('visible=true').count()) === 0);
  await page.getByLabel(ET('pedidoSemConta.telefone'), { exact: true }).locator('visible=true').last().fill('5444 3322');
  await page.screenshot({ path: `${OUT}/app_telefone_aceite.png`, fullPage: true });
  await page.getByTestId('telefone-aceite-salvar').locator('visible=true').first().click();
  await page.getByTestId('telefone-salvo').locator('visible=true').first().waitFor({ timeout: 10000 }).catch(() => {});
  const tel = (await sb.from('profiles').select('telefone').eq('id', cli).single()).data.telefone;
  ok('2 telefone gravado no perfil', /5444 ?3322/.test(tel || ''), tel);

  // 3 com telefone: mostra o numero que a oficina ve
  await page.goto(`${APP}/solicitacao/${s.id}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  ok('3 com telefone: "a oficina ve o seu numero"', (await page.getByTestId('telefone-oficina-ve').locator('visible=true').count()) === 1);
  await ctx.close();
  ok('sem erro de JavaScript', erros.length === 0, erros.join(' | '));
} catch (e) {
  falhas++; console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  for (const id of sols) { await sb.from('notificacoes').delete().eq('dados->>solicitacao_id', id); await sb.from('mensagens').delete().eq('solicitacao_id', id); const { data: os } = await sb.from('orcamentos').select('id').eq('solicitacao_id', id); for (const o of os || []) await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await sb.from('orcamentos').delete().eq('solicitacao_id', id); await sb.from('solicitacoes').delete().eq('id', id); }
  for (const id of oficinas) await sb.from('oficinas').delete().eq('id', id);
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id).catch(() => {}); }
  console.log(`\n${falhas ? 'FALHAS: ' + falhas : 'TUDO OK'}`);
  process.exit(falhas ? 1 : 0);
}
