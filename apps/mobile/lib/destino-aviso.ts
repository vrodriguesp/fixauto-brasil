// Para onde vai cada aviso ao ser tocado: dentro do app (lib/avisos.tsx) e no
// push com o app fechado (lib/push.ts). Arquivo sem dependencias de proposito.
export function destinoDoAviso(a: { tipo: string; dados: Record<string, string> | null }): string | null {
  const d = a.dados || {};
  // pedido de novas datas (079) e aviso para a OFICINA: o app nao tem telas de oficina (ela responde pelo
  // site) - nao abre a tela do motorista (auditoria Fable 079, S1)
  if (a.tipo.startsWith('pedido_novas_datas')) return null;
  if (a.tipo === 'nova_mensagem' && d.solicitacao_id) {
    const p = new URLSearchParams();
    if (d.oficina_id) p.set('oficina', d.oficina_id);
    if (d.pagador_id) p.set('pagador', '1');
    return `/conversa/${d.solicitacao_id}${p.toString() ? `?${p}` : ''}`;
  }
  if (d.solicitacao_id) return `/solicitacao/${d.solicitacao_id}`;
  return null;
}
