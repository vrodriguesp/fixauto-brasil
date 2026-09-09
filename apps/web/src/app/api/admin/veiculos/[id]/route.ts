import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Historico completo de intervencoes de um veiculo, atravessando todas as
// oficinas que ja atenderam ele (nao so uma) - visao que nenhuma oficina
// individual tem, pensada pro admin auditar o carro como um todo.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { data: veiculo, error } = await supabaseAdmin
      .from('veiculos')
      .select('*, dono:profiles(id, nome, email, telefone, created_at)')
      .eq('id', params.id)
      .single();

    if (error || !veiculo) {
      return NextResponse.json({ error: 'Veículo não encontrado' }, { status: 404 });
    }

    const { data: solicitacoes } = await supabaseAdmin
      .from('solicitacoes')
      .select(
        `*, orcamentos(id, status, valor_total, oficina:oficinas(nome_fantasia)),
         avaliacao:avaliacoes(nota, comentario)`
      )
      .eq('veiculo_id', params.id)
      .order('created_at', { ascending: false });

    const solicitacaoIds = (solicitacoes || []).map((s) => s.id);
    const { data: agendaRows } = solicitacaoIds.length
      ? await supabaseAdmin
          .from('agenda')
          .select('*, oficina:oficinas(nome_fantasia)')
          .in('solicitacao_id', solicitacaoIds)
      : { data: [] as any[] };

    let notasInternas: any[] = [];
    const agendaIds = (agendaRows || []).map((a: any) => a.id);
    if (agendaIds.length > 0) {
      const { data: notasData } = await supabaseAdmin
        .from('veiculo_notas_internas')
        .select('*, remetente:profiles(nome), agenda:agenda(oficina_id, oficina:oficinas(nome_fantasia))')
        .in('agenda_id', agendaIds)
        .order('created_at', { ascending: true });
      notasInternas = notasData || [];
    }

    // Outras oficinas por onde esse veiculo passou (cross-oficina, o dado
    // que nenhuma oficina individual consegue ver sozinha).
    const oficinasQuePassou = Array.from(
      new Map(
        (solicitacoes || [])
          .flatMap((s: any) => s.orcamentos || [])
          .filter((o: any) => o.status === 'aceito' && o.oficina)
          .map((o: any) => [o.oficina.nome_fantasia, o.oficina.nome_fantasia])
      ).values()
    );

    return NextResponse.json({
      veiculo,
      solicitacoes: solicitacoes || [],
      agenda: agendaRows || [],
      notasInternas,
      oficinasQuePassou,
    });
  } catch (error) {
    console.error('[admin/veiculos/:id]', error);
    return NextResponse.json({ error: 'Erro ao carregar veículo' }, { status: 500 });
  }
}
