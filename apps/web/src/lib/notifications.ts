import { Resend } from 'resend';

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
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured - RESEND_API_KEY missing');
    return { success: false, error: 'Email service not configured' };
  }

  const acidenteUrl = `${SITE_URL}/emergencia/acidente/${params.emergenciaId}`;
  const cadastroUrl = `${SITE_URL}/cadastro?tipo=cliente&email=${encodeURIComponent(params.toEmail)}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: `Registro de acidente - Veículo ${params.placa}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">Registro de Acidente</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>Olá <strong>${params.toName}</strong>,</p>
            <p><strong>${params.fromName}</strong> registrou um acidente envolvendo seu veículo (placa <strong>${params.placa}</strong>) na plataforma BipFix.</p>
            <p>Através da plataforma, você pode:</p>
            <ul>
              <li>Completar o registro do seu veículo</li>
              <li>Trocar mensagens com o outro motorista</li>
              <li>Receber orçamentos de oficinas próximas para o reparo</li>
              <li>Enviar um orçamento para o reparo do seu veículo</li>
              <li>Entrar em acordo sobre a reparação</li>
            </ul>
            <p style="margin-top: 16px; background: #fef3c7; padding: 12px; border-radius: 8px; font-size: 14px; color: #92400e;">
              <strong>Próximos passos:</strong> Acesse a plataforma, complete os dados do seu veículo e solicite orçamentos de oficinas para reparar os danos.
            </p>
            <p style="margin-top: 24px;">
              <a href="${params.isRegistered ? acidenteUrl : `${SITE_URL}/reset-password`}"
                 style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                ${params.isRegistered ? 'Ver detalhes do acidente' : 'Definir senha e acessar'}
              </a>
            </p>
            ${!params.isRegistered ? '<p style="font-size: 14px; color: #6b7280;">Criamos uma conta para você. Defina sua senha para acessar e acompanhar tudo.</p>' : ''}
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="font-size: 12px; color: #9ca3af;">
              Este email foi enviado automaticamente pela plataforma BipFix.
              Se você não reconhece este acidente, ignore este email.
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
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: `${params.oficinaNome} redefiniu sua senha - BipFix`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0c4a6e; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>Olá <strong>${params.toName}</strong>,</p>
            <p><strong>${params.oficinaNome}</strong> gerou uma nova senha temporária para sua conta.</p>
            <div style="background: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #0c4a6e; font-weight: bold;">Sua senha temporária:</p>
              <p style="margin: 0; font-size: 20px; letter-spacing: 3px;"><strong>${params.novaSenha}</strong></p>
            </div>
            <p style="font-size: 13px; color: #6b7280;">No próximo login, você será solicitado a escolher uma nova senha.</p>
            <p style="margin-top: 20px;">
              <a href="${SITE_URL}/login" style="display: inline-block; background: #0284c7; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">Acessar minha conta</a>
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="font-size: 12px; color: #9ca3af;">Equipe BipFix</p>
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
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const orcamentosUrl = `${SITE_URL}/cliente/orcamentos/${params.solicitacaoId}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: `Novo orçamento recebido - ${params.oficinaNome}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">Novo Orçamento</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>Olá <strong>${params.toName}</strong>,</p>
            <p>A oficina <strong>${params.oficinaNome}</strong> enviou um orçamento para sua solicitação:</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; font-size: 24px; font-weight: bold; color: #111827;">${params.valorTotal}</p>
              <p style="margin: 4px 0 0; color: #6b7280;">Prazo: ${params.prazoDias} dias</p>
            </div>
            <p style="margin-top: 24px;">
              <a href="${orcamentosUrl}"
                 style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                Ver orçamento completo
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
}) {
  if (!resend) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const acompanhamentoUrl = `${SITE_URL}/cliente/acompanhamento/${params.solicitacaoId}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: `Seu veículo está pronto! - ${params.oficinaNome}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #16a34a; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.9;">Serviço concluído</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>Olá <strong>${params.toName}</strong>,</p>
            <p>Seu veículo <strong>${params.veiculoNome}</strong> já foi finalizado na oficina <strong>${params.oficinaNome}</strong> e está pronto para retirada.</p>
            <p style="margin-top: 24px;">
              <a href="${acompanhamentoUrl}"
                 style="display: inline-block; background: #16a34a; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                Ver detalhes e avaliar
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
}) {
  const acidenteUrl = `${SITE_URL}/emergencia/acidente/${params.emergenciaId}`;
  const message = `Olá ${params.toName}! ${params.fromName} registrou um acidente envolvendo seu veículo (placa ${params.placa}) na BipFix. Acesse para ver detalhes e orçamentos: ${acidenteUrl}`;
  return sendWhatsApp(params.toPhone, message);
}

export async function sendQuoteWhatsApp(params: {
  toPhone: string;
  toName: string;
  oficinaNome: string;
  valorTotal: string;
  solicitacaoId: string;
}) {
  const url = `${SITE_URL}/cliente/orcamentos/${params.solicitacaoId}`;
  const message = `Olá ${params.toName}! A oficina ${params.oficinaNome} enviou um orçamento de ${params.valorTotal} para seu veículo. Veja os detalhes: ${url}`;
  return sendWhatsApp(params.toPhone, message);
}

export async function sendServicoConcluidoWhatsApp(params: {
  toPhone: string;
  toName: string;
  oficinaNome: string;
  veiculoNome: string;
  solicitacaoId: string;
}) {
  const url = `${SITE_URL}/cliente/acompanhamento/${params.solicitacaoId}`;
  const message = `Olá ${params.toName}! Seu veículo ${params.veiculoNome} já está pronto na oficina ${params.oficinaNome} e pode ser retirado. Detalhes: ${url}`;
  return sendWhatsApp(params.toPhone, message);
}
