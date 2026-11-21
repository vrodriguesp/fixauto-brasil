import { NextRequest, NextResponse } from 'next/server';
import { limitarPorIp } from '@/lib/rate-limit';

// Sugestoes de endereco enquanto a pessoa digita ("Bicoc" -> "Bicocca,
// Milano"). Photon (komoot, dados OpenStreetMap), feito para autocompletar -
// o Nominatim (usado em /api/geocode) PROIBE uso em autocompletar na politica
// dele. Photon publico: uso justo, sem garantia -> cache, limite por IP e
// minimo de 3 letras; o campo continua aceitando texto livre se falhar.
const PHOTON = 'https://photon.komoot.io/api/';
const USER_AGENT = 'BipFix/1.0 (+https://bipfix.com; support@bipfix.com)';
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { corpo: unknown; em: number }>();
// Sem a localizacao da pessoa, o Geoapify ia pelo mundo todo ("Lasnamäe" trazia La Scala, Italia).
// Puxar para a capital do mercado deixou as ruas de Tallinn em 1o (teste 12/11: Narva mnt 5,
// Kadaka tee 72a, Tartu mnt 67); filter/bias por pais piorava (Narva mnt 5 saia de Voka/Johvi).
// O app nao manda o pais: Estonia.
const CAPITAL: Record<string, [number, number]> = { EE: [24.745, 59.437], IT: [12.496, 41.903], PT: [-9.139, 38.722], BR: [-46.633, -23.55] };
// Pais, regiao e condado (na Estonia, o maakond) sao largos demais para achar oficina perto:
// pedido 100154 (20/11) escolheu "Eesti" e ficou com o centro do pais. Vald, cidade, linnaosa e rua ficam.
const LARGO_DEMAIS = new Set(['country', 'state', 'county']);
// Mercado da Estonia (21/11): so lugares da Estonia. "Таллинн" em RU trazia Tallinn e depois 5 lugares
// da Russia (Sosnovy Bor, Sao Petersburgo, Moscou); as oficinas sao todas na Estonia. Geoapify com
// filter=countrycode:ee (o vies da capital continua: Narva mnt 5 fica em Tallinn); Photon com o
// retangulo do pais + descarte do que nao for EE. Outros mercados: como antes (o pais so ordena).
const SO_DO_PAIS = new Set(['EE']);
const BBOX: Record<string, string> = { EE: '21.5,57.4,28.3,59.9' };
const MAX = 6;
// O Photon nao conhece os nomes russos dos lugares da Estonia ("Таллинн", "Ласнамяэ" so acham a
// Russia): no mercado EE o texto em cirilico vira latim no jeito estoniano (я depois de consoante = ä,
// que o Photon iguala a "a"; Ярве -> Jarve ~ Järve; Йыхви -> Johvi ~ Jõhvi; Кейла -> Keila).
const CIRILICO = /[а-яё]/i;
const LATIM: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'jo', ж: 'z', з: 'z', и: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 's', щ: 's', ъ: '', ы: 'o', ь: '', э: 'e',
};
const VOGAL = /[аеёиоуыэюяaeiou]/i;
function latimEstonia(texto: string): string {
  let out = '';
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i], min = ch.toLowerCase(), ant = i > 0 ? texto[i - 1].toLowerCase() : '';
    const inicio = !ant || !/[а-яёa-z]/i.test(ant) || VOGAL.test(ant) || ant === 'ь' || ant === 'ъ';
    let l: string;
    if (min === 'я') l = inicio ? 'ja' : 'a';
    else if (min === 'ю') l = inicio ? 'ju' : 'u';
    else if (min === 'й') l = ant && VOGAL.test(ant) ? 'i' : 'j';
    else if (min in LATIM) l = LATIM[min];
    else { out += ch; continue; }
    out += ch !== min && l ? l[0].toUpperCase() + l.slice(1) : l;
  }
  return out;
}

