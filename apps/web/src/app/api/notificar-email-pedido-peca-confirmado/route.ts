import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { sendPedidoPecaConfirmadoEmail } from '@/lib/notifications';
import { currencyForCountry } from '@fixauto/shared';
import { supabaseAdmin } from '@/lib/supabase-admin';


// So o envio do e-mail (a notificacao in-app ja e inserida direto pelo
// client, permitida pela policy publica de notificacoes) - separado numa
// rota minima porque o Resend so pode ser chamado do servidor.
//
// Antes, essa rota confiava em toEmail/toName/pecaDescricao/valorTotal
// mandados pelo proprio cliente, so checando que quem chamava estava
// logado (sem checar em NADA que o pedido/cotacao referenciado fosse dele)
// - qualquer conta logada (inclusive uma recem-criada) podia mandar a rota
// enviar um e-mail de verdade, assinado como BipFix, com HTML arbitrario,
// pra qualquer endereco. Agora a rota recebe so o `respostaId` e busca
// tudo (destinatario, nome da oficina, preco) direto do banco, verificando
// que quem chama e de fato a oficina dona da cotacao.
export async function POST(req: NextRequest) {
  try {
    const callerId = await getSessionUserId(req);
    if (!callerId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { respostaId } = await req.json();
    if (!respostaId) {
      return NextResponse.json({ error: 'respostaId obrigatório' }, { status: 400 });
    }

    const { data: resposta } = await supabaseAdmin
      .from('cotacoes_pecas_respostas')
      .select(`
        id, preco, fornecedor_tipo, loja_id, oficina_fornecedora_id,
        cotacao:cotacoes_pecas(id, peca_descricao, oficina:oficinas(profile_id, nome_fantasia)),
        loja:lojas_pecas(profile_id, pais, profile:profiles(email, nome, idioma)),
        oficina_fornecedora:oficinas!cotacoes_pecas_respostas_oficina_fornecedora_id_fkey(profile_id, pais, profile:profiles(email, nome, idioma))
      `)
      .eq('id', respostaId)
      .single();

    if (!resposta) {
      return NextResponse.json({ error: 'Resposta não encontrada' }, { status: 404 });
    }

    // So a oficina dona da cotacao (quem esta confirmando o pedido) pode
    // disparar essa notificacao por e-mail pro fornecedor.
    const cotacao = resposta.cotacao as any;
    if (!cotacao || cotacao.oficina?.profile_id !== callerId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const fornecedor = resposta.fornecedor_tipo === 'loja' ? (resposta.loja as any) : (resposta.oficina_fornecedora as any);
    const fornecedorProfile = fornecedor?.profile;
    if (!fornecedorProfile?.email) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const result = await sendPedidoPecaConfirmadoEmail({
      toEmail: fornecedorProfile.email,
      toName: fornecedorProfile.nome || 'Fornecedor',
      oficinaCompradoraNome: cotacao.oficina?.nome_fantasia || 'Uma oficina',
      pecaDescricao: cotacao.peca_descricao,
      valorTotal: Number(resposta.preco) || 0,
      moeda: currencyForCountry(fornecedor?.pais),
      locale: fornecedorProfile.idioma,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
