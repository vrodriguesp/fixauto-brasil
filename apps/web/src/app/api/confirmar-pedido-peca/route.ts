import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { sendPedidoPecaConfirmadoEmail } from '@/lib/notifications';
import { notifPedidoConfirmado, notifCotacaoPecaFechadaOutro } from '@/lib/notif-i18n';
import { currencyForCountry } from '@fixauto/shared';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { emTodasAsLinguas } from '@/lib/notif-textos';
import { telefonesComerciais } from '@/lib/pecas-v3';

// B2 (16/11): a oficina compradora confirma uma oferta. Antes isso era feito do
// navegador: o aviso para uma OFICINA vendedora era barrado pela regra de
// notificacoes (403) e o e-mail nem saia. Agora tudo aqui, com a service role:
//  1. fecha a cotacao (so se ainda estiver aberta/respondida - evita 2 pedidos);
//  2. grava pedidos_pecas com o valor total (preco x quantidade);
//  3. avisa quem ganhou (sino + e-mail com contato da compradora - A4);
//  4. avisa quem perdeu, sem preco (A5).
// Lote 1 (17/11): quantidade com casas decimais (4,5 l x 10,00 = 45,00); cotacao
// 'expirada' cai no 409 JA_FECHADA (so aberta/respondida fecha); o e-mail leva o
// telefone comercial da compradora quando ha; conta de teste e conta real nao se
// avisam (o pedido e gravado, mas sem sino/e-mail para o outro tipo de conta).
export async function POST(req: NextRequest) {
  try {
    const callerId = await getSessionUserId(req);
    if (!callerId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    if (!dentroDoLimite(`confirmar-peca-u:${callerId}`, 30, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
    }

    const { respostaId } = await req.json();
    if (!respostaId) return NextResponse.json({ error: 'respostaId obrigatório' }, { status: 400 });

    const { data: resposta } = await supabaseAdmin
      .from('cotacoes_pecas_respostas')
      .select(`
        id, cotacao_id, preco, fornecedor_tipo, loja_id, oficina_fornecedora_id, quantidade_ofertada,
        loja:lojas_pecas(profile_id, nome_fantasia, pais, profile:profiles(email, nome, idioma, conta_teste)),
        oficina_fornecedora:oficinas!cotacoes_pecas_respostas_oficina_fornecedora_id_fkey(profile_id, nome_fantasia, pais, profile:profiles!oficinas_profile_id_fkey(email, nome, idioma, conta_teste))
      `)
      .eq('id', respostaId)
      .maybeSingle();
    if (!resposta) return NextResponse.json({ error: 'Resposta não encontrada' }, { status: 404 });

    const { data: cotacao } = await supabaseAdmin
      .from('cotacoes_pecas')
      .select('id, status, quantidade, unidade, peca_descricao, oficina:oficinas!cotacoes_pecas_oficina_id_fkey(id, profile_id, nome_fantasia, endereco, numero, cidade, pais, profile:profiles!oficinas_profile_id_fkey(telefone, conta_teste))')
      .eq('id', resposta.cotacao_id)
      .single();
    const compradora = (cotacao as any)?.oficina;
    // So a dona da oficina que pediu a peca confirma (a mesma regra da RLS antiga de pedidos_pecas)
    if (!cotacao || !compradora || compradora.profile_id !== callerId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // 1. fecha a cotacao de forma atomica: se outra aba ja fechou, nao cria 2o pedido
    const statusAntes = cotacao.status;
    const { data: fechada } = await supabaseAdmin
      .from('cotacoes_pecas')
      .update({ status: 'fechada' })
      .eq('id', cotacao.id)
      .in('status', ['aberta', 'respondida'])
      .select('id');
    if (!fechada?.length) {
      return NextResponse.json({ error: 'Pedido já fechado ou cancelado', codigo: 'JA_FECHADA' }, { status: 409 });
    }

    // 2. pedido com o valor total
    // quantidade numeric (091): chega como numero (4.5); total arredondado a 2 casas.
    // Lote 2: a quantidade OFERTADA (oferta parcial) quando ha; sem ela, a pedida (= lote 1)
    const quantidade = Number((resposta as any).quantidade_ofertada ?? cotacao.quantidade) || 1;
    const precoTotal = Math.round((Number(resposta.preco) * quantidade + Number.EPSILON) * 100) / 100;
    const { data: pedido, error: ePedido } = await supabaseAdmin
      .from('pedidos_pecas')
      .insert({
        cotacao_id: cotacao.id,
        resposta_id: resposta.id,
        oficina_id: compradora.id,
        fornecedor_tipo: resposta.fornecedor_tipo,
        loja_id: resposta.fornecedor_tipo === 'loja' ? resposta.loja_id : null,
        oficina_fornecedora_id: resposta.fornecedor_tipo === 'oficina' ? resposta.oficina_fornecedora_id : null,
        preco_total: precoTotal,
        quantidade,
      })
      .select('id')
      .single();
    if (ePedido || !pedido) {
      // devolve a cotacao ao estado anterior para a oficina tentar de novo
      await supabaseAdmin.from('cotacoes_pecas').update({ status: statusAntes }).eq('id', cotacao.id);
      return NextResponse.json({ error: ePedido?.message || 'Falha ao gravar o pedido' }, { status: 500 });
    }

    // 3. quem ganhou
    const fornecedor = resposta.fornecedor_tipo === 'loja' ? (resposta.loja as any) : (resposta.oficina_fornecedora as any);
    const linkFornecedor = resposta.fornecedor_tipo === 'loja' ? '/loja/pedidos' : '/oficina/pecas?aba=vender';
    // paridade teste x real (091): a RLS ja nao deixa ofertar no outro tipo de conta; aqui o resto
    const compradoraTeste = !!compradora.profile?.conta_teste;
    const mesmoTipo = (perfil: { conta_teste?: boolean | null } | null | undefined) => !!perfil?.conta_teste === compradoraTeste;
    if (fornecedor?.profile_id && mesmoTipo(fornecedor.profile)) {
      const perfil = fornecedor.profile;
      const n = notifPedidoConfirmado(perfil?.idioma, compradora.nome_fantasia, cotacao.peca_descricao);
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: fornecedor.profile_id,
        tipo: 'pedido_peca_confirmado',
        titulo: n.titulo,
        mensagem: n.mensagem,
        dados: { cotacao_id: cotacao.id, pedido_id: pedido.id, link: linkFornecedor, textos: emTodasAsLinguas((l) => notifPedidoConfirmado(l, compradora.nome_fantasia, cotacao.peca_descricao)) },
      });
      if (perfil?.email) {
        const endereco = [[compradora.endereco, compradora.numero].filter(Boolean).join(' '), compradora.cidade].filter(Boolean).join(', ');
        const telefone = (await telefonesComerciais([{ tipo: 'oficina', id: compradora.id }])).get(`oficina:${compradora.id}`) || compradora.profile?.telefone || null;
        await sendPedidoPecaConfirmadoEmail({
          toEmail: perfil.email,
          toName: perfil.nome || fornecedor.nome_fantasia || '',
          oficinaCompradoraNome: compradora.nome_fantasia || '-',
          pecaDescricao: cotacao.peca_descricao,
          valorTotal: precoTotal,
          quantidade,
          unidade: cotacao.unidade,
          moeda: currencyForCountry(fornecedor.pais || compradora.pais),
          linkInterno: linkFornecedor,
          contato: { telefone, endereco },
          locale: perfil.idioma || undefined,
        }).catch(() => {});
      }
    }

    // 4. quem perdeu: so o sino, sem preco nem nome de quem ganhou
    const { data: outras } = await supabaseAdmin
      .from('cotacoes_pecas_respostas')
      .select('id, fornecedor_tipo, loja:lojas_pecas(profile_id, profile:profiles(idioma, conta_teste)), oficina_fornecedora:oficinas!cotacoes_pecas_respostas_oficina_fornecedora_id_fkey(profile_id, profile:profiles!oficinas_profile_id_fkey(idioma, conta_teste))')
      .eq('cotacao_id', cotacao.id)
      .neq('id', resposta.id);
    const avisados = new Set<string>([fornecedor?.profile_id].filter(Boolean));
    for (const r of outras || []) {
      const f = r.fornecedor_tipo === 'loja' ? (r.loja as any) : (r.oficina_fornecedora as any);
      if (!f?.profile_id || avisados.has(f.profile_id) || !mesmoTipo(f.profile)) continue;
      avisados.add(f.profile_id);
      const n = notifCotacaoPecaFechadaOutro(f.profile?.idioma, cotacao.peca_descricao);
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: f.profile_id,
        tipo: 'cotacao_peca_fechada_outro',
        titulo: n.titulo,
        mensagem: n.mensagem,
        dados: { cotacao_id: cotacao.id, link: r.fornecedor_tipo === 'loja' ? '/loja/cotacoes' : '/oficina/pecas?aba=vender', textos: emTodasAsLinguas((l) => notifCotacaoPecaFechadaOutro(l, cotacao.peca_descricao)) },
      });
    }

    return NextResponse.json({ success: true, pedidoId: pedido.id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
