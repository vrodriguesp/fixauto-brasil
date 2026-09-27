import { Resend } from 'resend';
import { EMAIL_I18N, WHATSAPP_I18N, resolveEmailLocale, fmt, escapeHtml, type EmailLocale } from './email-i18n';
import { formatCurrency } from '@fixauto/shared';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://bipfix.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'BipFix <noreply@bipfix.com>';

// ============================================================
// EMAIL NOTIFICATIONS
// ============================================================

export async function sendAccidentNotificationEmail(params: {
  toEmail: string;
  toName: string;
  fromName: string;
  placa: string;
  emergenciaId: string;
  isRegistered: boolean;
  locale?: string;
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured - RESEND_API_KEY missing');
    return { success: false, error: 'Email service not configured' };
  }

  const s = EMAIL_I18N.accidentNotification[resolveEmailLocale(params.locale)];
  const acidenteUrl = `${SITE_URL}/emergencia/acidente/${params.emergenciaId}`;
  const cadastroUrl = `${SITE_URL}/cadastro?tipo=cliente&email=${encodeURIComponent(params.toEmail)}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: fmt(s.subject, { placa: params.placa }),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">${s.headerTag}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.greeting, { name: escapeHtml(params.toName) })}</p>
            <p>${fmt(s.intro, { fromName: escapeHtml(params.fromName), placa: escapeHtml(params.placa) })}</p>
            <p>${s.canList}</p>
            <ul>
              <li>${s.li1}</li>
              <li>${s.li2}</li>
              <li>${s.li3}</li>
              <li>${s.li4}</li>
              <li>${s.li5}</li>
            </ul>
            <p style="margin-top: 16px; background: #fef3c7; padding: 12px; border-radius: 8px; font-size: 14px; color: #92400e;">
              <strong>${s.nextStepsLabel}</strong> ${s.nextStepsText}
            </p>
            <p style="margin-top: 24px;">
              <a href="${params.isRegistered ? acidenteUrl : `${SITE_URL}/reset-password`}"
                 style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                ${params.isRegistered ? s.ctaRegistered : s.ctaUnregistered}
              </a>
            </p>
            ${!params.isRegistered ? `<p style="font-size: 14px; color: #6b7280;">${s.accountCreatedNote}</p>` : ''}
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="font-size: 12px; color: #9ca3af;">
              ${s.automatedFooter}
            </p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
    console.error('[Notifications] Email error:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function sendFuncionarioNovaSenhaEmail(params: {
  toEmail: string;
  toName: string;
  oficinaNome: string;
  novaSenha: string;
  locale?: string;
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const s = EMAIL_I18N.funcionarioNovaSenha[resolveEmailLocale(params.locale)];

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: fmt(s.subject, { oficinaNome: params.oficinaNome }),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0c4a6e; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.greeting, { name: escapeHtml(params.toName) })}</p>
            <p>${fmt(s.intro, { oficinaNome: escapeHtml(params.oficinaNome) })}</p>
            <div style="background: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #0c4a6e; font-weight: bold;">${s.tempPasswordLabel}</p>
              <p style="margin: 0; font-size: 20px; letter-spacing: 3px;"><strong>${params.novaSenha}</strong></p>
            </div>
            <p style="font-size: 13px; color: #6b7280;">${s.nextLoginNote}</p>
            <p style="margin-top: 20px;">
              <a href="${SITE_URL}/login" style="display: inline-block; background: #0284c7; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">${s.cta}</a>
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="font-size: 12px; color: #9ca3af;">${s.footer}</p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
    console.error('[Notifications] Email error:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function sendQuoteNotificationEmail(params: {
  toEmail: string;
  toName: string;
  oficinaNome: string;
  valorTotal: string;
  prazoDias: number;
  solicitacaoId: string;
  locale?: string;
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const s = EMAIL_I18N.quoteNotification[resolveEmailLocale(params.locale)];
  const orcamentosUrl = `${SITE_URL}/cliente/orcamentos/${params.solicitacaoId}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: fmt(s.subject, { oficinaNome: params.oficinaNome }),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">${s.headerTag}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.greeting, { name: escapeHtml(params.toName) })}</p>
            <p>${fmt(s.intro, { oficinaNome: escapeHtml(params.oficinaNome) })}</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; font-size: 24px; font-weight: bold; color: #111827;">${params.valorTotal}</p>
              <p style="margin: 4px 0 0; color: #6b7280;">${fmt(s.prazo, { prazoDias: params.prazoDias })}</p>
            </div>
            <p style="margin-top: 24px;">
              <a href="${orcamentosUrl}"
                 style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                ${s.cta}
              </a>
            </p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
    console.error('[Notifications] Email error:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function sendServicoConcluidoEmail(params: {
  toEmail: string;
  toName: string;
  oficinaNome: string;
  veiculoNome: string;
  solicitacaoId: string;
  locale?: string;
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const s = EMAIL_I18N.servicoConcluido[resolveEmailLocale(params.locale)];
  const acompanhamentoUrl = `${SITE_URL}/cliente/acompanhamento/${params.solicitacaoId}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: fmt(s.subject, { oficinaNome: params.oficinaNome }),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #16a34a; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.9;">${s.headerTag}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.greeting, { name: escapeHtml(params.toName) })}</p>
            <p>${fmt(s.intro, { veiculoNome: escapeHtml(params.veiculoNome), oficinaNome: escapeHtml(params.oficinaNome) })}</p>
            <p style="margin-top: 24px;">
              <a href="${acompanhamentoUrl}"
                 style="display: inline-block; background: #16a34a; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                ${s.cta}
              </a>
            </p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
    console.error('[Notifications] Email error:', err);
    return { success: false, error: (err as Error).message };
  }
}

// ============================================================
// WHATSAPP NOTIFICATIONS (via Twilio)
// ============================================================

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

async function sendWhatsApp(to: string, message: string): Promise<{ success: boolean; error?: string }> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    console.warn('[Notifications] Twilio not configured - TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN missing');
    return { success: false, error: 'WhatsApp service not configured' };
  }

  // Format Brazilian phone number
  let phone = to.replace(/\D/g, '');
  if (phone.length === 11) phone = '55' + phone;
  if (phone.length === 10) phone = '55' + phone;
  if (!phone.startsWith('55')) phone = '55' + phone;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: TWILIO_WHATSAPP_FROM,
        To: `whatsapp:+${phone}`,
        Body: message,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.message || 'WhatsApp send failed' };
    }

    return { success: true };
  } catch (err) {
    console.error('[Notifications] WhatsApp error:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function sendAccidentWhatsApp(params: {
  toPhone: string;
  toName: string;
  fromName: string;
  placa: string;
  emergenciaId: string;
  locale?: string;
}) {
  const acidenteUrl = `${SITE_URL}/emergencia/acidente/${params.emergenciaId}`;
  const tmpl = WHATSAPP_I18N.accidentWhatsApp[resolveEmailLocale(params.locale)];
  const message = fmt(tmpl, { toName: params.toName, fromName: params.fromName, placa: params.placa, url: acidenteUrl });
  return sendWhatsApp(params.toPhone, message);
}

export async function sendQuoteWhatsApp(params: {
  toPhone: string;
  toName: string;
  oficinaNome: string;
  valorTotal: string;
  solicitacaoId: string;
  locale?: string;
}) {
  const url = `${SITE_URL}/cliente/orcamentos/${params.solicitacaoId}`;
  const tmpl = WHATSAPP_I18N.quoteWhatsApp[resolveEmailLocale(params.locale)];
  const message = fmt(tmpl, { toName: params.toName, oficinaNome: params.oficinaNome, valorTotal: params.valorTotal, url });
  return sendWhatsApp(params.toPhone, message);
}

export async function sendServicoConcluidoWhatsApp(params: {
  toPhone: string;
  toName: string;
  oficinaNome: string;
  veiculoNome: string;
  solicitacaoId: string;
  locale?: string;
}) {
  const url = `${SITE_URL}/cliente/acompanhamento/${params.solicitacaoId}`;
  const tmpl = WHATSAPP_I18N.servicoConcluidoWhatsApp[resolveEmailLocale(params.locale)];
  const message = fmt(tmpl, { toName: params.toName, veiculoNome: params.veiculoNome, oficinaNome: params.oficinaNome, url });
  return sendWhatsApp(params.toPhone, message);
}

// Notifica o time interno da BipFix (sempre em portugues - e o idioma
// operacional da equipe, nao do lead que preencheu o formulario).
export async function sendLeadParceiroEmail(params: {
  tipo: 'oficina' | 'loja_pecas';
  nomeResponsavel: string;
  nomeNegocio: string;
  cidade: string;
  estado: string;
  whatsapp: string;
  email?: string | null;
  observacao?: string | null;
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured - RESEND_API_KEY missing');
    return { success: false, error: 'Email service not configured' };
  }

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'support@bipfix.com';
  const tipoLabel = params.tipo === 'oficina' ? 'Oficina' : 'Loja de peças';

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: adminEmail,
      subject: `Novo interessado (${tipoLabel}): ${params.nomeNegocio}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 22px;">Novo interessado em ser parceiro fundador</h1>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <table style="width: 100%; font-size: 14px; color: #111827;">
              <tr><td style="padding: 4px 0; color: #6b7280;">Tipo</td><td style="padding: 4px 0;"><strong>${tipoLabel}</strong></td></tr>
              <tr><td style="padding: 4px 0; color: #6b7280;">Negócio</td><td style="padding: 4px 0;"><strong>${escapeHtml(params.nomeNegocio)}</strong></td></tr>
              <tr><td style="padding: 4px 0; color: #6b7280;">Responsável</td><td style="padding: 4px 0;">${escapeHtml(params.nomeResponsavel)}</td></tr>
              <tr><td style="padding: 4px 0; color: #6b7280;">Cidade</td><td style="padding: 4px 0;">${escapeHtml(params.cidade)} - ${escapeHtml(params.estado)}</td></tr>
              <tr><td style="padding: 4px 0; color: #6b7280;">WhatsApp</td><td style="padding: 4px 0;">${escapeHtml(params.whatsapp)}</td></tr>
              ${params.email ? `<tr><td style="padding: 4px 0; color: #6b7280;">E-mail</td><td style="padding: 4px 0;">${escapeHtml(params.email)}</td></tr>` : ''}
              ${params.observacao ? `<tr><td style="padding: 4px 0; color: #6b7280; vertical-align: top;">Observação</td><td style="padding: 4px 0;">${escapeHtml(params.observacao)}</td></tr>` : ''}
            </table>
            <p style="margin-top: 20px;"><a href="${SITE_URL}/admin/leads-parceiros" style="color: #2563eb;">Ver todos os interessados →</a></p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('[Notifications] Erro ao enviar e-mail de lead parceiro:', error);
    return { success: false, error: 'Failed to send email' };
  }
}

