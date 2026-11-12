import { createHash } from 'node:crypto';
import { supabaseAdmin } from './supabase-admin';
import { tokenAleatorio } from './segredos';
import { SITE_URL } from './site-url';

// Link de acesso dos e-mails do pedido ("Ver orcamento"; dono 12/11; migracao
// 080, tabela links_acesso). Token de 256 bits por e-mail, so o hash no banco,
// preso ao usuario e ao pedido, 7 dias, uso unico. O link curto continua o
// mesmo (bipfix.com/r/<numero>, sem portugues), com ?k=<token>: app/r/[numero]
// manda para a pagina "ver pedido", que NAO entra sozinha ao abrir (Outlook,
// antivirus e previas abrem links antes da pessoa - caso 29/10); so o toque em
// "Ver orcamento" (POST /api/link-acesso) gasta o token e entra na conta.
export const LINK_ACESSO_DIAS = 7;
export const hashLinkAcesso = (token: string) => createHash('sha256').update(`acesso:${token}`).digest('hex');
export const TOKEN_ACESSO = /^[A-Za-z0-9_-]{43}$/;

const site = () => SITE_URL.replace('://www.', '://');

/**
 * URL do botao do e-mail para o DONO do pedido. Sem usuario (outro motorista do
 * acidente) ou se o banco falhar, volta o link curto simples (pede login).
 */
export async function linkPedido(numero: string | number | null | undefined, userId?: string | null, solicitacaoId?: string | null, consulta = ''): Promise<string> {
  const base = `${site()}/r/${numero ?? ''}`;
  if (!numero || !userId || !solicitacaoId) return `${base}${consulta ? `?${consulta}` : ''}`;
  const token = tokenAleatorio();
  const { error } = await supabaseAdmin.from('links_acesso').insert({
    user_id: userId, solicitacao_id: solicitacaoId, token_hash: hashLinkAcesso(token),
    expira_em: new Date(Date.now() + LINK_ACESSO_DIAS * 24 * 3600 * 1000).toISOString(),
  });
  if (error) {
    console.error('[link-acesso] insert', error.message);
    return `${base}${consulta ? `?${consulta}` : ''}`;
  }
  return `${base}?k=${token}${consulta ? `&${consulta}` : ''}`;
}

/** Apaga links vencidos ha mais de 1 dia (tarefa de hora em hora). */
export async function limparLinksAcesso(): Promise<void> {
  await supabaseAdmin.from('links_acesso').delete().lt('expira_em', new Date(Date.now() - 24 * 3600 * 1000).toISOString()).then(() => {}, () => {});
}
