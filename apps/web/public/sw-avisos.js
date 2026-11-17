// BipFix - avisos no navegador (Web Push, lote 3c de pecas). Escopo estreito (/sw-avisos/): este
// service worker NAO controla as paginas, nao intercepta requisicoes e nao guarda cache - so mostra o
// aviso e, no clique, abre o caminho RELATIVO que veio no aviso (nunca um endereco de fora).
self.addEventListener('push', function (event) {
  var dados = {};
  try { dados = event.data ? event.data.json() : {}; } catch (e) { dados = {}; }
  var titulo = String(dados.titulo || 'BipFix').slice(0, 120);
  var opcoes = {
    body: String(dados.mensagem || '').slice(0, 300),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { link: typeof dados.link === 'string' ? dados.link : '/' },
  };
  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var link = event.notification && event.notification.data ? event.notification.data.link : null;
  // so caminho relativo do proprio site ("/..."), nunca "//outro-site" nem "https://..."
  if (typeof link !== 'string' || link.charAt(0) !== '/' || link.charAt(1) === '/' || link.charAt(1) === '\\') return;
  event.waitUntil(self.clients.openWindow(link));
});
