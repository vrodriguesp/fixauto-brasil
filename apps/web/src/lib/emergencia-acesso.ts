import type { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase-admin';
import { getSessionUserId } from './api-auth';
import { hashToken, iguaisSeguro } from './segredos';

export type PapelEmergencia = 'proprietario' | 'outro' | 'oficina' | 'admin';

export const HEADER_TOKEN = 'x-emergencia-token';

/**
 * Quem pode ver/agir num acidente: quem registrou (pelo codigo secreto
 * guardado no navegador dele, ou logado como dono), o outro motorista
 * logado, oficinas avisadas e o admin. O id sozinho nao da acesso a nada.
 */
export async function acessoEmergencia(
  req: NextRequest,
  emergenciaId: string
): Promise<{ papel: PapelEmergencia; userId: string | null; emergencia: any } | null> {
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

  const { data: minhas } = await supabaseAdmin.from('oficinas').select('id').eq('profile_id', userId);
  const ids = (minhas || []).map((o) => o.id);
  if (ids.length) {
    const { data: avisada } = await supabaseAdmin
      .from('emergencia_oficinas_notificadas')
      .select('id')
      .eq('emergencia_id', emergenciaId)
      .in('oficina_id', ids)
      .limit(1);
    if (avisada?.length) return { papel: 'oficina', userId, emergencia };
  }
  return null;
}
