// Base dos testes do lote 3 de pecas ("confianca", 17/11; Documentos/Analises/Pecas_lote3_2026-11-17:
// Mapa_lote3.md + Decisoes_dono_2026-11-17.md + Fable_auditoria_mapa_lote3.md, contrato em
// Contrato_testids_lote3.md). Reusa pecas-v3-lote2-lib.mjs (lotes 1 e 2) e acrescenta o que o lote 3
// precisa: pedidos v3 semeados pela service role, rotas novas (recebido, problema, cancelar, depois do
// cancelamento, avaliacao, pendentes P-7, lembretes, admin, push do navegador), referencias novas
// byte a byte e a limpeza das tabelas novas.
// Escrito ANTES da implementacao (teste primeiro, autor independente no lugar do Fable, que estava sem
// creditos em 17/11): os nomes aqui sao o contrato.
import fs from 'node:fs';
import path from 'node:path';
import { ambienteL2, naoExiste, psql, SITE, RESULTADOS, TODOS_TESTIDS_NOVOS, normalizarEmail, RAIZ, desbloquearPastaEmails } from './pecas-v3-lote2-lib.mjs';
export * from './pecas-v3-lote2-lib.mjs';

// ---------------- contrato do lote 3: nomes ----------------
export const ROTA = {
  recebido: '/api/pedido-peca/recebido',
  problema: '/api/pedido-peca/problema',
  cancelar: '/api/pedido-peca/cancelar',
  depois: '/api/pedido-peca/depois-do-cancelamento',
  pendentes: '/api/pedido-peca/pendentes',
  avaliar: '/api/avaliacao-fornecedor',
  resposta: '/api/avaliacao-fornecedor/resposta',
  denunciar: '/api/avaliacao-fornecedor/denunciar',
  adminAvaliacao: '/api/admin/avaliacao-fornecedor',
  adminPedido: '/api/admin/pedido-peca',
  corrigir: '/api/admin/corrigir',
  feedback: '/api/tarefas/feedback-pecas',
  push: '/api/push/navegador',
  entregue: '/api/marcar-pedido-peca-entregue',
};
export const PROBLEMAS = ['nao_entregou', 'peca_errada', 'avariada', 'outro'];
export const MOTIVOS_FORNECEDOR = ['sem_estoque', 'prazo', 'compradora_pediu', 'outro'];
export const MOTIVOS_COMPRADORA = ['comprei_outro', 'carro_saiu', 'erro_pedido', 'outro'];
export const CONDICOES = ['nova', 'sobra_nova', 'usada_propria', 'recondicionada'];
export const TIPOS_SINO_L3 = ['pedido_peca_recebido', 'pedido_peca_problema', 'pedido_peca_cancelado', 'avaliacao_recebida_fornecedor', 'feedback_peca_lembrete', 'cotacao_peca_reaberta_cancelamento'];
// elementos que SO existem com o interruptor ligado E em pedido v3 (nunca no DOM da tela de hoje)
export const NOVOS_TESTIDS_L3 = [
  'pedido-recebi', 'pedido-problema', ...PROBLEMAS.map((v) => `problema-motivo-${v}`), 'problema-texto', 'problema-enviar',
  'pedido-cancelar', ...[...new Set([...MOTIVOS_FORNECEDOR, ...MOTIVOS_COMPRADORA])].map((v) => `cancelar-motivo-${v}`), 'cancelar-texto', 'cancelar-enviar',
  'pedido-cancelado-info', 'pedido-falta-avaliar', 'avaliar-form', ...[1, 2, 3, 4, 5].map((n) => `avaliar-nota-${n}`),
  'avaliar-peca-certa-sim', 'avaliar-peca-certa-nao', 'avaliar-no-prazo-sim', 'avaliar-no-prazo-nao', 'avaliar-comentario', 'avaliar-enviar', 'avaliar-fechar', 'avaliacao-enviada', 'avaliar-erro',
  'pos-cancelamento-reabrir', 'pos-cancelamento-nova', 'pos-cancelamento-vencida',
  'p7-aviso', 'p7-bloqueio', 'p7-confirmar-bloqueado', 'p7-criar-bloqueado',
  'oferta-nota', 'oferta-nota-nova', 'oferta-ver-avaliacoes', 'avaliacoes-lista', 'avaliacao-item', 'oferta-condicao',
  'fornecedora-nota', 'avaliacao-responder', 'avaliacao-resposta-texto', 'avaliacao-resposta-enviar', 'avaliacao-denunciar', 'avaliacao-denuncia-motivo', 'avaliacao-denuncia-enviar',
  ...CONDICOES.map((v) => `resposta-condicao-${v}`),
  'pedido-recebido-info', 'pedido-problema-info', 'contato-arquivado',
  'loja-avaliacoes-resumo', 'loja-avaliacoes-item', 'loja-avaliacoes-vazio',
  'perfil-pecas-alcance-pais', 'perfil-pecas-alcance-raio', 'push-ligar', 'push-desligar', 'push-estado', 'push-ios-dica',
  'admin-avaliacao-ocultar', 'admin-pedidos-problema', 'admin-pedido-recebido', 'admin-p7-bloqueadas',
];
// testids com id no nome (p7-pedido-<id>, p7-avaliar-<id>): procurados por prefixo
export const PREFIXOS_TESTIDS_L3 = ['p7-pedido-', 'p7-avaliar-'];
export const TODOS_TESTIDS_ATE_L3 = [...TODOS_TESTIDS_NOVOS, ...NOVOS_TESTIDS_L3];
export const semTestidsNovosL3 = async (p, { ignorar = [] } = {}) => {
  const achados = [];
  for (const t of TODOS_TESTIDS_ATE_L3) if (!ignorar.includes(t) && await p.locator(`[data-testid="${t}"]`).count()) achados.push(t);
  for (const pre of PREFIXOS_TESTIDS_L3) if (await p.locator(`[data-testid^="${pre}"]`).count()) achados.push(`${pre}*`);
  return achados;
};
// chaves de traducao novas (namespace pecas.*; recomendado em *.misc.json), 6 idiomas
export const CHAVES_I18N_L3 = [
  'pecas.recebi', 'pecas.recebeuPeca', 'pecas.problema', ...['naoEntregou', 'pecaErrada', 'avariada', 'outro'].map((k) => `pecas.problemas.${k}`), 'pecas.problemaEnviar',
  'pecas.cancelarPedidoPeca', 'pecas.cancelarEnviar', ...['semEstoque', 'prazo', 'compradoraPediu', 'compreiOutro', 'carroSaiu', 'erroPedido', 'naoEntregou', 'outro'].map((k) => `pecas.motivosCancelamento.${k}`),
  'pecas.canceladoPor', 'pecas.canceladoPorQuem.compradora', 'pecas.canceladoPorQuem.fornecedor', 'pecas.canceladoPorQuem.admin',
  'pecas.faltaAvaliar', 'pecas.avaliacao.titulo', 'pecas.avaliacao.pecaCerta', 'pecas.avaliacao.noPrazo', 'pecas.avaliacao.comentario', 'pecas.avaliacao.enviar', 'pecas.avaliacao.depois', 'pecas.avaliacao.enviada', 'pecas.avaliacao.sim', 'pecas.avaliacao.nao', 'pecas.avaliacao.erro', 'pecas.avaliacao.contatoNoTexto',
  'pecas.posCancelamento.titulo', 'pecas.posCancelamento.reabrir', 'pecas.posCancelamento.nova', 'pecas.posCancelamento.vencida',
  'pecas.p7.aviso', 'pecas.p7.bloqueio', 'pecas.p7.linha', 'pecas.p7.avaliar', 'pecas.p7.confirmarBloqueado',
  'pecas.notaFornecedor', 'pecas.noPrazoPct', 'pecas.novoNoBipfix', 'pecas.verAvaliacoes', 'pecas.contatoArquivado', 'pecas.recebidoEm', 'pecas.problemaInfo',
  'pecas.suaNotaFornecedora', 'pecas.responderAvaliacao', 'pecas.denunciarAvaliacao', 'pecas.respostaFornecedor',
  ...['nova', 'sobraNova', 'usadaPropria', 'recondicionada'].map((k) => `pecas.condicoes.${k}`), 'pecas.condicao',
  'pecas.alcance.titulo', 'pecas.alcance.pais', 'pecas.alcance.raio',
  'pecas.lojaAvaliacoes.titulo', 'pecas.lojaAvaliacoes.vazio',
];
export const CHAVES_I18N_L3_TEXTO = CHAVES_I18N_L3.filter((k) => !/\.(sim|nao)$/.test(k)); // "Sim/Nao" pode coincidir entre linguas

