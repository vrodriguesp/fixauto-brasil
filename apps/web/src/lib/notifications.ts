import { Resend } from 'resend';
import { EMAIL_I18N, WHATSAPP_I18N, SMS_I18N, resolveEmailLocale, fmt, escapeHtml, diasTexto, quantidadeTexto, numeroTexto, type EmailLocale } from './email-i18n';
import { semIva, totalDaOferta } from './pecas-iva';
import { formatCurrency } from '@fixauto/shared';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

import { SITE_URL, siteNoIdioma, urlNoIdioma, idiomaDoSite, linkNeutroPecas } from './site-url';
import { linkPedido } from './link-acesso';

// Sem moeda informada: reais so para a versao do Brasil; euro no resto
const moedaPadrao = (idioma?: string | null) => (idiomaDoSite(idioma) === 'pt' ? 'BRL' : 'EUR');
import { FROM_EMAIL, enviarEmail } from '@/lib/email';
import { emailDeContaTeste } from './conta-teste-envio';
import { aplicarIdentidade } from './email-marca';
import { SUPORTE_EMAIL_MENSAGEM, SUPORTE_EMAIL_RESPOSTA, linguaTexto } from './suporte-textos';

// teste local sem Resend: os e-mails viram arquivos (lib/email.ts, EMAIL_PASTA_TESTE)
const podeEnviar = !!resend || !!process.env.EMAIL_PASTA_TESTE;

