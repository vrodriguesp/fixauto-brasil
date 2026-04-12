import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RESEND_KEY = process.env.RESEND_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 });
    }

    // Check if user exists
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('id, nome').eq('email', email).single();

    if (!profile) {
      // Don't reveal if email exists or not
      return NextResponse.json({ success: true });
    }

    // Generate new temporary password
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$&';
    let senha = '';
    for (let i = 0; i < 8; i++) senha += chars[Math.floor(Math.random() * chars.length)];

    // Update password
    await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: senha,
      user_metadata: { primeiro_login: true },
    });

    // Send email
    if (RESEND_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'BipFix <noreply@bipfix.com>',
          to: email,
          subject: 'BipFix - Sua nova senha temporária',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#0c4a6e;color:white;padding:24px;border-radius:12px 12px 0 0;">
                <h1 style="margin:0;font-size:24px;">BipFix</h1>
                <p style="margin:8px 0 0;opacity:0.8;">Recuperação de senha</p>
              </div>
              <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
                <p>Olá <strong>${profile.nome}</strong>,</p>
                <p>Você solicitou a recuperação de senha. Aqui está sua nova senha temporária:</p>
                <div style="background:#f0f9ff;border:2px solid #0ea5e9;border-radius:8px;padding:16px;margin:20px 0;">
                  <p style="margin:0 0 8px;font-size:14px;color:#0c4a6e;font-weight:bold;">Seus dados de acesso:</p>
                  <p style="margin:0;font-size:14px;">Email: <strong>${email}</strong></p>
                  <p style="margin:4px 0 0;font-size:14px;">Senha temporária: <strong style="font-size:20px;letter-spacing:3px;">${senha}</strong></p>
                </div>
                <p style="font-size:13px;color:#6b7280;">No próximo login, você será solicitado a escolher uma nova senha.</p>
                <p style="margin-top:20px;">
                  <a href="https://bipfix.com/login" style="display:inline-block;background:#0284c7;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">Acessar minha conta</a>
                </p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
                <p style="font-size:12px;color:#9ca3af;">Se você não solicitou esta recuperação, ignore este email. Equipe BipFix</p>
              </div>
            </div>
          `,
        }),
      });
      if (!res.ok) console.error('[esqueci-senha] Email error:', await res.text());
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[esqueci-senha]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
