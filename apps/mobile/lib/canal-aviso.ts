// Canal do Android (e prioridade do push) por tipo de aviso - ESPELHO de apps/web/src/lib/push-canal.ts
// (mudar la, mudar aqui; teste: scripts/teste-oficina.ts). Boas praticas das lojas: o que pede acao
// imediata (pedido novo para a oficina, orcamento novo para o motorista, mensagem) chega como aviso
// "heads-up" com som; lembretes, datas, etapas do conserto e pecas ficam no canal normal, sem interromper.
// A pessoa pode baixar/silenciar cada canal nas configuracoes do Android sem perder os outros.
export type Canal = 'pedidos' | 'mensagens' | 'avisos';
export const CANAIS: Canal[] = ['pedidos', 'mensagens', 'avisos'];

const PEDIDOS = new Set([
  // oficina
  'nova_solicitacao', 'pedido_convite', 'cobranca_admin_solicitacao', 'emergencia', 'orcamento_aceito',
  // motorista
  'novo_orcamento', 'revisao_orcamento', 'solicitacao_aceita',
]);

export function canalDoAviso(tipo: string): Canal {
  if (tipo === 'nova_mensagem') return 'mensagens';
  if (PEDIDOS.has(tipo)) return 'pedidos';
  return 'avisos';
}

/** prioridade do push da Expo (FCM: high = acorda o aparelho; default = pode esperar o proximo ciclo) */
export const prioridadeDoCanal = (c: Canal): 'high' | 'default' => (c === 'avisos' ? 'default' : 'high');