// O SDK do Resend (v6) NAO lanca excecao quando o envio falha (dominio nao
// verificado, destinatario invalido, limite de envio...) - so devolve
// { error }. Sem esta checagem, toda funcao abaixo retornava success: true
// e nada ia pro log, mesmo sem o e-mail ter saido. Lancando aqui, o catch
// que cada funcao ja tem passa a registrar a falha e retornar success: false.
// exportada so para o teste de unidade (scripts/e2e/conta-teste-envio-equipe.mjs)
export async function sendOrThrow(payload: Parameters<Resend['emails']['send']>[0]) {
  const destinos = ([] as string[]).concat((payload as { to: string | string[] }).to).filter(Boolean);
  if (!destinos.length) throw new Error('e-mail sem destinatario');
  if (!resend) {
    // modo local (EMAIL_PASTA_TESTE): 1 arquivo por destinatario (antes so o 1o de uma lista)
    const p = payload as { subject: string; html?: string };
    for (const para of destinos) {
      if (!(await enviarEmail({ para, assunto: p.subject, html: p.html || '' }))) throw new Error('e-mail de teste nao gravado');
    }
    return;
  }
  // conta de teste nao recebe e-mail de verdade (dono 18/11; mesma regra do lib/email.ts). Lote 3.2: com
  // varios destinatarios, so os de teste saem da lista (antes: todos de teste = nada; misto = todos recebiam)
  const teste = await Promise.all(destinos.map((d) => emailDeContaTeste(d)));
  const reais = destinos.filter((_, i) => !teste[i]);
  if (!reais.length) {
    console.log('[email] conta de teste - nao enviado');
    return;
  }
  if (reais.length < destinos.length) console.log(`[email] conta de teste - ${destinos.length - reais.length} destinatario(s) fora da lista`);
  // logo, cores e rodape da BipFix (lib/email-marca.ts); sem Resend, enviarEmail ja aplica
  const p2 = payload as { html?: string };
  const to = Array.isArray((payload as { to: string | string[] }).to) ? reais : reais[0];
  const { error } = await resend!.emails.send({ ...payload, to, ...(p2.html ? { html: aplicarIdentidade(p2.html) } : {}) } as typeof payload);
  if (error) throw new Error(`Resend recusou o e-mail: ${error.name} - ${error.message}`);
}

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
  if (!podeEnviar) {
    console.warn('[Notifications] Resend not configured - RESEND_API_KEY missing');
    return { success: false, error: 'Email service not configured' };
  }

  const s = EMAIL_I18N.accidentNotification[resolveEmailLocale(params.locale)];
  const acidenteUrl = `${urlNoIdioma(params.locale, `/emergencia/acidente/${params.emergenciaId}`)}`;
  const cadastroUrl = `${urlNoIdioma(params.locale, `/cadastro?tipo=cliente&email=${encodeURIComponent(params.toEmail)}`)}`;

  try {
    await sendOrThrow({
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
              <a href="${params.isRegistered ? acidenteUrl : `${siteNoIdioma(params.locale)}/reset-password`}"
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
  if (!podeEnviar) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const s = EMAIL_I18N.funcionarioNovaSenha[resolveEmailLocale(params.locale)];

  try {
    await sendOrThrow({
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
              <a href="${siteNoIdioma(params.locale)}/login" style="display: inline-block; background: #0284c7; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">${s.cta}</a>
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
  /** numero do pedido: link curto /r/<numero> (sem nome de pagina em portugues) */
  numero?: string | number | null;
  /** dono do pedido: o botao leva o link de acesso de uso unico (lib/link-acesso.ts) */
  clienteId?: string | null;
  locale?: string;
}) {
  if (!podeEnviar) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const s = EMAIL_I18N.quoteNotification[resolveEmailLocale(params.locale)];
  const orcamentosUrl = params.numero
    ? await linkPedido(params.numero, params.clienteId, params.solicitacaoId, `l=${resolveEmailLocale(params.locale)}`)
    : `${siteNoIdioma(params.locale)}/cliente/orcamentos/${params.solicitacaoId}`;

  try {
    await sendOrThrow({
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
              <p style="margin: 4px 0 0; color: #6b7280;">${fmt(s.prazo, { prazoDias: diasTexto(params.locale, params.prazoDias) })}</p>
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
  if (!podeEnviar) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const s = EMAIL_I18N.servicoConcluido[resolveEmailLocale(params.locale)];
  const acompanhamentoUrl = `${siteNoIdioma(params.locale)}/cliente/acompanhamento/${params.solicitacaoId}`;

  try {
    await sendOrThrow({
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
// WhatsApp so com remetente proprio configurado: a conta Twilio existe agora por
// causa do SMS (04/11) e o sandbox de teste da Twilio nao entrega a clientes.
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;
// SMS: remetente alfanumerico (aceito na Estonia e na maior parte da Europa sem
// registro previo; o cliente nao consegue responder). Desde 13/11 (dono) qualquer
// pais: onde o alfanumerico nao vale (EUA/Canada, Brasil...) a Twilio recusa e,
// com TWILIO_SMS_FROM_NUMERO, tenta de novo com o numero. A Twilio so entrega nos
// paises liberados em Geo Permissions (console da Twilio - decisao do dono).
const TWILIO_SMS_FROM = process.env.TWILIO_SMS_FROM || 'BipFix';
const TWILIO_SMS_FROM_NUMERO = process.env.TWILIO_SMS_FROM_NUMERO;
const SMS_LINK_BASE = (process.env.SMS_LINK_BASE || SITE_URL.replace('://www.', '://')).replace(/\/$/, '');

// Telefone em E.164 (padrao internacional). "+372 5..." / "00372..." ja traz o
// pais; numero nacional recebe o codigo do pais do servico. Antes todo numero
// virava +55 (Brasil) e o aviso de um cliente da Estonia ia para o numero
// errado (auditoria Fable 08/10, M-11).
const DDI: Record<string, string> = { BR: '55', EE: '372', PT: '351', IT: '39', LV: '371', LT: '370', FI: '358' };
export function telefoneE164(bruto: string, pais?: string | null): string | null {
  const t = (bruto || '').trim();
  if (t.startsWith('+')) return t.replace(/\D/g, '') || null;
  const d = t.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) return d.slice(2);
  const ddi = pais ? DDI[pais.toUpperCase()] : undefined;
  if (ddi) return d.startsWith(ddi) && d.length > ddi.length + 7 ? d : ddi + d.replace(/^0+/, '');
  // pais desconhecido: so o formato brasileiro (DDD + numero) e inequivoco
  if (d.length === 10 || d.length === 11) return '55' + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

async function twilioMensagem(params: Record<string, string>): Promise<{ success: boolean; error?: string; sid?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
    // Twilio parada nao segura o aviso do orcamento (e-mail e o resto seguem)
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return { success: false, error: data.message || `Twilio ${response.status}` };
  }
  const data = await response.json().catch(() => ({}));
  return { success: true, sid: data.sid };
}

// SMS de servico (so sobre o pedido do proprio cliente; nada de marketing - §103¹ ESS).
// Quem decide se envia (interruptor, app, pedido aberto) e lib/sms.ts.
async function sendSms(to: string, message: string, pais?: string | null): Promise<{ success: boolean; error?: string; sid?: string }> {
  if (!TWILIO_SID || !TWILIO_TOKEN) return { success: false, error: 'SMS service not configured' };
  const phone = telefoneE164(to, pais);
  if (!phone) return { success: false, error: 'Telefone sem país' };
  // E.164: 8 a 15 digitos; numero estoniano tem 7-8 digitos depois do 372 (barra numero
  // estrangeiro digitado sem "+", que viraria +372...)
  if (!/^\d{8,15}$/.test(phone)) return { success: false, error: 'Número inválido' };
  if (phone.startsWith('372') && !/^372\d{7,8}$/.test(phone)) return { success: false, error: 'Número estoniano inválido' };
  try {
    let r = await twilioMensagem({ From: TWILIO_SMS_FROM, To: `+${phone}`, Body: message });
    // pais sem remetente alfanumerico: de novo com o numero da conta, se houver
    if (!r.success && TWILIO_SMS_FROM_NUMERO && !phone.startsWith('372')) {
      r = await twilioMensagem({ From: TWILIO_SMS_FROM_NUMERO, To: `+${phone}`, Body: message });
    }
    if (!r.success) console.error('[Notifications] SMS recusado:', r.error);
    return r;
  } catch (err) {
    console.error('[Notifications] SMS error:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function sendQuoteSms(params: {
  toPhone: string;
  /** pais do servico (oficina): DDI de numero nacional */
  pais?: string | null;
  /** numero do pedido: o link curto /r/<numero> (app/r/[numero]) leva a pagina no idioma do cliente */
  numero: string | number;
  locale?: string;
}) {
  // link curto e neutro (dono 04/11: nada de caminho em portugues no SMS) e sem
  // "www" para caber em 1 SMS tambem em russo
  const url = `${SMS_LINK_BASE}/r/${params.numero}`;
  const tmpl = SMS_I18N.quoteSms[resolveEmailLocale(params.locale)];
  return sendSms(params.toPhone, fmt(tmpl, { url }), params.pais);
}

async function sendWhatsApp(to: string, message: string, pais?: string | null): Promise<{ success: boolean; error?: string }> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WHATSAPP_FROM) {
    console.info('[Notifications] WhatsApp desligado (sem TWILIO_WHATSAPP_FROM ou chaves)');
    return { success: false, error: 'WhatsApp service not configured' };
  }

  const phone = telefoneE164(to, pais);
  if (!phone) return { success: false, error: 'Telefone sem país' };

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
  /** pais do servico (oficina/acidente): DDI de numero nacional */
  pais?: string | null;
  toName: string;
  fromName: string;
  placa: string;
  emergenciaId: string;
  locale?: string;
}) {
  const acidenteUrl = `${urlNoIdioma(params.locale, `/emergencia/acidente/${params.emergenciaId}`)}`;
  const tmpl = WHATSAPP_I18N.accidentWhatsApp[resolveEmailLocale(params.locale)];
  const message = fmt(tmpl, { toName: params.toName, fromName: params.fromName, placa: params.placa, url: acidenteUrl });
  return sendWhatsApp(params.toPhone, message, params.pais);
}

export async function sendQuoteWhatsApp(params: {
  toPhone: string;
  /** pais do servico (oficina/acidente): DDI de numero nacional */
  pais?: string | null;
  toName: string;
  oficinaNome: string;
  valorTotal: string;
  solicitacaoId: string;
  locale?: string;
}) {
  const url = `${siteNoIdioma(params.locale)}/cliente/orcamentos/${params.solicitacaoId}`;
  const tmpl = WHATSAPP_I18N.quoteWhatsApp[resolveEmailLocale(params.locale)];
  const message = fmt(tmpl, { toName: params.toName, oficinaNome: params.oficinaNome, valorTotal: params.valorTotal, url });
  return sendWhatsApp(params.toPhone, message, params.pais);
}

export async function sendServicoConcluidoWhatsApp(params: {
  toPhone: string;
  /** pais do servico (oficina/acidente): DDI de numero nacional */
  pais?: string | null;
  toName: string;
  oficinaNome: string;
  veiculoNome: string;
  solicitacaoId: string;
  locale?: string;
}) {
  const url = `${siteNoIdioma(params.locale)}/cliente/acompanhamento/${params.solicitacaoId}`;
  const tmpl = WHATSAPP_I18N.servicoConcluidoWhatsApp[resolveEmailLocale(params.locale)];
  const message = fmt(tmpl, { toName: params.toName, veiculoNome: params.veiculoNome, oficinaNome: params.oficinaNome, url });
  return sendWhatsApp(params.toPhone, message, params.pais);
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
  pais?: string | null;
}) {
  if (!podeEnviar) {
    console.warn('[Notifications] Resend not configured - RESEND_API_KEY missing');
    return { success: false, error: 'Email service not configured' };
  }

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'support@bipfix.com';
  const tipoLabel = params.tipo === 'oficina' ? 'Oficina' : 'Loja de peças';
  const paisLabel = ({ EE: 'Estônia', IT: 'Itália', PT: 'Portugal', BR: 'Brasil' } as Record<string, string>)[params.pais || ''] || 'país não informado';

  try {
    await sendOrThrow({
      from: FROM_EMAIL,
      to: adminEmail,
      subject: `Novo interessado (${tipoLabel}, ${paisLabel}): ${params.nomeNegocio}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 22px;">Novo interessado em ser parceiro</h1>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <table style="width: 100%; font-size: 14px; color: #111827;">
              <tr><td style="padding: 4px 0; color: #6b7280;">País</td><td style="padding: 4px 0;"><strong>${paisLabel}</strong></td></tr>
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

// Pergunta do formulario "Ainda tem duvidas?" (pagina para oficinas)
export async function sendPerguntaSiteEmail(params: {
  nome: string;
  contato: string;
  pergunta: string;
  traducao?: string | null;
  locale: string;
  pagina?: string;
}) {
  if (!podeEnviar) {
    console.warn('[Notifications] Resend not configured - RESEND_API_KEY missing');
    return { success: false, error: 'Email service not configured' };
  }
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'support@bipfix.com';
  const idioma = ({ et: 'estoniano', ru: 'russo', en: 'inglês', it: 'italiano', 'pt-PT': 'português (PT)', pt: 'português (BR)' } as Record<string, string>)[params.locale] || params.locale;
  const linha = (rotulo: string, valor: string) => `<tr><td style="padding: 4px 0; color: #6b7280; vertical-align: top; width: 110px;">${rotulo}</td><td style="padding: 4px 0;">${valor}</td></tr>`;
  try {
    await sendOrThrow({
      from: FROM_EMAIL,
      to: adminEmail,
      // responder o e-mail vai direto para a pessoa, quando ela deixou um e-mail
      ...(/\S+@\S+\.\S+/.test(params.contato) ? { replyTo: params.contato } : {}),
      subject: `Pergunta pelo site (${idioma}): ${params.nome}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 22px;">Nova pergunta pelo site</h1>
            <p style="margin: 6px 0 0; font-size: 14px;">Prometemos responder em 1 dia útil.</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <table style="width: 100%; font-size: 14px; color: #111827;">
              ${linha('Nome', `<strong>${escapeHtml(params.nome)}</strong>`)}
              ${linha('Contato', escapeHtml(params.contato))}
              ${linha('Idioma', idioma)}
              ${params.pagina ? linha('Página', escapeHtml(params.pagina)) : ''}
            </table>
            ${params.traducao ? `<h2 style="font-size: 15px; margin: 20px 0 6px;">Tradução</h2><p style="margin: 0; white-space: pre-wrap; background: #eff6ff; padding: 12px; border-radius: 8px;">${escapeHtml(params.traducao)}</p>` : ''}
            <h2 style="font-size: 15px; margin: 20px 0 6px;">Mensagem original</h2>
            <p style="margin: 0; white-space: pre-wrap; background: #f9fafb; padding: 12px; border-radius: 8px;">${escapeHtml(params.pergunta)}</p>
            <p style="margin-top: 20px;"><a href="${SITE_URL}/admin/leads-parceiros" style="color: #2563eb;">Ver todos os contatos →</a></p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('[Notifications] Erro ao enviar e-mail de pergunta do site:', error);
    return { success: false, error: 'Failed to send email' };
  }
}

// ============================================================
// EMAIL - PORTAL DE PEÇAS (cotações entre oficinas e fornecedores)
// ============================================================

// Linha "rotulo: valor" dos e-mails de pecas (valor ja escapado por quem chama)
const linhaPeca = (rotulo: string, valor: string) => `<p style="margin: 6px 0 0; color: #374151;"><strong>${rotulo}:</strong> ${valor}</p>`;

// Pedido de peca novo: loja do pais (paraLoja) ou oficina vizinha que vende sobra.
// B3/M6 (16/11): leva carro, quantidade, detalhes e a 1a foto; o botao abre a tela
// certa (loja: /loja/cotacoes; oficina: aba "Vender" de /oficina/pecas).
export async function sendCotacaoPecaDisponivelEmail(params: {
  toEmail: string;
  toName: string;
  pecaDescricao: string;
  oficinaCompradoraNome: string;
  carro?: string | null;
  quantidade?: number;
  // lote 1 de pecas (17/11): "4,5 l"; sem unidade ou 'un' com numero inteiro = a linha de antes
  unidade?: string | null;
  observacao?: string | null;
  foto?: string | null;
  paraLoja?: boolean;
  linkInterno: string;
  locale?: string;
  // lote 2 de pecas (17/11), so com a tela nova (cotacao com urgencia): urgencia, "aberta ate"
  // (ja no fuso de quem recebe) e o botao "Nao tenho" (token proprio). Ausentes = e-mail de hoje.
  urgencia?: string | null;
  abertaAte?: string | null;
  naoTenhoUrl?: string | null;
}) {
  if (!podeEnviar) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }
  const l = resolveEmailLocale(params.locale);
  const s = EMAIL_I18N.cotacaoPecaDisponivel[l];
  const d = EMAIL_I18N.pecaDetalhes[l];
  const a = EMAIL_I18N.pecaAvisos[l];
  const foto = params.foto && /^https?:\/\//.test(params.foto) ? params.foto : null;
  const urgencia = params.urgencia && a[`urg_${params.urgencia}`] ? a[`urg_${params.urgencia}`] : null;
  try {
    await sendOrThrow({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: fmt(params.paraLoja ? d.subjectLoja : s.subject, { pecaDescricao: params.pecaDescricao }),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">${params.paraLoja ? d.headerTagLoja : s.headerTag}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.greeting, { name: escapeHtml(params.toName) })}</p>
            <p>${fmt(params.paraLoja ? d.introLoja : s.intro, { oficinaCompradoraNome: escapeHtml(params.oficinaCompradoraNome) })}</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; font-size: 18px; font-weight: bold; color: #111827;">${escapeHtml(params.pecaDescricao)}</p>
              ${params.carro?.trim() ? linhaPeca(d.veiculo, escapeHtml(params.carro.trim())) : ''}
              ${linhaPeca(d.quantidade, quantidadeTexto(l, params.quantidade, params.unidade))}
              ${urgencia ? `<p data-campo="urgencia" style="margin: 6px 0 0; color: #374151;"><strong>${a.urgencia}:</strong> ${urgencia}</p>` : ''}
              ${params.abertaAte ? `<p data-campo="aberta-ate" style="margin: 6px 0 0; color: #374151;"><strong>${a.abertaAte}:</strong> ${escapeHtml(params.abertaAte)}</p>` : ''}
              ${params.observacao?.trim() ? linhaPeca(d.detalhes, escapeHtml(params.observacao.trim().slice(0, 500))) : ''}
              ${foto ? `<p style="margin: 12px 0 0;"><img src="${escapeHtml(foto)}" alt="" width="160" style="max-width: 160px; border-radius: 8px; border: 1px solid #e5e7eb;" /></p>` : ''}
            </div>
            <p>${s.callToAction}</p>
            <p style="margin-top: 24px;">
              <a href="${linkNeutroPecas(params.locale, params.linkInterno)}"
                 style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                ${s.cta}
              </a>
            </p>
            ${params.naoTenhoUrl ? `<p style="margin-top: 16px;"><a data-campo="nao-tenho" href="${escapeHtml(params.naoTenhoUrl)}" style="display: inline-block; border: 1px solid #9ca3af; color: #374151; padding: 10px 20px; border-radius: 8px; text-decoration: none;">${a.naoTenho}</a></p><p style="margin: 6px 0 0; font-size: 12px; color: #6b7280;">${a.naoTenhoAjuda}</p>` : ''}
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

// Lote 2 de pecas (17/11): resumo de 2 h (dias uteis, 8-18 h Tallinn) com as cotacoes da fila
// (sem pressa ou acima do teto diario). Uma linha por cotacao (data-cotacao, para os testes) com o
// proprio link "Nao tenho"; sem placa e sem foto; botao neutro para a lista. Devolve success false
// (sem lancar) quando o envio falha: a tarefa desfaz a reserva e tenta no proximo slot.
export async function sendResumoCotacoesPecasEmail(params: {
  toEmail: string;
  toName: string;
  locale?: string;
  linkInterno: string;
  cotacoes: { id: string; peca: string; carro: string | null; semCarro: boolean; quantidade: number; unidade?: string | null; urgencia?: string | null; cidade?: string | null; abertaAte: string; naoTenhoUrl: string | null }[];
}) {
  if (!podeEnviar) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }
  const l = resolveEmailLocale(params.locale);
  const s = EMAIL_I18N.cotacaoPecaDisponivel[l];
  const d = EMAIL_I18N.pecaDetalhes[l];
  const a = EMAIL_I18N.pecaAvisos[l];
  const linhas = params.cotacoes.map((c) => {
    const urg = c.urgencia && a[`urg_${c.urgencia}`] ? ` · ${a.urgencia}: ${a[`urg_${c.urgencia}`]}` : '';
    const veiculo = c.semCarro ? a.semVeiculo : c.carro?.trim() ? escapeHtml(c.carro.trim()) : '';
    return `<div data-cotacao="${c.id}" style="border-top: 1px solid #e5e7eb; padding: 10px 0;">`
      + `<p style="margin: 0; font-weight: bold; color: #111827;">${escapeHtml(c.peca)}</p>`
      + `<p style="margin: 4px 0 0; color: #374151;">${veiculo ? `${veiculo} · ` : ''}${d.quantidade}: ${quantidadeTexto(l, c.quantidade, c.unidade)}${urg}</p>`
      + `<p style="margin: 4px 0 0; color: #6b7280;">${c.cidade ? `${a.cidade} ${escapeHtml(c.cidade)} · ` : ''}${a.abertaAte}: ${escapeHtml(c.abertaAte)}</p>`
      + (c.naoTenhoUrl ? `<p style="margin: 6px 0 0;"><a data-campo="nao-tenho" href="${escapeHtml(c.naoTenhoUrl)}" style="color: #374151;">${a.naoTenho}</a></p>` : '')
      + '</div>';
  }).join('');
  try {
    await sendOrThrow({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: fmt(a.resumoAssunto, { n: params.cotacoes.length }),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">${a.resumoTag}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.greeting, { name: escapeHtml(params.toName) })}</p>
            <p>${a.resumoIntro}</p>
            <div style="margin: 16px 0;">${linhas}</div>
            <p style="margin-top: 24px;">
              <a href="${linkNeutroPecas(params.locale, params.linkInterno)}"
                 style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                ${a.resumoCta}
              </a>
            </p>
            <p style="margin-top: 16px; font-size: 12px; color: #6b7280;">${a.resumoRodape}</p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('[Notifications] Erro ao enviar o resumo de cotacoes de pecas:', (error as Error)?.message);
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
  // lote 2 de pecas (17/11): oferta com IVA e/ou quantidade ofertada (tela nova). Sem iva_modo e sem
  // quantidade ofertada = e-mail de hoje (nenhuma linha nova).
  oferta?: { quantidadePedida: number; quantidadeOfertada?: number | null; unidade?: string | null; ivaModo?: string | null; ivaPct?: number | null } | null;
}) {
  if (!podeEnviar) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }
  const locale = resolveEmailLocale(params.locale);
  const s = EMAIL_I18N.cotacaoPecaRespondida[locale];
  // Moeda e formato do idioma de quem recebe (antes: sempre pt-BR/BRL, tambem na Europa)
  const precoFormatado = formatCurrency(params.preco, params.moeda || moedaPadrao(params.locale), params.locale || 'en');
  const linhasOferta = (() => {
    const o = params.oferta;
    if (!o || (!o.ivaModo && o.quantidadeOfertada == null)) return '';
    const a = EMAIL_I18N.pecaAvisos[locale];
    const moeda = params.moeda || moedaPadrao(params.locale);
    const qtd = Number(o.quantidadeOfertada ?? o.quantidadePedida) || 1;
    const total = totalDaOferta(params.preco, qtd);
    const linhas = [`<p data-campo="total" style="margin: 6px 0 0; color: #374151;"><strong>${a.total}:</strong> ${formatCurrency(total, moeda, params.locale || 'en')} (${quantidadeTexto(locale, qtd, o.unidade)})</p>`];
    if (o.ivaModo === 'registrado' && o.ivaPct != null) linhas.push(`<p data-campo="iva" style="margin: 4px 0 0; color: #6b7280;">${fmt(a.ivaSem, { valor: formatCurrency(semIva(total, o.ivaPct), moeda, params.locale || 'en'), pct: numeroTexto(locale, o.ivaPct) })}</p>`);
    else if (o.ivaModo === 'nao_registrado') linhas.push(`<p data-campo="iva" style="margin: 4px 0 0; color: #6b7280;">${a.ivaNaoAplicavel}</p>`);
    else if (o.ivaModo === 'margem') linhas.push(`<p data-campo="iva" style="margin: 4px 0 0; color: #6b7280;">${a.ivaMargem}</p>`);
    if (o.quantidadeOfertada != null && Number(o.quantidadeOfertada) < Number(o.quantidadePedida)) linhas.push(`<p data-campo="parcial" style="margin: 4px 0 0; color: #92400e;">${fmt(a.ofertaParcial, { ofertada: quantidadeTexto(locale, o.quantidadeOfertada, o.unidade), pedida: quantidadeTexto(locale, o.quantidadePedida, o.unidade) })}</p>`);
    return linhas.join('');
  })();
  try {
    await sendOrThrow({
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
              <p style="margin: 4px 0 0; color: #6b7280;">${fmt(s.prazo, { prazoDias: diasTexto(params.locale, params.prazoDias) })}</p>
              ${linhasOferta}
            </div>
            <p style="margin-top: 24px;">
              <a href="${linkNeutroPecas(params.locale, '/oficina/pecas')}"
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

// A4 (16/11): botao pela tela do fornecedor (loja: /loja/pedidos; oficina: aba
// "Vender"), valor TOTAL (preco x quantidade) e contato da oficina compradora.
export async function sendPedidoPecaConfirmadoEmail(params: {
  toEmail: string;
  toName: string;
  oficinaCompradoraNome: string;
  pecaDescricao: string;
  valorTotal: number;
  quantidade?: number;
  unidade?: string | null;
  moeda?: string;
  linkInterno: string;
  contato?: { telefone?: string | null; endereco?: string | null };
  locale?: string;
}) {
  if (!podeEnviar) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }
  const s = EMAIL_I18N.pedidoPecaConfirmado[resolveEmailLocale(params.locale)];
  const d = EMAIL_I18N.pecaDetalhes[resolveEmailLocale(params.locale)];
  const valorFormatado = formatCurrency(params.valorTotal, params.moeda || moedaPadrao(params.locale), params.locale || 'en');
  const tel = params.contato?.telefone?.trim();
  const end = params.contato?.endereco?.trim();
  const contatoHtml = tel || end
    ? `<div style="background: #eff6ff; padding: 16px; border-radius: 8px; margin: 16px 0;">
         <p style="margin: 0; font-weight: bold; color: #1e3a8a;">${d.contatoTitulo}: ${escapeHtml(params.oficinaCompradoraNome)}</p>
         ${tel ? linhaPeca(d.telefone, `<a href="tel:${escapeHtml(tel.replace(/[^\d+]/g, ''))}">${escapeHtml(tel)}</a>`) : ''}
         ${end ? linhaPeca(d.endereco, escapeHtml(end)) : ''}
       </div>`
    : '';
  try {
    await sendOrThrow({
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
              <p style="margin: 0; font-size: 13px; color: #6b7280;">${d.total}</p>
              <p style="margin: 2px 0 0; font-size: 24px; font-weight: bold; color: #111827;">${valorFormatado}</p>
              ${linhaPeca(d.quantidade, quantidadeTexto(params.locale, params.quantidade, params.unidade))}
            </div>
            ${contatoHtml}
            <p>${s.deliveryNote}</p>
            <p style="margin-top: 24px;">
              <a href="${linkNeutroPecas(params.locale, params.linkInterno)}"
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

// A2 (16/11): mensagem nova na conversa de um pedido de peca (no maximo 1 por hora por conversa)
export async function sendMensagemPecaEmail(params: {
  toEmail: string;
  toName: string;
  remetente: string;
  pecaDescricao: string;
  linkInterno: string;
  locale?: string;
}) {
  if (!podeEnviar) return { success: false, error: 'Email service not configured' };
  const s = EMAIL_I18N.mensagemPeca[resolveEmailLocale(params.locale)];
  try {
    await sendOrThrow({
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
            <p>${fmt(s.intro, { remetente: escapeHtml(params.remetente), pecaDescricao: escapeHtml(params.pecaDescricao) })}</p>
            <p style="margin-top: 24px;">
              <a href="${linkNeutroPecas(params.locale, params.linkInterno)}"
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
    console.error('[Notifications] Erro ao enviar e-mail de mensagem de peca:', error);
    return { success: false, error: 'Failed to send email' };
  }
}

// 20/11 (dono): oficina aprovada (ativada) pelo admin: como entrar, onde ficam os pedidos e os guias
export async function sendOficinaAtivadaEmail(params: { toEmail: string; toName: string; oficinaNome: string; locale?: string }) {
  if (!podeEnviar) return { success: false, error: 'Email service not configured' };
  const s = EMAIL_I18N.oficinaAtivada[resolveEmailLocale(params.locale)];
  const idioma = idiomaDoSite(params.locale);
  const loginLink = `<a href="${urlNoIdioma(params.locale, '/login')}">${s.loginRotulo}</a>`;
  // PDF de nome fixo = sempre a versao atual (so ET e RU); os outros idiomas vao para a ajuda das oficinas
  const guiaUrl = idioma === 'et' || idioma === 'ru'
    ? `${SITE_URL.replace('://www.', '://')}/guias/perfil-oficina-${idioma}.pdf`
    : urlNoIdioma(params.locale, '/docs/oficina');
  const guiaLink = `<a href="${guiaUrl}">${s.guiaRotulo}</a>`;
  try {
    await sendOrThrow({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: s.subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">${s.headerTag}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.greeting, { name: escapeHtml(params.toName) })}</p>
            <p>${fmt(s.intro, { oficinaNome: escapeHtml(params.oficinaNome) })}</p>
            <ol style="padding-left: 20px; line-height: 1.5;">
              <li style="margin-bottom: 8px;">${fmt(s.passoLogin, { loginLink })}</li>
              <li style="margin-bottom: 8px;">${s.passoPedidos}</li>
              <li style="margin-bottom: 8px;">${fmt(s.passoGuias, { guiaLink })}</li>
            </ol>
            <p style="margin-top: 24px;">
              <a href="${linkNeutroPecas(params.locale, '/oficina/pedidos')}"
                 style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                ${s.cta}
              </a>
            </p>
            <p style="color: #6b7280; font-size: 13px;">${s.fim}</p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('[Notifications] Erro ao enviar e-mail de oficina ativada:', error);
    return { success: false, error: 'Failed to send email' };
  }
}

// M1 (16/11): loja de pecas ativada pelo admin
export async function sendLojaAtivadaEmail(params: { toEmail: string; toName: string; lojaNome: string; locale?: string }) {
  if (!podeEnviar) return { success: false, error: 'Email service not configured' };
  const s = EMAIL_I18N.lojaAtivada[resolveEmailLocale(params.locale)];
  try {
    await sendOrThrow({
      from: FROM_EMAIL,
      to: params.toEmail,
      subject: s.subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">${s.headerTag}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.greeting, { name: escapeHtml(params.toName) })}</p>
            <p>${fmt(s.intro, { lojaNome: escapeHtml(params.lojaNome) })}</p>
            <p style="margin-top: 24px;">
              <a href="${linkNeutroPecas(params.locale, '/loja/cotacoes')}"
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
    console.error('[Notifications] Erro ao enviar e-mail de loja ativada:', error);
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
  if (!podeEnviar) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }
  const s = EMAIL_I18N.pedidoPecaEntregue[resolveEmailLocale(params.locale)];
  try {
    await sendOrThrow({
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
              <a href="${linkNeutroPecas(params.locale, '/oficina/pecas')}"
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
  if (!podeEnviar) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const s = EMAIL_I18N.orcamentoAceitoPagamento[resolveEmailLocale(params.locale)];

  try {
    await sendOrThrow({
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
              <p style="margin: 4px 0 0; color: #b91c1c;">${fmt(s.prazo, { dias: diasTexto(params.locale, params.prazoDias) })}</p>
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
              <a href="${siteNoIdioma(params.locale)}/cliente/mensagens/${params.solicitacaoId}"
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
  if (!podeEnviar) {
    console.warn('[Notifications] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const s = EMAIL_I18N.orcamentoAceitoOutro[resolveEmailLocale(params.locale)];

  try {
    await sendOrThrow({
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
              <p style="margin: 4px 0 0; color: #15803d;">${fmt(s.prazo, { dias: diasTexto(params.locale, params.prazoDias) })}</p>
            </div>
            <p>${s.ctaText}</p>
            <p style="margin-top: 24px;">
              <a href="${urlNoIdioma(params.locale, `/emergencia/acidente/${params.emergenciaId}`)}"
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

// ============================================================
// CHAT DE SUPORTE (dono 03/11)
// ============================================================

/** Mensagem nova no chat de suporte com o admin offline (no maximo 1 a cada 15 min por conversa). */
export async function sendSuporteAdminEmail(params: { nome: string; contato: string; texto: string; traducao?: string | null; locale: string; pagina?: string | null }) {
  if (!podeEnviar) return { success: false, error: 'Email service not configured' };
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'support@bipfix.com';
  const idioma = ({ et: 'estoniano', ru: 'russo', en: 'inglês', it: 'italiano', 'pt-PT': 'português (PT)', pt: 'português (BR)' } as Record<string, string>)[params.locale] || params.locale;
  try {
    await sendOrThrow({
      from: FROM_EMAIL,
      to: adminEmail,
      subject: `Chat de suporte (${idioma}): ${params.nome}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 20px 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 20px;">Nova mensagem no chat</h1>
            <p style="margin: 6px 0 0; font-size: 14px;">${escapeHtml(params.nome)} · ${escapeHtml(params.contato)} · ${idioma}${params.pagina ? ` · ${escapeHtml(params.pagina)}` : ''}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            ${params.traducao ? `<p style="margin: 0 0 12px; white-space: pre-wrap; background: #eff6ff; padding: 12px; border-radius: 8px;">${escapeHtml(params.traducao)}</p>` : ''}
            <p style="margin: 0; white-space: pre-wrap; background: #f9fafb; padding: 12px; border-radius: 8px; color: #374151;">${escapeHtml(params.texto)}</p>
            <p style="margin-top: 20px;"><a href="${SITE_URL}/admin/suporte" style="display: inline-block; background: #1e40af; color: white; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: bold;">Responder no admin</a></p>
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

/** Resposta do admin para quem nao esta com o chat aberto (no maximo 1 a cada 15 min por conversa). */
export async function sendSuporteRespostaEmail(params: { toEmail: string; toName: string; texto: string; locale: string; visitante?: boolean; iniciada?: boolean }) {
  if (!podeEnviar) return { success: false, error: 'Email service not configured' };
  // iniciada: conversa que o admin comecou (dono 19/11) - "mensagem", nao "resposta"
  const s = (params.iniciada ? SUPORTE_EMAIL_MENSAGEM : SUPORTE_EMAIL_RESPOSTA)[linguaTexto(params.locale)];
  const url = `${siteNoIdioma(params.locale)}?suporte=1`;
  try {
    await sendOrThrow({
      from: FROM_EMAIL,
      to: params.toEmail,
      // responder o e-mail chega no suporte (a pessoa pode estar noutro aparelho, sem o chat)
      replyTo: process.env.ADMIN_NOTIFICATION_EMAIL || 'support@bipfix.com',
      subject: s.assunto,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 20px 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 20px;">${s.titulo}</h1>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(s.ola, { nome: escapeHtml(params.toName) })}</p>
            <p style="white-space: pre-wrap; background: #f3f4f6; padding: 14px; border-radius: 8px;">${escapeHtml(params.texto)}</p>
            <p style="margin-top: 20px;"><a href="${url}" style="display: inline-block; background: #1e40af; color: white; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: bold;">${s.abrir}</a></p>
            <p style="color: #6b7280; font-size: 13px;">${s.rodape}</p>
            ${params.visitante ? `<p style="color: #9ca3af; font-size: 12px;">${s.porque}</p>` : ''}
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
