import type { MetadataRoute } from 'next';

// Manifesto do app web ("adicionar a tela inicial" com nome e icone certos)
// enquanto o app nativo nao esta nas lojas.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BipFix',
    short_name: 'BipFix',
    description: 'Car repair quotes from local repair shops - Tallinn, Estonia.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
