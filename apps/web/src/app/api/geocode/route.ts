import { NextRequest, NextResponse } from 'next/server';

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  try {
    if (lat && lon) {
      const url = `${NOMINATIM_REVERSE}?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
      if (!res.ok) return NextResponse.json({ error: 'Falha ao consultar geocodificacao reversa' }, { status: 502 });
      const hit = await res.json();
      if (!hit || hit.error) return NextResponse.json({ error: 'Localizacao nao encontrada' }, { status: 404 });
      return NextResponse.json(fromAddress(hit.address || {}));
    }

    if (!q || q.trim().length < 3) {
      return NextResponse.json({ error: 'Informe "q" (endereco) ou "lat"+"lon"' }, { status: 400 });
    }

    const url = `${NOMINATIM_SEARCH}?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
    if (!res.ok) return NextResponse.json({ error: 'Falha ao consultar geocodificacao' }, { status: 502 });

    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ error: 'Endereco nao encontrado' }, { status: 404 });
    }

    const hit = results[0];
    return NextResponse.json({
      latitude: parseFloat(hit.lat),
      longitude: parseFloat(hit.lon),
      enderecoCompleto: hit.display_name || '',
      ...fromAddress(hit.address || {}),
    });
  } catch {
    return NextResponse.json({ error: 'Erro ao consultar geocodificacao' }, { status: 500 });
  }
}
