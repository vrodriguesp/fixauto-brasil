import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { oficinasDoUsuario } from '@/lib/acesso-servico';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { TETO_REABERTURAS, VALIDADE_COTACAO_DIAS } from '@/lib/pecas-formato';
import { avisarFornecedoresCotacao, carregarCotacaoParaAviso } from '@/lib/avisar-fornecedores-cotacao';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lote 1 de pecas (17/11): a compradora reabre uma cotacao vencida ('expirada', gravada
// pela tarefa horaria) por mais 7 dias, ate 3 vezes. Volta a 'respondida' se ja tem
// oferta, senao a 'aberta'. O status so muda pelo servidor (trigger da 091), por isso a rota.
// Lote 2: re-avisa quem nao respondeu nem dispensou (antes ela so voltava as listas).
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    if (!dentroDoLimite(`reabrir-peca-u:${userId}`, 30, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
    }
    const { cotacaoId } = await req.json().catch(() => ({}));
    if (typeof cotacaoId !== 'string' || !UUID.test(cotacaoId)) return NextResponse.json({ error: 'cotacaoId obrigatório' }, { status: 400 });

    const { data: cot } = await supabaseAdmin.from('cotacoes_pecas').select('id, oficina_id, status, reaberta_vezes').eq('id', cotacaoId).maybeSingle();
    if (!cot) return NextResponse.json({ error: 'Cotação não encontrada', codigo: 'NAO_ENCONTRADA' }, { status: 404 });
    // dona ou equipe; conferido antes do status (quem nao e dona nao fica sabendo do estado)
    if (!(await oficinasDoUsuario(userId)).includes(cot.oficina_id)) {
      return NextResponse.json({ error: 'Acesso negado', codigo: 'SEM_ACESSO' }, { status: 403 });
    }
    if (String(cot.status) !== 'expirada') return NextResponse.json({ error: 'A cotação não está vencida', codigo: 'NAO_EXPIRADA' }, { status: 409 });
    const vezes = Number(cot.reaberta_vezes) || 0;
    if (vezes >= TETO_REABERTURAS) return NextResponse.json({ error: 'Limite de reaberturas', codigo: 'TETO_REABERTURAS' }, { status: 409 });

    const { count } = await supabaseAdmin.from('cotacoes_pecas_respostas').select('id', { count: 'exact', head: true }).eq('cotacao_id', cot.id);
    const status = count ? 'respondida' : 'aberta';
    const expiraEm = new Date(Date.now() + VALIDADE_COTACAO_DIAS * 86400000).toISOString();
    // so troca se ainda estiver vencida e com a mesma contagem (duas abas reabrindo juntas)
    const { data: mudou, error } = await supabaseAdmin
      .from('cotacoes_pecas')
      .update({ status, expira_em: expiraEm, reaberta_vezes: vezes + 1 })
      .eq('id', cot.id)
      .eq('status', 'expirada')
      .eq('reaberta_vezes', vezes)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!mudou?.length) return NextResponse.json({ error: 'A cotação não está vencida', codigo: 'NAO_EXPIRADA' }, { status: 409 });
    // lote 2: re-aviso so a quem nao respondeu nem disse "nao tenho" (sino com dados.reaberta,
    // e-mail conforme a urgencia: imediato com token novo ou fila do resumo)
    let avisados = 0;
    const atual = await carregarCotacaoParaAviso(cot.id);
    if (atual) {
      const r = await avisarFornecedoresCotacao(atual, vezes + 1).catch((e) => { console.error('[reabrir] re-aviso:', (e as Error).message); return null; });
      if (r && !('erro' in r)) avisados = r.lojasNotificadas + r.oficinasNotificadas;
    }
    return NextResponse.json({ success: true, status, expiraEm, reabertaVezes: vezes + 1, avisados });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
