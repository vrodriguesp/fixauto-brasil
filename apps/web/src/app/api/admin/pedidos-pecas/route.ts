import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';

// Ultimos pedidos de peca (para o admin conferir e corrigir o status).
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin
    .from('pedidos_pecas')
    .select(
      `id, status, preco_total, quantidade, created_at, fornecedor_tipo,
       oficina:oficinas!pedidos_pecas_oficina_id_fkey(nome_fantasia, pais),
       loja:lojas_pecas(nome_fantasia),
       oficina_fornecedora:oficinas!pedidos_pecas_oficina_fornecedora_id_fkey(nome_fantasia),
       cotacao:cotacoes_pecas(peca_descricao)`
    )
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
