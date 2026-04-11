// Supabase Edge Function: notify-accident
// Sends email notification to the other driver involved in an accident
// Called from the frontend after registering the other vehicle

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { emergenciaId, outroVeiculoId } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get emergency data
    const { data: emergencia } = await supabase
      .from('emergencias')
      .select('*')
      .eq('id', emergenciaId)
      .single();

    if (!emergencia) {
      return new Response(JSON.stringify({ error: 'Emergência não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get other vehicle data
    const { data: outroVeiculo } = await supabase
      .from('emergencia_outro_veiculo')
      .select('*')
      .eq('id', outroVeiculoId)
      .single();

    if (!outroVeiculo || !outroVeiculo.email) {
      return new Response(JSON.stringify({ error: 'Email do outro motorista não informado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if other person already has an account
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', outroVeiculo.email)
      .single();

    const siteUrl = Deno.env.get('SITE_URL') || 'https://fixauto-brasil.vercel.app';
    const acidenteUrl = `${siteUrl}/emergencia/acidente/${emergenciaId}`;
    const cadastroUrl = `${siteUrl}/cadastro?tipo=cliente&email=${encodeURIComponent(outroVeiculo.email)}`;

    // Send email via Supabase Auth admin (or use a third-party email service)
    // Using Supabase's built-in email sending via auth.admin
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">FixAuto Brasil</h1>
          <p style="margin: 8px 0 0; opacity: 0.8;">Registro de Acidente</p>
        </div>
        <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <p>Olá <strong>${outroVeiculo.nome}</strong>,</p>
          <p><strong>${emergencia.nome}</strong> registrou um acidente envolvendo seu veículo (placa ${outroVeiculo.placa}) na plataforma FixAuto.</p>
          <p>Através da plataforma, você pode:</p>
          <ul>
            <li>Trocar mensagens com o outro motorista</li>
            <li>Acompanhar orçamentos de oficinas próximas</li>
            <li>Entrar em acordo sobre a reparação</li>
          </ul>
          ${existingProfile
            ? `<p><a href="${acidenteUrl}" style="display: inline-block; background: #1e40af; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Ver detalhes do acidente</a></p>`
            : `<p><a href="${cadastroUrl}" style="display: inline-block; background: #1e40af; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Criar conta e acompanhar</a></p>
               <p style="font-size: 14px; color: #6b7280;">Enquanto isso, você receberá atualizações sobre orçamentos neste email.</p>`
          }
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #9ca3af;">
            Este email foi enviado automaticamente pela plataforma FixAuto Brasil.
            Se você não reconhece este acidente, ignore este email.
          </p>
        </div>
      </div>
    `;

    // Send via Supabase's built-in resend integration or SMTP
    // For now, we use the auth.admin.inviteUserByEmail as a fallback
    // In production, integrate with Resend, SendGrid, or similar
    const { error: emailError } = await supabase.auth.admin.inviteUserByEmail(
      outroVeiculo.email,
      {
        data: {
          tipo: 'cliente',
          nome: outroVeiculo.nome,
          telefone: outroVeiculo.telefone,
          from_accident: emergenciaId,
        },
        redirectTo: acidenteUrl,
      }
    ).catch(() => {
      // If user already exists, send a magic link instead
      return supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: outroVeiculo.email,
        options: { redirectTo: acidenteUrl },
      });
    });

    // Mark as notified regardless (the record exists for tracking)
    await supabase
      .from('emergencia_outro_veiculo')
      .update({ notificado: true })
      .eq('id', outroVeiculoId);

    // If the other person is already registered, also create a notification
    if (existingProfile) {
      await supabase.from('notificacoes').insert({
        profile_id: existingProfile.id,
        tipo: 'acidente',
        titulo: 'Registro de acidente',
        mensagem: `${emergencia.nome} registrou um acidente envolvendo seu veículo. Acesse para ver detalhes e orçamentos.`,
        dados: { emergencia_id: emergenciaId },
      });
    }

    return new Response(
      JSON.stringify({ success: true, alreadyRegistered: !!existingProfile }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
