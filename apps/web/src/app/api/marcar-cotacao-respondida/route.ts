import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSessionUserId } from '@/lib/api-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// A loja que responde uma cotacao nao e dona dela (a oficina e), entao a
// policy de UPDATE de cotacoes_pecas bloqueia silenciosamente esse update
// vindo do client. Mesma causa-raiz do bug de avaliacao/oficina.
export async function POST(req: NextRequest) {
  try {
    const callerId = await getSessionUserId();
    if (!callerId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { cotacaoId } = await req.json();
    if (!cotacaoId) {
      return NextResponse.json({ error: 'cotacaoId obrigatório' }, { status: 400 });
    }

    // So quem de fato respondeu essa cotacao (loja ou oficina
    // fornecedora dona da linha em cotacoes_pecas_respostas) pode marca-la
    // como respondida - sem isso, qualquer cotacaoId aberto podia ser
    // escondido de outros fornecedores sem nenhuma resposta real.
    const { data: minhaResposta } = await supabaseAdmin
      .from('cotacoes_pecas_respostas')
      .select('id, fornecedor_tipo, loja:lojas_pecas(profile_id), oficina_fornecedora:oficinas!cotacoes_pecas_respostas_oficina_fornecedora_id_fkey(profile_id)')
      .eq('cotacao_id', cotacaoId)
      .order('created_at', { ascending: false });

    const respondeuDeVerdade = (minhaResposta || []).some((r: any) => {
      const fornecedorProfileId = r.fornecedor_tipo === 'loja' ? r.loja?.profile_id : r.oficina_fornecedora?.profile_id;
      return fornecedorProfileId === callerId;
    });
    if (!respondeuDeVerdade) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
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
