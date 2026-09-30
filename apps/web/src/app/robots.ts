import { MetadataRoute } from 'next';
import { routing, hrefNoIdioma } from '@/i18n/routing';

// Areas privadas por idioma, pelo endereco PUBLICO de cada uma (o acidente,
// por exemplo, e /et/avarii/teade/ em estoniano - as regras do robots.txt sao
// literais, entao o nome interno nao serviria).
const PRIVADAS_POR_IDIOMA = ['/cliente', '/oficina', '/loja', '/definir-senha', '/reset-password'];
const acidente = (l: string) => hrefNoIdioma(l, '/emergencia/acidente/X').replace(/\/X$/, '');

export default function robots(): MetadataRoute.Robots {
  const disallow = [
    // Sem prefixo de idioma: painel e API
    '/admin/',
    '/api/',
    ...PRIVADAS_POR_IDIOMA.flatMap((p) => routing.locales.map((l) => `${hrefNoIdioma(l, p)}/`)),
    ...routing.locales.map((l) => `${acidente(l)}/`),
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
      // Buscadores e crawlers de IA (indice de busca, resposta em tempo real e
      // treino) - permitidos explicitamente: o objetivo do site e ser
      // encontrado em busca organica (Google, Bing, DuckDuckGo, Yandex...) e
      // citado em respostas de assistentes de IA.
      {
        userAgent: [
          'Googlebot',
          'Bingbot',
          'DuckDuckBot',
          'YandexBot',
          'Applebot',
          'GPTBot',
          'ChatGPT-User',
          'OAI-SearchBot',
          'ClaudeBot',
          'Claude-User',
          'Claude-SearchBot',
          'anthropic-ai',
          'PerplexityBot',
          'Perplexity-User',
          'Google-Extended',
          'Applebot-Extended',
          'Meta-ExternalAgent',
          'MistralAI-User',
          'DuckAssistBot',
          'CCBot',
          'Bytespider',
          'Amazonbot',
        ],
        allow: '/',
        disallow,
      },
    ],
    // Sem a diretiva Host: o Google ignora e o Yandex deixou de usar em 2018
    sitemap: 'https://bipfix.com/sitemap.xml',
  };
}
