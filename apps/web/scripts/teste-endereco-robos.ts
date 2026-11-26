// Sem banco nem servidor (26/11): nomes russos dos lugares da Estonia -> estoniano/latim nas sugestoes
// de endereco (lib/endereco-sugestoes.ts), filtro de pontos de interesse e o filtro de robos do funil
// (lib/robo.ts).
//
//   npx tsx scripts/teste-endereco-robos.ts
import { paraLatimEE, latimEstonia, ehPoiGeoapify, ehPoiPhoton, CIRILICO } from '../src/lib/endereco-sugestoes';
import { ehRobo } from '../src/lib/robo';

let falhas = 0, oks = 0;
const ok = (nome: string, cond: boolean, extra = '') => { if (cond) oks++; else falhas++; console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}${extra ? ' - ' + extra : ''}`); };
const igual = (nome: string, got: string, esperado: string) => ok(nome, got === esperado, got === esperado ? '' : `veio "${got}", esperado "${esperado}"`);

// nomes conhecidos: grafia estoniana exata, com maiuscula/minuscula da pessoa ignorada
igual('Ласнамяэ -> Lasnamäe', paraLatimEE('Ласнамяэ'), 'Lasnamäe');
igual('ласнамяэ (minusculas) -> Lasnamäe', paraLatimEE('ласнамяэ'), 'Lasnamäe');
igual('ЛАСНАМЯЭ (maiusculas) -> Lasnamäe', paraLatimEE('ЛАСНАМЯЭ'), 'Lasnamäe');
igual('Мустамяэ -> Mustamäe', paraLatimEE('Мустамяэ'), 'Mustamäe');
igual('Нымме -> Nõmme', paraLatimEE('Нымме'), 'Nõmme');
igual('Ыйсмяэ -> Õismäe', paraLatimEE('Ыйсмяэ'), 'Õismäe');
igual('Пыхья-Таллинн -> Põhja-Tallinn', paraLatimEE('Пыхья-Таллинн'), 'Põhja-Tallinn');
igual('Кристийне, Таллинн -> Kristiine, Tallinn', paraLatimEE('Кристийне, Таллинн'), 'Kristiine, Tallinn');
igual('Пярну -> Pärnu', paraLatimEE('Пярну'), 'Pärnu');
igual('Кохтла-Ярве -> Kohtla-Järve', paraLatimEE('Кохтла-Ярве'), 'Kohtla-Järve');
// nome conhecido + rua/numero: o resto do texto vai letra a letra (a busca iguala a ~ ä)
igual('Нарва мнт 5 -> Narva mnt 5', paraLatimEE('Нарва мнт 5'), 'Narva mnt 5');
igual('Ласнамяэ, Паэ 10 -> Lasnamäe, Pae 10', paraLatimEE('Ласнамяэ, Паэ 10'), 'Lasnamäe, Pae 10');
// desconhecido: letra a letra no jeito estoniano (comportamento anterior mantido)
igual('Кейла (nao mapeado? mapeado) -> Keila', paraLatimEE('Кейла'), 'Keila');
igual('Ярвекюла (desconhecido) -> Jarvekula', paraLatimEE('Ярвекюла'), 'Jarvekula');
igual('latimEstonia: Йыхви -> Johvi', latimEstonia('Йыхви'), 'Johvi');
// latim e misto passam intactos
igual('Lasnamäe fica igual', paraLatimEE('Lasnamäe'), 'Lasnamäe');
igual('Tartu mnt 50 fica igual', paraLatimEE('Tartu mnt 50'), 'Tartu mnt 50');
ok('CIRILICO reconhece cirilico e nao latim', CIRILICO.test('Ласнамяэ') && !CIRILICO.test('Lasnamäe'));
ok('resultado nunca tem cirilico', !['Ласнамяэ', 'Нарвское шоссе 5', 'Таллинн, Ыйсмяэ тее 1', 'щёлково'].some((q) => CIRILICO.test(paraLatimEE(q))));

// pontos de interesse fora; bairro, rua, cidade, casa ficam
ok('Geoapify: amenity e POI', ehPoiGeoapify('amenity'));
ok('Geoapify: suburb/street/city/building/postcode nao sao POI', !['suburb', 'street', 'city', 'building', 'postcode', 'district', 'locality', undefined].some(ehPoiGeoapify));
ok('Photon: amenity/shop/tourism sao POI', ['amenity', 'shop', 'tourism', 'leisure'].every(ehPoiPhoton));
ok('Photon: place/highway/boundary/building nao sao POI', !['place', 'highway', 'boundary', 'building', undefined].some(ehPoiPhoton));

// robos do funil
const ROBOS = [
  'Google',
  'Google-Ads-Creatives-Assistant',
  'AdsBot-Google (+http://www.google.com/adsbot.html)',
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
  'curl/8.18.0',
  'python-requests/2.32',
  '',
];
const PESSOAS = [
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/158.0.0.0 Mobile Safari/537.36', // WebView do Facebook
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-A127F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/22.0 Chrome/111.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Linux; arm_64; Android 16; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 YaBrowser/25.8.0.0 Mobile Safari/537.36',
  'node', 'undici', // scripts e2e do projeto chamam /api/funil pelo Node: continuam contando
];
for (const ua of ROBOS) ok(`robo: ${ua.slice(0, 50) || '(vazio)'}`, ehRobo(ua));
for (const ua of PESSOAS) ok(`pessoa: ${ua.slice(0, 50)}`, !ehRobo(ua));

console.log(`\n${oks} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
