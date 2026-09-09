import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Detalhe (breakdown por pedido) da comissao de peca de um fornecedor
// especifico - buscado sob demanda quando o admin expande a linha, pra nao
// carregar todo o historico de todo mundo na listagem principal.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const fornecedorTipo = searchParams.get('fornecedor_tipo');
  const fornecedorId = searchParams.get('fornecedor_id');
  if (!fornecedorTipo || !fornecedorId) {
    return NextResponse.json({ error: 'fornecedor_tipo e fornecedor_id obrigatórios' }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('comissao_pecas_lancamento')
      .select('*, pedido:pedidos_pecas(quantidade, cotacao:cotacoes_pecas(peca_descricao))')
      .eq('fornecedor_tipo', fornecedorTipo)
      .eq('fornecedor_id', fornecedorId)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('[admin/comissao-pecas/lancamentos]', error);
    return NextResponse.json({ error: 'Erro ao buscar lançamentos' }, { status: 500 });
  }
}
