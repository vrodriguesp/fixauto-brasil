// App (web): sugestoes do Fable para o app do motorista (auditoria 10/10, B3/C1/C2)
//  1 Inicio: cartao de acao com o pedido mais urgente (3 orcamentos para comparar) acima dos botoes
//  2 lista com os outros pedidos e o selo da situacao (carro na oficina / esperando orcamentos)
//  3 pedido: numero, cabecalho de situacao, resumo "3 orcamentos de X a Y", ordenacao e marcadores
//  4 "Escolher esta oficina" cheio; "Nao me interessa" so como link
//  5 perfil: codigo de cliente; pedido novo: o problema antes do carro
// uso: node app-situacao.mjs <.env.local>  (com o app web servido em :8090 - servir-app-web.mjs)
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js'); const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const MOB = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/mobile/i18n/locales';
const tx = (l) => { const j = JSON.parse(fs.readFileSync(`${MOB}/${l}.json`, 'utf8')); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], j)).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? ''); };
const IT = tx('it'); const PT = tx('pt');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tag = crypto.randomBytes(3).toString('hex');
let falhas = 0; const ok = (n, c, x = '') => { if (!c) falhas++; console.log(c ? 'ok  ' : 'FALHA', n, c ? '' : String(x).replace(/\s+/g, ' ').slice(0, 300)); };
const contas = [];
const conta = async (tipo) => { const email = `app-sit-${tipo}${contas.length}-${tag}@example.test`; const senha = `Si${tag}Senha9`; const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true }); await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `Teste ${tipo}`, email, idioma: 'it' }); contas.push(data.user.id); return { id: data.user.id, email, senha }; };
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const cli = await conta('cliente');
const ofs = [];
// 3 oficinas: barata sem nota, media com nota 4.9, cara com o dia mais cedo
for (const [nome, nota, n] of [['Economica', 0, 0], ['Stellata', 4.9, 30], ['Veloce', 3.5, 4]]) {
  const d = await conta('oficina');
  const { data: of } = await sb.from('oficinas').insert({ profile_id: d.id, nome_fantasia: `${nome} ${tag}`, endereco: 'Via Roma, 1', cidade: 'Milano', estado: 'MI', cep: '20121', pais: 'IT', latitude: 45.46, longitude: 9.19, ativa: true, raio_atendimento_km: 50, avaliacao_media: nota, total_avaliacoes: n }).select('id').single();
  ofs.push(of.id);
}
const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Fiat', fipe_modelo: 'Panda', fipe_ano: '2020' }).select('id').single();
const sol = async (descricao, status, extra = {}) => (await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao, urgencia: 'media', latitude: 45.46, longitude: 9.19, endereco: 'Milano', status, ...extra }).select('id, numero').single()).data;
const sComparar = await sol(`Freni ${tag}`, 'em_orcamento');
for (const [i, valor, d1] of [[0, 180, 5], [1, 240, 6], [2, 300, 2]]) {
  const { data: o } = await sb.from('orcamentos').insert({ solicitacao_id: sComparar.id, oficina_id: ofs[i], valor_total: valor, prazo_dias: i + 1, status: 'enviado', validade: '2030-01-01' }).select('id').single();
  await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_checkin: dia(d1), turno: 'manha', data_previsao_entrega: dia(d1 + 2) });
}
const sOficina = await sol(`Frizione ${tag}`, 'em_andamento');
await sb.from('orcamentos').insert({ solicitacao_id: sOficina.id, oficina_id: ofs[1], valor_total: 500, prazo_dias: 3, status: 'aceito', validade: '2030-01-01' });
const { data: ag } = await sb.from('agenda').insert({ oficina_id: ofs[1], solicitacao_id: sOficina.id, titulo: 'Fiat Panda', data_inicio: new Date(Date.now() - 86400000).toISOString(), data_fim: new Date(Date.now() + 86400000).toISOString(), tipo: 'plataforma', status: 'em_andamento' }).select('id').single();
await sb.from('manutencao_etapas').insert({ agenda_id: ag.id, status: 'em_execucao' });
const sEspera = await sol(`Rumore ${tag}`, 'aberta');
const { data: perfil } = await sb.from('profiles').select('codigo').eq('id', cli.id).single();

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
  const visivel = (txt) => p.getByText(txt, { exact: false }).locator('visible=true').first();

  // 1 cartao de acao
  const card = p.getByTestId('situacao-comparar').locator('visible=true').first();
  ok('1 Inicio: cartao de acao "3 orcamentos para comparar"', (await card.count()) === 1 && (await card.innerText()).includes(IT('situacao.titulo_comparar', { n: 3 })), (await p.innerText('body')).slice(0, 400));
  const yCard = (await card.boundingBox())?.y ?? 9e9; const yBotao = (await visivel(IT('dashboard.novaSolicitacaoBotao')).boundingBox())?.y ?? 0;
  ok('1 cartao de acao logo abaixo dos dois botoes', yCard > yBotao, `${yCard} x ${yBotao}`);
  // 2 lista com os outros
  const corpo = await p.innerText('body');
  ok('2 lista "outros pedidos" com o carro na oficina e o que espera orcamentos', corpo.includes(IT('situacao.outros')) && corpo.includes(IT('situacao.titulo_naOficina')) && corpo.includes(IT('situacao.titulo_aguardando')), corpo.slice(0, 600));
  // 3 pedido
  await card.getByText(IT('situacao.botao_comparar'), { exact: true }).click(); await p.waitForTimeout(4000);
  const tela = await p.innerText('body');
  ok('3 abre o pedido certo com o numero', p.url().includes(`/solicitacao/${sComparar.id}`) && tela.includes(String(sComparar.numero)), p.url());
  ok('3 cabecalho de situacao com "o que acontece agora"', tela.includes(IT('situacao.agora_comparar')));
  ok('3 resumo "3 orcamentos de 180 a 300"', /3 preventivi · da .*180.* a .*300/.test(tela), tela.match(/preventivi ·[^\n]*/)?.[0]);
  const primeiraOficina = async () => { const t = await p.innerText('body'); const i = ['Economica', 'Stellata', 'Veloce'].map((n) => [n, t.indexOf(`${n} ${tag}`)]).filter((x) => x[1] >= 0).sort((a, b) => a[1] - b[1]); return i[0]?.[0]; };
  ok('3 ordem padrao: menor preco primeiro', (await primeiraOficina()) === 'Economica', await primeiraOficina());
  ok('3 marcadores: mais barato, melhor avaliada, mais cedo', tela.includes(IT('orcamentos.marca_preco')) && tela.includes(IT('orcamentos.marca_nota')) && tela.includes(IT('orcamentos.marca_cedo')));
  await visivel(IT('orcamentos.ord_nota')).click(); await p.waitForTimeout(800);
  ok('3 ordenar por melhor avaliada', (await primeiraOficina()) === 'Stellata', await primeiraOficina());
  await visivel(IT('orcamentos.ord_cedo')).click(); await p.waitForTimeout(800);
  ok('3 ordenar pelo dia mais cedo', (await primeiraOficina()) === 'Veloce', await primeiraOficina());
  // 4 botoes
  ok('4 "Scegli questa officina" e "Non mi interessa" (sem "Rifiuta")', tela.includes(IT('orcamentos.aceitar')) && tela.includes(IT('orcamentos.naoMeInteressa')) && !tela.includes(IT('orcamentos.recusar')));
  await p.screenshot({ path: 'app-situacao-pedido.png', fullPage: true });
  // 5 perfil e pedido novo
  await p.goto('http://localhost:8090/perfil', { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  ok('5 perfil mostra o codigo de cliente', (await p.innerText('body')).includes(String(perfil.codigo)), perfil.codigo);
  await p.goto('http://localhost:8090/nova-solicitacao', { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  const yServ = (await visivel(IT('novaSolicitacao.passoServico')).boundingBox())?.y ?? 9e9;
  const yVeic = (await visivel(IT('novaSolicitacao.passoVeiculo')).boundingBox())?.y ?? 0;
  ok('5 pedido novo: o problema vem antes do carro', yServ < yVeic, `${yServ} x ${yVeic}`);
  ok('6 sem erros de JavaScript', !erros.length, erros.slice(0, 3).join(' | '));
} finally {
  await b.close();
  for (const s of [sComparar, sOficina, sEspera]) {
    for (const t of ['manutencao_etapas']) await sb.from(t).delete().eq('agenda_id', ag.id);
    await sb.from('agenda').delete().eq('solicitacao_id', s.id); await sb.from('orcamentos').delete().eq('solicitacao_id', s.id);
    await sb.from('notificacoes').delete().eq('dados->>solicitacao_id', s.id); await sb.from('solicitacoes').delete().eq('id', s.id);
  }
  await sb.from('veiculos').delete().eq('id', v.id);
  for (const id of ofs) { await sb.from('comissao_config').delete().eq('oficina_id', id); await sb.from('oficinas').delete().eq('id', id); }
  for (const id of contas) { await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
