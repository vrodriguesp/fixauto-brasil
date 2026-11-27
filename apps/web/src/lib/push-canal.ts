// Canal do Android (e prioridade do push) por tipo de aviso - ESPELHO de apps/mobile/lib/canal-aviso.ts
// (mudar la, mudar aqui; teste: scripts/teste-push-canal.ts). O app cria os tres canais ao entrar:
//  - pedidos: pedido novo / convite / lembrete do admin (oficina), orcamento novo ou aceito (motorista/oficina) - alta;
//  - mensagens: conversa - alta;
//  - avisos: lembretes, datas, etapas do conserto, fotos, pecas, expirado... - normal (nao interrompe).
// Antes tudo ia no canal 'avisos' com prioridade alta.
export type Canal = 'pedidos' | 'mensagens' | 'avisos';

const PEDIDOS = new Set([
  'nova_solicitacao', 'pedido_convite', 'cobranca_admin_solicitacao', 'emergencia', 'orcamento_aceito',
  'novo_orcamento', 'revisao_orcamento', 'solicitacao_aceita',
]);

export function canalDoAviso(tipo: string): Canal {
  if (tipo === 'nova_mensagem') return 'mensagens';
  if (PEDIDOS.has(tipo)) return 'pedidos';
  return 'avisos';
}

export const prioridadeDoCanal = (c: Canal): 'high' | 'default' => (c === 'avisos' ? 'default' : 'high');
