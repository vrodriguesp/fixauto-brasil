import i18n from '../i18n';

// Na tela so aparece texto traduzido: nunca a mensagem crua do banco ("new row
// violates row-level security policy for table ...") nem o texto interno das
// rotas (em portugues). O detalhe tecnico vai para o log.

/** Erro cuja mensagem ja esta traduzida e pode ir para a tela. */
export class ErroUsuario extends Error {}

/** Resposta de erro das rotas do site: status + codigo estavel (erros.<codigo>). */
export class ErroApi extends Error {
  constructor(public status: number, public codigo?: string) {
    super(codigo || `HTTP ${status}`);
  }
}

export function mensagemErro(e: unknown): string {
  if (e instanceof ErroUsuario) return e.message;
  if (e instanceof ErroApi) {
    if (e.codigo && i18n.exists(`erros.${e.codigo}`)) return i18n.t(`erros.${e.codigo}`);
    if (e.status === 429) return i18n.t('erros.MUITAS_TENTATIVAS');
    if (e.status === 401) return i18n.t('erros.NAO_AUTENTICADO');
    if (e.status === 403) return i18n.t('erros.SEM_ACESSO');
    if (e.status === 400) return i18n.t('erros.DADOS_INVALIDOS');
  }
  console.error('[erro]', e);
  return i18n.t('common.erroGenerico');
}
