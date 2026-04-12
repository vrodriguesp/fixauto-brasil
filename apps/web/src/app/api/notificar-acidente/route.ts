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

const RESEND_KEY = process.env.RESEND_API_KEY;

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY) return;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'BipFix <noreply@bipfix.com>', to, subject, html }),
  });
  if (!res.ok) console.error('[email]', await res.text());
}

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

    // Check if the other person already has an account, or create one
    let profileId: string | null = null;

    if (outroVeiculo.email) {
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', outroVeiculo.email)
        .single();

      if (existingProfile) {
        profileId = existingProfile.id;
      } else {
        // Create account with simple 6-digit password
        const senha = String(Math.floor(100000 + Math.random() * 900000));
        const { data: authData } = await supabaseAdmin.auth.admin.createUser({
          email: outroVeiculo.email, password: senha, email_confirm: true,
          user_metadata: { primeiro_login: true },
        });

        if (authData?.user) {
          profileId = authData.user.id;
          await supabaseAdmin.from('profiles').insert({
            id: profileId, tipo: 'cliente',
            nome: outroVeiculo.nome, email: outroVeiculo.email,
            telefone: outroVeiculo.telefone || null,
          });

          await supabaseAdmin.from('veiculos').insert({
            profile_id: profileId, fipe_tipo: 'cars',
            fipe_marca: outroVeiculo.veiculo_descricao || 'A definir',
            fipe_modelo: 'A definir', fipe_ano: 'A definir',
            placa: outroVeiculo.placa || null,
          });

          // Email with credentials to other person
          await sendEmail(outroVeiculo.email, 'BipFix - Sua conta foi criada', `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#0c4a6e;color:white;padding:24px;border-radius:12px 12px 0 0;">
                <h1 style="margin:0;font-size:24px;">BipFix</h1>
              </div>
              <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
                <p>Olá <strong>${outroVeiculo.nome}</strong>,</p>
                <p><strong>${emergencia.nome}</strong> registrou um acidente envolvendo seu veículo (placa <strong>${outroVeiculo.placa}</strong>).</p>
                <p>Criamos uma conta para você acompanhar, completar o registro do veículo e solicitar orçamentos.</p>
                <div style="background:#f0f9ff;border:2px solid #0ea5e9;border-radius:8px;padding:16px;margin:20px 0;">
                  <p style="margin:0 0 8px;font-size:14px;color:#0c4a6e;font-weight:bold;">Seus dados de acesso:</p>
                  <p style="margin:0;font-size:14px;">Email: <strong>${outroVeiculo.email}</strong></p>
                  <p style="margin:4px 0 0;font-size:14px;">Senha temporária: <strong style="font-size:20px;letter-spacing:3px;">${senha}</strong></p>
                </div>
                <p style="font-size:13px;color:#6b7280;">No primeiro login, você será solicitado a trocar a senha.</p>
                <p style="margin-top:20px;">
                  <a href="https://bipfix.com/login" style="display:inline-block;background:#0284c7;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">Acessar minha conta</a>
                </p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
                <p style="font-size:12px;color:#9ca3af;">Equipe BipFix</p>
              </div>
            </div>
          `);
        }
      }
    }

    const results: { email?: { success: boolean }; whatsapp?: { success: boolean } } = {};

    // Send email notification + welcome with password reset link
    if (outroVeiculo.email) {
      results.email = await sendAccidentNotificationEmail({
        toEmail: outroVeiculo.email,
        toName: outroVeiculo.nome,
        fromName: emergencia.nome,
        placa: outroVeiculo.placa,
        emergenciaId,
        isRegistered: !!profileId,
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

    // Create in-app notification
    if (profileId) {
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: profileId,
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
