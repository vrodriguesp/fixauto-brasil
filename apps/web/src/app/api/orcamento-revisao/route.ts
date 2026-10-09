import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { dentroDoLimite } from '@/lib/rate-limit';
import { ehUuid } from '@/lib/validacao';
import { formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { notifRevisaoProposta } from '@/lib/notif-revisao';

export const dynamic = 'force-dynamic';

const TIPOS_ITEM = ['mao_de_obra', 'peca', 'material', 'outro'];

// A oficina PROPOE a revisao de um orcamento ja aceito (ver migracao 049).
// O orcamento aceito so muda quando o cliente aprovar (rota /decidir).
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!dentroDoLimite(`revisao:${userId}`, 20, 60 * 60 * 1000)) return NextResponse.json({ error: 'Muitas requisições', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });

  const corpo = await req.json().catch(() => ({}));
  const { orcamentoId, motivo, prazoDias } = corpo as { orcamentoId?: string; motivo?: string; prazoDias?: number };
  const itensBrutos = Array.isArray(corpo.itens) ? corpo.itens.slice(0, 60) : [];
  const motivoLimpo = typeof motivo === 'string' ? motivo.trim().slice(0, 1000) : '';
  if (!ehUuid(orcamentoId) || motivoLimpo.length < 5 || !itensBrutos.length) {
    return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  }
  const itens = itensBrutos.map((i: any) => ({
    descricao: String(i?.descricao || '').trim().slice(0, 200),
    tipo: TIPOS_ITEM.includes(i?.tipo) ? i.tipo : 'outro',
    quantidade: Math.max(1, Math.min(999, Math.round(Number(i?.quantidade) || 1))),
    valor_unitario: Math.max(0, Math.round((Number(i?.valor_unitario) || 0) * 100) / 100),
  })).filter((i: any) => i.descricao).map((i: any) => ({ ...i, valor_total: Math.round(i.quantidade * i.valor_unitario * 100) / 100 }));
  if (!itens.length) return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  const valorNovo = Math.round(itens.reduce((s: number, i: any) => s + i.valor_total, 0) * 100) / 100;

  const { data: orc } = await supabaseAdmin.from('orcamentos')
    .select('id, status, valor_total, revisao_numero, solicitacao_id, oficina_id, oficina:oficinas(profile_id, nome_fantasia, pais), solicitacao:solicitacoes(cliente_id, status, cliente:profiles!solicitacoes_cliente_id_fkey(idioma))')
    .eq('id', orcamentoId).maybeSingle();
  if (!orc) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const of = (orc as any).oficina;
  const ehDono = of?.profile_id === userId;
  const { data: func } = ehDono ? { data: null } : await supabaseAdmin.from('funcionarios').select('id').eq('oficina_id', orc.oficina_id).eq('profile_id', userId).eq('ativo', true).maybeSingle();
  if (!ehDono && !func) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  // so orcamento aceito com o carro agendado ou na oficina
  if (orc.status !== 'aceito') return NextResponse.json({ error: 'Orçamento não está aceito', codigo: 'ORCAMENTO_INDISPONIVEL' }, { status: 409 });
  const { data: agenda } = await supabaseAdmin.from('agenda').select('id').eq('solicitacao_id', orc.solicitacao_id).eq('oficina_id', orc.oficina_id).in('status', ['agendado', 'em_andamento']).limit(1);
  if (!agenda?.length) return NextResponse.json({ error: 'Serviço não está ativo', codigo: 'NAO_EM_SERVICO' }, { status: 409 });
  if (valorNovo === Number(orc.valor_total)) return NextResponse.json({ error: 'Mesmo valor', codigo: 'REVISAO_SEM_MUDANCA' }, { status: 400 });

  const { data: rev, error } = await supabaseAdmin.from('orcamento_revisoes').insert({
    orcamento_id: orc.id, solicitacao_id: orc.solicitacao_id, oficina_id: orc.oficina_id,
    numero: (orc.revisao_numero || 0) + 1, valor_anterior: orc.valor_total, valor_novo: valorNovo,
    prazo_dias_novo: Number.isFinite(Number(prazoDias)) && Number(prazoDias) > 0 ? Math.min(365, Math.round(Number(prazoDias))) : null,
    itens, motivo: motivoLimpo, criado_por: userId,
  }).select('id').single();
  if (error) {
    // indice unico: ja existe uma proposta esperando o cliente
    if (error.code === '23505') return NextResponse.json({ error: 'Já existe uma revisão pendente', codigo: 'REVISAO_PENDENTE' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sol = (orc as any).solicitacao;
  const moeda = currencyForCountry(of?.pais);
  const fmt = (v: number) => formatCurrency(v, moeda, sol?.cliente?.idioma || 'en');
  const n = notifRevisaoProposta(sol?.cliente?.idioma, { oficina: of?.nome_fantasia || '', de: fmt(Number(orc.valor_total)), para: fmt(valorNovo), motivo: motivoLimpo });
  await supabaseAdmin.from('notificacoes').insert({
    profile_id: sol.cliente_id, tipo: 'revisao_orcamento', titulo: n.titulo, mensagem: n.mensagem,
    dados: { solicitacao_id: orc.solicitacao_id, orcamento_id: orc.id, revisao_id: rev.id },
  });
  return NextResponse.json({ ok: true, revisaoId: rev.id });
}
