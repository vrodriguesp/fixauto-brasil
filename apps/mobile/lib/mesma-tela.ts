// O aviso tocado (banner ou push) leva para uma tela que JA esta aberta? Entao nao empilha outra (auditoria 27/11,
// A1: tocar no aviso da conversa aberta abria uma 2a conversa e, ao voltar, "cannot add postgres_changes callbacks").
// Compara o caminho e, na conversa, a oficina e o pagador (cada conversa e uma tela distinta).
export function mesmaTela(pathnameAtual: string | null | undefined, paramsAtuais: Record<string, string | string[] | undefined> | null | undefined, destino: string): boolean {
  if (!pathnameAtual) return false;
  const [caminho, query = ''] = destino.split('?');
  if (caminho.replace(/\/$/, '') !== pathnameAtual.replace(/\/$/, '')) return false;
  const q = new URLSearchParams(query);
  const p = paramsAtuais || {};
  const valor = (k: string) => { const v = p[k]; return Array.isArray(v) ? v[0] : v; };
  for (const k of ['oficina', 'pagador']) {
    const destinoV = q.get(k) || '';
    const atualV = valor(k) || '';
    if (destinoV !== atualV) return false;
  }
  return true;
}
