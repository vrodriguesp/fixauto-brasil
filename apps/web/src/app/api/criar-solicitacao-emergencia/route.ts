import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { emergenciaId, clienteId, descricao, latitude, longitude, endereco, photoUrls } = await req.json();

    if (!emergenciaId || !clienteId) {
      return NextResponse.json({ error: 'emergenciaId e clienteId obrigatórios' }, { status: 400 });
    }

    // Get first vehicle (if any)
    const { data: veiculos } = await supabaseAdmin
      .from('veiculos')
      .select('id')
      .eq('profile_id', clienteId)
      .limit(1);

    let veiculoId = veiculos?.[0]?.id;

    // If no vehicle, create a placeholder
    if (!veiculoId) {
      const { data: newVeiculo } = await supabaseAdmin
        .from('veiculos')
        .insert({
          profile_id: clienteId,
          fipe_tipo: 'cars',
          fipe_marca: 'A definir',
          fipe_modelo: 'A definir',
          fipe_ano: 'A definir',
          apelido: 'Veículo da emergência',
        })
        .select('id')
        .single();
      veiculoId = newVeiculo?.id;
    }

    if (!veiculoId) {
      return NextResponse.json({ error: 'Não foi possível criar veículo' }, { status: 500 });
    }

    // Create solicitacao
    const { data: sol, error: solError } = await supabaseAdmin
      .from('solicitacoes')
      .insert({
        cliente_id: clienteId,
        veiculo_id: veiculoId,
        tipo: 'colisao',
        descricao: descricao || 'Emergência - Colisão',
        urgencia: 'alta',
        latitude,
        longitude,
        endereco,
      })
      .select()
      .single();

    if (solError || !sol) {
      return NextResponse.json({ error: solError?.message || 'Erro ao criar solicitação' }, { status: 500 });
    }

    // Link emergencia to solicitacao
    await supabaseAdmin.from('emergencias').update({ solicitacao_id: sol.id }).eq('id', emergenciaId);

    // Copy photos to solicitacao_fotos
    if (photoUrls && Array.isArray(photoUrls)) {
      for (const url of photoUrls) {
        await supabaseAdmin.from('solicitacao_fotos').insert({
          solicitacao_id: sol.id,
          foto_url: url,
        });
      }
    }

    // Notify nearby oficinas about the new solicitação
    const { data: oficinas } = await supabaseAdmin
      .from('oficinas')
      .select('id, profile_id, especialidades')
      .eq('ativa', true);

    if (oficinas) {
      for (const ofi of oficinas) {
        if (ofi.especialidades?.length > 0 && !ofi.especialidades.some((e: string) => ['colisao', 'funilaria'].includes(e))) continue;
        await supabaseAdmin.from('notificacoes').insert({
          profile_id: ofi.profile_id,
          tipo: 'nova_solicitacao',
          titulo: 'Nova solicitação!',
          mensagem: `Emergência - Novo pedido de reparo por colisão na sua região.`,
          dados: { solicitacao_id: sol.id },
        });
      }
    }

    return NextResponse.json({ success: true, solicitacaoId: sol.id });
  } catch (err) {
    console.error('[criar-solicitacao-emergencia]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