export interface SugestaoEndereco {
  rotulo: string;
  endereco: string;
  /** rua sem numero e numero separado (endereco estruturado da oficina) */
  rua: string;
  numero: string;
  cidade: string;
  estado: string;
  cep: string;
  paisCodigo: string;
  latitude: number;
  longitude: number;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 100);
  if (q.length < 3) return NextResponse.json([]);
  if (!limitarPorIp(req, 'endereco-sugestoes', 60, 60 * 1000)) return NextResponse.json([], { status: 429 });

  const lat = Number(req.nextUrl.searchParams.get('lat'));
  const lon = Number(req.nextUrl.searchParams.get('lon'));
  const perto = Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? `&lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}` : '';
  const pais = (req.nextUrl.searchParams.get('pais') || 'EE').slice(0, 2).toUpperCase();
  const soDoPais = SO_DO_PAIS.has(pais);
  const chave = `${q.toLowerCase()}|${perto}|${pais}`;
  const c = cache.get(chave);
  if (c && Date.now() - c.em < CACHE_MS) return NextResponse.json(c.corpo);

  try {
    // Com chave do Geoapify (gratis ate 3.000 buscas/dia): resposta em ~0,2 s e
    // com numero da casa. Sem chave: Photon publico (gratis, mas 4-7 s).
    const chaveGeoapify = process.env.GEOAPIFY_KEY;
    if (chaveGeoapify) {
      const capital = CAPITAL[pais];
      const centro = Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? [lon, lat] : capital;
      const filtro = soDoPais ? `&filter=countrycode:${pais.toLowerCase()}` : '';
      const buscar = (vies: string, texto = q) => fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(texto)}&limit=${MAX}${filtro}${vies}&apiKey=${chaveGeoapify}`, { signal: AbortSignal.timeout(4000) });
      const vies = centro ? `&bias=proximity:${centro[0].toFixed(3)},${centro[1].toFixed(3)}` : '';
      let r = await buscar(vies);
      let d = r.ok ? ((await r.json()) as { features?: { properties: Record<string, any> }[] }) : null;
      const doPais = (f: { properties: Record<string, any> }) => String(f.properties.country_code || '').toUpperCase() === pais;
      // Estonia com o filtro e nada achado em cirilico: tenta o nome em latim ("Ласнамяэ" -> Lasnamae)
      if (soDoPais && d && !(d.features || []).length && CIRILICO.test(q)) {
        const r2 = await buscar(vies, latimEstonia(q));
        const d2 = r2.ok ? ((await r2.json()) as { features?: { properties: Record<string, any> }[] }) : null;
        if (d2 && (d2.features || []).length) { r = r2; d = d2; }
      }
      // nome da rua em russo ("Нарвское шоссе 5"): perto de Tallinn so achava a Russia; sem o
      // vies ele acha a Narva mnt - segunda busca so quando nada do pais veio
      if (d && capital && !(d.features || []).some(doPais)) {
        const r2 = await buscar('');
        const d2 = r2.ok ? ((await r2.json()) as { features?: { properties: Record<string, any> }[] }) : null;
        if (d2 && (d2.features || []).some(doPais)) { r = r2; d = d2; }
      }
      if (r.ok && d) {
        // o pais do mercado primeiro, sem esconder os outros (oficina perto da fronteira, endereco no exterior)
        // (Estonia: so o pais, conferido de novo aqui alem do filter)
        const feats = [...(d.features || [])].filter((f) => !LARGO_DEMAIS.has(String(f.properties.result_type || '')) && (!soDoPais || doPais(f)))
          .sort((a, b) => Number(doPais(b)) - Number(doPais(a)));
        const lista: SugestaoEndereco[] = feats.map(({ properties: p }) => ({
          rotulo: p.formatted || [p.street, p.housenumber, p.city].filter(Boolean).join(' '),
          endereco: [p.street, p.housenumber].filter(Boolean).join(' ') || p.name || '',
          rua: p.street || p.name || '',
          numero: p.housenumber || '',
          cidade: p.city || p.town || p.village || p.county || '',
          estado: p.state || p.county || '',
          cep: p.postcode || '',
          paisCodigo: String(p.country_code || '').toUpperCase(),
          latitude: Number(p.lat),
          longitude: Number(p.lon),
        })).filter((x) => x.rotulo);
        cache.set(chave, { corpo: lista, em: Date.now() });
        return NextResponse.json(lista);
      }
    }
    // Estonia: retangulo do pais e mais resultados (o que cair fora do pais e descartado abaixo)
    const area = soDoPais && BBOX[pais] ? `&bbox=${BBOX[pais]}` : '';
    const qPhoton = soDoPais && CIRILICO.test(q) ? latimEstonia(q) : q;
    const res = await fetch(`${PHOTON}?q=${encodeURIComponent(qPhoton)}&limit=${soDoPais ? MAX * 2 : MAX}${perto}${area}`, {
      headers: { 'User-Agent': USER_AGENT },
      // o Photon publico tem levado 4-7 s: com 4 s quase sempre voltava vazio
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return NextResponse.json([]);
    const dados = (await res.json()) as { features?: { properties: Record<string, string>; geometry: { coordinates: [number, number] } }[] };
    const vistos = new Set<string>();
    const lista: SugestaoEndereco[] = [];
    for (const f of dados.features || []) {
      const p = f.properties;
      if (LARGO_DEMAIS.has(p.type || '')) continue;
      if (soDoPais && (p.countrycode || '').toUpperCase() !== pais) continue;
      if (lista.length >= MAX) break;
      const rua = [p.street, p.housenumber].filter(Boolean).join(' ');
      const endereco = rua || p.name || '';
      const cidade = p.city || p.town || p.village || p.county || '';
      const bairro = p.locality || p.district || '';
      const rotulo = [p.name && p.name !== rua ? p.name : '', rua, bairro !== p.name ? bairro : '', [p.postcode, cidade].filter(Boolean).join(' '), p.state]
        .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
      if (!rotulo || vistos.has(rotulo)) continue;
      vistos.add(rotulo);
      lista.push({
        rotulo,
        endereco,
        rua: p.street || p.name || '',
        numero: p.housenumber || '',
        cidade,
        estado: p.state || p.county || '',
        cep: p.postcode || '',
        paisCodigo: (p.countrycode || '').toUpperCase(),
        latitude: f.geometry.coordinates[1],
        longitude: f.geometry.coordinates[0],
      });
    }
    cache.set(chave, { corpo: lista, em: Date.now() });
    if (cache.size > 3000) cache.delete(cache.keys().next().value as string);
    return NextResponse.json(lista);
  } catch {
    return NextResponse.json([]);
  }
}
