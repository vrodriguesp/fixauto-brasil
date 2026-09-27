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

// Mesmas traducoes de i18n/locales/*.json (constants.tiposServico), usadas
// aqui pra montar o corpo da notificacao no idioma da OFICINA destinataria -
// t() do proprio app so reflete o idioma de quem esta criando a
// solicitacao (o cliente), nao de quem vai receber a notificacao.
const tiposServico: Record<NotifLocale, Record<string, string>> = {
  pt: { colisao: 'Colisão', funilaria: 'Funilaria e Pintura', revisao: 'Revisões', mecanica: 'Mecânica', eletrica: 'Elétrico', pneu: 'Pneu', outro: 'Outro' },
  en: { colisao: 'Collision', funilaria: 'Bodywork & Paint', revisao: 'Maintenance', mecanica: 'Mechanical', eletrica: 'Electrical', pneu: 'Tires', outro: 'Other' },
  et: { colisao: 'Kokkupõrge', funilaria: 'Kere- ja värvitööd', revisao: 'Hooldus', mecanica: 'Mehaanika', eletrica: 'Elektroonika', pneu: 'Rehvid', outro: 'Muu' },
  it: { colisao: 'Collisione', funilaria: 'Carrozzeria e Verniciatura', revisao: 'Tagliando', mecanica: 'Meccanica', eletrica: 'Elettrauto', pneu: 'Pneumatici', outro: 'Altro' },
};

export function tipoServicoLabel(locale: string | null | undefined, tipo: string): string {
  return tiposServico[resolveLocale(locale)][tipo] || tipo;
}
