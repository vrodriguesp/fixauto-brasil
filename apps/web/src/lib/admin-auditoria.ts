import { SupabaseClient } from '@supabase/supabase-js';

// Registro de toda acao do admin que muda dado de alguem (status de
// servico, agendamento, comissao, selo de fundador...). Serve para saber
// depois quem mudou o que, quando e por que - e para desfazer se preciso.
// Falha ao registrar nao derruba a acao (so loga).
export async function registrarAuditoria(
  supabaseAdmin: SupabaseClient,
  r: {
    adminId: string;
    entidade: string;
    entidadeId?: string | null;
    acao: string;
    antes?: unknown;
    depois?: unknown;
    motivo?: string | null;
    solicitacaoId?: string | null;
  }
): Promise<void> {
  const { error } = await supabaseAdmin.from('admin_auditoria').insert({
    admin_id: r.adminId,
    entidade: r.entidade,
    entidade_id: r.entidadeId ?? null,
    acao: r.acao,
    antes: r.antes ?? null,
    depois: r.depois ?? null,
    motivo: r.motivo?.trim() || null,
    solicitacao_id: r.solicitacaoId ?? null,
  });
  if (error) console.error('[admin-auditoria] falha ao registrar:', error.message);
}
