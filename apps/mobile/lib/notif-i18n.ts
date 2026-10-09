// Espelha src/lib/notif-i18n.ts do apps/web (so a parte usada pelo app:
// avisar a oficina de uma nova solicitacao criada pelo cliente). Duplicado
// aqui em vez de compartilhado via @fixauto/shared porque e um unico
// dicionario pequeno e o pacote shared hoje so tem types/constants puros.
export type NotifLocale = 'pt' | 'pt-PT' | 'en' | 'et' | 'it' | 'ru';

function resolveLocale(locale: string | null | undefined): NotifLocale {
  return locale === 'pt-PT' || locale === 'en' || locale === 'et' || locale === 'it' || locale === 'ru' ? locale : 'pt';
}

const novaSolicitacaoTitulo: Record<NotifLocale, string> = {
  pt: 'Nova solicitação!',
  'pt-PT': 'Novo pedido!',
  en: 'New request!',
  et: 'Uus päring!',
  it: 'Nuova richiesta!',
  ru: 'Новая заявка!',
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
  'pt-PT': { colisao: 'Colisão', funilaria: 'Bate-chapa e Pintura', revisao: 'Manutenção', mecanica: 'Mecânica', eletrica: 'Eletricidade', pneu: 'Pneus', outro: 'Outro' },
  en: { colisao: 'Collision', funilaria: 'Bodywork & Paint', revisao: 'Maintenance', mecanica: 'Mechanical', eletrica: 'Electrical', pneu: 'Tyres', outro: 'Other' },
  et: { colisao: 'Kokkupõrge', funilaria: 'Kere- ja värvitööd', revisao: 'Hooldus', mecanica: 'Mehaanika', eletrica: 'Elektritööd', pneu: 'Rehvid', outro: 'Muu' },
  it: { colisao: 'Collisione', funilaria: 'Carrozzeria e Verniciatura', revisao: 'Tagliando', mecanica: 'Meccanica', eletrica: 'Elettrauto', pneu: 'Pneumatici', outro: 'Altro' },
  ru: { colisao: 'ДТП', funilaria: 'Кузовной ремонт и покраска', revisao: 'Техобслуживание', mecanica: 'Механика', eletrica: 'Электрика', pneu: 'Шины', outro: 'Другое' },
};

export function tipoServicoLabel(locale: string | null | undefined, tipo: string): string {
  return tiposServico[resolveLocale(locale)][tipo] || tipo;
}
