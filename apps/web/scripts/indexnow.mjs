// Avisa os buscadores que usam IndexNow (Bing, Yandex, Seznam, Naver... - o
// Bing repassa ao DuckDuckGo e ao Yahoo) sobre todas as URLs do sitemap, para
// reindexarem na hora em vez de esperar o proximo rastreio.
// Rodar depois de cada deploy: `npm run indexnow` (dentro de apps/web).
// A chave e publica por definicao do protocolo: o arquivo public/<chave>.txt
// prova ao buscador que o dono do site autorizou o envio.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://bipfix.com';
const here = path.dirname(fileURLToPath(import.meta.url));
const keyFile = fs.readdirSync(path.join(here, '..', 'public')).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) throw new Error('Arquivo de chave IndexNow nao encontrado em public/');
const key = keyFile.replace('.txt', '');

const sitemap = await (await fetch(`${SITE}/sitemap.xml`)).text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
if (!urls.length) throw new Error('Sitemap sem URLs');

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation: `${SITE}/${keyFile}`, urlList: urls }),
});
// 200 = recebido; 202 = recebido, chave ainda em validacao (normal na 1a vez)
console.log(`IndexNow: ${urls.length} URLs enviadas -> HTTP ${res.status} ${await res.text()}`);
if (res.status >= 400) process.exit(1);
