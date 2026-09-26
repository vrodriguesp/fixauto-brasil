import { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';

const PRIVATE_PATHS = ['cliente', 'oficina', 'loja', 'admin', 'api', 'definir-senha', 'reset-password', 'emergencia/acidente'];

export default function robots(): MetadataRoute.Robots {
  // "pt" (locale padrao) nao tem prefixo de URL, en/et/it tem - o disallow
  // precisa cobrir os dois formatos (ex: "/cliente/" e "/en/cliente/") ou os
  // paineis privados das rotas com prefixo ficariam indexaveis.
  const disallow = PRIVATE_PATHS.flatMap((path) => [
    `/${path}/`,
    ...routing.locales.filter((l) => l !== routing.defaultLocale).map((l) => `/${l}/${path}/`),
  ]);

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
    ],
    sitemap: 'https://bipfix.com/sitemap.xml',
  };
}
