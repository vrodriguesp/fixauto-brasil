const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
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
