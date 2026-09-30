import { NextRequest, NextResponse } from 'next/server';
import { limitarPorIp } from '@/lib/rate-limit';

const FIPE_API_BASE = 'https://parallelum.com.br/fipe/api/v2';
const CAMINHO_VALIDO = /^(cars|motorcycles|trucks)\/brands(\/\d+\/models(\/\d+\/years(\/[0-9]+-[0-9]+)?)?)?$/;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  // So os caminhos que o formulario usa (antes o `path` ia cru para a URL
  // e `../` alcancava qualquer endereco do host - OWASP SSRF)
  if (!path || !CAMINHO_VALIDO.test(path)) {
    return NextResponse.json({ error: 'Path inválido' }, { status: 400 });
  }
  if (!limitarPorIp(request, 'fipe', 120, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
  }

  try {
    const res = await fetch(`${FIPE_API_BASE}/${path}`, {
      next: { revalidate: 86400 }, // Cache for 24h
    });

    if (!res.ok) {
      throw new Error(`FIPE API returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch FIPE data' },
      { status: 502 }
    );
  }
}
