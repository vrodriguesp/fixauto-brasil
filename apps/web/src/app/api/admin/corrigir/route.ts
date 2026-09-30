import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { notifCorrecaoSuporte } from '@/lib/notif-i18n';
import { supabaseAdmin } from '@/lib/supabase-admin';


export const dynamic = 'force-dynamic';

// Correcao manual pelo admin de qualquer estado de um servico - para
// destravar ou consertar um caso que ficou errado. Como no PATCH de
// solicitacao, NAO dispara os efeitos dos fluxos automaticos (lancar
// comissao, criar agenda, avisar oficinas proximas...): so grava o novo
// estado, registra antes/depois/motivo em admin_auditoria e avisa cliente
// e oficina com uma notificacao generica.
//
// Body: { entidade, id, alteracoes, motivo, notificar? }
//   agenda         id = agenda.id       alteracoes { status?, data_inicio?, data_fim? }
//   etapa_add      id = agenda.id       alteracoes { status, observacao? }
//   etapa_remover  id = manutencao_etapas.id
//   orcamento      id = orcamentos.id   alteracoes { status }
//   emergencia     id = emergencias.id  alteracoes { status }
//   pedido_peca    id = pedidos_pecas.id alteracoes { status }

const STATUS = {
  agenda: ['agendado', 'em_andamento', 'concluido', 'cancelado'],
  etapa: ['recebido', 'diagnostico', 'aguardando_pecas', 'em_execucao', 'pausa_cliente', 'pausa_pecas', 'pausa_geral', 'teste_final', 'concluido', 'entregue'],
  orcamento: ['enviado', 'visualizado', 'aceito', 'recusado', 'expirado'],
  emergencia: ['aberta', 'em_orcamento', 'resolvida', 'cancelada'],
  pedido_peca: ['confirmado', 'entregue', 'cancelado'],
} as const;

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

