import { supabaseAdmin } from './supabase-admin';
import { currencyForCountry } from './currency';
import { formatCurrency, cleanDescricao } from './utils';
import { notifNovoOrcamento, notifOrcamentoRevisado, chatOrcamentoRevisado } from './notif-i18n';
import { emTodasAsLinguas } from './notif-textos';

// Orcamento ALTERADO pela oficina (revisao de enviado/visto/vencido, ou orcamento novo depois de recusado):
// o que o site faz no navegador em hooks/use-orcamentos.ts (update) - aviso `novo_orcamento` no sino/push do
// motorista ("revisado" ou "novo" depois da recusa) e, na revisao, a mensagem de sistema no chat. O app chama
// pela rota /api/notificar-orcamento com { revisao: true } (revisao Fable S3): a rota so avisava uma vez por
// orcamento, entao a revisao feita no app nunca chegava ao motorista. Sem e-mail/SMS (o site tambem nao manda
// na revisao). Retorna o id do aviso criado.
export async function avisarRevisaoOrcamento(orcamentoId: string, callerId: string, eraRecusado: boolean): Promise<{ ok: true; avisoId: string } | { ok: false; status: number; error: string }> {
  const { data: orc } = await supabaseAdmin.from('orcamentos')
    .select('id, valor_total, prazo_dias, observacoes, revisao_numero, solicitacao_id, oficina:oficinas(id, nome_fantasia, profile_id, pais, profile:profiles(idioma)), solicitacao:solicitacoes(id, cliente_id)')
    .eq('id', orcamentoId).maybeSingle();
  if (!orc || !(orc as any).solicitacao) return { ok: false, status: 404, error: 'Orçamento não encontrado' };
  const oficina = (orc as any).oficina;
  if (oficina?.profile_id !== callerId) return { ok: false, status: 403, error: 'Acesso negado' };
  const clienteId = (orc as any).solicitacao.cliente_id as string;
  const { data: cliente } = await supabaseAdmin.from('profiles').select('idioma').eq('id', clienteId).maybeSingle();
  const moeda = currencyForCountry(oficina.pais);
  const nome = oficina.nome_fantasia || 'Oficina';
  const texto = (l: string | null | undefined) => {
    const v = formatCurrency(Number(orc.valor_total), moeda, l || undefined);
    return eraRecusado ? notifNovoOrcamento(l, nome, v) : notifOrcamentoRevisado(l, nome, v);
  };
  const n = texto(cliente?.idioma);
  const { data: aviso, error } = await supabaseAdmin.from('notificacoes').insert({
    profile_id: clienteId, tipo: 'novo_orcamento', titulo: n.titulo, mensagem: n.mensagem,
    dados: { solicitacao_id: orc.solicitacao_id, orcamento_id: orc.id, revisao: !eraRecusado, textos: emTodasAsLinguas((l) => texto(l)) },
  }).select('id').single();
  if (error || !aviso) return { ok: false, status: 500, error: error?.message || 'Falha ao gravar o aviso' };
  // resumo da revisao no chat (orcamento novo depois de recusado: sem "revisao n", como no site)
  if (!eraRecusado) {
    const idiomaOficina = oficina.profile?.idioma;
    await supabaseAdmin.from('mensagens').insert({
      solicitacao_id: orc.solicitacao_id, oficina_id: oficina.id, remetente_id: oficina.profile_id,
      texto: chatOrcamentoRevisado(idiomaOficina, Number(orc.revisao_numero) || 1, formatCurrency(Number(orc.valor_total), moeda, idiomaOficina), Number(orc.prazo_dias), cleanDescricao(orc.observacoes)),
    }).then(() => {}, () => {});
  }
  return { ok: true, avisoId: aviso.id };
}
