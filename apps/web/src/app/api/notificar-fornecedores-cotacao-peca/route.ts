import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { distanciaKm } from '@/lib/utils';

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

    // Caixa larga (100km) so pra pre-filtrar no banco por performance - o
    // corte de verdade e feito abaixo, por oficina, usando o raio de
    // atendimento que cada uma configurou (o mesmo raio que decide o que
    // ela VE na aba "Vender excedente"). Antes usava um raio fixo de
    // 50km aqui, que podia notificar uma oficina que depois nao via a
    // cotacao na propria tela por estar fora do raio dela.
    const BOUNDING_BOX_KM = 100;
    const radiusLat = BOUNDING_BOX_KM / 111;
    const radiusLon = BOUNDING_BOX_KM / (111 * Math.cos(latitude * Math.PI / 180));

    const { data: candidatas, error } = await supabaseAdmin
      .from('oficinas')
      .select('id, profile_id, nome_fantasia, latitude, longitude, raio_atendimento_km')
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

    const oficinas = (candidatas || []).filter((o) => {
      if (o.latitude == null || o.longitude == null) return false;
      const raio = o.raio_atendimento_km || 30;
      return distanciaKm(latitude, longitude, o.latitude, o.longitude) <= raio;
    });

    let notificadas = 0;
    for (const of of oficinas) {
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
