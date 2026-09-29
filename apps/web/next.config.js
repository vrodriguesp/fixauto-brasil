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
    return [
      {
        source: '/:lang(et|en|ru|it|pt-pt)/partner',
        destination: '/:lang/seja-parceiro?utm_source=endereco_curto&utm_medium=print&utm_campaign=tallinn_founding',
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'supabase.bipfix.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
};

module.exports = withNextIntl(nextConfig);
