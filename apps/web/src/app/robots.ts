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
    sitemap: 'https://bipfix.com/sitemap.xml',
  };
}
