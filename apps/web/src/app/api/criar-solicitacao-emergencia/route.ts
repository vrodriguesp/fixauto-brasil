import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = 'BipFix <noreply@bipfix.com>';

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY) return;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) console.error('[email]', await res.text());
}

export async function POST(req: NextRequest) {
  try {
    const { emergenciaId, clienteId, nome, email, telefone, descricao, latitude, longitude, endereco, photoUrls, placa, veiculoInfo } = await req.json();

    if (!emergenciaId) {
      return NextResponse.json({ error: 'emergenciaId obrigatório' }, { status: 400 });
    }

    let finalClienteId = clienteId;
    let contaCriada = false;

    // If no logged-in user, find or create account
    if (!finalClienteId && email) {
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles').select('id').eq('email', email).single();

      if (existingProfile) {
        finalClienteId = existingProfile.id;
      } else {
        // Create auth user
        const tempPassword = `BipFix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email, password: tempPassword, email_confirm: true,
        });

        if (authError || !authData.user) {
          return NextResponse.json({ error: authError?.message || 'Erro ao criar conta' }, { status: 500 });
        }

        finalClienteId = authData.user.id;
        contaCriada = true;

        await supabaseAdmin.from('profiles').insert({
          id: finalClienteId, tipo: 'cliente',
          nome: nome || email.split('@')[0], email, telefone: telefone || null,
        });

        // Generate password reset link with actual token
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery', email,
          options: { redirectTo: 'https://bipfix.com/reset-password' },
        });
        const resetLink = linkData?.properties?.action_link || 'https://bipfix.com/reset-password';

        // Welcome email with working password link
        await sendEmail(email, 'Sua conta BipFix foi criada - Defina sua senha', `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#0c4a6e;color:white;padding:24px;border-radius:12px 12px 0 0;">
              <h1 style="margin:0;font-size:24px;">BipFix</h1>
              <p style="margin:8px 0 0;opacity:0.8;">Sua emergência foi registrada</p>
            </div>
            <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
              <p>Olá <strong>${nome || ''}</strong>,</p>
              <p>Sua emergência foi registrada e oficinas próximas já estão sendo notificadas.</p>
              <p>Criamos uma conta para você acompanhar os orçamentos.</p>
              <p style="margin-top:20px;">
                <a href="${resetLink}" style="display:inline-block;background:#0284c7;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">Definir minha senha e acessar</a>
              </p>
              <p style="font-size:14px;color:#6b7280;margin-top:16px;">Email de acesso: <strong>${email}</strong></p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
              <p style="font-size:12px;color:#9ca3af;">Equipe BipFix</p>
            </div>
          </div>
        `);
      }
    }

    // Always update emergencia with profile_id
    if (finalClienteId) {
      await supabaseAdmin.from('emergencias').update({ profile_id: finalClienteId }).eq('id', emergenciaId);
    }

    if (!finalClienteId) {
      return NextResponse.json({ error: 'Não foi possível identificar o cliente' }, { status: 400 });
    }

    // Get or create vehicle
    const { data: veiculos } = await supabaseAdmin
      .from('veiculos').select('id').eq('profile_id', finalClienteId).limit(1);

    let veiculoId = veiculos?.[0]?.id;

    if (!veiculoId) {
      const { data: newV } = await supabaseAdmin.from('veiculos').insert({
        profile_id: finalClienteId, fipe_tipo: 'cars',
        fipe_marca: veiculoInfo?.marca || 'A definir',
        fipe_modelo: veiculoInfo?.modelo || 'A definir',
        fipe_ano: veiculoInfo?.ano || 'A definir',
        placa: placa || null, cor: veiculoInfo?.cor || null,
        apelido: placa ? `Veículo ${placa}` : 'Veículo da emergência',
      }).select('id').single();
      veiculoId = newV?.id;
    }

    if (!veiculoId) {
      return NextResponse.json({ error: 'Não foi possível criar veículo' }, { status: 500 });
    }

    // Create solicitacao WITH emergencia_id
    const { data: sol, error: solError } = await supabaseAdmin
      .from('solicitacoes').insert({
        cliente_id: finalClienteId, veiculo_id: veiculoId,
        tipo: 'colisao', descricao: descricao || 'Emergência - Colisão',
        urgencia: 'alta', latitude, longitude, endereco,
      }).select().single();

    if (solError || !sol) {
      return NextResponse.json({ error: solError?.message || 'Erro ao criar solicitação' }, { status: 500 });
    }

    // Link emergencia → solicitacao
    await supabaseAdmin.from('emergencias').update({ solicitacao_id: sol.id }).eq('id', emergenciaId);

    // Copy photos
    if (photoUrls?.length) {
      for (const url of photoUrls) {
        await supabaseAdmin.from('solicitacao_fotos').insert({ solicitacao_id: sol.id, foto_url: url });
      }
    }

    // Notify oficinas
    const { data: oficinas } = await supabaseAdmin
      .from('oficinas').select('id, profile_id, especialidades').eq('ativa', true);

    if (oficinas) {
      for (const ofi of oficinas) {
        if (ofi.especialidades?.length > 0 && !ofi.especialidades.some((e: string) => ['colisao', 'funilaria'].includes(e))) continue;
        await supabaseAdmin.from('notificacoes').insert({
          profile_id: ofi.profile_id, tipo: 'nova_solicitacao',
          titulo: 'Nova solicitação!',
          mensagem: 'Emergência - Novo pedido de reparo por colisão na sua região.',
          dados: { solicitacao_id: sol.id },
        });
      }
    }

    return NextResponse.json({ success: true, solicitacaoId: sol.id, contaCriada });
  } catch (err) {
    console.error('[criar-solicitacao-emergencia]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
