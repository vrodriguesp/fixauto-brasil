// Base dos testes do lote 2 de pecas ("avisos que nao inundam a loja", 17/11;
// Documentos/Analises/Pecas_lote2_2026-11-17: Mapa_lote2.md + Fable_auditoria_mapa_lote2.md,
// contrato em Contrato_testids_lote2.md). Reusa pecas-v3-lib.mjs (lote 1) e acrescenta o que o
// lote 2 precisa: motorista + pedido (pre-preenchimento), funcionario, rotas novas (resumo, "nao
// tenho" por e-mail), tokens /n/<token>, hora de Tallinn, referencias de sino e limpeza das tabelas
// novas. Escrito ANTES da implementacao (teste primeiro): os nomes aqui sao o contrato.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ambiente, naoExiste, psql, SITE, sleep, normalizarEmail, RESULTADOS, NOVOS_TESTIDS } from './pecas-v3-lib.mjs';
export * from './pecas-v3-lib.mjs';

let desbloquearPendente = null; // pastaEmailsBloqueada(): restauro pendente (SIGINT / saida)

// ---------------- contrato do lote 2: nomes ----------------
export const ROTA_RESUMO = '/api/tarefas/resumo-cotacoes-pecas';
export const ROTA_NAO_TENHO_EMAIL = '/api/cotacao-peca/nao-tenho-email';
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
// slug traduzido da pagina do link "nao tenho" (PATHNAMES '/peca-nao-tenho')
export const SLUG_NAO_TENHO = { pt: '/br/pt/peca-nao-tenho', 'pt-PT': '/pt/pt/peca-nao-tenho', en: '/ee/en/part-not-available', et: '/ee/et/varuosa-puudub', it: '/it/it/ricambio-non-disponibile', ru: '/ee/ru/zapchasti-net' };
export const URGENCIAS = ['hoje', 'amanha', 'sem_pressa'];
export const MOTIVOS_NAO_TENHO = ['sem_estoque', 'nao_trabalho', 'outro'];
export const TETO_IMEDIATOS_DIA = 30;
// elementos que SO existem com o interruptor ligado (lote 2); somados aos do lote 1 no DOM da tela de hoje
export const NOVOS_TESTIDS_L2 = [
  'cotacao-urgencia-hoje', 'cotacao-urgencia-amanha', 'cotacao-urgencia-sem-pressa', 'pedir-peca',
  'oferta-iva', 'oferta-parcial', 'cotacao-nao-tem-contagem',
  'cotacao-nao-tenho', 'cotacao-nao-tenho-motivo', 'cotacao-nao-tenho-confirmar', 'cotacao-nao-tenho-desfazer',
  'resposta-quantidade', 'resposta-usada', 'resposta-iva-previa',
  'perfil-iva-registrado', 'perfil-iva-pct', 'perfil-regime-margem',
];
export const TODOS_TESTIDS_NOVOS = [...NOVOS_TESTIDS, ...NOVOS_TESTIDS_L2];
// chaves de traducao novas (namespace pecas.*; recomendado em *.misc.json)
export const CHAVES_I18N_L2 = [
  'pecas.urgencia', 'pecas.urgencias.hoje', 'pecas.urgencias.amanha', 'pecas.urgencias.semPressa',
  'pecas.pedirPeca',
  'pecas.naoTenho', 'pecas.naoTenhoMotivo', 'pecas.naoTenhoMotivos.semEstoque', 'pecas.naoTenhoMotivos.naoTrabalho', 'pecas.naoTenhoMotivos.outro',
  'pecas.naoTenhoConfirmar', 'pecas.naoTenhoFeito', 'pecas.naoTenhoDesfazer', 'pecas.naoTenhoVencido', 'pecas.naoTenhoJaRespondeu', 'pecas.naoTenhoJaDispensou', 'pecas.naoTenhoInvalido', 'pecas.naoTenhoTitulo',
  'pecas.naoTemContagem',
  'pecas.quantidadeOfertada', 'pecas.ofertaParcial', 'pecas.pecaUsada',
  'pecas.ivaRegistrado', 'pecas.ivaPct', 'pecas.regimeMargem', 'pecas.semIva', 'pecas.ivaNaoAplicavel', 'pecas.ivaMargem', 'pecas.ivaCompletePerfil',
  'pecas.respostaErro',
];
export const CHAVES_I18N_L2_TEXTO = CHAVES_I18N_L2.filter((k) => !/ivaPct$/.test(k));
export const semTestidsNovosL2 = async (p) => { const achados = []; for (const t of TODOS_TESTIDS_NOVOS) if (await p.locator(`[data-testid="${t}"]`).count()) achados.push(t); return achados; };

