import { supabaseAdmin } from './supabase-admin';
import { enviarEmail } from './email';
import { senhaAleatoria } from './segredos';
import { EMAIL_I18N, resolveEmailLocale, fmt, escapeHtml } from './email-i18n';
import { urlNoIdioma, idiomaDoSite } from './site-url';

/**
 * Conta de cliente para quem registrou (ou foi citado em) um acidente sem
 * estar logado. Se o e-mail ja tem conta, devolve a existente. Se nao, cria
 * com senha aleatoria que NINGUEM recebe e manda um link de uso unico para a
 * pessoa definir a propria senha (OWASP: nunca senha por e-mail).
 * `introHtml` = paragrafo de contexto do e-mail (ja escapado).
 */
export async function garantirContaCliente(p: {
  email: string;
  nome: string;
  telefone?: string | null;
  idioma?: string | null;
  introHtml?: string;
}): Promise<{ id: string; idioma: string | null; criada: boolean }> {
  const { data: existente } = await supabaseAdmin
    .from('profiles')
    .select('id, idioma')
    .ilike('email', p.email.replace(/[%_\\]/g, '\\$&'))
    .maybeSingle();
  if (existente) return { id: existente.id, idioma: existente.idioma, criada: false };

  const idiomaSite = idiomaDoSite(p.idioma);
  const { data: auth, error } = await supabaseAdmin.auth.admin.createUser({
    email: p.email,
    password: senhaAleatoria(),
    email_confirm: true,
    user_metadata: { primeiro_login: true },
  });
  if (error || !auth.user) throw new Error(error?.message || 'Erro ao criar conta');

  const id = auth.user.id;
  await supabaseAdmin.from('profiles').insert({
    id,
    tipo: 'cliente',
    nome: p.nome || p.email.split('@')[0],
    email: p.email,
    telefone: p.telefone || null,
    idioma: idiomaSite,
  });

  const { data: link } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email: p.email });
  const tokenHash = link?.properties?.hashed_token;
  const url = tokenHash
    ? urlNoIdioma(idiomaSite, `/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`)
    : urlNoIdioma(idiomaSite, '/login');

  const cs = EMAIL_I18N.contaCriadaEmergencia[resolveEmailLocale(idiomaSite)];
  await enviarEmail({ para: p.email, assunto: cs.subject, html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0c4a6e;color:white;padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:24px;">BipFix</h1>
        <p style="margin:8px 0 0;opacity:0.8;">${cs.headerTag}</p>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
        <p>${fmt(cs.greeting, { name: escapeHtml(p.nome || '') })}</p>
        <p>${p.introHtml ?? cs.intro}</p>
        <p>${cs.accountNote}</p>
        <p>${cs.setPasswordNote}</p>
        <p style="margin:24px 0;">
          <a href="${url}" style="display:inline-block;background:#0284c7;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">${cs.setPasswordCta}</a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:12px;color:#9ca3af;">${cs.footer}</p>
      </div>
    </div>
  ` });
  return { id, idioma: idiomaSite, criada: true };
}
