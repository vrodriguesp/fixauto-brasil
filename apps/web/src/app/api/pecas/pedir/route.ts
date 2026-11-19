import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { MAX_ABERTAS_POR_PAR, VISIVEIS_SHOP, oficinaDaDona, pecasShopAtivo } from '@/lib/pecas-lote5';
import { avisarFornecedoresCotacao, carregarCotacaoParaAviso } from '@/lib/avisar-fornecedores-cotacao';

export const dynamic = 'force-dynamic';
const SEM_CACHE = { 'Cache-Control': 'no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const erro = (status: number, codigo: string) => NextResponse.json({ error: codigo }, { status, headers: SEM_CACHE });

// Pecas lote 5 (20/11): "Pedir" do Shop (item do catalogo ou promocao) e "Pedir de novo" (pedido entregue de uma loja).
// Cria uma cotacao de 1 fornecedor (alvo = 'fornecedor_unico', so pelo servidor - gatilho da 105) e avisa SO a loja-alvo
// pelo fluxo de hoje (sino + e-mail/resumo). A loja responde como hoje (preco pre-preenchido) e a oficina confirma como
// hoje: avaliacao, contato, P-7 e expiracao valem iguais. Mapa_lote5.md sec. 3 (proposta v3 P-26: "comprar" pelo site).
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return erro(401, 'NAO_AUTENTICADO');
    if (!(await pecasShopAtivo(userId))) return erro(404, 'NAO_ENCONTRADO');
    const of = await oficinaDaDona(userId);
    if (!of) return erro(403, 'SO_DONA');
    const corpo = await req.json().catch(() => ({}));
    const itemId = typeof corpo.itemId === 'string' ? corpo.itemId : null;
    const promocaoId = typeof corpo.promocaoId === 'string' ? corpo.promocaoId : null;
    const pedidoId = typeof corpo.pedidoId === 'string' ? corpo.pedidoId : null;
    if ([itemId, promocaoId, pedidoId].filter(Boolean).length !== 1) return erro(400, 'ORIGEM');
    if (![itemId, promocaoId, pedidoId].filter(Boolean).every((x) => UUID.test(String(x)))) return erro(400, 'ORIGEM');
    const observacao = typeof corpo.observacao === 'string' ? corpo.observacao.trim().slice(0, 500) : '';
    if (!dentroDoLimite(`pecas-pedir-u:${userId}`, 20, 60 * 60 * 1000)) return erro(429, 'MUITAS_TENTATIVAS');

    // P-7 (lote 3): com retorno de compra pendente nao pede peca nova (mesma regra do formulario)
    const { data: bloqueada } = await supabaseAdmin.rpc('oficina_feedback_pecas_pendente', { p_oficina: of.id });
    if (bloqueada === true) return erro(409, 'P7_BLOQUEADA');

    let lojaId: string;
    let linha: Record<string, unknown>;
    let quantidade = Number(corpo.quantidade);
    if (pedidoId) {
      const { data: ped } = await supabaseAdmin.from('pedidos_pecas')
        .select('id, oficina_id, loja_id, fornecedor_tipo, status, recebido_em, cotacao:cotacoes_pecas(peca_descricao, fipe_marca, fipe_modelo, fipe_ano, quantidade, unidade, tipo, observacao)')
        .eq('id', pedidoId).maybeSingle();
      const c = (ped as any)?.cotacao;
      if (!ped || ped.oficina_id !== of.id || ped.fornecedor_tipo !== 'loja' || !ped.loja_id || ped.status !== 'entregue' || !c) return erro(404, 'NAO_ENCONTRADO');
      lojaId = ped.loja_id;
      if (!(quantidade > 0)) quantidade = Number(c.quantidade) || 1;
      // copia peca/carro/quantidade/unidade, NUNCA a placa (enviar_placa = false, sem linha em cotacoes_pecas_placa)
      linha = {
        peca_descricao: c.peca_descricao, fipe_marca: c.fipe_marca, fipe_modelo: c.fipe_modelo, fipe_ano: c.fipe_ano,
        unidade: c.unidade || 'un', tipo: c.tipo === 'sem_carro' ? 'sem_carro' : 'carro', origem: 'pedir_de_novo', preco_referencia: null,
      };
    } else if (itemId) {
      const { data: it } = await supabaseAdmin.from('pecas_catalogo')
        .select('id, loja_id, nome, codigo, especificacao, embalagem, unidade, preco, ativo, oculto, visibilidade').eq('id', itemId).maybeSingle();
      if (!it || !it.ativo || it.oculto || !VISIVEIS_SHOP.includes(it.visibilidade)) return erro(404, 'NAO_ENCONTRADO');
      lojaId = it.loja_id;
      if (!(quantidade > 0)) quantidade = 1;
      const desc = [it.nome, it.codigo, it.especificacao, it.embalagem].filter(Boolean).join(' · ');
      linha = { peca_descricao: desc.slice(0, 300), unidade: it.unidade || 'un', tipo: 'sem_carro', catalogo_item_id: it.id, origem: 'shop', preco_referencia: Math.round(Number(it.preco) * quantidade * 100) / 100 };
    } else {
      const agora = Date.now();
      const { data: pr } = await supabaseAdmin.from('promocoes_pecas')
        .select('id, loja_id, item_id, titulo, unidade, preco, oculta, valido_de, valido_ate, visibilidade').eq('id', promocaoId!).maybeSingle();
      if (!pr || pr.oculta || !VISIVEIS_SHOP.includes(pr.visibilidade) || Date.parse(pr.valido_ate) <= agora || Date.parse(pr.valido_de) > agora) return erro(404, 'NAO_ENCONTRADO');
      lojaId = pr.loja_id;
      if (!(quantidade > 0)) quantidade = 1;
      linha = { peca_descricao: String(pr.titulo).slice(0, 300), unidade: pr.unidade || 'un', tipo: 'sem_carro', catalogo_item_id: pr.item_id, promocao_id: pr.id, origem: 'shop', preco_referencia: Math.round(Number(pr.preco) * quantidade * 100) / 100 };
    }
    if (!(quantidade > 0 && quantidade <= 9999)) return erro(400, 'QUANTIDADE');
    quantidade = Math.round(quantidade * 100) / 100;
    if (linha.preco_referencia !== null && !(Number(linha.preco_referencia) > 0)) linha.preco_referencia = null;

    // fornecedor: loja ativa, mesmo pais, mesmo tipo de conta (teste x real), dona ativa e nao a propria pessoa
    const { data: loja } = await supabaseAdmin.from('lojas_pecas')
      .select('id, profile_id, pais, ativa, profile:profiles(conta_teste, ativo)').eq('id', lojaId).maybeSingle();
    const lp = (loja as any)?.profile;
    if (!loja || !loja.ativa || !of.pais || loja.pais !== of.pais || !lp || lp.ativo === false || !!lp.conta_teste !== of.teste || loja.profile_id === userId) {
      return erro(404, 'NAO_ENCONTRADO');
    }

    // teto por par (oficina, loja): no maximo MAX_ABERTAS_POR_PAR cotacoes de 1 fornecedor abertas ao mesmo tempo
    const { count: abertas } = await supabaseAdmin.from('cotacoes_pecas').select('id', { count: 'exact', head: true })
      .eq('oficina_id', of.id).eq('alvo', 'fornecedor_unico').eq('fornecedor_alvo_id', loja.id).in('status', ['aberta', 'respondida']);
    if ((abertas || 0) >= MAX_ABERTAS_POR_PAR) return erro(409, 'LIMITE_PAR');

    const { data: nova, error } = await supabaseAdmin.from('cotacoes_pecas').insert({
      ...linha,
      oficina_id: of.id,
      quantidade,
      observacao: observacao || null,
      alvo: 'fornecedor_unico',
      fornecedor_alvo_tipo: 'loja',
      fornecedor_alvo_id: loja.id,
      enviar_placa: false,
      status: 'aberta',
      expira_em: new Date(Date.now() + 7 * 86400000).toISOString(),
    }).select('id').single();
    if (error || !nova) { console.error('[pecas/pedir]', error?.message); return erro(500, 'ERRO'); }

    const cot = await carregarCotacaoParaAviso(nova.id);
    if (cot) await avisarFornecedoresCotacao(cot).catch((e) => console.error('[pecas/pedir] aviso', (e as Error).message));
    return NextResponse.json({ cotacaoId: nova.id }, { headers: SEM_CACHE });
  } catch (err) {
    console.error('[pecas/pedir]', (err as Error).message);
    return erro(500, 'ERRO');
  }
}
