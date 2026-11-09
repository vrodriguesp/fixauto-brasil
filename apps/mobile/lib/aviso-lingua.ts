import i18n from '../i18n';

// Aviso na lingua do app (dados.textos, gravado nas 6 linguas pelo servidor) - mesma regra do
// site (lib/notif-textos.ts). Aviso antigo, sem textos: fica o texto gravado.
export function naLinguaDoApp<N extends { titulo: string; mensagem: string; dados?: unknown }>(n: N): N {
  const textos = (n.dados as { textos?: Record<string, { titulo: string; mensagem: string }> } | null | undefined)?.textos;
  const l = i18n.language || 'en';
  const t = textos?.[l] || (l.startsWith('pt') ? textos?.pt : undefined);
  return t ? { ...n, titulo: t.titulo, mensagem: t.mensagem } : n;
}
