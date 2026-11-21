import type { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase-admin';
import { getSessionUserId } from './api-auth';
import { hashToken, iguaisSeguro } from './segredos';

export type PapelEmergencia = 'proprietario' | 'outro' | 'oficina' | 'admin';

export const HEADER_TOKEN = 'x-emergencia-token';

/**
 * Quem pode ver/agir num acidente: quem registrou (pelo codigo secreto
 * guardado no navegador dele, ou logado como dono), o outro motorista
 * logado, a oficina escolhida (orcamento aceito) e o admin. O id sozinho nao da acesso a nada.
 */
export async function acessoEmergencia(
  req: NextRequest,
  emergenciaId: string
): Promise<{ papel: PapelEmergencia; userId: string | null; emergencia: any; oficinaIds?: string[] } | null> {
  const { data: emergencia } = await supabaseAdmin.from('emergencias').select('*').eq('id', emergenciaId).maybeSingle();
  if (!emergencia) return null;

  const token = req.headers.get(HEADER_TOKEN);
  const userId = await getSessionUserId(req);

  if (token && emergencia.acesso_token_hash && iguaisSeguro(hashToken(token), emergencia.acesso_token_hash)) {
    return { papel: 'proprietario', userId, emergencia };
  }
  if (!userId) return null;
  if (emergencia.profile_id === userId) return { papel: 'proprietario', userId, emergencia };

  const { data: outro } = await supabaseAdmin
    .from('emergencia_outro_veiculo')
    .select('id')
    .eq('emergencia_id', emergenciaId)
    .eq('profile_id', userId)
    .maybeSingle();
  if (outro) return { papel: 'outro', userId, emergencia };

  const { data: perfil } = await supabaseAdmin.from('profiles').select('tipo').eq('id', userId).maybeSingle();
  if (perfil?.tipo === 'admin') return { papel: 'admin', userId, emergencia };

  // Oficina: so a ESCOLHIDA (orcamento aceito no pedido do acidente) - espelho de
  // oficina_atende/pode_ver_emergencia da migracao 074. Antes bastava ter sido
  // avisada, e a oficina avisada lia o contato do outro motorista, a conversa
  // entre os dois e os orcamentos das concorrentes (auditoria Fable, B1). A
  // avisada ve o pedido no painel dela (/oficina/pedidos/<id>).
  if (emergencia.solicitacao_id) {
    const ids = await minhasOficinas(userId);
    if (ids.length) {
      const { data: aceito } = await supabaseAdmin
        .from('orcamentos')
        .select('id')
        .eq('solicitacao_id', emergencia.solicitacao_id)
        .eq('status', 'aceito')
        .in('oficina_id', ids)
        .limit(1);
      if (aceito?.length) return { papel: 'oficina', userId, emergencia, oficinaIds: ids };
    }
  }
  return null;
}

// mesma regra de minhas_oficinas() no banco: dono ou funcionario ativo
async function minhasOficinas(userId: string): Promise<string[]> {
  const [{ data: donas }, { data: equipe }] = await Promise.all([
    supabaseAdmin.from('oficinas').select('id').eq('profile_id', userId),
    supabaseAdmin.from('funcionarios').select('oficina_id').eq('profile_id', userId).eq('ativo', true),
  ]);
  return Array.from(new Set([...(donas || []).map((o) => o.id as string), ...(equipe || []).map((f) => f.oficina_id as string)]));
}

/**
 * Oficina logada que foi avisada do acidente (ou orcou) mas nao foi escolhida:
 * para onde a pagina do acidente a leva em vez de um "sem acesso" (aviso antigo
 * do sininho, link salvo - links nunca mortos). O pedido dela; ou, se o acidente
 * ficou sem pedido (falha ao criar veiculo/pedido), o painel de pedidos ('').
 * null = nao e oficina avisada (o 403 segue sem nada).
 */
export async function pedidoDaOficinaSemAcesso(req: NextRequest, emergenciaId: string): Promise<string | null> {
  const userId = await getSessionUserId(req);
  if (!userId) return null;
  const { data: emergencia } = await supabaseAdmin.from('emergencias').select('id, solicitacao_id').eq('id', emergenciaId).maybeSingle();
  if (!emergencia) return null;
  const ids = await minhasOficinas(userId);
  if (!ids.length) return null;
  const [{ data: avisada }, { data: orcou }] = await Promise.all([
    supabaseAdmin.from('emergencia_oficinas_notificadas').select('id').eq('emergencia_id', emergenciaId).in('oficina_id', ids).limit(1),
    emergencia.solicitacao_id
      ? supabaseAdmin.from('orcamentos').select('id').eq('solicitacao_id', emergencia.solicitacao_id).in('oficina_id', ids).limit(1)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ]);
  if (!avisada?.length && !orcou?.length) return null;
  return (emergencia.solicitacao_id as string | null) || '';
}
