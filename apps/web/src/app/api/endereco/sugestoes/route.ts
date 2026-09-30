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
    const res = await fetch(`${PHOTON}?q=${encodeURIComponent(q)}&limit=6${perto}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(4000),
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