// referencias (HTML ou JSON ja normalizados): gravadas SO com PECAS_V3_GRAVAR_REFERENCIA=1; sem o arquivo e sem a variavel = FALHA
export const REFERENCIA_EMAIL_RESPONDIDA = path.join(RESULTADOS, 'referencia-email-cotacao-respondida.html');
export const REFERENCIA_EMAIL_PEDIDO = path.join(RESULTADOS, 'referencia-email-pedido-confirmado.html');
export const REFERENCIA_SINO_DISPONIVEL = path.join(RESULTADOS, 'referencia-sino-cotacao-disponivel.json');
export const REFERENCIA_SINO_RESPONDIDA = path.join(RESULTADOS, 'referencia-sino-cotacao-respondida.json');
export function compararReferencia(ok, nome, arquivo, normalizado) {
  if (process.env.PECAS_V3_GRAVAR_REFERENCIA === '1') {
    fs.writeFileSync(arquivo, normalizado);
    console.log(`info ${nome}: referencia gravada em ${arquivo} (PECAS_V3_GRAVAR_REFERENCIA=1) - so faz sentido no codigo de hoje`);
    ok(`${nome} referencia gravada agora (rodada de base)`, true);
    return true;
  }
  if (!fs.existsSync(arquivo)) { ok(`${nome} IDENTICO a referencia`, false, `referencia ausente: ${arquivo} - rode no codigo de hoje com PECAS_V3_GRAVAR_REFERENCIA=1`); return false; }
  const ref = fs.readFileSync(arquivo, 'utf8');
  let detalhe = '';
  if (ref !== normalizado) { let i = 0; while (i < ref.length && ref[i] === normalizado[i]) i++; detalhe = `difere a partir de ${i}: ref="${ref.slice(i, i + 120)}" agora="${normalizado.slice(i, i + 120)}"`; }
  ok(`${nome} IDENTICO a referencia (ignorando ids, datas, links e a tag)`, ref === normalizado, detalhe);
  return ref === normalizado;
}
// sino (titulo, mensagem, dados) como JSON canonico: chaves ordenadas, tag/uuids/datas trocados
const ordenar = (v) => Array.isArray(v) ? v.map(ordenar) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])])) : v;
export const normalizarSino = (n, tag) => normalizarEmail(JSON.stringify(ordenar({ titulo: n.titulo, mensagem: n.mensagem, dados: n.dados })), tag);

