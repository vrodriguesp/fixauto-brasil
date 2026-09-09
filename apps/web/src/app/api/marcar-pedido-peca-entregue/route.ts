import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recalcularComissaoPecasConfig } from '@/lib/comissao-pecas';
import { getSessionUserId } from '@/lib/api-auth';
import { sendPedidoPecaEntregueEmail } from '@/lib/notifications';

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
    const callerId = await getSessionUserId();
    if (!callerId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { pedidoId } = await req.json();
    if (!pedidoId) {
      return NextResponse.json({ error: 'pedidoId e obrigatorio' }, { status: 400 });
    }

    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from('pedidos_pecas')
      .select(`
        id, fornecedor_tipo, loja_id, oficina_fornecedora_id, preco_total, status,
        loja:lojas_pecas(profile_id, nome_fantasia),
        oficina_fornecedora:oficinas!pedidos_pecas_oficina_fornecedora_id_fkey(profile_id, nome_fantasia),
        cotacao:cotacoes_pecas(peca_descricao, oficina:oficinas(profile_id, profile:profiles(email, nome)))
      `)
      .eq('id', pedidoId)
      .single();

    if (pedidoError || !pedido) {
      return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 });
    }

    // So o proprio fornecedor (loja ou oficina fornecedora) daquele
    // pedido pode marca-lo como entregue - sem isso, qualquer pedidoId
    // adivinhado lancava comissao indevida contra um fornecedor de
    // terceiro.
    const fornecedorProfileId = pedido.fornecedor_tipo === 'loja'
      ? (pedido as any).loja?.profile_id
      : (pedido as any).oficina_fornecedora?.profile_id;
    if (fornecedorProfileId !== callerId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
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

    // Notifica a oficina compradora que a peca foi entregue (faltava -
    // ela so ficava sabendo se checasse o status manualmente).
    const cotacao = (pedido as any).cotacao;
    const compradoraProfile = cotacao?.oficina?.profile;
    if (compradoraProfile && cotacao.oficina?.profile_id) {
      const fornecedorNome = pedido.fornecedor_tipo === 'loja'
        ? (pedido as any).loja?.nome_fantasia
        : (pedido as any).oficina_fornecedora?.nome_fantasia;

      await supabaseAdmin.from('notificacoes').insert({
        profile_id: cotacao.oficina.profile_id,
        tipo: 'pedido_peca_entregue',
        titulo: 'Peça entregue',
        mensagem: `${fornecedorNome || 'O fornecedor'} marcou como entregue o pedido de "${cotacao.peca_descricao}"`,
        dados: { pedido_id: pedidoId },
      });

      if (compradoraProfile.email) {
        await sendPedidoPecaEntregueEmail({
          toEmail: compradoraProfile.email,
          toName: compradoraProfile.nome,
          fornecedorNome: fornecedorNome || 'O fornecedor',
          pecaDescricao: cotacao.peca_descricao,
        }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
