import { NextRequest, NextResponse } from 'next/server';

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch('https://placas.app.br/api/v1/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.PLACAS_API_EMAIL,
      password: process.env.PLACAS_API_PASSWORD,
    }),
  });

  if (!res.ok) throw new Error('Falha na autenticação da API de placas');

  const data = await res.json();
  cachedToken = data.token;
  tokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24h cache
  return data.token;
}

export async function POST(req: NextRequest) {
  try {
    const { placa } = await req.json();

    if (!placa || placa.length < 7) {
      return NextResponse.json({ error: 'Placa inválida' }, { status: 400 });
    }

    if (!process.env.PLACAS_API_EMAIL || !process.env.PLACAS_API_PASSWORD) {
      return NextResponse.json({ error: 'API de placas não configurada' }, { status: 500 });
    }

    const token = await getToken();

    const res = await fetch('https://placas.app.br/api/v1/placas/numero', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ placa: placa.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Placa não encontrada: ${err}` }, { status: 404 });
    }

    const data = await res.json();

    return NextResponse.json({
      marca: data.marca || '',
      modelo: data.modelo || '',
      ano: data.ano_fabricacao || data.ano_modelo || '',
      cor: data.cor || '',
      combustivel: data.combustivel || '',
      uf: data.uf || '',
      chassi: data.chassi || '',
      placa_novo: data.placa_modelo_novo || '',
      segmento: data.segmento || '',
      potencia: data.potencia || '',
    });
  } catch (err) {
    console.error('[consultar-placa]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
