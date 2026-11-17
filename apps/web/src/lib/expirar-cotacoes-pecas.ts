import { supabaseAdmin } from '@/lib/supabase-admin';
import { notifCotacaoPecaExpirada } from '@/lib/notif-i18n';
import { emTodasAsLinguas } from '@/lib/notif-textos';
import { interruptorPecasV3Global } from '@/lib/pecas-v3';

// Lote 1 de pecas (17/11): cotacao aberta/respondida com expira_em no passado (7 dias,
// ou 7 dias desde a ultima reabertura) -> 'expirada' + aviso no sino da compradora.
// POR COTACAO, so onde a tela nova vale: interruptor global ligado OU dona com conta de
// teste. Com o interruptor desligado uma cotacao real nunca vence (quem nao viu "vale
// 7 dias" nao perde a cotacao). Chamada de hora em hora pelo crontab do servidor.

export const ESTADOS_QUE_VENCEM = ['aberta', 'respondida'];

export async function expirarCotacoesPecas(agora = Date.now()): Promise<{ expiradas: number; avisos: number }> {
  const global = await interruptorPecasV3Global();
  const limite = new Date(agora).toISOString();
  const { data: cand, error } = await supabaseAdmin.from('cotacoes_pecas')
    .select('id, peca_descricao, reaberta_vezes, oficina:oficinas!cotacoes_pecas_oficina_id_fkey(profile_id, profile:profiles!oficinas_profile_id_fkey(idioma, conta_teste))')
    .in('status', ESTADOS_QUE_VENCEM)
    .lt('expira_em', limite)
    .order('expira_em')
    .limit(500);
  if (error) throw new Error(error.message);
  let expiradas = 0, avisos = 0;
  for (const c of (cand || []) as any[]) {
    const dona = c.oficina;
    if (!global && !dona?.profile?.conta_teste) continue;
    // so troca se ainda estiver aberta e vencida (corrida com a confirmacao ou a reabertura)
    const { data: mudou } = await supabaseAdmin.from('cotacoes_pecas')
      .update({ status: 'expirada' })
      .eq('id', c.id).in('status', ESTADOS_QUE_VENCEM).lt('expira_em', limite)
      .select('id');
    if (!mudou?.length) continue;
    expiradas++;
    if (!dona?.profile_id) continue;
    // um aviso por vencimento (tipo + cotacao + numero de reaberturas): tarefa repetida nao avisa de novo
    const reaberta = String(c.reaberta_vezes ?? 0);
    const { data: ja } = await supabaseAdmin.from('notificacoes').select('id')
      .eq('profile_id', dona.profile_id).eq('tipo', 'cotacao_peca_expirada')
      .eq('dados->>cotacao_id', c.id).eq('dados->>reaberta', reaberta).limit(1);
    if (ja?.length) continue;
    const peca = c.peca_descricao || '-';
    const n = notifCotacaoPecaExpirada(dona.profile?.idioma, peca);
    const { error: eN } = await supabaseAdmin.from('notificacoes').insert({
      profile_id: dona.profile_id,
      tipo: 'cotacao_peca_expirada',
      titulo: n.titulo,
      mensagem: n.mensagem,
      dados: { cotacao_id: c.id, link: '/oficina/pecas', reaberta, textos: emTodasAsLinguas((l) => notifCotacaoPecaExpirada(l, peca)) },
    });
    if (eN) console.error('[expirar-cotacoes-pecas] aviso:', eN.message); else avisos++;
  }
  return { expiradas, avisos };
}
