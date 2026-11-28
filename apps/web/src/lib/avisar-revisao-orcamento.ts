import { supabaseAdmin } from './supabase-admin';
import { currencyForCountry } from './currency';
import { formatCurrency, cleanDescricao } from './utils';
import { notifNovoOrcamento, notifOrcamentoRevisado, chatOrcamentoRevisado } from './notif-i18n';
import { emTodasAsLinguas } from './notif-textos';
import { dentroDoLimite } from './rate-limit';

// revisoes por orcamento por hora (revisao 28/11): sem limite uma oficina podia "subir revisao_numero + POST" em laco e
// inundar o motorista de push/sino/chat; 10/h e folga de sobra para corrigir um orcamento
export const LIMITE_REVISOES_HORA = 10;

// Orcamento ALTERADO pela oficina (revisao de enviado/visto/vencido, ou orcamento novo depois de recusado):
// o que o site faz no navegador em hooks/use-orcamentos.ts (update) - aviso `novo_orcamento` no sino/push do
// motorista ("revisado" ou "novo" depois da recusa) e, na revisao, a mensagem de sistema no chat. O app chama
// pela rota /api/notificar-orcamento com { revisao: true } (revisao Fable S3): a rota so avisava uma vez por
// orcamento, entao a revisao feita no app nunca chegava ao motorista. Sem e-mail/SMS (o site tambem nao manda
// na revisao). Retorna o id do aviso criado.
// pedido em que ainda cabe alterar o orcamento: aberto, ou aceito/em andamento SO com este orcamento (M13, caso 284 da auditoria)
const ABERTO = ['aberta', 'em_orcamento', 'no_show'];

export async function avisarRevisaoOrcamento(orcamentoId: string, callerId: string, eraRecusado: boolean): Promise<{ ok: true; avisoId: string; semMudanca?: boolean; limitado?: boolean } | { ok: false; status: number; error: string; codigo?: string }> {
  const { data: orc } = await supabaseAdmin.from('orcamentos')
    .select('id, status, valor_total, prazo_dias, observacoes, revisao_numero, revisado_em, solicitacao_id, oficina:oficinas(id, nome_fantasia, profile_id, pais, profile:profiles(idioma)), solicitacao:solicitacoes(id, cliente_id, status)')
    .eq('id', orcamentoId).maybeSingle();
  if (!orc || !(orc as any).solicitacao) return { ok: false, status: 404, error: 'Orçamento não encontrado' };
  const oficina = (orc as any).oficina;
  if (oficina?.profile_id !== callerId) return { ok: false, status: 403, error: 'Acesso negado' };
  const statusSol = (orc as any).solicitacao.status as string;
  if (!ABERTO.includes(statusSol) && !(['aceita', 'em_andamento'].includes(statusSol) && orc.status === 'aceito')) {
    return { ok: false, status: 409, error: 'Pedido encerrado para esta oficina', codigo: 'SERVICO_ENCERRADO' };
  }
  const clienteId = (orc as any).solicitacao.cliente_id as string;
  // mesma revisao ja avisada (valor e numero da revisao iguais ao ultimo aviso): nao repete sino nem chat (A3-c)
  const { data: ultimo } = await supabaseAdmin.from('notificacoes').select('id, dados').eq('profile_id', clienteId).eq('tipo', 'novo_orcamento')
    .eq('dados->>orcamento_id', orc.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const d0 = (ultimo?.dados || {}) as Record<string, unknown>;
  if (ultimo && d0.revisao_numero != null && Number(d0.revisao_numero) === Number(orc.revisao_numero || 0) && Number(d0.valor_total) === Number(orc.valor_total) && String(d0.revisado_em || '') === String(orc.revisado_em || '')) {
    return { ok: true, avisoId: ultimo.id, semMudanca: true };
  }
  const moeda = currencyForCountry(oficina.pais);
  // resumo da revisao no chat (orcamento novo depois de recusado: sem "revisao n", como no site). O app ja GRAVOU o
  // orcamento antes de chamar aqui: o resumo e o que explica a mudanca de preco ao motorista, por isso sai sempre
  const resumoNoChat = async () => {
    if (eraRecusado) return;
    const idiomaOficina = oficina.profile?.idioma;
    await supabaseAdmin.from('mensagens').insert({
      solicitacao_id: orc.solicitacao_id, oficina_id: oficina.id, remetente_id: oficina.profile_id,
      texto: chatOrcamentoRevisado(idiomaOficina, Number(orc.revisao_numero) || 1, formatCurrency(Number(orc.valor_total), moeda, idiomaOficina), Number(orc.prazo_dias), cleanDescricao(orc.observacoes)),
    }).then(() => {}, () => {});
  };
  // limite (10/h por orcamento) contado so DEPOIS do dono, do estado do pedido e da checagem "mesma revisao" (403/409 e
  // repeticao sem mudanca nao gastam); estourado = o resumo no chat sai, sino/push nao, e o app conta a verdade
  if (!dentroDoLimite(`notificar-orc-rev:${orc.id}`, LIMITE_REVISOES_HORA, 60 * 60 * 1000)) {
    await resumoNoChat();
    return { ok: true, avisoId: '', limitado: true };
  }
  const { data: cliente } = await supabaseAdmin.from('profiles').select('idioma').eq('id', clienteId).maybeSingle();
  const nome = oficina.nome_fantasia || 'Oficina';
  const texto = (l: string | null | undefined) => {
    const v = formatCurrency(Number(orc.valor_total), moeda, l || undefined);
    return eraRecusado ? notifNovoOrcamento(l, nome, v) : notifOrcamentoRevisado(l, nome, v);
  };
  const n = texto(cliente?.idioma);
  const { data: aviso, error } = await supabaseAdmin.from('notificacoes').insert({
    profile_id: clienteId, tipo: 'novo_orcamento', titulo: n.titulo, mensagem: n.mensagem,
    dados: { solicitacao_id: orc.solicitacao_id, orcamento_id: orc.id, revisao: !eraRecusado, revisao_numero: orc.revisao_numero || 0, valor_total: orc.valor_total, revisado_em: orc.revisado_em, textos: emTodasAsLinguas((l) => texto(l)) },
  }).select('id').single();
  if (error || !aviso) return { ok: false, status: 500, error: error?.message || 'Falha ao gravar o aviso' };
  await resumoNoChat();
  return { ok: true, avisoId: aviso.id };
}