// hora de Tallinn (o resumo e o teto diario contam em Europe/Tallinn; o cron corre em UTC)
const partesTallinn = (instante) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Tallinn', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }).formatToParts(instante);
  const v = (t) => p.find((x) => x.type === t)?.value || '';
  return { ymd: `${v('year')}-${v('month')}-${v('day')}`, h: Number(v('hour')), m: Number(v('minute')), s: Number(v('second')), weekday: v('weekday') };
};
const deslocTallinn = (instante) => { const { ymd, h, m, s } = partesTallinn(instante); const [y, mo, d] = ymd.split('-').map(Number); return (Date.UTC(y, mo - 1, d, h, m, s) - instante.getTime()) / 60000; };
/** "2026-11-18" + "10:53" em Tallinn -> ISO UTC */
export function tallinnEmUtc(ymd, hhmm) {
  const ingenuo = new Date(`${ymd}T${hhmm}:00Z`);
  let t = ingenuo.getTime() - deslocTallinn(ingenuo) * 60000;
  t = ingenuo.getTime() - deslocTallinn(new Date(t)) * 60000;
  return new Date(t).toISOString();
}
export const diaTallinn = (instante = new Date()) => partesTallinn(instante).ymd;
export const meiaNoiteTallinn = (instante = new Date()) => tallinnEmUtc(diaTallinn(instante), '00:00');
/** proximo dia util (seg-sex) em Tallinn a partir de amanha: 'YYYY-MM-DD' */
export function proximoDiaUtilTallinn(aPartirDe = new Date(), pularDias = 1) {
  let d = new Date(aPartirDe.getTime() + pularDias * 86400e3);
  for (let i = 0; i < 7; i++) { const w = partesTallinn(d).weekday; if (!['Sat', 'Sun'].includes(w)) return partesTallinn(d).ymd; d = new Date(d.getTime() + 86400e3); }
  return partesTallinn(d).ymd;
}
export const slotDe = (ymd, hora) => `${ymd}-${String(hora).padStart(2, '0')}`;

// links "nao tenho" de um e-mail: [{ token, idioma }] (href="https://.../n/<43>?o=et")
export const tokensNaoTenho = (html) => [...String(html).matchAll(/href="[^"]*\/n\/([A-Za-z0-9_-]{43})\?o=([A-Za-z-]+)[^"]*"/g)].map((m) => ({ token: m[1], idioma: m[2] }));
export const hashNaoTenho = (token) => crypto.createHash('sha256').update(`naotenho:${token}`).digest('hex');
// links neutros /v/<base64url>?o=xx decodificados (como correcoes.mjs)
export const linksNeutros = (html) => [...String(html).matchAll(/\/v\/([A-Za-z0-9_-]+)\?o=([A-Za-z-]+)/g)].map((m) => ({ idioma: m[2], interno: Buffer.from(m[1], 'base64url').toString('utf8') }));
export const semSlugPortugues = (html) => !/href="[^"]*\/(loja|oficina)\//.test(String(html));

