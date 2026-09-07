import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { obterTaxaComissao } from '@/lib/comissao';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';

// Devolve a taxa de comissao efetiva de uma oficina agora (considerando o
// tier de fidelidade/volume dos ultimos 90 dias, ou o override do admin).
export async function GET(req: NextRequest) {
  const oficinaId = req.nextUrl.searchParams.get('oficinaId');
  if (!oficinaId) {
    return NextResponse.json({ error: 'oficinaId obrigatório' }, { status: 400 });
  }
  const info = await obterTaxaComissao(supabaseAdmin, oficinaId);
  return NextResponse.json(info);
}
