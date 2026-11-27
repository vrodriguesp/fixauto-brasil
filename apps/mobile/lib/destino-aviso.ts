// Para onde vai cada aviso ao ser tocado: dentro do app (lib/avisos.tsx) e no
// push com o app fechado (lib/push.ts). Arquivo sem dependencias de proposito.
// Desde 27/11 o app tambem e da OFICINA: o mesmo aviso abre telas diferentes
// conforme quem esta logado (papel).
export type Papel = 'cliente' | 'oficina';

// avisos que pedem um orcamento da oficina: o toque abre direto o formulario (pedido do dono 27/11:
// "abre o app -> ja logada -> ve o pedido e orca em poucos toques")
export const AVISOS_PEDIDO_NOVO = ['nova_solicitacao', 'pedido_convite', 'cobranca_admin_solicitacao'];

export function destinoDoAviso(a: { tipo: string; dados: Record<string, string> | null }, papel: Papel = 'cliente'): string | null {
  const d = a.dados || {};
  if (papel === 'oficina') return destinoOficina(a.tipo, d);
  // pedido de novas datas (079) e aviso para a OFICINA: nao abre a tela do motorista (auditoria Fable 079, S1)
  if (a.tipo.startsWith('pedido_novas_datas')) return null;
  // fotos novas num pedido (lote A, 18/11) tambem sao aviso para a OFICINA (veredito Fable N1)
  if (a.tipo === 'pedido_fotos') return null;
  if (a.tipo === 'nova_mensagem' && d.solicitacao_id) {
    const p = new URLSearchParams();
    if (d.oficina_id) p.set('oficina', d.oficina_id);
    if (d.pagador_id) p.set('pagador', '1');
    return `/conversa/${d.solicitacao_id}${p.toString() ? `?${p}` : ''}`;
  }
  if (d.solicitacao_id) return `/solicitacao/${d.solicitacao_id}`;
  return null;
}

function destinoOficina(tipo: string, d: Record<string, string>): string | null {
  if (!d.solicitacao_id) return null; // pecas, conta excluida etc.: sem tela no app (v2)
  // pedido novo / convite da BipFix / lembrete do admin -> formulario do orcamento
  if (AVISOS_PEDIDO_NOVO.includes(tipo)) return `/orcamento/${d.solicitacao_id}`;
  if (tipo === 'nova_mensagem') {
    const p = new URLSearchParams();
    if (d.oficina_id) p.set('oficina', d.oficina_id);
    // na conversa da oficina o pagador e o OUTRO motorista (uuid), nao "eu"
    if (d.pagador_id) p.set('pagador', d.pagador_id);
    return `/conversa/${d.solicitacao_id}${p.toString() ? `?${p}` : ''}`;
  }
  // orcamento aceito/recusado, novas datas, fotos novas, revisao decidida, expirado, avaliacao, acidente...
  return `/pedido-oficina/${d.solicitacao_id}`;
}
