// Base comum dos testes do lote 1 de pecas ("cotacao segura e completa", 17/11;
// Documentos/Analises/Pecas_lote1_2026-11-17: Mapa_lote1.md + Fable_auditoria_mapa_lote1.md,
// contrato em Contrato_testids_lote1.md). So banco LOCAL (Docker) + site :3100.
// Cria contas @example.test com nome "TESTE-PECAS ..." e apaga tudo no fim (limpar()),
// inclusive os e-mails gravados em EMAIL_PASTA_TESTE. Escrito ANTES da implementacao
// (teste primeiro): os nomes aqui (testids, rotas, colunas) sao o contrato.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
export const { createClient } = req('@supabase/supabase-js');
export const { chromium, webkit, devices } = req('playwright-core');

export const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const WEB = path.resolve(AQUI, '../..');
export const RAIZ = path.resolve(WEB, '../..');
export const ENV_PADRAO = path.join(WEB, '.env.local');

export function lerEnv(arq = ENV_PADRAO) {
  const env = Object.fromEntries(fs.readFileSync(arq, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error('TESTE LOCAL: faltam as chaves do Supabase no .env.local');
  if (!env.EMAIL_PASTA_TESTE) throw new Error('TESTE LOCAL: EMAIL_PASTA_TESTE nao definido - sem ele o site mandaria e-mail de verdade');
  // lib/email.ts so grava em pasta quando NAO ha Resend: com a chave presente a suite mandaria e-mail real
  if (env.RESEND_API_KEY || env.TWILIO_ACCOUNT_SID || env.TWILIO_AUTH_TOKEN) throw new Error('TESTE LOCAL: chave de envio real presente no .env (RESEND_API_KEY / TWILIO_*) - parado para nao mandar e-mail/SMS de verdade');
  if (!env.TAREFAS_CHAVE) throw new Error('TESTE LOCAL: TAREFAS_CHAVE nao definido (rota da tarefa de expiracao)');
  return env;
}

export const SITE = process.env.SITE || 'http://localhost:3100';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SITE)) throw new Error('TESTE LOCAL: SITE precisa ser o site local (ex.: http://localhost:3100) - parado para nao tocar a producao');
export const CHROME = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
export const WEBKIT = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/webkit-2388/Playwright.exe');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const horasAtras = (h) => new Date(Date.now() - h * 3600e3).toISOString();
export const diasAFrente = (d) => new Date(Date.now() + d * 86400e3).toISOString();
export const DIA_MS = 86400e3;
export const psql = (sql) => execSync('docker exec -i supabase_db_bipfix-teste psql -U postgres -v ON_ERROR_STOP=1 -tA', { input: sql }).toString().trim();
export const siteNoAr = async () => { try { const r = await fetch(`${SITE}/ee/et`, { redirect: 'manual', signal: AbortSignal.timeout(5000) }); return r.status > 0; } catch { return false; } };

// Narva (EE): longe das oficinas de teste que ja existem no banco local (Tallinn, ~200 km),
// para que so as oficinas vendedoras criadas AQUI fiquem no raio da compradora
export const NARVA = { lat: 59.377, lon: 28.19 };
export const perto = (km) => ({ lat: NARVA.lat + km * 0.009, lon: NARVA.lon });

