import { supabaseAdmin } from './supabase-admin';
import { interruptorPecasV3Global } from './pecas-v3';
import { avaliavel, mesmoRegistro, referenciaP7, sino, emailL3, linkPedidoCompradora, DIA_MS } from './pecas-confianca';
import { notifLembrete } from './pecas-confianca-textos';

// Lote 3 de pecas (P-7, D-7): lembretes a DONA da oficina compradora para dar o retorno ("recebi"/
// "problema") e avaliar um pedido v3: o 1o no dia seguinte a data de referencia (entregue, recebido,
// problema ou cancelamento contra o fornecedor), o 2o no 3o dia (avisa que a partir do dia seguinte
// pedidos e confirmacoes ficam bloqueados). No maximo 2 (pedidos_pecas.lembretes_feedback; o bloqueio
// so vale depois do 1o). So pedidos v3 sem avaliacao, fora o par com o mesmo codigo de registro (P-20).
// Com o global desligado o filtro de conta de teste vai NA CONSULTA (licao da expirar-cotacoes-pecas).
// Chamada de hora em hora pelo crontab (UTC); um lembrete por pedido em cada chamada.

export async function feedbackPecas(agora = Date.now()): Promise<{ lembretes: number }> {
  const global = await interruptorPecasV3Global();
  let oficinasDeTeste: string[] | null = null;
  if (!global) {
    const { data: testes } = await supabaseAdmin.from('profiles').select('id').eq('conta_teste', true);
    const donos = ((testes as any[]) || []).map((p) => p.id);
    if (!donos.length) return { lembretes: 0 };
    const { data: ofs } = await supabaseAdmin.from('oficinas').select('id').in('profile_id', donos);
    oficinasDeTeste = ((ofs as any[]) || []).map((o) => o.id);
    if (!oficinasDeTeste.length) return { lembretes: 0 };
  }
  let consulta = supabaseAdmin.from('pedidos_pecas')
    .select(`id, cotacao_id, status, fornecedor_tipo, recebido_em, problema, problema_em, cancelado_por, cancelado_motivo, cancelado_em, entregue_em, lembretes_feedback,
      cotacao:cotacoes_pecas!pedidos_pecas_cotacao_id_fkey(peca_descricao),
      compradora:oficinas!pedidos_pecas_oficina_id_fkey(id, profile_id, nome_fantasia, cnpj, profile:profiles!oficinas_profile_id_fkey(email, nome, idioma, conta_teste)),
      loja:lojas_pecas(nome_fantasia, cnpj),
      oficina_fornecedora:oficinas!pedidos_pecas_oficina_fornecedora_id_fkey(nome_fantasia, cnpj)`)
    .eq('v3', true)
    .lt('lembretes_feedback', 2);
  if (oficinasDeTeste) consulta = consulta.in('oficina_id', oficinasDeTeste);
  const { data: cand, error } = await consulta.order('created_at').limit(500);
  if (error) throw new Error(error.message);
  const lista = ((cand as any[]) || []).filter((p) => avaliavel(p));
  if (!lista.length) return { lembretes: 0 };
  const { data: avs } = await supabaseAdmin.from('fornecedores_avaliacoes').select('pedido_id').in('pedido_id', lista.map((p) => p.id));
  const avaliados = new Set(((avs as any[]) || []).map((a) => a.pedido_id));

  let lembretes = 0;
  for (const p of lista) {
    if (avaliados.has(p.id)) continue;
    const dona = p.compradora;
    if (!global && !dona?.profile?.conta_teste) continue;
    const forn = p.fornecedor_tipo === 'loja' ? p.loja : p.oficina_fornecedora;
    if (mesmoRegistro(dona?.cnpj, forn?.cnpj)) continue;
    const ref = referenciaP7(p);
    if (!ref) continue;
    const n = Number(p.lembretes_feedback) || 0;
    const dias = (agora - Date.parse(ref)) / DIA_MS;
    if (!((n === 0 && dias >= 1) || (n === 1 && dias >= 3))) continue;
    // so quem ganha a troca manda (2 chamadas juntas nao mandam 2 vezes)
    const { data: mudou } = await supabaseAdmin.from('pedidos_pecas').update({ lembretes_feedback: n + 1 }).eq('id', p.id).eq('lembretes_feedback', n).select('id');
    if (!mudou?.length) continue;
    lembretes++;
    const peca = p.cotacao?.peca_descricao || '-';
    const fornecedor = forn?.nome_fantasia || '-';
    const link = linkPedidoCompradora(p.id);
    await sino(dona?.profile_id, dona?.profile?.idioma, 'feedback_peca_lembrete', (l) => notifLembrete(l, peca, fornecedor), { pedido_id: p.id, cotacao_id: p.cotacao_id, link });
    await emailL3({ tipo: n === 0 ? 'lembrete1' : 'lembrete2', para: dona?.profile?.email, nome: dona?.profile?.nome || dona?.nome_fantasia, idioma: dona?.profile?.idioma, vars: { peca, fornecedor }, linkInterno: link, extra: n === 1 });
  }
  return { lembretes };
}
