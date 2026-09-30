import { NextRequest, NextResponse } from 'next/server';
import { recalcularComissaoConfig } from '@/lib/comissao';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';


export const dynamic = 'force-dynamic';

// Recalculates oficinas.avaliacao_media/total_avaliacoes from the avaliacoes
// table. Runs with the service role key because a cliente submitting a
// review isn't the oficina owner, so RLS blocks a direct client-side update
// of the oficinas row.
export async function POST(req: NextRequest) {
  try {
    const { oficinaId } = await req.json();
    if (!oficinaId) {
      return NextResponse.json({ error: 'oficinaId obrigatório' }, { status: 400 });
    }
    // Recalculo a partir do banco (idempotente): exige login e limite
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    if (!dentroDoLimite(`avaliacao:${userId}`, 30, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
    }

    const { data: reviews, error } = await supabaseAdmin
      .from('avaliacoes')
      .select('nota')
      .eq('oficina_id', oficinaId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = reviews?.length || 0;
    const media = total > 0
      ? Math.round((reviews!.reduce((sum, r) => sum + r.nota, 0) / total) * 10) / 10
      : 0;

    const { error: updateError } = await supabaseAdmin
      .from('oficinas')
      .update({ avaliacao_media: media, total_avaliacoes: total })
      .eq('id', oficinaId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Avaliacao media afeta a taxa de comissao - recalcula junto
    await recalcularComissaoConfig(supabaseAdmin, oficinaId).catch(() => {});

    return NextResponse.json({ success: true, avaliacao_media: media, total_avaliacoes: total });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
