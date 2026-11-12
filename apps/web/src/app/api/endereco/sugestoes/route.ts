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
      const buscar = (vies: string) => fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(q)}&limit=6${vies}&apiKey=${chaveGeoapify}`, { signal: AbortSignal.timeout(4000) });
      let r = await buscar(centro ? `&bias=proximity:${centro[0].toFixed(3)},${centro[1].toFixed(3)}` : '');
      let d = r.ok ? ((await r.json()) as { features?: { properties: Record<string, any> }[] }) : null;
      const doPais = (f: { properties: Record<string, any> }) => String(f.properties.country_code || '').toUpperCase() === pais;
      // nome da rua em russo ("Нарвское шоссе 5"): perto de Tallinn so achava a Russia; sem o
      // vies ele acha a Narva mnt - segunda busca so quando nada do pais veio
      if (d && capital && !(d.features || []).some(doPais)) {
        const r2 = await buscar('');
        const d2 = r2.ok ? ((await r2.json()) as { features?: { properties: Record<string, any> }[] }) : null;
        if (d2 && (d2.features || []).some(doPais)) { r = r2; d = d2; }
      }
      if (r.ok && d) {
        // o pais do mercado primeiro, sem esconder os outros (oficina perto da fronteira, endereco no exterior)
        const feats = [...(d.features || [])].sort((a, b) => Number(doPais(b)) - Number(doPais(a)));
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
    const res = await fetch(`${PHOTON}?q=${encodeURIComponent(q)}&limit=6${perto}`, {
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
