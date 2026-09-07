import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recalcularComissaoConfig } from '@/lib/comissao';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Chamado (fire-and-forget) sempre que algo que afeta a taxa de comissao
// muda do lado do cliente: orcamento enviado/revisado, nova avaliacao.
// Escrever em comissao_config exige service role (RLS so libera leitura
// pra propria oficina), por isso isso nao pode rodar direto do navegador.
export async function POST(req: NextRequest) {
  try {
    const { oficinaId } = await req.json();
    if (!oficinaId) {
      return NextResponse.json({ error: 'oficinaId obrigatório' }, { status: 400 });
    }
    const info = await recalcularComissaoConfig(supabaseAdmin, oficinaId);
    return NextResponse.json(info);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
