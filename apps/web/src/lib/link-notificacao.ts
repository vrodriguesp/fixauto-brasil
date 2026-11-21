import type { Notificacao } from '@fixauto/shared';

// Pra onde leva cada aviso, pelo tipo e pelo papel de quem le. Uma regra so
// para o sino, o painel e a pagina de avisos (antes eram duas diferentes e o
// sino mandava "nova mensagem" e o pagador do acidente para paginas erradas -
// auditoria Fable 08/10, M9).
export function linkDaNotificacao(n: Pick<Notificacao, 'tipo' | 'dados'>, tipoUsuario?: string | null): string | null {
  const d = (n.dados || {}) as Record<string, string | undefined>;
  if (n.tipo === 'nota_interna_veiculo') return d.agenda_id ? `/oficina/hoje?ev=${d.agenda_id}` : '/oficina/hoje';
  if (tipoUsuario === 'oficina') {
    // "Novidades" (migracao 084): pagina Melhorias, que tambem leva ao perfil (recepcao/almoco)
    if (n.tipo === 'novidades') return d.link && d.link.startsWith('/oficina/') ? d.link : '/oficina/melhorias';
    if (n.tipo === 'nova_mensagem' && d.solicitacao_id) return `/oficina/mensagens/${d.solicitacao_id}`;
    if (d.solicitacao_id) return `/oficina/pedidos/${d.solicitacao_id}`;
    // portal de pecas (16/11): o aviso traz a tela certa (aba Vender, conversa...)
    if (d.cotacao_id) return d.link && d.link.startsWith('/oficina/pecas') ? d.link : '/oficina/pecas';
    // aviso de acidente antigo, sem o id do pedido (antes de 21/11): a pagina do
    // acidente manda a oficina nao escolhida para o pedido dela (B1)
    if (d.emergencia_id) return `/emergencia/acidente/${d.emergencia_id}`;
    return null;
  }
  if (tipoUsuario === 'loja_pecas') return d.cotacao_id ? (d.link && d.link.startsWith('/loja/') ? d.link : '/loja/cotacoes') : null;
  // cliente
  if (n.tipo === 'acidente' && d.emergencia_id) return `/emergencia/acidente/${d.emergencia_id}`;
  // quem paga o reparo do acidente nao ve o pedido do outro, so a conversa dele
  if (d.pagador_id && d.solicitacao_id && d.oficina_id) return `/cliente/mensagens/${d.solicitacao_id}?oficina=${d.oficina_id}&pagador=1`;
  if (n.tipo === 'nova_mensagem') return d.solicitacao_id ? `/cliente/mensagens/${d.solicitacao_id}${d.oficina_id ? `?oficina=${d.oficina_id}` : ''}` : '/cliente/mensagens';
  if (d.solicitacao_id) return `/cliente/orcamentos/${d.solicitacao_id}`;
  if (d.emergencia_id) return `/emergencia/acidente/${d.emergencia_id}`;
  return null;
}
