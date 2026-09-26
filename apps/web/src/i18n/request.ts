import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

// Mensagens divididas por area (messages/{locale}.json = base/comum,
// messages/{locale}.{area}.json = por secao do site) em vez de um unico
// arquivo gigante por idioma - permite trabalhar em areas diferentes do
// site em paralelo sem duas edicoes concorrentes colidirem no mesmo
// arquivo. Cada modulo vira namespaces de nivel superior na mesma arvore
// de mensagens (t('cliente.dashboard...'), etc via useTranslations('cliente')).
const AREAS = ['cliente', 'oficina', 'loja', 'auth'] as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const base = (await import(`../../messages/${locale}.json`)).default;
  const areaModules = await Promise.all(
    AREAS.map((area) => import(`../../messages/${locale}.${area}.json`).then((m) => m.default))
  );

  const messages = Object.assign({}, base, ...areaModules);

  return { locale, messages };
});