// ============================================================
// EMAIL - PORTAL DE PEÇAS (cotações entre oficinas e fornecedores)
// ============================================================

export async function sendCotacaoPecaDisponivelEmail(params: {
  toEmail: string;
  toName: string;
  pecaDescricao: string;
  oficinaCompradoraNome: string;
  locale?: string;
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }
  const s = EMAIL_I18N.cotacaoPecaDisponivel[resolveEmailLocale(params.locale)];
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: fmt(s.subject, { pecaDescricao: params.pecaDescricao }),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">${s.headerTag}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.greeting, { name: escapeHtml(params.toName) })}</p>
            <p>${fmt(s.intro, { oficinaCompradoraNome: escapeHtml(params.oficinaCompradoraNome) })}</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; font-size: 18px; font-weight: bold; color: #111827;">${escapeHtml(params.pecaDescricao)}</p>
            </div>
            <p>${s.callToAction}</p>
            <p style="margin-top: 24px;">
              <a href="${SITE_URL}/oficina/pecas"
                 style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                ${s.cta}
              </a>
            </p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('[Notifications] Erro ao enviar e-mail de cotação de peça:', error);
    return { success: false, error: 'Failed to send email' };
  }
}

export async function sendCotacaoPecaRespondidaEmail(params: {
  toEmail: string;
  toName: string;
  fornecedorNome: string;
  pecaDescricao: string;
  preco: number;
  prazoDias: number;
  moeda?: string;
  locale?: string;
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }
  const locale = resolveEmailLocale(params.locale);
  const s = EMAIL_I18N.cotacaoPecaRespondida[locale];
  const precoFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: params.moeda || 'BRL' }).format(params.preco);
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: fmt(s.subject, { pecaDescricao: params.pecaDescricao }),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">${s.headerTag}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.greeting, { name: escapeHtml(params.toName) })}</p>
            <p>${fmt(s.intro, { fornecedorNome: escapeHtml(params.fornecedorNome), pecaDescricao: escapeHtml(params.pecaDescricao) })}</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; font-size: 24px; font-weight: bold; color: #111827;">${precoFormatado}</p>
              <p style="margin: 4px 0 0; color: #6b7280;">${fmt(s.prazo, { prazoDias: params.prazoDias })}</p>
            </div>
            <p style="margin-top: 24px;">
              <a href="${SITE_URL}/oficina/pecas"
                 style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                ${s.cta}
              </a>
            </p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('[Notifications] Erro ao enviar e-mail de resposta de cotação:', error);
    return { success: false, error: 'Failed to send email' };
  }
}