// referencias: as 5 do lote 2 (so comparadas, NUNCA regravadas por este lote) + 4 novas gravadas no codigo de hoje
export const REF_L3 = {
  emailPedidoEntregue: path.join(RESULTADOS, 'referencia-email-pedido-entregue.html'),
  sinoPedidoEntregue: path.join(RESULTADOS, 'referencia-sino-pedido-entregue.json'),
  sinoPedidoConfirmado: path.join(RESULTADOS, 'referencia-sino-pedido-confirmado.json'),
  emailCotacaoOficina: path.join(RESULTADOS, 'referencia-email-cotacao-oficina.html'),
};
const NOVAS_REFS = new Set(Object.values(REF_L3));
// a gravacao so e aceita no codigo de hoje: sem 093_*.sql no repositorio e sem pedidos_pecas.v3 no banco
export const podeGravarReferencia = () => {
  const mig = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).some((f) => /^093_/.test(f));
  const col = psql("select count(*) from information_schema.columns where table_name='pedidos_pecas' and column_name='v3'") !== '0';
  return !mig && !col;
};
export function compararReferenciaL3(ok, nome, arquivo, normalizado) {
  const gravar = process.env.PECAS_V3_GRAVAR_REFERENCIA === '1' && NOVAS_REFS.has(arquivo);
  if (gravar) {
    if (!podeGravarReferencia()) { ok(`${nome} referencia NAO gravada`, false, 'PECAS_V3_GRAVAR_REFERENCIA=1 recusado: a 093 ja existe (arquivo ou coluna pedidos_pecas.v3) - a referencia tem de vir do codigo de hoje'); return false; }
    fs.writeFileSync(arquivo, normalizado);
    console.log(`info ${nome}: referencia gravada em ${arquivo} (codigo de hoje, PECAS_V3_GRAVAR_REFERENCIA=1)`);
    ok(`${nome} referencia gravada agora (rodada de base)`, true);
    return true;
  }
  if (!fs.existsSync(arquivo)) { ok(`${nome} IDENTICO a referencia`, false, `referencia ausente: ${arquivo} - rode a suite desligada no codigo de hoje com PECAS_V3_GRAVAR_REFERENCIA=1`); return false; }
  const ref = fs.readFileSync(arquivo, 'utf8');
  let detalhe = '';
  if (ref !== normalizado) { let i = 0; while (i < ref.length && ref[i] === normalizado[i]) i++; detalhe = `difere a partir de ${i}: ref="${ref.slice(i, i + 120)}" agora="${normalizado.slice(i, i + 120)}"`; }
  ok(`${nome} IDENTICO a referencia (ignorando ids, datas, links e a tag)`, ref === normalizado, detalhe);
  return ref === normalizado;
}

