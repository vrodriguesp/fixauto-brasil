import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { emergenciaId, latitude, longitude } = await req.json();

    if (!emergenciaId || latitude == null || longitude == null) {
      return NextResponse.json(
        { error: 'emergenciaId, latitude e longitude são obrigatórios' },
        { status: 400 }
      );
    }

    // Search radius: ~30km (same approach as use-solicitacoes.ts)
    const RADIUS_KM = 30;
    const radiusLat = RADIUS_KM / 111;
    const radiusLon = RADIUS_KM / (111 * Math.cos(latitude * Math.PI / 180));

    // Fetch oficinas within radius
    const { data: oficinas, error: oficinasError } = await supabaseAdmin
      .from('oficinas')
      .select('id, profile_id, nome_fantasia, especialidades, latitude, longitude')
      .gte('latitude', latitude - radiusLat)
      .lte('latitude', latitude + radiusLat)
      .gte('longitude', longitude - radiusLon)
      .lte('longitude', longitude + radiusLon);

    if (oficinasError) {
      return NextResponse.json({ error: oficinasError.message }, { status: 500 });
    }

    // Filter by especialidades that handle collision/body work
    const oficinasColisao = (oficinas || []).filter((o) => {
      if (!o.especialidades || o.especialidades.length === 0) return true;
      return o.especialidades.some(
        (e: string) => ['colisao', 'funilaria', 'pintura', 'geral'].includes(e)
      );
    });

    let notificadasCount = 0;

    for (const oficina of oficinasColisao) {
      // Record in emergencia_oficinas_notificadas
      await supabaseAdmin.from('emergencia_oficinas_notificadas').insert({
        emergencia_id: emergenciaId,
        oficina_id: oficina.id,
      });

      // Create notification for the oficina owner
      if (oficina.profile_id) {
        await supabaseAdmin.from('notificacoes').insert({
          profile_id: oficina.profile_id,
          tipo: 'emergencia',
          titulo: 'Emergência - Acidente próximo',
          mensagem: `Um motorista próximo à sua oficina acabou de sofrer um acidente e precisa de atendimento urgente. Envie um orçamento rápido!`,
          dados: { emergencia_id: emergenciaId },
        });
      }

      notificadasCount++;
    }

    // Update emergencia with notification count
    await supabaseAdmin
      .from('emergencias')
      .update({ oficinas_notificadas: notificadasCount })
      .eq('id', emergenciaId);

    return NextResponse.json({ success: true, oficinasNotificadas: notificadasCount });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