export async function sendPedidoPecaConfirmadoEmail(params: {
  toEmail: string;
  toName: string;
  oficinaCompradoraNome: string;
  pecaDescricao: string;
  valorTotal: number;
  moeda?: string;
  locale?: string;
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }
  const s = EMAIL_I18N.pedidoPecaConfirmado[resolveEmailLocale(params.locale)];
  const valorFormatado = formatCurrency(params.valorTotal, params.moeda || 'BRL', params.locale || 'pt');
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: fmt(s.subject, { pecaDescricao: params.pecaDescricao }),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">${s.headerTag}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.greeting, { name: escapeHtml(params.toName) })}</p>
            <p>${fmt(s.intro, { oficinaCompradoraNome: escapeHtml(params.oficinaCompradoraNome), pecaDescricao: escapeHtml(params.pecaDescricao) })}</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; font-size: 24px; font-weight: bold; color: #111827;">${valorFormatado}</p>
            </div>
            <p>${s.deliveryNote}</p>
            <p style="margin-top: 24px;">
              <a href="${SITE_URL}/oficina/pecas"
                 style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                ${s.cta}
              </a>
            </p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('[Notifications] Erro ao enviar e-mail de pedido confirmado:', error);
    return { success: false, error: 'Failed to send email' };
  }
}