// politicas RLS que o lote 3 NAO pode mudar (D-12: sem anonimato; so cotacoes_pecas_insert muda pelo P-7).
// md5 tirado do banco local com 091+092 em 17/11 (= producao): 25 politicas.
export const POLITICAS_INTOCADAS_SQL = "select md5(string_agg(c.relname||'.'||polname||':'||polcmd::text||':'||coalesce(pg_get_expr(polqual,polrelid),'')||':'||coalesce(pg_get_expr(polwithcheck,polrelid),''), '|' order by c.relname, polname))||'|'||count(*) from pg_policy p join pg_class c on c.oid=p.polrelid where c.relname in ('cotacoes_pecas','cotacoes_pecas_respostas','cotacoes_pecas_mensagens','cotacoes_pecas_dispensas','pedidos_pecas','cotacoes_pecas_placa','fornecedores_contato','oficinas','lojas_pecas','notificacoes') and not (c.relname='cotacoes_pecas' and polname='cotacoes_pecas_insert')";
export const POLITICAS_INTOCADAS_MD5 = '0a2f6091747a01f6f3a7888ce5c183a8|25';

// normalizacao do e-mail para as referencias (a mesma do lote 2)
export const normalizarEmailL3 = normalizarEmail;
// |a - b| em minutos (datas ISO)
export const difMin = (a, b) => (a && b ? Math.abs(new Date(a) - new Date(b)) / 60000 : Infinity);

