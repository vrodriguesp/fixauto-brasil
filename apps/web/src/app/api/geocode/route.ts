import { NextRequest, NextResponse } from 'next/server';

// Geocodificacao de endereco fora do Brasil via Nominatim (OpenStreetMap) -
// gratuito, sem chave, cobre o mundo inteiro incluindo a Estonia. Serve de
// fallback quando o navegador nega a permissao de geolocalizacao (nesse
// caso a coordenada ficaria presa no default de Sao Paulo - ver
// middleware/cadastro/nova-solicitacao). Rodado no servidor (nao no
// client) porque a politica de uso do Nominatim exige um User-Agent
// identificando a aplicacao, algo que o fetch do navegador nao deixa
// customizar: https://operations.osmfoundation.org/policies/nominatim/
// Limite: 1 requisicao/segundo na instancia publica - de sobra pro volume
// de um cadastro/solicitacao isolados, nao usar em loop/bulk.
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'BipFix/1.0 (+https://bipfix.com; contato@bipfix.com)';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  if (!q || q.trim().length < 3) {
    return NextResponse.json({ error: 'Parametro "q" obrigatorio (minimo 3 caracteres)' }, { status: 400 });
  }

  try {
    const url = `${NOMINATIM_BASE}?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Falha ao consultar geocodificacao' }, { status: 502 });
    }

    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ error: 'Endereco nao encontrado' }, { status: 404 });
    }

    const hit = results[0];
    const addr = hit.address || {};

    return NextResponse.json({
      latitude: parseFloat(hit.lat),
      longitude: parseFloat(hit.lon),
      enderecoCompleto: hit.display_name || '',
      cidade: addr.city || addr.town || addr.village || addr.municipality || '',
      estado: addr.state || addr.county || '',
      cep: addr.postcode || '',
      pais: addr.country || '',
    });
  } catch {
    return NextResponse.json({ error: 'Erro ao consultar geocodificacao' }, { status: 500 });
  }
}
