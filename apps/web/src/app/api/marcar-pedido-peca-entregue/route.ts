import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recalcularComissaoPecasConfig } from '@/lib/comissao-pecas';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Marca um pedido de peca como entregue e lanca a comissao da plataforma.
// Rota de servidor (service role) pra sempre conseguir gravar
// comissao_pecas_lancamento, independente de qual fornecedor (loja ou
// oficina) esta chamando - mesmo padrao usado em /api/confirmar-entrega e
// /api/marcar-cotacao-respondida.
export async function POST(req: NextRequest) {
  try {
    const { pedidoId } = await req.json();
    if (!pedidoId) {
      return NextResponse.json({ error: 'pedidoId e obrigatorio' }, { status: 400 });
    }

    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from('pedidos_pecas')
      .select('id, fornecedor_tipo, loja_id, oficina_fornecedora_id, preco_total, status')
      .eq('id', pedidoId)
      .single();

    if (pedidoError || !pedido) {
      return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 });
    }

    if (pedido.status === 'entregue') {
      return NextResponse.json({ success: true, jaEntregue: true });
    }

    await supabaseAdmin.from('pedidos_pecas').update({ status: 'entregue' }).eq('id', pedidoId);

    const fornecedorId = pedido.fornecedor_tipo === 'loja' ? pedido.loja_id : pedido.oficina_fornecedora_id;

    // Evita lancar comissao duas vezes se a rota for chamada de novo
    const { data: jaLancado } = await supabaseAdmin
      .from('comissao_pecas_lancamento')
      .select('id')
      .eq('pedido_id', pedidoId)
      .single();

    if (!jaLancado && fornecedorId) {
      const { taxa } = await recalcularComissaoPecasConfig(supabaseAdmin, pedido.fornecedor_tipo, fornecedorId);

      const { error: comissaoError } = await supabaseAdmin.from('comissao_pecas_lancamento').insert({
        fornecedor_tipo: pedido.fornecedor_tipo,
        fornecedor_id: fornecedorId,
        pedido_id: pedidoId,
        valor_pedido: pedido.preco_total,
        taxa_aplicada: taxa,
        valor_comissao: Math.round(pedido.preco_total * taxa * 100) / 100,
        status: 'pendente',
      });

      if (comissaoError) {
        console.error('[marcar-pedido-peca-entregue] Falha ao registrar comissao:', comissaoError.message);
      } else {
        await recalcularComissaoPecasConfig(supabaseAdmin, pedido.fornecedor_tipo, fornecedorId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
