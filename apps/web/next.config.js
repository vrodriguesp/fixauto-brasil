/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@fixauto/shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'supabase.bipfix.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
};

module.exports = nextConfig;
