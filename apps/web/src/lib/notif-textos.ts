// Avisos (sininho) na lingua de QUEM LE, nao na lingua da conta no momento do envio (dono 08/11:
// conta usada em ET mostrava "Proposta di nuova data"). Ao criar o aviso, os textos sao gerados
// nas 6 linguas e guardados em dados.textos; titulo/mensagem continuam com a lingua da conta (e-mail,
// push e avisos antigos). Na tela, textoDoAviso escolhe a lingua da tela.
import type { EmailLocale } from './email-i18n';

export const LINGUAS_AVISO: EmailLocale[] = ['pt', 'pt-PT', 'en', 'et', 'ru', 'it'];
export type TextoAviso = { titulo: string; mensagem: string };
export type TextosAviso = Partial<Record<EmailLocale, TextoAviso>>;

/** Gera o aviso em todas as linguas a partir do mesmo modelo usado para a conta. */
export function emTodasAsLinguas(gerar: (lingua: EmailLocale) => TextoAviso): TextosAviso {
  const r: TextosAviso = {};
  for (const l of LINGUAS_AVISO) {
    try { const x = gerar(l); r[l] = { titulo: x.titulo, mensagem: x.mensagem }; } catch { /* segue sem esta lingua */ }
  }
  return r;
}

/** Titulo e mensagem na lingua da tela (cai no texto gravado quando o aviso e antigo). */
export function textoDoAviso<N extends { titulo: string; mensagem: string; dados?: unknown }>(n: N, lingua: string): N {
  const textos = (n.dados as { textos?: TextosAviso } | null | undefined)?.textos;
  const t = textos?.[lingua as EmailLocale] || (lingua.startsWith('pt') ? textos?.pt : undefined);
  return t ? { ...n, titulo: t.titulo, mensagem: t.mensagem } : n;
}
