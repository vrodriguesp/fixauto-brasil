// Serve a versao web do app (expo export) em :8090 e repassa /api/* para o
// site de producao (mesma origem -> sem bloqueio de CORS no navegador).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(process.env.APP_WEB || path.join(path.dirname(fileURLToPath(import.meta.url)), 'app-web'));
// SEMPRE o site LOCAL de teste (07/11: o padrao era producao e, numa copia sem a
// alteracao local, testes do app mandaram consultas para o bipfix.com). Producao so
// com PERMITIR_PRODUCAO=1 de proposito.
const SITE = process.env.SITE || 'http://localhost:3100';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SITE) && process.env.PERMITIR_PRODUCAO !== '1') {
  console.error(`servir-app-web: SITE=${SITE} nao e local - parado (use PERMITIR_PRODUCAO=1 se for de proposito)`);
  process.exit(1);
}
const TIPOS = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const corpo = await new Promise((ok) => { const b = []; req.on('data', (c) => b.push(c)); req.on('end', () => ok(Buffer.concat(b))); });
    const h = { ...req.headers };
    delete h.host; delete h.origin; delete h.referer; delete h['content-length'];
    const r = await fetch(SITE + url.pathname + url.search, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : corpo });
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let arq = path.join(RAIZ, decodeURIComponent(url.pathname));
  if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) {
    const html = path.join(RAIZ, url.pathname.replace(/\/$/, '') + '.html');
    arq = fs.existsSync(html) ? html : path.join(RAIZ, 'index.html');
  }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
  fs.createReadStream(arq).pipe(res);
}).listen(8090, () => console.log('app web em http://localhost:8090'));
