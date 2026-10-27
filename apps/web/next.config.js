const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
// Cabecalhos de seguranca (OWASP "HTTP Security Response Headers" e docs do
// Next.js "Content Security Policy"). A lista abaixo e exatamente o que o
// navegador usa: Supabase (dados, fotos, tempo real), Google Analytics e
// Clarity (so com consentimento), ViaCEP (cadastro no Brasil) e o mapa do
// Google embutido no perfil da oficina e os videos do YouTube (dominio sem
// cookies youtube-nocookie.com, carregado so quando a pessoa clica em play). 'unsafe-inline' em script-src e
// necessario para os scripts inline do Next e do consentimento; o ganho da
// CSP aqui e restringir DE ONDE vem conteudo e proibir embutir o site.
// endereco do banco vem da configuracao (producao: https://supabase.bipfix.com;
// ambiente de teste local: http://localhost:54321)
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supabase.bipfix.com';
const SUPABASE_WS = SUPABASE.replace(/^http/, 'ws');
// Google Ads: medicao de conversoes (lista do guia de CSP do Google Tag:
// developers.google.com/tag-platform/security/guides/csp)
const GOOGLE_ADS = 'https://www.googleadservices.com https://*.doubleclick.net https://www.google.com https://www.google.ee';
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"} https://www.googletagmanager.com ${GOOGLE_ADS} https://*.clarity.ms`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${SUPABASE} https://*.google-analytics.com https://*.googletagmanager.com ${GOOGLE_ADS} https://*.clarity.ms https://c.bing.com`,
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE} ${SUPABASE_WS} https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com ${GOOGLE_ADS} https://pagead2.googlesyndication.com https://*.clarity.ms https://viacep.com.br`,
  `media-src 'self' blob: ${SUPABASE}`,
  'frame-src https://www.google.com https://maps.google.com https://www.youtube-nocookie.com https://td.doubleclick.net https://www.googletagmanager.com',
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const CABECALHOS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig = {
  // Nao anunciar a tecnologia do servidor (OWASP)
  poweredByHeader: false,
  // Universal Links (iOS) / App Links (Android): ver src/app/api/app-links
  async rewrites() {
    return [
      { source: '/.well-known/apple-app-site-association', destination: '/api/app-links?f=aasa' },
      { source: '/.well-known/assetlinks.json', destination: '/api/app-links?f=assetlinks' },
    ];
  },
  async headers() {
    return [
      { source: '/(.*)', headers: CABECALHOS },
      // Imagens e icones de /public: cache de 1 semana (os nomes nao tem hash)
      { source: '/:arquivo*.(png|webp|ico|svg|jpg)', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }] },
    ];
  },
  transpilePackages: ['@fixauto/shared'],
  experimental: {
    // geoip-lite le a base de IPs do disco via __dirname - empacotado pelo
    // webpack, o caminho quebra (usado em api/visita).
    serverComponentsExternalPackages: ['geoip-lite'],
  },
  // Endereco curto impresso nos flyers (bipfix.com/et/partner). O slug real
  // e em portugues e sem o prefixo de idioma cairia na versao do Brasil.
  // 307 (nao permanente) para poder mudar o destino depois da campanha.
  async redirects() {
    // Destino = nome da pagina no idioma (PATHNAMES em src/i18n/routing.ts)
    const paginaParceiro = {
      et: '/et/hakka-partneriks',
      en: '/en/become-a-partner',
      ru: '/ru/stat-partnerom',
      it: '/it/diventa-partner',
      'pt-pt': '/pt-pt/seja-parceiro',
      'pt-br': '/pt-br/seja-parceiro',
    };
    return Object.entries(paginaParceiro).map(([lang, destino]) => ({
      source: `/${lang}/partner`,
      destination: `${destino}?utm_source=endereco_curto&utm_medium=print&utm_campaign=tallinn_founding`,
      permanent: false,
    }));
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'supabase.bipfix.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
};

module.exports = withNextIntl(nextConfig);
