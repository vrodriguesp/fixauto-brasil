import { supabaseAdmin } from '@/lib/supabase-admin';

// Presenca "online agora / visto ha X" para o admin (dono 19/11). Ver migracao 101:
// uma linha por conta com so a hora do ultimo sinal. O sinal vem de /api/presenca
// (site e app, a cada minuto com a tela visivel). Este modulo so le, pelo service role.

/** "online agora" = sinal nos ultimos 2 min (o sinal sai a cada 60 s) */
export const PRESENCA_ONLINE_MS = 2 * 60 * 1000;
/** o servidor so grava um sinal por conta a cada 20 s (o resto e ignorado, sem erro) */
export const PRESENCA_MIN_MS = 20 * 1000;

export const estaOnline = (vistoEm: string | null | undefined) => !!vistoEm && Date.now() - Date.parse(vistoEm) < PRESENCA_ONLINE_MS;

/** ultimo sinal de cada conta pedida: { profileId: visto_em } (so quem tem sinal) */
export async function presencaDe(profileIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(profileIds.filter((x) => /^[0-9a-f-]{36}$/.test(x))));
  if (!ids.length) return {};
  const { data, error } = await supabaseAdmin.from('presenca').select('profile_id, visto_em').in('profile_id', ids);
  if (error) { console.error('[presenca] ler', error.message); return {}; }
  return Object.fromEntries((data || []).map((p) => [p.profile_id, p.visto_em]));
}

/** presenca das oficinas (pela conta do dono): { oficinaId: visto_em } */
export async function presencaDeOficinas(oficinaIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(oficinaIds.filter((x) => /^[0-9a-f-]{36}$/.test(x))));
  if (!ids.length) return {};
  const { data } = await supabaseAdmin.from('oficinas').select('id, profile_id').in('id', ids);
  const porPerfil = await presencaDe((data || []).map((o) => o.profile_id).filter(Boolean));
  const r: Record<string, string> = {};
  for (const o of data || []) if (o.profile_id && porPerfil[o.profile_id]) r[o.id] = porPerfil[o.profile_id];
  return r;
}
