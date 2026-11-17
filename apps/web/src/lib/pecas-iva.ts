// Lote 2 de pecas (17/11): IVA da oferta. O preco que o fornecedor digita e o FINAL (com IVA,
// o que a compradora paga). "Sem IVA" e so derivado para mostrar (com "≈"), nunca gravado.
// O modo vai na oferta (retrato do perfil na hora): uma desmontadora registrada vende peca nova
// com IVA e usada no regime de margem (v3 P-22). Regras: Fable_auditoria_mapa_lote2.md sec. 6.

export type IvaModo = 'registrado' | 'nao_registrado' | 'margem';

// aliquota sugerida ao marcar "registrado no IVA" (editavel). EE 24 % desde 01/07/2025.
export const IVA_PADRAO_PAIS: Record<string, number> = { EE: 24, IT: 22, PT: 23 };

/** valor sem IVA a partir do total com IVA: 248,00 a 24 % -> 200,00; 10,00 -> 8,06 */
export function semIva(total: number, pct: number): number {
  return Math.round((Number(total) / (1 + Number(pct) / 100) + Number.EPSILON) * 100) / 100;
}

/** total da oferta: preco x quantidade (a ofertada quando ha), 2 casas */
export function totalDaOferta(preco: number, quantidade: number): number {
  return Math.round((Number(preco) * Number(quantidade) + Number.EPSILON) * 100) / 100;
}

/**
 * Retrato fiscal gravado na oferta: perfil registrado -> 'registrado' + aliquota; nao registrado ->
 * 'nao_registrado'; peca usada no regime de margem (so com o regime ligado no perfil) -> 'margem';
 * perfil sem IVA preenchido -> nada (oferta como hoje).
 */
export function ivaDaOferta(perfil: { iva_registrado?: boolean | null; iva_pct?: number | null; regime_margem_usadas?: boolean | null } | null | undefined, usada = false): { iva_modo: IvaModo | null; iva_pct: number | null } {
  if (usada && perfil?.regime_margem_usadas && perfil.iva_registrado) return { iva_modo: 'margem', iva_pct: null };
  if (perfil?.iva_registrado === true && perfil.iva_pct != null) return { iva_modo: 'registrado', iva_pct: Number(perfil.iva_pct) };
  if (perfil?.iva_registrado === false) return { iva_modo: 'nao_registrado', iva_pct: null };
  return { iva_modo: null, iva_pct: null };
}
