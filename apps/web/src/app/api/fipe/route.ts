import { NextRequest, NextResponse } from 'next/server';

const FIPE_API_BASE = 'https://parallelum.com.br/fipe/api/v2';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'Path parameter required' }, { status: 400 });
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
