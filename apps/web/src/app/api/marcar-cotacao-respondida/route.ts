import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// A loja que responde uma cotacao nao e dona dela (a oficina e), entao a
// policy de UPDATE de cotacoes_pecas bloqueia silenciosamente esse update
// vindo do client. Mesma causa-raiz do bug de avaliacao/oficina.
export async function POST(req: NextRequest) {
  try {
    const { cotacaoId } = await req.json();
    if (!cotacaoId) {
      return NextResponse.json({ error: 'cotacaoId obrigatório' }, { status: 400 });
    }
    await supabaseAdmin
      .from('cotacoes_pecas')
      .update({ status: 'respondida' })
      .eq('id', cotacaoId)
      .eq('status', 'aberta');
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
