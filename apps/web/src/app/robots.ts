import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/cliente/', '/oficina/', '/loja/', '/admin/', '/api/', '/definir-senha', '/reset-password', '/emergencia/acidente/'],
      },
    ],
    sitemap: 'https://bipfix.com/sitemap.xml',
  };
}
