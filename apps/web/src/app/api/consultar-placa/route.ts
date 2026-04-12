import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  tokenExpiry = Date.now() + 24 * 60 * 60 * 1000;
  return data.token;
}

export async function POST(req: NextRequest) {
  try {
    const { placa } = await req.json();
    const clean = (placa || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    if (!clean || clean.length < 7) {
      return NextResponse.json({ error: 'Placa inválida' }, { status: 400 });
    }

    // 1. Check DB first (any vehicle with this placa)
    const { data: dbVeiculo } = await supabaseAdmin
      .from('veiculos')
      .select('fipe_marca, fipe_modelo, fipe_ano, cor, placa')
      .eq('placa', clean)
      .limit(1)
      .single();

    if (dbVeiculo && dbVeiculo.fipe_marca !== 'A definir') {
      return NextResponse.json({
        marca: dbVeiculo.fipe_marca,
        modelo: dbVeiculo.fipe_modelo,
        ano: dbVeiculo.fipe_ano,
        cor: dbVeiculo.cor || '',
        fonte: 'db',
      });
    }

    // 2. Call external API
    if (!process.env.PLACAS_API_EMAIL || !process.env.PLACAS_API_PASSWORD) {
      return NextResponse.json({ error: 'API de placas não configurada', fonte: 'none' }, { status: 404 });
    }

    const token = await getToken();
    const res = await fetch('https://placas.app.br/api/v1/placas/numero', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ placa: clean.toLowerCase() }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Placa não encontrada', fonte: 'none' }, { status: 404 });
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
      potencia: data.potencia || '',
      fonte: 'api',
    });
  } catch (err) {
    console.error('[consultar-placa]', err);
    return NextResponse.json({ error: (err as Error).message, fonte: 'none' }, { status: 500 });
  }
}