export function ambienteL3(env) {
  const A = ambienteL2(env);
  const { admin, criado } = A;
  criado.pedidos = [];
  let p7MinimoAntes; // plataforma_config.pecas_p7_minimo no inicio (restaurado em limpar)

  const temColuna = (t, c) => A.colunaExiste(t, c);
  const tem093 = () => temColuna('pedidos_pecas', 'v3') && A.tabelaExiste('fornecedores_avaliacoes');

  // pedido v3 semeado pela service role (cotacao fechada + resposta + pedido). Campos do lote 3 em `campos`.
  const pedidoV3 = async (of, forn, { tipo = 'loja', status = 'confirmado', campos = {}, descricao = 'Pedido v3', preco = 10, v3 = true } = {}) => {
    const cot = await A.cotacao(of, descricao, { urgencia: 'hoje', alvo: tipo === 'loja' ? 'so_lojas' : 'todos' });
    const respostaId = await A.resposta(cot, forn, { tipo, preco });
    const { error: eF } = await admin.from('cotacoes_pecas').update({ status: 'fechada' }).eq('id', cot.id);
    if (eF) throw new Error(`fechar cotacao: ${eF.message}`);
    const linha = { cotacao_id: cot.id, resposta_id: respostaId, oficina_id: of.id, fornecedor_tipo: tipo, loja_id: tipo === 'loja' ? forn.id : null, oficina_fornecedora_id: tipo === 'oficina' ? forn.id : null, preco_total: preco, quantidade: 1, status, ...(v3 === null ? {} : { v3 }), ...campos };
    const { data, error } = await admin.from('pedidos_pecas').insert(linha).select('id').single();
    if (error) throw new Error(`pedido v3 (093 ausente? ${naoExiste(error) ? 'coluna nova inexistente' : ''}): ${error.message}`);
    criado.pedidos.push(data.id);
    return { id: data.id, cotacao: cot, respostaId, descricao: cot.descricao };
  };
  const pedidoNoBanco = (id) => A.linhaJson('pedidos_pecas', id);
  const atualizarPedido = async (id, campos) => { const { error } = await admin.from('pedidos_pecas').update(campos).eq('id', id); if (error) throw new Error(`update pedido: ${error.message}`); };
  // avaliacao semeada pela service role (o cliente nunca grava: so a rota)
  const avaliacaoSemente = async (ped, of, autor, forn, { tipo = 'loja', nota = 5, peca_certa = true, no_prazo = true, comentario = null, extra = {} } = {}) => {
    const { data, error } = await admin.from('fornecedores_avaliacoes').insert({ pedido_id: ped.id, oficina_id: of.id, autor_profile_id: autor.id, fornecedor_tipo: tipo, fornecedor_id: forn.id, nota, peca_certa, no_prazo, comentario, editavel_ate: new Date(Date.now() + 48 * 3600e3).toISOString(), ...extra }).select('id').single();
    if (error) throw new Error(`avaliacao semente (093 ausente?): ${error.message}`);
    return data.id;
  };
  const lerOuVazio = async (q) => { const { data, error } = await q; if (error && !naoExiste(error)) throw new Error(error.message); return data || []; };
  const avaliacoesDe = (filtro = {}) => { let q = admin.from('fornecedores_avaliacoes').select('*'); for (const [k, v] of Object.entries(filtro)) q = v === null ? q.is(k, null) : q.eq(k, v); return lerOuVazio(q); };
  const avaliacaoDoPedido = async (pedidoId) => (await avaliacoesDe({ pedido_id: pedidoId }))[0] || null;

  // rotas
  const post = (rota, corpo, s) => A.api('POST', rota, corpo, s?.token);
  const recebido = (pedidoId, s) => post(ROTA.recebido, { pedidoId }, s);
  const problema = (pedidoId, prob, s, texto) => post(ROTA.problema, { pedidoId, problema: prob, ...(texto ? { texto } : {}) }, s);
  const cancelar = (pedidoId, motivo, s, texto) => post(ROTA.cancelar, { pedidoId, motivo, ...(texto ? { texto } : {}) }, s);
  const depois = (pedidoId, escolha, s) => post(ROTA.depois, { pedidoId, escolha }, s);
  const pendentes = (s) => A.api('GET', ROTA.pendentes, undefined, s?.token);
  const avaliar = (pedidoId, s, campos = {}) => post(ROTA.avaliar, { pedidoId, nota: 4, pecaCerta: true, noPrazo: true, ...campos }, s);
  const editarAvaliacao = (pedidoId, s, campos = {}) => A.api('PATCH', ROTA.avaliar, { pedidoId, ...campos }, s?.token);
  const responder = (avaliacaoId, texto, s) => post(ROTA.resposta, { avaliacaoId, texto }, s);
  const denunciar = (avaliacaoId, motivo, s) => post(ROTA.denunciar, { avaliacaoId, motivo }, s);
  const adminAvaliacao = (id, oculta, motivo, s) => post(ROTA.adminAvaliacao, { id, oculta, motivo }, s);
  const adminPedido = (id, acao, s) => post(ROTA.adminPedido, { id, ...acao }, s);
  const corrigir = (id, status, s) => post(ROTA.corrigir, { entidade: 'pedido_peca', id, alteracoes: { status }, motivo: 'teste lote 3', notificar: false }, s);
  const entregue = (pedidoId, s) => post(ROTA.entregue, { pedidoId }, s);
  const feedback = (agora, chave = env.TAREFAS_CHAVE) => A.api('POST', ROTA.feedback, agora ? { agora } : {}, null, { 'x-tarefa-chave': chave });
  const resumoForn = async (s, tipo, id) => { const { data, error } = await s.c.rpc('fornecedor_resumo', { p_tipo: tipo, p_id: id }); return { linha: Array.isArray(data) ? data[0] || null : data || null, error }; };
  const pendenteRpc = async (s, oficinaId) => { const { data, error } = await s.c.rpc('oficina_feedback_pecas_pendente', { p_oficina: oficinaId }); return { valor: data, error }; };

  // config do P-7 (pecas_p7_minimo), restaurada em limpar
  const p7Minimo = async (n) => {
    if (p7MinimoAntes === undefined) { const v = psql("select coalesce(to_jsonb(c)->>'pecas_p7_minimo','') from plataforma_config c where id = 1"); p7MinimoAntes = v === '' ? null : Number(v); }
    const { error } = await admin.from('plataforma_config').update({ pecas_p7_minimo: n }).eq('id', 1);
    return error || null;
  };

  const limpar = async () => {
    const erros = [];
    const del = async (tabela, col, val, op = 'eq') => { const q = admin.from(tabela).delete(); const { error } = await (op === 'in' ? q.in(col, val) : q.eq(col, val)); if (error && !naoExiste(error)) erros.push(`${tabela}: ${error.message}`); };
    // pedidos desta rodada (semeados + os que as rotas/telas criaram nas cotacoes das oficinas desta rodada)
    const pedIds = new Set(criado.pedidos);
    const cots = new Set(criado.cotacoes);
    if (criado.oficinas.length) for (const c of await lerOuVazio(admin.from('cotacoes_pecas').select('id').in('oficina_id', criado.oficinas))) cots.add(c.id);
    if (cots.size) for (const p of await lerOuVazio(admin.from('pedidos_pecas').select('id').in('cotacao_id', [...cots]))) pedIds.add(p.id);
    const peds = [...pedIds];
    // sinos de pedido (inclusive os de admins pre-existentes: "nao entregou" avisa o admin)
    for (const id of peds) await del('notificacoes', 'dados->>pedido_id', id);
    if (peds.length) await del('fornecedores_avaliacoes', 'pedido_id', peds, 'in');
    if (criado.oficinas.length) { await del('fornecedores_avaliacoes', 'oficina_id', criado.oficinas, 'in'); await del('fornecedores_avaliacoes', 'fornecedor_id', criado.oficinas, 'in'); }
    if (criado.lojas.length) await del('fornecedores_avaliacoes', 'fornecedor_id', criado.lojas, 'in');
    for (const id of criado.contas) await del('push_navegador', 'profile_id', id);
    // pedidos_pecas.nova_cotacao_id aponta para cotacao desta rodada: ON DELETE SET NULL (093) - nada a fazer
    if (p7MinimoAntes !== undefined && p7MinimoAntes !== null) {
      const { error } = await admin.from('plataforma_config').update({ pecas_p7_minimo: p7MinimoAntes }).eq('id', 1);
      if (error && !naoExiste(error)) erros.push(`plataforma_config.pecas_p7_minimo: ${error.message}`);
    }
    return [...erros, ...(await A.limpar())];
  };
  const verificarLimpeza = async () => {
    const sobras = await A.verificarLimpeza();
    const conta1 = async (nome, q) => { const { count, error } = await q; if (error) { if (!naoExiste(error)) sobras.push(`${nome}: ${error.message}`); } else if (count) sobras.push(`${nome}: ${count}`); };
    if (criado.oficinas.length) await conta1('fornecedores_avaliacoes (oficinas)', admin.from('fornecedores_avaliacoes').select('id', { count: 'exact', head: true }).or(`oficina_id.in.(${criado.oficinas.join(',')}),fornecedor_id.in.(${criado.oficinas.join(',')})`));
    if (criado.lojas.length) await conta1('fornecedores_avaliacoes (lojas)', admin.from('fornecedores_avaliacoes').select('id', { count: 'exact', head: true }).in('fornecedor_id', criado.lojas));
    if (criado.contas.length) await conta1('push_navegador', admin.from('push_navegador').select('id', { count: 'exact', head: true }).in('profile_id', criado.contas));
    if (criado.pedidos.length) await conta1('pedidos_pecas', admin.from('pedidos_pecas').select('id', { count: 'exact', head: true }).in('id', criado.pedidos));
    return sobras;
  };
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

  return { ...A, tem093, temColuna, pedidoV3, pedidoNoBanco, atualizarPedido, avaliacaoSemente, avaliacoesDe, avaliacaoDoPedido, recebido, problema, cancelar, depois, pendentes, avaliar, editarAvaliacao, responder, denunciar, adminAvaliacao, adminPedido, corrigir, entregue, feedback, resumoForn, pendenteRpc, p7Minimo, limpar, verificarLimpeza, limparAoInterromper };
}
export const SITE_L3 = SITE;
