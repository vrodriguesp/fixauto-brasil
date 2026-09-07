import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { oficinaTemCapacidade } from '@/lib/capacidade';

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

    // Search radius: ~50km for emergencies (wider than normal)
    const RADIUS_KM = 50;
    const radiusLat = RADIUS_KM / 111;
    const radiusLon = RADIUS_KM / (111 * Math.cos(latitude * Math.PI / 180));

    // Fetch oficinas within radius
    let { data: oficinas, error: oficinasError } = await supabaseAdmin
      .from('oficinas')
      .select('id, profile_id, nome_fantasia, especialidades, latitude, longitude, capacidade_servicos')
      .gte('latitude', latitude - radiusLat)
      .lte('latitude', latitude + radiusLat)
      .gte('longitude', longitude - radiusLon)
      .lte('longitude', longitude + radiusLon);

    if (oficinasError) {
      return NextResponse.json({ error: oficinasError.message }, { status: 500 });
    }

    // Fallback: if no oficinas found in radius, notify ALL active oficinas (emergency)
    if (!oficinas || oficinas.length === 0) {
      const { data: allOficinas } = await supabaseAdmin
        .from('oficinas')
        .select('id, profile_id, nome_fantasia, especialidades, latitude, longitude, capacidade_servicos')
        .eq('ativa', true)
        .limit(20);
      oficinas = allOficinas || [];
    }

    // Filter by especialidades that handle collision/body work
    const oficinasColisao = (oficinas || []).filter((o) => {
      if (!o.especialidades || o.especialidades.length === 0) return true;
      return o.especialidades.some(
        (e: string) => ['colisao', 'funilaria', 'pintura', 'geral'].includes(e)
      );
    });

    // Gestao de capacidade: despriorizar oficinas ja no limite pro tipo
    // "colisao" (nao notificar quem ja esta sobrecarregado) - mas nunca
    // deixar a emergencia sem NENHUMA oficina notificada por causa disso.
    const comCapacidade = [];
    for (const o of oficinasColisao) {
      if (await oficinaTemCapacidade(supabaseAdmin, o, 'colisao')) comCapacidade.push(o);
    }
    const destinatarias = comCapacidade.length > 0 ? comCapacidade : oficinasColisao;

    let notificadasCount = 0;

    for (const oficina of destinatarias) {
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

    return NextResponse.json({ success: true, oficinasNotificadas: notificadasCount });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
