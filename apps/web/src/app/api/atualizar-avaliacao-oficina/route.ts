import { NextRequest, NextResponse } from 'next/server';
import { recalcularComissaoConfig } from '@/lib/comissao';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { temRelacaoComOficina } from '@/lib/acesso-servico';
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

    // a media e o total agora sao recalculados pelo banco (gatilho da migracao
    // 048) a cada avaliacao; aqui so a configuracao de comissao, e so para
    // quem tem relacao com a oficina (auditoria M-13)
    if (!(await temRelacaoComOficina(userId, oficinaId))) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    // Avaliacao media afeta a taxa de comissao - recalcula junto
    await recalcularComissaoConfig(supabaseAdmin, oficinaId).catch(() => {});

    const { data: of } = await supabaseAdmin.from('oficinas').select('avaliacao_media, total_avaliacoes').eq('id', oficinaId).maybeSingle();
    return NextResponse.json({ success: true, avaliacao_media: of?.avaliacao_media ?? 0, total_avaliacoes: of?.total_avaliacoes ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
