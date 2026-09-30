import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { limitarPorIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';


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
    // API paga: limite por IP (quem registra acidente sem login tambem usa)
    const userId = await getSessionUserId(req);
    if (!limitarPorIp(req, 'placa', userId ? 30 : 5, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
    }
    const { placa } = await req.json();
    const clean = String(placa || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);

    if (!clean || clean.length < 7) {
      return NextResponse.json({ error: 'Placa inválida' }, { status: 400 });
    }

    // 1. Veiculos da PROPRIA pessoa primeiro (antes buscava em todos os
    // veiculos do banco e revelava o carro de outra pessoa pela placa)
    const { data: dbVeiculo } = userId
      ? await supabaseAdmin
          .from('veiculos')
          .select('fipe_marca, fipe_modelo, fipe_ano, cor, placa')
          .eq('placa', clean)
          .eq('profile_id', userId)
          .limit(1)
          .maybeSingle()
      : { data: null };

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
