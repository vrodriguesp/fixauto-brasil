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
  const chave = `${q.toLowerCase()}|${perto}`;
  const c = cache.get(chave);
  if (c && Date.now() - c.em < CACHE_MS) return NextResponse.json(c.corpo);

  try {
    // Com chave do Geoapify (gratis ate 3.000 buscas/dia): resposta em ~0,2 s e
    // com numero da casa. Sem chave: Photon publico (gratis, mas 4-7 s).
    const chaveGeoapify = process.env.GEOAPIFY_KEY;
    if (chaveGeoapify) {
      const vies = Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? `&bias=proximity:${lon.toFixed(3)},${lat.toFixed(3)}` : '';
      const r = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(q)}&limit=6${vies}&apiKey=${chaveGeoapify}`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const d = (await r.json()) as { features?: { properties: Record<string, any> }[] };
        const lista: SugestaoEndereco[] = (d.features || []).map(({ properties: p }) => ({
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
