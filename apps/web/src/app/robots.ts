import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/cliente/', '/oficina/', '/api/', '/definir-senha'],
      },
    ],
    sitemap: 'https://fixauto-brasil.vercel.app/sitemap.xml',
  };
}
