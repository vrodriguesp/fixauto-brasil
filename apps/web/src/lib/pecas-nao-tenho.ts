import { createHash } from 'node:crypto';
import { supabaseAdmin } from './supabase-admin';
import { tokenAleatorio } from './segredos';
import { SITE_URL, idiomaDoSite } from './site-url';

// Lote 2 de pecas (17/11): link "Nao tenho" dos e-mails de cotacao (imediato e resumo).
// Tabela propria (pecas_links_email), NUNCA links_acesso: esses tokens dao login e este nao.
// Token de 256 bits por e-mail/linha, so o hash no banco (com prefixo proprio), preso a
// (fornecedor, cotacao), vale ate a cotacao vencer, uso unico. Abrir a pagina nao age; so o
// toque em "confirmar" (api/cotacao-peca/nao-tenho-email) gasta o token.
export const TOKEN_NAO_TENHO = /^[A-Za-z0-9_-]{43}$/;
export const hashNaoTenho = (token: string) => createHash('sha256').update(`naotenho:${token}`).digest('hex');

/** URL do botao "Nao tenho" (bipfix.com/n/<token>?o=<idioma>); null se o banco falhar (o e-mail sai sem o botao) */
export async function linkNaoTenho(p: { profileId: string; cotacaoId: string; fornecedorTipo: 'loja' | 'oficina'; fornecedorId: string; expiraEm: string; idioma?: string | null }): Promise<string | null> {
  const token = tokenAleatorio();
  const { error } = await supabaseAdmin.from('pecas_links_email').insert({
    token_hash: hashNaoTenho(token), profile_id: p.profileId, cotacao_id: p.cotacaoId,
    fornecedor_tipo: p.fornecedorTipo, fornecedor_id: p.fornecedorId, expira_em: p.expiraEm,
  });
  if (error) { console.error('[pecas-nao-tenho] token:', error.message); return null; }
  return `${SITE_URL.replace('://www.', '://')}/n/${token}?o=${encodeURIComponent(idiomaDoSite(p.idioma))}`;
}
