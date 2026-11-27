import type { TFunction } from 'i18next';

// Rotulo do tipo do pedido na tela da OFICINA (espelho de rotuloTipoPedido em apps/web/src/lib/utils.ts):
// acidente marcado na descricao ([TIPO:colisao_simples] etc.) vale o tipo de ocorrencia; senao o tipo de
// servico (constants.tiposServico). Tipo desconhecido mostra o valor cru, nunca a chave nem erro.
export function rotuloTipoOficina(t: TFunction, tipo: string | null | undefined, descricao?: string | null): string {
  const oc = descricao?.match(/\[TIPO:(\w+)\]/)?.[1];
  if (oc) {
    const r = t(`constants.tiposOcorrencia.${oc}`, { defaultValue: '' });
    if (r) return r;
  }
  if (!tipo) return '';
  return t(`constants.tiposServico.${tipo}`, { defaultValue: tipo });
}
