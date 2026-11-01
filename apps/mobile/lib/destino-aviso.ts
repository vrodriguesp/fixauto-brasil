// Para onde vai cada aviso ao ser tocado: dentro do app (lib/avisos.tsx) e no
// push com o app fechado (lib/push.ts). Arquivo sem dependencias de proposito.
export function destinoDoAviso(a: { tipo: string; dados: Record<string, string> | null }): string | null {
  const d = a.dados || {};
  if (a.tipo === 'nova_mensagem' && d.solicitacao_id) {
    const p = new URLSearchParams();
    if (d.oficina_id) p.set('oficina', d.oficina_id);
    if (d.pagador_id) p.set('pagador', '1');
    return `/conversa/${d.solicitacao_id}${p.toString() ? `?${p}` : ''}`;
  }
  if (d.solicitacao_id) return `/solicitacao/${d.solicitacao_id}`;
  return null;
}
