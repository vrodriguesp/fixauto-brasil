// Espelha src/lib/notif-i18n.ts do apps/web (so a parte usada pelo app:
// avisar a oficina de uma nova solicitacao criada pelo cliente). Duplicado
// aqui em vez de compartilhado via @fixauto/shared porque e um unico
// dicionario pequeno e o pacote shared hoje so tem types/constants puros.
export type NotifLocale = 'pt' | 'en' | 'et' | 'it';

function resolveLocale(locale: string | null | undefined): NotifLocale {
  return locale === 'en' || locale === 'et' || locale === 'it' ? locale : 'pt';
}

const novaSolicitacaoTitulo: Record<NotifLocale, string> = {
  pt: 'Nova solicitação!',
  en: 'New request!',
  et: 'Uus päring!',
  it: 'Nuova richiesta!',
};

export function notifNovaSolicitacaoTitulo(locale: string | null | undefined) {
  return novaSolicitacaoTitulo[resolveLocale(locale)];
}
