// Robos que executam JavaScript e por isso chegam as rotas de contagem como se fossem pessoas.
// So o funil usa isto (26/11); nao serve para bloquear nada - quem e robo apenas nao conta.
// 26/11: ao trocar as URLs finais dos anuncios, as previas do Google Ads (Google-Ads-Creatives-
// Assistant, AdsBot-Google, UA so "Google") e do Facebook (facebookexternalhit) abriram o pedido
// dezenas de vezes e contaram abriu/servico_prefill/detalhe no funil. Lista curta e obvia: em caso
// de duvida conta (uma pessoa a menos no funil e pior que um robo a mais). /api/visita tem a sua.
// "bot" so como palavra/sufixo de robo (Googlebot/2.1, bingbot/2.0, "bot;", "bot)"): o telefone CUBOT KINGKONG
// e uma pessoa (revisao Fable 26/11)
const ROBO = /bot|bot[\/;)]|bot\.html|crawl|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|google-ads|adsbot|mediapartners|curl\/|wget\/|python|go-http|java\/|playwright|puppeteer|selenium|phantom/i;
const SO_GOOGLE = /^google$/i; // previa do Google Ads: User-Agent exatamente "Google"

export function ehRobo(userAgent: string | null | undefined): boolean {
  const ua = (userAgent || '').trim();
  if (!ua) return true; // sem User-Agent nao e navegador de pessoa
  return SO_GOOGLE.test(ua) || ROBO.test(ua);
}
