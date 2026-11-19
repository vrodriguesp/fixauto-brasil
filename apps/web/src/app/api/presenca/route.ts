import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PRESENCA_MIN_MS } from '@/lib/presenca';

export const dynamic = 'force-dynamic';

// Sinal de presenca (dono 19/11): o site (components/PresencaSinal.tsx) e o app
// (app/_layout.tsx) chamam a cada minuto com a tela visivel, so com login. Grava a
// hora na linha da propria conta (migracao 101) - nada mais (sem IP, sem pagina).
// Sem login: 401 e nada gravado. Mais de um sinal a cada 20 s por conta: ignorado.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!dentroDoLimite(`presenca:${userId}`, 1, PRESENCA_MIN_MS)) return NextResponse.json({ ok: true, ignorado: true });
  const { error } = await supabaseAdmin.from('presenca').upsert({ profile_id: userId, visto_em: new Date().toISOString() }, { onConflict: 'profile_id' });
  if (error) { console.error('[presenca] gravar', error.message); return NextResponse.json({ error: 'Erro' }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
