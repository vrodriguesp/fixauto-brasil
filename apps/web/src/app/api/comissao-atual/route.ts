import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { obterTaxaComissao } from '@/lib/comissao';
import { getSessionUserId } from '@/lib/api-auth';

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

  // Taxa de comissao e dado comercial da propria oficina - sem essa
  // checagem, qualquer um sabendo o oficinaId (aparece em URL publica)
  // conseguia ler a taxa e o volume de servicos de um concorrente.
  const callerId = await getSessionUserId();
  const { data: oficina } = await supabaseAdmin.from('oficinas').select('profile_id').eq('id', oficinaId).single();
  if (!callerId || !oficina || oficina.profile_id !== callerId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const info = await obterTaxaComissao(supabaseAdmin, oficinaId);
  return NextResponse.json(info);
}
