import type { TFunction } from 'i18next';

// Rotulo do tipo de pedido para o MOTORISTA (o app e so do cliente). Dono 18/11:
// 'outro' = "Muu / ei tea" (constants.tiposServicoMotorista); os demais = constants.tiposServico.
// Tipo que esta versao nao conhece mostra o valor cru (nunca a chave nem erro).
export function rotuloTipoMotorista(t: TFunction, tipo: string | null | undefined): string {
  if (!tipo) return '';
  const base = t(`constants.tiposServico.${tipo}`, { defaultValue: tipo });
  return t(`constants.tiposServicoMotorista.${tipo}`, { defaultValue: base });
}
