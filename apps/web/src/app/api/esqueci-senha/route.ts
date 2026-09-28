import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { EMAIL_I18N, resolveEmailLocale, fmt, escapeHtml } from '@/lib/email-i18n';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RESEND_KEY = process.env.RESEND_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://bipfix.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'BipFix <noreply@bipfix.com>';

// Um pedido por e-mail a cada 2 min - sem isso, qualquer um encheria a
// caixa de entrada de outra pessoa de e-mails de recuperacao. Em memoria:
// o site roda num processo so (PM2).
const INTERVALO_MS = 2 * 60 * 1000;
const ultimoPedido = new Map<string, number>();

// Recuperacao de senha por LINK de confirmacao. Antes esta rota trocava a
// senha na hora e mandava uma temporaria por e-mail - qualquer pessoa que
// soubesse o e-mail de outra conseguia trancar essa pessoa fora da conta.
// Agora a senha so muda quando o dono abre o link (token de uso unico do
// Supabase, validade de 1 h) e escolhe uma nova em /reset-password.
//
// Sempre responde sucesso, exista ou nao a conta - pra nao revelar quais
// e-mails estao cadastrados.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 });
    }

    const agora = Date.now();
    if (agora - (ultimoPedido.get(email) || 0) < INTERVALO_MS) {
      return NextResponse.json({ success: true });
    }
    ultimoPedido.set(email, agora);
    if (ultimoPedido.size > 5000) ultimoPedido.clear();

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, nome, idioma')
      .ilike('email', email.replace(/[%_\\]/g, '\\$&'))
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ success: true });
    }

    // generateLink so gera o token, nao manda e-mail nenhum (o envio e
    // nosso, via Resend, no idioma da pessoa).
    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error('[esqueci-senha] falha ao gerar link', linkError);
      return NextResponse.json({ error: 'Falha ao gerar link' }, { status: 500 });
    }

    // body.locale vem do app mobile, as vezes no formato "en-US"
    const locale = resolveEmailLocale(profile.idioma || String(body.locale || '').slice(0, 2));
    const s = EMAIL_I18N.recuperarSenha[locale];
    const prefixo = locale === 'pt' ? '' : `/${locale}`;
    const url = `${SITE_URL}${prefixo}/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;

    if (!RESEND_KEY) {
      console.warn('[esqueci-senha] RESEND_API_KEY ausente - e-mail nao enviado');
      return NextResponse.json({ success: true });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: s.subject,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#0c4a6e;color:white;padding:24px;border-radius:12px 12px 0 0;">
              <h1 style="margin:0;font-size:24px;">BipFix</h1>
              <p style="margin:8px 0 0;opacity:0.8;">${s.headerTag}</p>
            </div>
            <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
              <p>${fmt(s.greeting, { name: escapeHtml(profile.nome) })}</p>
              <p>${s.intro}</p>
              <p style="margin:24px 0;">
                <a href="${url}" style="display:inline-block;background:#0284c7;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">${s.cta}</a>
              </p>
              <p style="font-size:13px;color:#6b7280;">${s.expiry}</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
              <p style="font-size:12px;color:#9ca3af;">${s.ignore}<br>${s.footer}</p>
            </div>
          </div>
        `,
      }),
    });
    if (!res.ok) {
      console.error('[esqueci-senha] Email error:', await res.text());
      return NextResponse.json({ error: 'Falha ao enviar e-mail' }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[esqueci-senha]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