export async function sendPedidoPecaEntregueEmail(params: {
  toEmail: string;
  toName: string;
  fornecedorNome: string;
  pecaDescricao: string;
  locale?: string;
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }
  const s = EMAIL_I18N.pedidoPecaEntregue[resolveEmailLocale(params.locale)];
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: fmt(s.subject, { pecaDescricao: params.pecaDescricao }),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">${s.headerTag}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.greeting, { name: escapeHtml(params.toName) })}</p>
            <p>${fmt(s.intro, { fornecedorNome: escapeHtml(params.fornecedorNome), pecaDescricao: escapeHtml(params.pecaDescricao) })}</p>
            <p style="margin-top: 24px;">
              <a href="${SITE_URL}/oficina/pecas"
                 style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                ${s.cta}
              </a>
            </p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('[Notifications] Erro ao enviar e-mail de pedido entregue:', error);
    return { success: false, error: 'Failed to send email' };
  }
}

export async function sendOrcamentoAceitoPagamentoEmail(params: {
  toEmail: string;
  toName: string;
  oficinaNome: string;
  oficinaEndereco?: string;
  oficinaTelefone?: string;
  oficinaEmail?: string;
  valorFormatado: string;
  prazoDias: number;
  solicitacaoId: string;
  locale?: string;
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const s = EMAIL_I18N.orcamentoAceitoPagamento[resolveEmailLocale(params.locale)];

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: fmt(s.subject, { oficinaNome: params.oficinaNome }),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc2626; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">${s.headerTag}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.greeting, { name: escapeHtml(params.toName) })}</p>
            <p>${s.intro}</p>
            <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; font-size: 20px; font-weight: bold; color: #991b1b;">${params.valorFormatado}</p>
              <p style="margin: 4px 0 0; color: #b91c1c;">${fmt(s.prazo, { dias: params.prazoDias })}</p>
            </div>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; font-weight: bold; color: #111827;">${s.dadosOficinaLabel}</p>
              <p style="margin: 4px 0 0; color: #374151;">${fmt(s.oficinaLabel, { oficinaNome: escapeHtml(params.oficinaNome) })}</p>
              ${params.oficinaEndereco ? `<p style="margin: 4px 0 0; color: #374151;">${fmt(s.enderecoLabel, { endereco: escapeHtml(params.oficinaEndereco) })}</p>` : ''}
              ${params.oficinaTelefone ? `<p style="margin: 4px 0 0; color: #374151;">${fmt(s.telefoneLabel, { telefone: escapeHtml(params.oficinaTelefone) })}</p>` : ''}
              ${params.oficinaEmail ? `<p style="margin: 4px 0 0; color: #374151;">${fmt(s.emailLabel, { email: escapeHtml(params.oficinaEmail) })}</p>` : ''}
            </div>
            <p>${s.ctaText}</p>
            <p style="margin-top: 24px;">
              <a href="${SITE_URL}/cliente/mensagens/${params.solicitacaoId}"
                 style="display: inline-block; background: #dc2626; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                ${s.cta}
              </a>
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="font-size: 12px; color: #9ca3af;">${s.footer}</p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
    console.error('[Notifications] Email error:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function sendOrcamentoAceitoOutroEmail(params: {
  toEmail: string;
  toName: string;
  oficinaNome: string;
  placaVeiculo?: string;
  valorFormatado: string;
  prazoDias: number;
  emergenciaId: string;
  locale?: string;
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const s = EMAIL_I18N.orcamentoAceitoOutro[resolveEmailLocale(params.locale)];

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: fmt(s.subject, { oficinaNome: params.oficinaNome }),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">${s.headerTag}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.greeting, { name: escapeHtml(params.toName) })}</p>
            <p>${params.placaVeiculo ? fmt(s.introComPlaca, { placa: escapeHtml(params.placaVeiculo) }) : s.introSemPlaca}</p>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; font-size: 20px; font-weight: bold; color: #166534;">${params.valorFormatado}</p>
              <p style="margin: 4px 0 0; color: #15803d;">${fmt(s.oficinaLabel, { oficinaNome: escapeHtml(params.oficinaNome) })}</p>
              <p style="margin: 4px 0 0; color: #15803d;">${fmt(s.prazo, { dias: params.prazoDias })}</p>
            </div>
            <p>${s.ctaText}</p>
            <p style="margin-top: 24px;">
              <a href="${SITE_URL}/emergencia/acidente/${params.emergenciaId}"
                 style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                ${s.cta}
              </a>
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="font-size: 12px; color: #9ca3af;">${s.footer}</p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
    console.error('[Notifications] Email error:', err);
    return { success: false, error: (err as Error).message };
  }
}

export type { EmailLocale };
