import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendAccidentNotificationEmail,
  sendAccidentWhatsApp,
} from '@/lib/notifications';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { emergenciaId, outroVeiculoId } = await req.json();

    if (!emergenciaId || !outroVeiculoId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Get emergency data
    const { data: emergencia } = await supabaseAdmin
      .from('emergencias')
      .select('*')
      .eq('id', emergenciaId)
      .single();

    if (!emergencia) {
      return NextResponse.json({ error: 'Emergência não encontrada' }, { status: 404 });
    }

    // Get other vehicle data
    const { data: outroVeiculo } = await supabaseAdmin
      .from('emergencia_outro_veiculo')
      .select('*')
      .eq('id', outroVeiculoId)
      .single();

    if (!outroVeiculo) {
      return NextResponse.json({ error: 'Outro veículo não encontrado' }, { status: 404 });
    }

    // Check if the other person already has an account
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', outroVeiculo.email || '')
      .single();

    const results: { email?: { success: boolean }; whatsapp?: { success: boolean } } = {};

    // Send email notification
    if (outroVeiculo.email) {
      results.email = await sendAccidentNotificationEmail({
        toEmail: outroVeiculo.email,
        toName: outroVeiculo.nome,
        fromName: emergencia.nome,
        placa: outroVeiculo.placa,
        emergenciaId,
        isRegistered: !!existingProfile,
      });
    }

    // Send WhatsApp notification
    if (outroVeiculo.telefone) {
      results.whatsapp = await sendAccidentWhatsApp({
        toPhone: outroVeiculo.telefone,
        toName: outroVeiculo.nome,
        fromName: emergencia.nome,
        placa: outroVeiculo.placa,
        emergenciaId,
      });
    }

    // Mark as notified
    await supabaseAdmin
      .from('emergencia_outro_veiculo')
      .update({ notificado: true })
      .eq('id', outroVeiculoId);

    // If the other person is already registered, create in-app notification
    if (existingProfile) {
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: existingProfile.id,
        tipo: 'acidente',
        titulo: 'Registro de acidente',
        mensagem: `${emergencia.nome} registrou um acidente envolvendo seu veículo (placa ${outroVeiculo.placa}). Acesse para ver detalhes e orçamentos.`,
        dados: { emergencia_id: emergenciaId },
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('[API notificar-acidente]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