function dataISO(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// Cliente da solicitacao + oficina dona do agendamento/orcamento
async function avisar(solicitacaoId: string | null, oficinaId: string | null, entidade: string) {
  const destinatarios: { id: string; idioma: string | null }[] = [];
  if (solicitacaoId) {
    const { data: sol } = await supabaseAdmin
      .from('solicitacoes')
      .select('cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(idioma)')
      .eq('id', solicitacaoId)
      .maybeSingle();
    if (sol?.cliente_id) destinatarios.push({ id: sol.cliente_id, idioma: (sol.cliente as any)?.idioma ?? null });
  }
  if (oficinaId) {
    const { data: ofi } = await supabaseAdmin
      .from('oficinas')
      .select('profile_id, profile:profiles!oficinas_profile_id_fkey(idioma)')
      .eq('id', oficinaId)
      .maybeSingle();
    if (ofi?.profile_id) destinatarios.push({ id: ofi.profile_id, idioma: (ofi.profile as any)?.idioma ?? null });
  }
  for (const d of destinatarios) {
    const n = notifCorrecaoSuporte(d.idioma, entidade);
    await supabaseAdmin.from('notificacoes').insert({
      profile_id: d.id,
      tipo: 'status_atualizado_admin',
      titulo: n.titulo,
      mensagem: n.mensagem,
      dados: { solicitacao_id: solicitacaoId, entidade },
    });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const adminId = auth.userId;

  try {
    const { entidade, id, alteracoes = {}, motivo, notificar = true } = await req.json();
    if (!entidade || !id) return erro('entidade e id são obrigatórios');
    if (typeof motivo !== 'string' || motivo.trim().length < 3) return erro('Informe o motivo da correção (fica no histórico)');

    if (entidade === 'agenda') {
      const { data: antes } = await supabaseAdmin
        .from('agenda')
        .select('id, status, data_inicio, data_fim, oficina_id, solicitacao_id')
        .eq('id', id)
        .maybeSingle();
      if (!antes) return erro('Agendamento não encontrado', 404);

      const upd: Record<string, string> = {};
      if (alteracoes.status !== undefined) {
        if (!(STATUS.agenda as readonly string[]).includes(alteracoes.status)) return erro('Status de agendamento inválido');
        upd.status = alteracoes.status;
      }
      if (alteracoes.data_inicio !== undefined) {
        const d = dataISO(alteracoes.data_inicio);
        if (!d) return erro('Data de início inválida');
        upd.data_inicio = d;
      }
      if (alteracoes.data_fim !== undefined) {
        const d = dataISO(alteracoes.data_fim);
        if (!d) return erro('Data de fim inválida');
        upd.data_fim = d;
      }
      if (Object.keys(upd).length === 0) return erro('Nada para alterar');
      const inicio = upd.data_inicio || antes.data_inicio;
      const fim = upd.data_fim || antes.data_fim;
      if (new Date(fim) <= new Date(inicio)) return erro('O fim precisa ser depois do início');

      const { error } = await supabaseAdmin.from('agenda').update(upd).eq('id', id);
      if (error) return erro(error.message, 500);
      await registrarAuditoria(supabaseAdmin, {
        adminId, entidade: 'agenda', entidadeId: id, acao: 'corrigir_agendamento',
        antes: { status: antes.status, data_inicio: antes.data_inicio, data_fim: antes.data_fim }, depois: upd,
        motivo, solicitacaoId: antes.solicitacao_id,
      });
      if (notificar) await avisar(antes.solicitacao_id, antes.oficina_id, 'agenda');
      return NextResponse.json({ ok: true });
    }

    if (entidade === 'etapa_add') {
      if (!(STATUS.etapa as readonly string[]).includes(alteracoes.status)) return erro('Etapa inválida');
      const { data: agenda } = await supabaseAdmin
        .from('agenda')
        .select('id, oficina_id, solicitacao_id')
        .eq('id', id)
        .maybeSingle();
      if (!agenda) return erro('Agendamento não encontrado', 404);
      const observacao = typeof alteracoes.observacao === 'string' && alteracoes.observacao.trim() ? alteracoes.observacao.trim() : null;
      const { data: nova, error } = await supabaseAdmin
        .from('manutencao_etapas')
        .insert({ agenda_id: id, status: alteracoes.status, observacao })
        .select('id')
        .single();
      if (error) return erro(error.message, 500);
      await registrarAuditoria(supabaseAdmin, {
        adminId, entidade: 'etapa', entidadeId: nova.id, acao: 'adicionar_etapa',
        depois: { agenda_id: id, status: alteracoes.status, observacao }, motivo, solicitacaoId: agenda.solicitacao_id,
      });
      if (notificar) await avisar(agenda.solicitacao_id, agenda.oficina_id, 'etapa');
      return NextResponse.json({ ok: true });
    }

    if (entidade === 'etapa_remover') {
      const { data: etapa } = await supabaseAdmin
        .from('manutencao_etapas')
        .select('*, agenda:agenda(oficina_id, solicitacao_id)')
        .eq('id', id)
        .maybeSingle();
      if (!etapa) return erro('Etapa não encontrada', 404);
      const { error } = await supabaseAdmin.from('manutencao_etapas').delete().eq('id', id);
      if (error) return erro(error.message, 500);
      const { agenda, ...copia } = etapa as any;
      await registrarAuditoria(supabaseAdmin, {
        adminId, entidade: 'etapa', entidadeId: id, acao: 'remover_etapa',
        antes: copia, motivo, solicitacaoId: agenda?.solicitacao_id ?? null,
      });
      if (notificar) await avisar(agenda?.solicitacao_id ?? null, agenda?.oficina_id ?? null, 'etapa');
      return NextResponse.json({ ok: true });
    }

    // Entidades em que so o status e corrigido
    const simples: Record<string, { tabela: string; lista: readonly string[]; campos: string }> = {
      orcamento: { tabela: 'orcamentos', lista: STATUS.orcamento, campos: 'id, status, oficina_id, solicitacao_id' },
      emergencia: { tabela: 'emergencias', lista: STATUS.emergencia, campos: 'id, status, solicitacao_id' },
      pedido_peca: { tabela: 'pedidos_pecas', lista: STATUS.pedido_peca, campos: 'id, status, oficina_id' },
    };
    const cfg = simples[entidade];
    if (!cfg) return erro('Entidade inválida');
    if (!cfg.lista.includes(alteracoes.status)) return erro('Status inválido');

    const { data: antes } = await supabaseAdmin.from(cfg.tabela).select(cfg.campos).eq('id', id).maybeSingle();
    if (!antes) return erro('Registro não encontrado', 404);
    const a = antes as any;
    if (a.status === alteracoes.status) return erro('O status já é esse');

    const { error } = await supabaseAdmin.from(cfg.tabela).update({ status: alteracoes.status }).eq('id', id);
    if (error) return erro(error.message, 500);
    await registrarAuditoria(supabaseAdmin, {
      adminId, entidade, entidadeId: id, acao: 'corrigir_status',
      antes: { status: a.status }, depois: { status: alteracoes.status }, motivo, solicitacaoId: a.solicitacao_id ?? null,
    });
    if (notificar && entidade === 'orcamento') await avisar(a.solicitacao_id, a.oficina_id, 'orcamento');
    if (notificar && entidade === 'pedido_peca') await avisar(null, a.oficina_id, 'pedido_peca');
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[admin/corrigir]', e);
    return erro('Erro ao aplicar a correção', 500);
  }
}