export function ambienteL2(env) {
  const A = ambiente(env);
  const { admin, criado } = A;
  criado.clientes = []; criado.sols = []; criado.funcionarios = [];
  const temSimulacao = env.TAREFAS_SIMULAR_HORA === '1';

  const cliente = (apelido, opts = {}) => A.conta('cliente', apelido, opts);
  // pedido do motorista perto da compradora (Narva), com carro e placa: base do "pedir peca"
  const solicitacao = async (cli, { placa = 'TA1234', marca = 'Toyota', modelo = 'Corolla', ano = '2018', status = 'aberta', tipo = 'mecanica', km = 0 } = {}) => {
    const { data: v, error: ev } = await admin.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: marca, fipe_modelo: modelo, fipe_ano: ano, placa }).select('id').single();
    if (ev) throw new Error(`veiculo: ${ev.message}`);
    const { lat, lon } = { lat: 59.377 + km * 0.009, lon: 28.19 };
    const { data, error } = await admin.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo, descricao: `TESTE-PECAS pedido ${A.tag}`, urgencia: 'media', endereco: 'Tallinna mnt 1, Narva', latitude: lat, longitude: lon, pais: 'EE', status }).select('id, numero').single();
    if (error) throw new Error(`solicitacao: ${error.message}`);
    criado.sols.push(data.id);
    return { id: data.id, numero: data.numero, cliente: cli, veiculoId: v.id, placa, marca, modelo, ano };
  };
  const funcionario = async (of, apelido, { cargo = 'mecanico' } = {}) => {
    const u = await A.conta('oficina', apelido, { contaTeste: !!of.dono?.contaTeste });
    const { data, error } = await admin.from('funcionarios').insert({ oficina_id: of.id, profile_id: u.id, nome: u.nome, cargo, ativo: true }).select('id').single();
    if (error) throw new Error(`funcionario: ${error.message}`);
    criado.funcionarios.push(data.id);
    return u;
  };

  // rotas novas
  const resumo = (agora, chave = env.TAREFAS_CHAVE) => A.api('POST', ROTA_RESUMO, agora ? { agora } : {}, null, { 'x-tarefa-chave': chave });
  const naoTenhoEmail = (corpo, ip) => A.api('POST', ROTA_NAO_TENHO_EMAIL, corpo, null, ip ? { 'x-real-ip': ip } : {});
  const get302 = async (caminho, ip) => { const r = await fetch(`${SITE}${caminho}`, { redirect: 'manual', headers: { 'x-real-ip': ip || A.ip() } }); return { status: r.status, location: r.headers.get('location') || '', cacheControl: r.headers.get('cache-control') || '', setCookie: r.headers.get('set-cookie') || '' }; };
  // POST cru (para ler cabecalhos: Cache-Control, Set-Cookie)
  const postCru = async (rota, corpo, ip) => { const r = await fetch(`${SITE}${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip || A.ip() }, body: JSON.stringify(corpo) }); return { status: r.status, cacheControl: r.headers.get('cache-control') || '', setCookie: r.headers.get('set-cookie') || '', d: await r.json().catch(() => ({})) }; };

  // leituras das tabelas novas (service role); tabela ausente = []
  const lerOuVazio = async (q) => { const { data, error } = await q; if (error && !naoExiste(error)) throw new Error(error.message); return data || []; };
  const dispensas = (cotacaoId) => lerOuVazio(admin.from('cotacoes_pecas_dispensas').select('*').eq('cotacao_id', cotacaoId));
  const avisosEmail = (filtro = {}) => { let q = admin.from('avisos_email_pecas').select('*'); for (const [k, v] of Object.entries(filtro)) q = v === null ? q.is(k, null) : q.eq(k, v); return lerOuVazio(q.order('criado_em')); };
  const tokensEmail = (filtro = {}) => { let q = admin.from('pecas_links_email').select('*'); for (const [k, v] of Object.entries(filtro)) q = v === null ? q.is(k, null) : q.eq(k, v); return lerOuVazio(q.order('criado_em')); };
  const tokenNoBanco = async (token) => (await tokensEmail({ token_hash: hashNaoTenho(token) }))[0] || null;
  const sinoDisponivel = async (profileId, cotacaoId) => (await A.avisos(profileId, 'cotacao_peca_disponivel')).filter((n) => n.dados?.cotacao_id === cotacaoId);
  const inserirDispensa = (sessao, cotacaoId, tipo, fornecedorId, extra = {}) => sessao.c.from('cotacoes_pecas_dispensas').insert({ cotacao_id: cotacaoId, fornecedor_tipo: tipo, fornecedor_id: fornecedorId, profile_id: sessao.user.id, origem: 'painel', ...extra });

  // limpeza: tabelas do lote 2 e dados de motorista antes da limpeza do lote 1 (que apaga cotacoes, contas...)
  const limpar = async () => {
    const erros = [];
    const del = async (tabela, col, val, op = 'eq') => { const q = admin.from(tabela).delete(); const { error } = await (op === 'in' ? q.in(col, val) : q.eq(col, val)); if (error && !naoExiste(error)) erros.push(`${tabela}: ${error.message}`); };
    const cots = new Set(criado.cotacoes);
    if (criado.oficinas.length) for (const c of await lerOuVazio(admin.from('cotacoes_pecas').select('id').in('oficina_id', criado.oficinas))) cots.add(c.id);
    const ids = [...cots];
    if (ids.length) { await del('cotacoes_pecas_dispensas', 'cotacao_id', ids, 'in'); await del('avisos_email_pecas', 'cotacao_id', ids, 'in'); await del('pecas_links_email', 'cotacao_id', ids, 'in'); }
    for (const id of criado.contas) { await del('cotacoes_pecas_dispensas', 'profile_id', id); await del('avisos_email_pecas', 'profile_id', id); await del('pecas_links_email', 'profile_id', id); }
    for (const s of criado.sols) { await del('notificacoes', 'dados->>solicitacao_id', s); for (const t of ['admin_auditoria', 'pedido_dispensas', 'pedido_convites', 'links_acesso', 'orcamentos', 'solicitacao_fotos']) await del(t, 'solicitacao_id', s); }
    if (criado.sols.length) await del('solicitacoes', 'id', criado.sols, 'in');
    for (const id of criado.contas) await del('veiculos', 'profile_id', id);
    if (criado.funcionarios.length) await del('funcionarios', 'id', criado.funcionarios, 'in');
    return [...erros, ...(await A.limpar())];
  };
  const verificarLimpeza = async () => {
    const sobras = await A.verificarLimpeza();
    const conta1 = async (nome, q) => { const { count, error } = await q; if (error) { if (!naoExiste(error)) sobras.push(`${nome}: ${error.message}`); } else if (count) sobras.push(`${nome}: ${count}`); };
    if (criado.contas.length) {
      await conta1('cotacoes_pecas_dispensas', admin.from('cotacoes_pecas_dispensas').select('profile_id', { count: 'exact', head: true }).in('profile_id', criado.contas));
      await conta1('avisos_email_pecas', admin.from('avisos_email_pecas').select('id', { count: 'exact', head: true }).in('profile_id', criado.contas));
      await conta1('pecas_links_email', admin.from('pecas_links_email').select('id', { count: 'exact', head: true }).in('profile_id', criado.contas));
      await conta1('veiculos', admin.from('veiculos').select('id', { count: 'exact', head: true }).in('profile_id', criado.contas));
    }
    if (criado.sols.length) await conta1('solicitacoes', admin.from('solicitacoes').select('id', { count: 'exact', head: true }).in('id', criado.sols));
    return sobras;
  };
  const limparAoInterromper = (fecharNavegadores) => {
    let limpando = false;
    for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, async () => {
      if (limpando) return; limpando = true;
      console.log(`\n${sinal}: limpando o que esta rodada criou antes de sair...`);
      desbloquearPendente?.(); // pasta de e-mails de volta antes de tudo
      try { await fecharNavegadores?.(); } catch { /* segue */ }
      const erros = await limpar();
      console.log(erros.length ? `limpeza com erros: ${erros.join(' | ')}` : 'limpeza ok');
      process.exit(130);
    });
  };

  return { ...A, temSimulacao, cliente, solicitacao, funcionario, resumo, naoTenhoEmail, get302, postCru, dispensas, avisosEmail, tokensEmail, tokenNoBanco, sinoDisponivel, inserirDispensa, limpar, verificarLimpeza, limparAoInterromper };
}

// o site escreve o e-mail numa pasta; para simular falha de envio a pasta vira um ARQUIVO (mkdir falha).
// So a pasta de _teste_local; o desbloqueio fica pendente em modulo e roda tambem no SIGINT e na saida
// do processo (uma pasta deixada como arquivo faria toda rodada seguinte perder os e-mails).
export function pastaEmailsBloqueada(EMAILS) {
  if (!/_teste_local/.test(String(EMAILS))) throw new Error('TESTE LOCAL: so bloqueio a pasta de e-mails de _teste_local');
  if (desbloquearPendente) throw new Error('pasta de e-mails ja esta bloqueada');
  const bak = `${EMAILS}.bloqueada-${Date.now()}`;
  fs.renameSync(EMAILS, bak);
  fs.writeFileSync(EMAILS, 'pasta bloqueada pelo teste pecas-v3-lote2 (simula falha de envio)');
  const desbloquear = () => {
    if (desbloquearPendente !== desbloquear) return;
    desbloquearPendente = null;
    try { fs.rmSync(EMAILS, { force: true }); } catch { /* ja */ }
    try { fs.renameSync(bak, EMAILS); } catch (e) { console.log(`AVISO: nao consegui restaurar a pasta de e-mails (${e.message}); copia em ${bak}`); }
  };
  desbloquearPendente = desbloquear;
  return desbloquear;
}
export const desbloquearPastaEmails = () => { desbloquearPendente?.(); };
process.on('exit', () => { desbloquearPendente?.(); });
export const sleepMs = sleep;
export const sqlLocal = psql;
