import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';
import { STATUS_SOLICITACAO } from '@fixauto/shared';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Bundle completo de uma solicitacao pro admin auditar: cliente, veiculo,
// fotos, todos os orcamentos (com itens), o chat inteiro (mensagens),
// avaliacao, analise de dano por IA, emergencia vinculada (se veio do fluxo
// "Acabei de bater") e o acompanhamento de manutencao (agenda + etapas +
// notas internas da equipe da oficina - normalmente invisiveis ao cliente).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { data: solicitacao, error } = await supabaseAdmin
      .from('solicitacoes')
      .select(
        `*,
         cliente:profiles!solicitacoes_cliente_id_fkey(id, nome, email, telefone, created_at),
         veiculo:veiculos(*)`
      )
      .eq('id', params.id)
      .single();

    if (error || !solicitacao) {
      return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });
    }

    const [
      { data: fotos },
      { data: orcamentos },
      { data: mensagens },
      { data: avaliacao },
      { data: analiseDano },
      { data: emergencia },
      { data: agendaRows },
    ] = await Promise.all([
      supabaseAdmin.from('solicitacao_fotos').select('*').eq('solicitacao_id', params.id),
      supabaseAdmin
        .from('orcamentos')
        .select('*, itens:orcamento_itens(*), oficina:oficinas(id, nome_fantasia, cidade, estado, profile_id)')
        .eq('solicitacao_id', params.id)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('mensagens')
        .select('*, remetente:profiles(nome, tipo)')
        .eq('solicitacao_id', params.id)
        .order('created_at', { ascending: true }),
      supabaseAdmin.from('avaliacoes').select('*').eq('solicitacao_id', params.id).maybeSingle(),
      supabaseAdmin.from('analise_dano').select('*').eq('solicitacao_id', params.id).maybeSingle(),
      solicitacao.emergencia_id
        ? supabaseAdmin.from('emergencias').select('*').eq('id', solicitacao.emergencia_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin
        .from('agenda')
        .select('*, funcionario:funcionarios(id, profile_id, cargo, profile:profiles(nome))')
        .eq('solicitacao_id', params.id),
    ]);

    let etapas: any[] = [];
    let notasInternas: any[] = [];
    const agendaIds = (agendaRows || []).map((a: any) => a.id);
    if (agendaIds.length > 0) {
      const [{ data: etapasData }, { data: notasData }] = await Promise.all([
        supabaseAdmin
          .from('manutencao_etapas')
          .select('*, funcionario:funcionarios(profile:profiles(nome))')
          .in('agenda_id', agendaIds)
          .order('created_at', { ascending: true }),
        supabaseAdmin
          .from('veiculo_notas_internas')
          .select('*, remetente:profiles(nome)')
          .in('agenda_id', agendaIds)
          .order('created_at', { ascending: true }),
      ]);
      etapas = etapasData || [];
      notasInternas = notasData || [];
    }

    return NextResponse.json({
      solicitacao,
      fotos: fotos || [],
      orcamentos: orcamentos || [],
      mensagens: mensagens || [],
      avaliacao: avaliacao || null,
      analiseDano: analiseDano || null,
      emergencia: emergencia || null,
      agenda: agendaRows || [],
      etapas,
      notasInternas,
    });
  } catch (error) {
    console.error('[admin/solicitacoes/:id]', error);
    return NextResponse.json({ error: 'Erro ao carregar solicitação' }, { status: 500 });
  }
}

// Permite ao admin corrigir manualmente o status de uma solicitacao (ex:
// destravar um caso preso, ou cancelar em nome do cliente/oficina). Nao
// dispara os efeitos colaterais dos fluxos automaticos especificos (como
// no-show ou aceite de orcamento) - so troca o status e avisa as partes
// envolvidas via notificacao in-app.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { status } = await req.json();
    if (!status || !(status in STATUS_SOLICITACAO)) {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
    }

    const { data: solicitacao, error: fetchError } = await supabaseAdmin
      .from('solicitacoes')
      .select('cliente_id, status')
      .eq('id', params.id)
      .single();

    if (fetchError || !solicitacao) {
      return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from('solicitacoes')
      .update({ status })
      .eq('id', params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const label = STATUS_SOLICITACAO[status as keyof typeof STATUS_SOLICITACAO]?.label || status;

    if (solicitacao.cliente_id) {
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: solicitacao.cliente_id,
        tipo: 'status_atualizado_admin',
        titulo: 'Status da solicitação atualizado',
        mensagem: `Nossa equipe atualizou o status da sua solicitação para: ${label}.`,
        dados: { solicitacao_id: params.id, status_anterior: solicitacao.status, status_novo: status },
      });
    }

    const { data: oficinaProfiles } = await supabaseAdmin
      .from('orcamentos')
      .select('oficina:oficinas(profile_id)')
      .eq('solicitacao_id', params.id)
      .eq('status', 'aceito');

    for (const row of oficinaProfiles || []) {
      const profileId = (row as any).oficina?.profile_id;
      if (profileId) {
        await supabaseAdmin.from('notificacoes').insert({
          profile_id: profileId,
          tipo: 'status_atualizado_admin',
          titulo: 'Status da solicitação atualizado',
          mensagem: `Nossa equipe atualizou o status de uma solicitação para: ${label}.`,
          dados: { solicitacao_id: params.id, status_anterior: solicitacao.status, status_novo: status },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[admin/solicitacoes/:id PATCH]', error);
    return NextResponse.json({ error: 'Erro ao atualizar solicitação' }, { status: 500 });
  }
}
