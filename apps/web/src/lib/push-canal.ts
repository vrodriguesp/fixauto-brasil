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

// A partir de que versao o app criou os canais 'pedidos'/'mensagens' e trata o badge (migracao 118). Um push com
// channelId que o aparelho nao tem NAO aparece (docs da Expo): token sem versao (app 1.0.0) ou mais antigo
// recebe como sempre - canal 'avisos', prioridade alta, sem badge.
export const VERSAO_CANAIS = '1.1.0';
export function suportaCanaisNovos(versaoApp: string | null | undefined): boolean {
  if (!versaoApp) return false;
  const a = String(versaoApp).split('.').map((x) => parseInt(x, 10) || 0);
  const b = VERSAO_CANAIS.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; }
  return true;
}

/** campos do push por token: canais/prioridade/badge novos so para quem os tem; o resto igual a antes */
export function entregaDoPush(tipo: string, versaoApp: string | null | undefined, naoLidos: number): { channelId: Canal; priority: 'high' | 'default'; badge?: number } {
  if (!suportaCanaisNovos(versaoApp)) return { channelId: 'avisos', priority: 'high' };
  const canal = canalDoAviso(tipo);
  return { channelId: canal, priority: prioridadeDoCanal(canal), badge: Math.max(1, naoLidos || 0) };
}
