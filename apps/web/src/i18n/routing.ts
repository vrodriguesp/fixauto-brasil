import { defineRouting } from 'next-intl/routing';

// pt = portugues (padrao, sem prefixo na URL - mantem compatibilidade com
// links/SEO ja indexados em bipfix.com/cliente/... etc), en = ingles
// (fallback universal pra qualquer pais nao coberto pelos outros 3), et =
// estoniano (piloto em Tallinn), it = italiano.
export const routing = defineRouting({
  locales: ['pt', 'en', 'et', 'it'],
  defaultLocale: 'pt',
  localePrefix: 'as-needed',
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];
