// Fotos adicionadas ao pedido DEPOIS de um orcamento (lote A, 18/11): comparacao feita na tela com
// as datas que ja vem na consulta; nada gravado. Revisar o orcamento (revisado_em) zera a faixa.
type FotoMin = { origem?: string | null; created_at?: string | null };
type OrcMin = { created_at?: string | null; revisado_em?: string | null };

export function fotosDepoisDoOrcamento<F extends FotoMin>(fotos: F[] | null | undefined, orc: OrcMin | null | undefined): F[] {
  if (!orc || !fotos?.length) return [];
  const marco = Math.max(Date.parse(orc.created_at || '') || 0, Date.parse(orc.revisado_em || '') || 0);
  if (!marco) return [];
  return fotos.filter((f) => f.origem === 'adicionada' && (Date.parse(f.created_at || '') || 0) > marco);
}
