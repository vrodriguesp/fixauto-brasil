import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Notifica oficinas que se inscreveram como fornecedoras de pecas
// (oficinas.vende_pecas = true) e estao dentro do raio de atendimento da
// oficina que abriu a cotacao, pra elas saberem que podem responder com
// estoque excedente. Lojas de pecas continuam no modelo pull (navegam
// cotacoes abertas em /loja/cotacoes) - isso aqui e so o "push" pro caso
// novo de oficina-fornecedora, mesma logica de proximidade usada em
// /api/notificar-oficinas-emergencia.
export async function POST(req: NextRequest) {
  try {
    const { cotacaoId, oficinaCompradoraId, latitude, longitude } = await req.json();

    if (!cotacaoId || !oficinaCompradoraId || latitude == null || longitude == null) {
      return NextResponse.json({ error: 'cotacaoId, oficinaCompradoraId, latitude e longitude sao obrigatorios' }, { status: 400 });
    }

    const RADIUS_KM = 50;
    const radiusLat = RADIUS_KM / 111;
    const radiusLon = RADIUS_KM / (111 * Math.cos(latitude * Math.PI / 180));

    const { data: oficinas, error } = await supabaseAdmin
      .from('oficinas')
      .select('id, profile_id, nome_fantasia')
      .eq('vende_pecas', true)
      .eq('ativa', true)
      .neq('id', oficinaCompradoraId)
      .gte('latitude', latitude - radiusLat)
      .lte('latitude', latitude + radiusLat)
      .gte('longitude', longitude - radiusLon)
      .lte('longitude', longitude + radiusLon);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let notificadas = 0;
    for (const of of oficinas || []) {
      if (!of.profile_id) continue;
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: of.profile_id,
        tipo: 'cotacao_peca_disponivel',
        titulo: 'Oficina próxima precisa de uma peça',
        mensagem: 'Uma oficina perto de você abriu uma cotação de peça. Responda se tiver em estoque.',
        dados: { cotacao_id: cotacaoId },
      });
      notificadas++;
    }

    return NextResponse.json({ success: true, oficinasNotificadas: notificadas });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
