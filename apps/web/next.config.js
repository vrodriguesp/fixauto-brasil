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
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'supabase.bipfix.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
};

module.exports = withNextIntl(nextConfig);
