// 114: motivos da recusa do orcamento (1 toque, opcional) - orcamentos.recusado_motivo
export const MOTIVOS_RECUSA = ['preco', 'data', 'distancia', 'resolvido', 'outro'] as const;
export type MotivoRecusa = (typeof MOTIVOS_RECUSA)[number];
