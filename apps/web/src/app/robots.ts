import { MetadataRoute } from 'next';
import { LOCALE_PREFIX } from '@/i18n/routing';

const PRIVATE_PATHS = ['cliente', 'oficina', 'loja', 'admin', 'api', 'definir-senha', 'reset-password', 'emergencia/acidente'];

export default function robots(): MetadataRoute.Robots {
  // Cada idioma tem o seu prefixo publico ('' para o Brasil, /pt-pt, /en,
  // /et, /it) - o disallow cobre todos, senao os paineis privados das rotas
  // com prefixo ficariam rastreaveis. Usa o prefixo publico (/pt-pt), nao o
  // nome interno do idioma (pt-PT).
  const disallow = PRIVATE_PATHS.flatMap((path) =>
    Object.values(LOCALE_PREFIX).map((prefix) => `${prefix}/${path}/`)
  );

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
    sitemap: 'https://bipfix.com/sitemap.xml',
    host: 'https://bipfix.com',
  };
}