// mensagens (todos os arquivos do idioma juntos) e T('ns.chave', { x })
export const mensagens = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => { try { return JSON.parse(fs.readFileSync(path.join(WEB, 'messages', `${l}${a}.json`), 'utf8')); } catch { return {}; } }));
export const pegaChave = (m, k) => k.split('.').reduce((o, p) => o?.[p], m);
export const tradutor = (l) => { const m = mensagens(l); return (k, v = {}) => String(pegaChave(m, k) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
export const IDIOMAS = ['pt', 'pt-PT', 'en', 'et', 'it', 'ru'];
export const PREFIXO = { et: '/ee/et', ru: '/ee/ru', en: '/ee/en', it: '/it/it', pt: '/br/pt', 'pt-PT': '/pt/pt' };
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "4,5 l" / "2.5 kg": numero + rotulo da unidade inteiro (nao basta includes('l'))
export const quantidadeComUnidade = (texto, numeroRe, rotulo) => new RegExp(`(?<![\\p{N}])${numeroRe}\\s*${escapeRegex(rotulo)}(?![\\p{L}\\p{N}])`, 'u').test(String(texto));
// botao pelo texto EXATO da traducao, admitindo so um prefixo de simbolo/emoji ("✏️ Muuda", "✕ Tühista päring"):
// getByRole sem exact casa substring ("Muuda" casaria "Salvesta muudatused") e viraria strict mode violation
export const botao = (escopo, texto) => escopo.getByRole('button', { name: new RegExp(`^[^\\p{L}\\p{N}]*${escapeRegex(texto)}$`, 'u') });

// ---------------- contrato: nomes que as telas/rotas novas usam ----------------
export const UNIDADES = ['un', 'jogo', 'par', 'litro', 'kg', 'metro', 'caixa'];
// controles/elementos que SO existem com o interruptor ligado (nunca no DOM da tela de hoje)
export const NOVOS_TESTIDS = [
  'cotacao-tipo-carro', 'cotacao-tipo-sem-carro', 'cotacao-quantidade', 'cotacao-unidade', 'cotacao-placa', 'cotacao-ocultar-placa', 'cotacao-ocultar-placa-ajuda',
  'cotacao-alvo-todos', 'cotacao-alvo-so-lojas', 'cotacao-validade-aviso', 'cotacao-placa-dica',
  'cotacao-expira-em', 'cotacao-reabrir', 'cotacao-quantidade-valor', 'cotacao-sem-carro', 'cotacao-placa-valor', 'oferta-total',
  'perfil-telefone-comercial',
];
// chaves de traducao novas (namespace neutro "pecas", recomendado em *.misc.json)
export const CHAVES_I18N = [
  'pecas.tipoCarro', 'pecas.tipoSemCarro', 'pecas.semCarro', 'pecas.unidade',
  ...UNIDADES.map((u) => `pecas.unidades.${u}`),
  'pecas.placa', 'pecas.ocultarPlaca', 'pecas.ocultarPlacaAjuda', 'pecas.placaDica',
  'pecas.enviarA', 'pecas.alvoTodos', 'pecas.alvoSoLojas',
  'pecas.vale7Dias', 'pecas.expiraEm', 'pecas.expirada', 'pecas.reabrir', 'pecas.reabrindo', 'pecas.reabrirTeto',
  'pecas.erroCriar', 'pecas.telefoneComercial', 'pecas.telefoneComercialAjuda',
];
// chaves que devem ser traduzidas de verdade (as unidades "kg"/"l" podem coincidir entre linguas)
export const CHAVES_I18N_TEXTO = CHAVES_I18N.filter((k) => !k.startsWith('pecas.unidades.'));
export const TIPO_AVISO_EXPIRADA = 'cotacao_peca_expirada';
export const ROTA_PLACA = '/api/cotacao-peca/placa';
export const ROTA_REABRIR = '/api/cotacao-peca/reabrir';
export const ROTA_TAREFA = '/api/tarefas/expirar-cotacoes-pecas';
export const ROTA_INTERRUPTOR = '/api/pecas-v3';
export const ROTA_ADMIN_INTERRUPTOR = '/api/admin/pecas-v3';

export function contador() {
  let oks = 0, falhas = 0, novoFalhas = 0;
  const ok = (nome, cond, extra = '') => {
    if (cond) oks++; else { falhas++; if (nome.startsWith('[NOVO]')) novoFalhas++; }
    console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}${!cond && extra ? ' - ' + String(extra).replace(/\s+/g, ' ').slice(0, 320) : ''}`);
  };
  const fim = () => {
    console.log(`\nok ${oks} / falhas ${falhas}${novoFalhas ? ` (das quais ${novoFalhas} marcadas [NOVO]: esperadas antes da implementacao)` : ''}`);
    return falhas;
  };
  const tentar = async (nome, fn) => { try { await fn(); } catch (e) { ok(`${nome} (excecao)`, false, e?.stack || e?.message || e); } };
  return { ok, fim, tentar, total: () => oks + falhas };
}

// erro do supabase-js quando a tabela/coluna ainda nao existe (rodando no esquema de hoje)
export const naoExiste = (e) => !!e && (/does not exist|Could not find|PGRST204|PGRST205|42P01|42703/.test(`${e.code || ''} ${e.message || ''}`));

export function ambiente(env) {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const EMAILS = env.EMAIL_PASTA_TESTE;
  const tag = crypto.randomBytes(3).toString('hex');
  const inicio = Date.now(); // e-mails gravados a partir daqui com a tag no corpo (lojas pre-existentes) tambem sao apagados
  const senha = `Pecas-${crypto.randomBytes(5).toString('hex')}A1`;
  let ipN = 1;
  const ip = () => `10.78.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
  const criado = { contas: [], oficinas: [], lojas: [], cotacoes: [], emails: [] };
  const HORARIO = Object.fromEntries(['seg', 'ter', 'qua', 'qui', 'sex'].map((d) => [d, { aberto: true, inicio: '08:00', fim: '18:00' }]).concat([['sab', { aberto: false, inicio: '', fim: '' }], ['dom', { aberto: false, inicio: '', fim: '' }]]));
  let interruptorAntes; // valor de plataforma_config.pecas_v3_ativo no inicio (restaurado em limpar)

  const conta = async (tipo, apelido, { idioma = 'et', contaTeste = false, ativo = true, telefone = '+372 5000 0001' } = {}) => {
    const email = `teste-pecas-${apelido}-${tag}@example.test`.toLowerCase();
    const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (error) throw new Error(`createUser ${apelido}: ${error.message}`);
    criado.contas.push(data.user.id); criado.emails.push(email);
    const nome = `TESTE-PECAS ${apelido}`;
    const { error: e2 } = await admin.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone, conta_teste: contaTeste, senha_definida: true, ativo, termos_aceitos_em: new Date().toISOString() });
    if (e2) throw new Error(`profile ${apelido}: ${e2.message}`);
    return { id: data.user.id, email, senha, nome, idioma, telefone, contaTeste };
  };
  const oficina = async (dono, apelido, { km = 1, ativa = true, vendePecas = false, pais = 'EE', raio = 30 } = {}) => {
    const p = perto(km);
    const nome = `TESTE-PECAS ${apelido} ${tag}`;
    const { data, error } = await admin.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: nome, endereco: `${apelido} tee`, numero: '1', cidade: 'Narva', estado: 'Ida-Virumaa', cep: '20308', pais, latitude: p.lat, longitude: p.lon, raio_atendimento_km: raio, especialidades: ['mecanica'], ativa, vende_pecas: vendePecas, seguradoras_convencionadas: [], horario_funcionamento: HORARIO }).select('id').single();
    if (error) throw new Error(`oficina ${apelido}: ${error.message}`);
    criado.oficinas.push(data.id);
    return { id: data.id, dono, nome, pais, endereco: `${apelido} tee 1, Narva` };
  };
  const loja = async (dono, apelido, { ativa = true, pais = 'EE', km = 1 } = {}) => {
    const p = perto(km);
    const nome = `TESTE-PECAS ${apelido} ${tag}`;
    const { data, error } = await admin.from('lojas_pecas').insert({ profile_id: dono.id, nome_fantasia: nome, cnpj: '12345678', endereco: `${apelido} pood 2`, cidade: pais === 'EE' ? 'Narva' : 'Milano', estado: pais === 'EE' ? 'Ida-Virumaa' : 'MI', cep: '20308', pais, latitude: p.lat, longitude: p.lon, ativa }).select('id').single();
    if (error) throw new Error(`loja ${apelido}: ${error.message}`);
    criado.lojas.push(data.id);
    return { id: data.id, dono, nome, pais };
  };
  // cotacao gravada pela service role (sem trigger de usuario): o teste controla todos os campos
  const cotacao = async (of, descricao, campos = {}) => {
    const { data, error } = await admin.from('cotacoes_pecas').insert({ oficina_id: of.id, peca_descricao: `TESTE-PECAS ${descricao} ${tag}`, fipe_marca: 'Skoda', fipe_modelo: 'Octavia', fipe_ano: '2016', quantidade: 1, ...campos }).select('id, peca_descricao').single();
    if (error) throw new Error(`cotacao ${descricao}: ${error.message}`);
    criado.cotacoes.push(data.id);
    return { id: data.id, descricao: data.peca_descricao, oficina: of };
  };
  const resposta = async (cot, fornecedor, { preco = 10, prazo = 2, tipo = 'loja' } = {}) => {
    const linha = tipo === 'loja'
      ? { cotacao_id: cot.id, fornecedor_tipo: 'loja', loja_id: fornecedor.id, preco, prazo_dias: prazo }
      : { cotacao_id: cot.id, fornecedor_tipo: 'oficina', oficina_fornecedora_id: fornecedor.id, preco, prazo_dias: prazo };
    const { data, error } = await admin.from('cotacoes_pecas_respostas').insert(linha).select('id').single();
    if (error) throw new Error(`resposta: ${error.message}`);
    return data.id;
  };
  const cotacaoNoBanco = async (id) => (await admin.from('cotacoes_pecas').select('*').eq('id', id).maybeSingle()).data;
  // linha inteira como JSON pelo psql: funciona mesmo antes das colunas novas existirem (ficam ausentes)
  const linhaJson = (tabela, id) => { const s = psql(`select to_jsonb(t) from ${tabela} t where id = '${id}'`); return s ? JSON.parse(s) : null; };
  const colunaExiste = (tabela, coluna) => psql(`select count(*) from information_schema.columns where table_schema='public' and table_name='${tabela}' and column_name='${coluna}'`) === '1';
  const tabelaExiste = (tabela) => psql(`select count(*) from information_schema.tables where table_schema='public' and table_name='${tabela}'`) === '1';
  const enumTem = (valor) => psql(`select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname='status_cotacao_peca' and e.enumlabel='${valor}'`) === '1';
  const politica = (tabela, nome) => psql(`select coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') from pg_policy p where p.polrelid = '${tabela}'::regclass and p.polname = '${nome}'`);

  const sessao = async (u) => { const c = anon(); const { data, error } = await c.auth.signInWithPassword({ email: u.email, password: u.senha }); if (error) throw new Error(`login ${u.email}: ${error.message}`); return { c, token: data.session.access_token, user: u }; };
  // { status, d }; status 0 quando o site nem responde (o check falha com o motivo, sem derrubar o grupo)
  const api = async (metodo, rota, corpo, token, extra = {}) => {
    try {
      const r = await fetch(`${SITE}${rota}`, { method: metodo, headers: { 'Content-Type': 'application/json', 'x-real-ip': ip(), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
      return { status: r.status, d: await r.json().catch(() => ({})) };
    } catch (e) { return { status: 0, d: { erro: String(e?.cause?.message || e?.message || e) } }; }
  };
  const tarefa = (chave = env.TAREFAS_CHAVE) => api('POST', ROTA_TAREFA, {}, null, { 'x-tarefa-chave': chave });
  const placa = (cotacaoId, token) => api('GET', `${ROTA_PLACA}?cotacao=${encodeURIComponent(cotacaoId)}`, undefined, token);
  const reabrir = (cotacaoId, token) => api('POST', ROTA_REABRIR, { cotacaoId }, token);
  const pecasV3 = (token) => api('GET', ROTA_INTERRUPTOR, undefined, token);
  const confirmar = (respostaId, token) => api('POST', '/api/confirmar-pedido-peca', { respostaId }, token);
  const contato = (pedidoIds, token) => api('POST', '/api/contato-pedido-peca', { pedidoIds }, token);
  const notificarFornecedores = (cotacaoId, token) => api('POST', '/api/notificar-fornecedores-cotacao-peca', { cotacaoId }, token);
  const marcarRespondida = (cotacaoId, token) => api('POST', '/api/marcar-cotacao-respondida', { cotacaoId }, token);
  const notificarMensagem = (mensagemId, token) => api('POST', '/api/notificar-mensagem-peca', { mensagemId }, token);
  const adminInterruptor = (ativo, token) => api('PATCH', ROTA_ADMIN_INTERRUPTOR, { ativo }, token);

  const avisos = async (profileId, tipo) => (await admin.from('notificacoes').select('id, tipo, titulo, mensagem, dados, lida, created_at').eq('profile_id', profileId).eq('tipo', tipo).order('created_at')).data || [];
  const esperarAviso = async (profileId, tipo, tentativas = 40) => { for (let i = 0; i < tentativas; i++) { const a = await avisos(profileId, tipo); if (a.length) return a; await sleep(300); } return []; };

  // interruptor global (plataforma_config.pecas_v3_ativo), pela service role
  const interruptorEstado = () => { const v = psql("select coalesce(to_jsonb(c)->>'pecas_v3_ativo', '') from plataforma_config c where id = 1"); return v === '' ? null : v === 'true'; };
  const interruptor = async (ativo) => {
    if (interruptorAntes === undefined) interruptorAntes = interruptorEstado();
    const { error } = await admin.from('plataforma_config').update({ pecas_v3_ativo: ativo }).eq('id', 1);
    return error || null;
  };

  // e-mails do ambiente local (lib/email.ts): <timestamp>_<para>.html com "<!-- para: | assunto: [| responder:] -->"
  const arqDe = (email) => `_${email.replace(/[^a-z0-9@._-]/gi, '_')}.html`;
  const lerEmail = (f) => {
    const html = fs.readFileSync(path.join(EMAILS, f), 'utf8');
    const cab = (html.match(/<!-- para: .*? -->/) || [''])[0];
    const m = cab.match(/<!-- para: (.*?) \| assunto: (.*?)(?: \| .*)? -->/);
    return { f, html, cab, para: m?.[1] || '', assunto: m?.[2] || '', responder: (cab.match(/\| responder: (\S+)/) || [])[1] || '', texto: html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
  };
  const emailsDe = (email, depois = 0) => (fs.existsSync(EMAILS) ? fs.readdirSync(EMAILS) : []).filter((f) => f.endsWith(arqDe(email)) && Number(f.split('_')[0]) >= depois).sort().map(lerEmail);
  // todos os e-mails gravados desde t0, de qualquer destinatario (vazamento da placa)
  const emailsDesde = (depois = 0) => (fs.existsSync(EMAILS) ? fs.readdirSync(EMAILS) : []).filter((f) => f.endsWith('.html') && Number(f.split('_')[0]) >= depois).sort().map(lerEmail);
  const esperarEmail = async (email, depois, filtro = () => true, tentativas = 40) => { for (let i = 0; i < tentativas; i++) { const e = emailsDe(email, depois).filter(filtro).at(-1); if (e) return e; await sleep(300); } return null; };
  // arquivo de e-mail desta rodada: de uma conta criada aqui, ou gravado desde o inicio com a tag no corpo
  // (lojas pre-existentes do banco local recebem o aviso da cotacao de uma compradora real)
  const emailDaRodada = (f) => criado.emails.some((e) => f.endsWith(arqDe(e))) || (f.endsWith('.html') && Number(f.split('_')[0]) >= inicio && (() => { try { return fs.readFileSync(path.join(EMAILS, f), 'utf8').includes(tag); } catch { return false; } })());

  // apaga tudo desta rodada; devolve a lista de erros (tabelas que ainda nao existem no esquema de hoje nao contam)
  const limpar = async () => {
    const erros = [];
    const del = async (tabela, col, val, op = 'eq') => {
      const q = admin.from(tabela).delete();
      const { error } = await (op === 'in' ? q.in(col, val) : q.eq(col, val));
      if (error && !naoExiste(error)) erros.push(`${tabela}: ${error.message}`);
    };
    // cotacoes criadas aqui + as que as telas criaram para as oficinas desta rodada
    const cotIds = new Set(criado.cotacoes);
    if (criado.oficinas.length) {
      const { data } = await admin.from('cotacoes_pecas').select('id').in('oficina_id', criado.oficinas);
      for (const c of data || []) cotIds.add(c.id);
    }
    const cots = [...cotIds];
    if (cots.length) {
      const { data: peds } = await admin.from('pedidos_pecas').select('id').in('cotacao_id', cots);
      const pedIds = (peds || []).map((p) => p.id);
      if (pedIds.length) await del('comissao_pecas_lancamento', 'pedido_id', pedIds, 'in');
      await del('pedidos_pecas', 'cotacao_id', cots, 'in');
      await del('cotacoes_pecas_mensagens', 'cotacao_id', cots, 'in');
      await del('cotacoes_pecas_respostas', 'cotacao_id', cots, 'in');
      await del('cotacoes_pecas_placa', 'cotacao_id', cots, 'in');
      for (const c of cots) await del('notificacoes', 'dados->>cotacao_id', c);
      await del('cotacoes_pecas', 'id', cots, 'in');
    }
    if (criado.lojas.length) { await del('fornecedores_contato', 'fornecedor_id', criado.lojas, 'in'); await del('comissao_pecas_config', 'fornecedor_id', criado.lojas, 'in'); await del('pecas_catalogo', 'loja_id', criado.lojas, 'in'); }
    if (criado.oficinas.length) { await del('fornecedores_contato', 'fornecedor_id', criado.oficinas, 'in'); await del('comissao_pecas_config', 'fornecedor_id', criado.oficinas, 'in'); await del('funcionarios', 'oficina_id', criado.oficinas, 'in'); }
    for (const id of criado.contas) { await del('notificacoes', 'profile_id', id); await del('admin_auditoria', 'admin_id', id); await del('codigos_login', 'user_id', id); await del('links_acesso', 'user_id', id); }
    if (criado.lojas.length) await del('lojas_pecas', 'id', criado.lojas, 'in');
    if (criado.oficinas.length) await del('oficinas', 'id', criado.oficinas, 'in');
    for (const id of criado.contas) { await del('profiles', 'id', id); const { error } = await admin.auth.admin.deleteUser(id); if (error) erros.push(`auth ${id}: ${error.message}`); }
    if (EMAILS && fs.existsSync(EMAILS)) for (const f of fs.readdirSync(EMAILS)) if (emailDaRodada(f)) fs.rmSync(path.join(EMAILS, f), { force: true });
    // interruptor global de voltar ao que era (quando a coluna existe)
    if (interruptorAntes !== undefined && interruptorAntes !== null) {
      const { error } = await admin.from('plataforma_config').update({ pecas_v3_ativo: interruptorAntes }).eq('id', 1);
      if (error && !naoExiste(error)) erros.push(`plataforma_config: ${error.message}`);
    }
    if (erros.length) console.log('limpar: ' + erros.join(' | '));
    return erros;
  };
  // o que sobrou desta rodada (tem de ser nada)
  const verificarLimpeza = async () => {
    const sobras = [];
    const conta1 = async (nome, q) => { const { count, error } = await q; if (error) { if (!naoExiste(error)) sobras.push(`${nome}: ${error.message}`); } else if (count) sobras.push(`${nome}: ${count}`); };
    if (criado.contas.length) {
      await conta1('profiles', admin.from('profiles').select('id', { count: 'exact', head: true }).in('id', criado.contas));
      await conta1('notificacoes', admin.from('notificacoes').select('id', { count: 'exact', head: true }).in('profile_id', criado.contas));
      await conta1('admin_auditoria', admin.from('admin_auditoria').select('id', { count: 'exact', head: true }).in('admin_id', criado.contas));
    }
    if (criado.oficinas.length) {
      await conta1('oficinas', admin.from('oficinas').select('id', { count: 'exact', head: true }).in('id', criado.oficinas));
      await conta1('cotacoes_pecas', admin.from('cotacoes_pecas').select('id', { count: 'exact', head: true }).in('oficina_id', criado.oficinas));
      await conta1('fornecedores_contato (oficinas)', admin.from('fornecedores_contato').select('fornecedor_id', { count: 'exact', head: true }).in('fornecedor_id', criado.oficinas));
    }
    if (criado.lojas.length) {
      await conta1('lojas_pecas', admin.from('lojas_pecas').select('id', { count: 'exact', head: true }).in('id', criado.lojas));
      await conta1('fornecedores_contato (lojas)', admin.from('fornecedores_contato').select('fornecedor_id', { count: 'exact', head: true }).in('fornecedor_id', criado.lojas));
    }
    if (criado.cotacoes.length) await conta1('cotacoes_pecas_placa', admin.from('cotacoes_pecas_placa').select('cotacao_id', { count: 'exact', head: true }).in('cotacao_id', criado.cotacoes));
    const mails = EMAILS && fs.existsSync(EMAILS) ? fs.readdirSync(EMAILS).filter(emailDaRodada).length : 0;
    if (mails) sobras.push(`e-mails: ${mails}`);
    return sobras;
  };
  // Ctrl+C / kill: o Node sai sem passar pelo finally - limpa antes de sair (so banco local)
  const limparAoInterromper = (fecharNavegadores) => {
    let limpando = false;
    for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, async () => {
      if (limpando) return; limpando = true;
      console.log(`\n${sinal}: limpando o que esta rodada criou antes de sair...`);
      try { await fecharNavegadores?.(); } catch { /* segue */ }
      const erros = await limpar();
      console.log(erros.length ? `limpeza com erros: ${erros.join(' | ')}` : 'limpeza ok');
      process.exit(130);
    });
  };

  return { admin, anon, EMAILS, tag, inicio, senha, ip, criado, conta, oficina, loja, cotacao, resposta, cotacaoNoBanco, linhaJson, colunaExiste, tabelaExiste, enumTem, politica, sessao, api, tarefa, placa, reabrir, pecasV3, confirmar, contato, notificarFornecedores, marcarRespondida, notificarMensagem, adminInterruptor, avisos, esperarAviso, interruptor, interruptorEstado, emailsDe, emailsDesde, esperarEmail, limpar, verificarLimpeza, limparAoInterromper };
}

// navegadores: Chromium (390 ou 1280) e WebKit (iPhone 13)
export async function abrirNavegadores(precisaWebkit = true) {
  const chrome = await chromium.launch({ executablePath: CHROME });
  let wk = precisaWebkit ? await webkit.launch({ executablePath: WEBKIT }) : null;
  const contexto = async (motor, largura, ip, extra = {}) => {
    const B = motor === 'webkit' ? wk : chrome;
    if (!B) throw new Error(`navegador ${motor} nao esta aberto (ja fechado ou nao pedido)`);
    const base = motor === 'webkit' ? { ...devices['iPhone 13'] }
      : { viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500 };
    const ctx = await B.newContext({ ...base, locale: 'et-EE', extraHTTPHeaders: { 'x-real-ip': ip() }, ...extra });
    ctx.setDefaultTimeout(20000);
    // sem traducao automatica (chave Gemini de teste): a descricao aparece como foi escrita
    await ctx.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
    // cartao de cookies do celular (12/11) cobre os botoes: ja respondido
    await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} });
    return ctx;
  };
  // WebKit so e preciso no fluxo de criar (D.1): fechar logo depois poupa ~300 MB no pico
  const fecharWebkit = async () => { await wk?.close().catch(() => {}); wk = null; };
  const fechar = async () => { await chrome.close().catch(() => {}); await fecharWebkit(); };
  return { contexto, fechar, fecharWebkit };
}
export const semRolagemLateral = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
export const visivel = (loc, ms = 8000) => loc.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
// WebKit relata um fetch/prefetch da MESMA origem abortado pela nossa propria navegacao ou pelo fecho do
// contexto como "<url> due to access control checks" (prefetch RSC dos links do painel, /api/traduzir):
// artefato do motor, nao erro do site - so esse padrao, e so na origem do proprio site (:3100), e ignorado
// (veredito Fable lote 2: um erro de CORS real contra o Supabase local nao pode ser silenciado)
// (o WebKit escreve so "/localhost:3100/<caminho> due to access control checks.", sem o esquema: compara pelo host:porta)
const HOST_SITE = (() => { try { return new URL(SITE).host; } catch { return 'localhost:3100'; } })();
const artefatoWebkit = (msg) => /due to access control checks/.test(msg) && msg.includes(`${HOST_SITE}/`);
export const vigiar = (p, erros, quem) => {
  p.on('pageerror', (e) => { const msg = String(e.message); if (!artefatoWebkit(msg)) erros.push(`${quem}: ${msg.slice(0, 200)}`); });
  p.on('dialog', (d) => d.accept().catch(() => {}));
};
export const entrarPelaTela = async (p, prefixo, u, voltar) => {
  await p.goto(`${SITE}${prefixo}/login${voltar ? `?voltar=${encodeURIComponent(voltar)}` : ''}`, { waitUntil: 'networkidle' });
  const email = (await p.locator('#c0862-2').count()) ? p.locator('#c0862-2') : p.locator('input[type=email]').last();
  await email.fill(u.email);
  await p.locator('#login-senha').fill(u.senha);
  await p.locator('form:has(#login-senha) button[type=submit]').click();
  await p.waitForURL((x) => !/\/login/.test(x.pathname), { timeout: 30000 }).catch(() => {});
  // espera chegar ao painel (nao a passagem pela home): navegar no meio da troca aborta o prefetch RSC
  // do menu e o WebKit registra "due to access control checks" como erro de pagina (falso erro)
  await p.waitForURL((x) => /\/(oficina|loja|cliente|admin)(\/|$)/.test(x.pathname), { timeout: 20000 }).catch(() => {});
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(400);
};
export const ir = async (p, url, ms = 2000) => { await p.goto(`${SITE}${url}`, { waitUntil: 'networkidle' }).catch(() => {}); await p.waitForTimeout(ms); };
// nenhum dos testids novos no DOM (tela de hoje)
export const semTestidsNovos = async (p) => { const achados = []; for (const t of NOVOS_TESTIDS) if (await p.locator(`[data-testid="${t}"]`).count()) achados.push(t); return achados; };
// texto da tela sem chave crua de traducao
export const semChaveCrua = (txt) => !/\?\?[a-zA-Z]|\bpecas\.[a-zA-Z]+\b|\boficinaPecas\.[a-zA-Z]+\b|\blojaCotacoes\.[a-zA-Z]+\b|\{dias\}|\{quantidade\}|\bundefined\b|\bNaN\b/.test(txt);

// e-mail de cotacao normalizado para comparar com a referencia (ids, datas, tag, links e nomes variaveis)
export const normalizarEmail = (html, tag) => String(html)
  .replace(/^<!--.*?-->\s*/, '')
  .replace(new RegExp(tag, 'g'), 'TAG')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID')
  .replace(/\/v\/[A-Za-z0-9_-]+\?o=[a-zA-Z-]+/g, '/v/LINK')
  .replace(/https?:\/\/[^"'\s<]+/g, 'URL')
  .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/g, 'DATA')
  .replace(/\s+/g, ' ')
  .trim();
export const RESULTADOS = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/pecas-v3';
export const PRINTS = RESULTADOS;
export const REFERENCIA_EMAIL = path.join(RESULTADOS, 'referencia-email-cotacao-un.html');
fs.mkdirSync(RESULTADOS, { recursive: true });
