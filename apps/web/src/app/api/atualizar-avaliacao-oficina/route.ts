import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

    return NextResponse.json({ success: true, avaliacao_media: media, total_avaliacoes: total });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
