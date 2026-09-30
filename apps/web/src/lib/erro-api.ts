// Texto de erro de uma chamada de API no idioma da tela: pelo `codigo`
// devolvido pela rota (erros.<codigo>) ou, sem codigo, pelo status HTTP.
// As rotas respondem em portugues para o log; a pessoa ve o texto traduzido.
type Tradutor = { (chave: string): string; has: (chave: string) => boolean };

export function textoErroApi(t: Tradutor, status: number, corpo?: { codigo?: string } | null): string {
  if (corpo?.codigo && t.has(corpo.codigo)) return t(corpo.codigo);
  if (status === 401) return t('NAO_AUTENTICADO');
  if (status === 403) return t('SEM_ACESSO');
  if (status === 429) return t('MUITAS_TENTATIVAS');
  if (status === 400) return t('DADOS_INVALIDOS');
  return t('GENERICO');
}
