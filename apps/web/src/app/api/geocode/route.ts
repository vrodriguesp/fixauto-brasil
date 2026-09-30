import { NextRequest, NextResponse } from 'next/server';
import { limitarPorIp } from '@/lib/rate-limit';

// Geocodificacao via Nominatim (OpenStreetMap) - gratuito, sem chave,
// cobre o mundo inteiro incluindo a Estonia. Dois modos:
// - Busca direta (?q=...): endereco digitado -> coordenadas + pais.
//   Fallback quando o navegador nega a permissao de geolocalizacao.
// - Reversa (?lat=...&lon=...): coordenadas reais do navegador -> pais.
//   O browser so devolve lat/lon, nunca o pais - precisamos disso pra
//   saber em que moeda mostrar os precos daquela oficina/loja (por pais
//   real, nao pelo idioma de quem esta navegando - ver lib/currency.ts).
// Rodado no servidor (nao no client) porque a politica de uso do
// Nominatim exige um User-Agent identificando a aplicacao, algo que o
// fetch do navegador nao deixa customizar:
// https://operations.osmfoundation.org/policies/nominatim/
// Limite: 1 requisicao/segundo na instancia publica - de sobra pro
// volume de um cadastro/solicitacao isolados, nao usar em loop/bulk.
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'BipFix/1.0 (+https://bipfix.com; support@bipfix.com)';

function fromAddress(addr: Record<string, string>) {
  return {
    cidade: addr.city || addr.town || addr.village || addr.municipality || '',
    estado: addr.state || addr.county || '',
    cep: addr.postcode || '',
    pais: addr.country || '',
    // ISO 3166-1 alpha-2 (ex: "br", "ee") - usado pra decidir moeda, nunca
    // pra exibir pro usuario (usar "pais" pra isso).
    paisCodigo: (addr.country_code || '').toUpperCase(),
  };
}

// Politica do Nominatim: no maximo 1 requisicao/segundo e sem uso em massa
// (violar = bloqueio do servidor, o que quebraria cadastros). Por isso:
// cache de 24 h por consulta, fila de 1/s e limite por IP.
const CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { corpo: unknown; status: number; em: number }>();
let ultimaChamada = 0;
let fila: Promise<void> = Promise.resolve();

function aguardarVez(): Promise<void> {
  const vez = fila.then(async () => {
    const espera = ultimaChamada + 1100 - Date.now();
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultimaChamada = Date.now();
  });
  fila = vez.catch(() => undefined);
  return vez;
}

async function nominatim(url: string): Promise<Response> {
  await aguardarVez();
  return fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
}

function responder(chave: string, corpo: unknown, status = 200) {
  if (status === 200 || status === 404) {
    cache.set(chave, { corpo, status, em: Date.now() });
    if (cache.size > 5000) cache.delete(cache.keys().next().value as string);
  }
  return NextResponse.json(corpo, { status });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim().slice(0, 200) || null;
  // Coordenadas arredondadas (~100 m): melhora o cache e nao muda o pais/cidade
  const lat = searchParams.get('lat') ? Number(searchParams.get('lat')).toFixed(3) : null;
  const lon = searchParams.get('lon') ? Number(searchParams.get('lon')).toFixed(3) : null;
  const chave = lat && lon ? `r:${lat},${lon}` : `q:${(q || '').toLowerCase()}`;
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < CACHE_MS) return NextResponse.json(guardado.corpo, { status: guardado.status });
  if (!limitarPorIp(req, 'geocode', 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
  }

  try {
    if (lat && lon) {
      const url = `${NOMINATIM_REVERSE}?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
      const res = await nominatim(url);
      if (!res.ok) return NextResponse.json({ error: 'Falha ao consultar geocodificacao reversa' }, { status: 502 });
      const hit = await res.json();
      if (!hit || hit.error) return responder(chave, { error: 'Localizacao nao encontrada' }, 404);
      return responder(chave, fromAddress(hit.address || {}));
    }

    if (!q || q.length < 3) {
      return NextResponse.json({ error: 'Informe "q" (endereco) ou "lat"+"lon"' }, { status: 400 });
    }

    const url = `${NOMINATIM_SEARCH}?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`;
    const res = await nominatim(url);
    if (!res.ok) return NextResponse.json({ error: 'Falha ao consultar geocodificacao' }, { status: 502 });

    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) {
      return responder(chave, { error: 'Endereco nao encontrado' }, 404);
    }

    const hit = results[0];
    return responder(chave, {
      latitude: parseFloat(hit.lat),
      longitude: parseFloat(hit.lon),
      enderecoCompleto: hit.display_name || '',
      ...fromAddress(hit.address || {}),
    });
  } catch {
    return NextResponse.json({ error: 'Erro ao consultar geocodificacao' }, { status: 500 });
  }
}
