// Marcas internas gravadas na descricao do pedido ([TIPO:outro_causou] no
// acidente, [COMISSAO:...] no orcamento) nunca aparecem na tela. Mesma regra
// do site (cleanDescricao em apps/web/src/lib/utils.ts).
export function limparDescricao(d?: string | null): string {
  return (d || '').replace(/\[TIPO:\w+\]\s*/g, '').replace(/\[RESP:\w+\]\s*/g, '').replace(/\[COMISSAO:[^\]]+\]\s*/g, '').trim();
}

/** Pedido criado pelo "acabei de bater". */
export const ehAcidente = (d?: string | null) => /\[TIPO:\w+\]/.test(d || '');

/** Marcas do inicio da descricao, para preservar ao editar o texto. */
export const marcasDaDescricao = (d?: string | null) => ((d || '').match(/^(\s*\[[A-Z]+:[^\]]+\]\s*)+/) || [''])[0];
