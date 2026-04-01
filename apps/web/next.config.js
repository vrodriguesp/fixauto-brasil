/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@fixauto/shared'],
  images: {
    domains: ['localhost'],
  },
};

module.exports = nextConfig;
