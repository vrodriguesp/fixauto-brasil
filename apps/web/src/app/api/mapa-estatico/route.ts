import { NextRequest, NextResponse } from 'next/server';
import { limitarPorIp } from '@/lib/rate-limit';

// Mapa estatico com o pino do passo "Asukoht" do pedido (dono 19/11, Proposta sec. 14: "mapa
// estatico simples"). Imagem do Geoapify buscada AQUI, com a chave do servidor (nunca no navegador);
// sem GEOAPIFY_KEY (ambiente local) ou falha do Geoapify responde 204 (sem corpo: a <img> dispara onError e a
// pagina esconde o mapa; nao e um 4xx, o mapa e so um extra). Coordenada arredondada
// (~10 m) para o cache; nada e gravado. Mesmo limite por IP do geocode.
export const dynamic = 'force-dynamic';

const CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { corpo: ArrayBuffer; tipo: string; em: number }>();

export async function GET(req: NextRequest) {
  const chave = process.env.GEOAPIFY_KEY;
  if (!chave) return new NextResponse(null, { status: 204 });
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get('lat')), lon = Number(searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return new NextResponse(null, { status: 400 });
  const la = lat.toFixed(4), lo = lon.toFixed(4);
  const id = `${la},${lo}`;
  const guardado = cache.get(id);
  if (guardado && Date.now() - guardado.em < CACHE_MS) return new NextResponse(guardado.corpo, { headers: { 'Content-Type': guardado.tipo, 'Cache-Control': 'public, max-age=86400' } });
  if (!limitarPorIp(req, 'mapa', 60, 60 * 60 * 1000)) return new NextResponse(null, { status: 429 });
  try {
    const url = `https://maps.geoapify.com/v1/staticmap?style=osm-bright-smooth&width=640&height=300&center=lonlat:${lo},${la}&zoom=14&marker=lonlat:${lo},${la};type:material;color:%23dc2626;size:large&scaleFactor=2&apiKey=${chave}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return new NextResponse(null, { status: 204 });
    const corpo = await r.arrayBuffer();
    const tipo = r.headers.get('content-type') || 'image/png';
    cache.set(id, { corpo, tipo, em: Date.now() });
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
    return new NextResponse(corpo, { headers: { 'Content-Type': tipo, 'Cache-Control': 'public, max-age=86400' } });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
