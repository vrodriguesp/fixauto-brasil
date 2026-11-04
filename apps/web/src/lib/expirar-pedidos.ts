import { supabaseAdmin } from '@/lib/supabase-admin';
import { notifPedidoExpiradoCliente, notifPedidoExpiradoOficina } from '@/lib/notif-i18n';

// Pedido expira (dono 04/11, migracao 072): aberto/em orcamento ha N dias (30)
// contados da criacao ou da ultima reabertura, sem orcamento escolhido -> "expirada".
// Os orcamentos nao mudam (ao reabrir voltam). Aviso no sino ao cliente e as
// oficinas que mandaram orcamento ainda valido.

export const ESTADOS_QUE_EXPIRAM = ['aberta', 'em_orcamento'];

/** regra pura (testada em scripts/teste-expirar-pedidos.ts) */
export function venceu(p: { status: string; created_at: string; reaberta_em: string | null }, dias: number, agora = Date.now()): boolean {
  if (!ESTADOS_QUE_EXPIRAM.includes(p.status)) return false;
  const inicio = Date.parse(p.reaberta_em || p.created_at);
  return Number.isFinite(inicio) && agora - inicio >= dias * 86400000;
}

export async function validadeDias(): Promise<number> {
  const { data } = await supabaseAdmin.from('plataforma_config').select('pedido_validade_dias').eq('id', 1).maybeSingle();
  return data?.pedido_validade_dias ?? 30;
}

export async function expirarPedidos(agora = Date.now()): Promise<{ expirados: number; avisos: number }> {
  const dias = await validadeDias();
  const limite = new Date(agora - dias * 86400000).toISOString();
  // candidatos no banco (criados ou reabertos antes do limite); a regra pura confirma
  const { data: cand, error } = await supabaseAdmin.from('solicitacoes')
    .select('id, numero, status, created_at, reaberta_em, cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(idioma)')
    .in('status', ESTADOS_QUE_EXPIRAM)
    .or(`and(reaberta_em.is.null,created_at.lt.${limite}),reaberta_em.lt.${limite}`)
    .limit(500);
  if (error) throw new Error(error.message);
  let expirados = 0, avisos = 0;
  for (const s of (cand || []) as any[]) {
    if (!venceu(s, dias, agora)) continue;
    // so troca se ainda estiver aberto (corrida com o cliente aceitando agora)
    const { data: mudou } = await supabaseAdmin.from('solicitacoes')
      .update({ status: 'expirada', expirada_em: new Date(agora).toISOString() })
      .eq('id', s.id).in('status', ESTADOS_QUE_EXPIRAM).select('id');
    if (!mudou?.length) continue;
    expirados++;
    const nc = notifPedidoExpiradoCliente(s.cliente?.idioma, String(s.numero), dias);
    const linhas: any[] = [{ profile_id: s.cliente_id, tipo: 'pedido_expirado', titulo: nc.titulo, mensagem: nc.mensagem, dados: { solicitacao_id: s.id } }];
    const { data: orcs } = await supabaseAdmin.from('orcamentos')
      .select('oficina:oficinas(profile_id, profile:profiles(idioma))')
      .eq('solicitacao_id', s.id).in('status', ['enviado', 'visualizado']);
    const vistos = new Set<string>();
    for (const o of (orcs || []) as any[]) {
      const pid = o.oficina?.profile_id; if (!pid || vistos.has(pid)) continue; vistos.add(pid);
      const no = notifPedidoExpiradoOficina(o.oficina?.profile?.idioma, String(s.numero));
      linhas.push({ profile_id: pid, tipo: 'pedido_expirado', titulo: no.titulo, mensagem: no.mensagem, dados: { solicitacao_id: s.id } });
    }
    const { error: eN } = await supabaseAdmin.from('notificacoes').insert(linhas);
    if (eN) console.error('[expirar-pedidos] aviso:', eN.message); else avisos += linhas.length;
  }
  return { expirados, avisos };
}
