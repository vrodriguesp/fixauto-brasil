/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@fixauto/shared'],
  images: {
    domains: ['localhost', 'bzlrpvlbeqckmunrldnp.supabase.co'],
  },
};

module.exports = nextConfig;
