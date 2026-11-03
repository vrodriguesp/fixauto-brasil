// Tempo de resposta de uma oficina a um pedido, em ms. Conta a partir de
// quando a oficina passou a poder ver o pedido: um pedido aberto antes do
// cadastro dela conta do cadastro, nao da criacao do pedido - senao toda
// oficina nova comeca "lenta" so por orcar pedidos antigos (dono, 03/11).
export function tempoRespostaMs(orcamentoEm: string, pedidoEm: string, oficinaDesde?: string | null): number {
  const inicio = Math.max(Date.parse(pedidoEm), oficinaDesde ? Date.parse(oficinaDesde) : 0);
  return Date.parse(orcamentoEm) - inicio;
}
