import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { entregarServico } from '@/lib/entrega';

export async function POST(req: NextRequest) {
  try {
    const callerId = await getSessionUserId(req);
    if (!callerId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { eventoId } = await req.json();
    if (!eventoId) {
      return NextResponse.json({ error: 'eventoId obrigatório' }, { status: 400 });
    }

    // So a oficina dona do evento de agenda pode confirmar a entrega -
    // sem isso, qualquer eventoId adivinhado concluia a solicitacao de
    // outra oficina e lancava comissao contra ela indevidamente.
    const { data: evento } = await supabaseAdmin
      .from('agenda')
      .select('oficina_id, solicitacao_id, oficina:oficinas(profile_id, nome_fantasia)')
      .eq('id', eventoId)
      .single();
    if (!evento || (evento as any).oficina?.profile_id !== callerId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    const oficinaNome = (evento as any).oficina?.nome_fantasia || 'a oficina';
    // O pedido vem do PROPRIO evento, nunca do corpo da requisicao: senao uma
    // oficina podia mandar o id de um pedido de outra e conclui-lo/gerar
    // comissao nele. Check-in manual (tipo 'externo') nao tem pedido, entao
    // nunca gera comissao.
    const solicitacaoId: string | null = (evento as any).solicitacao_id || null;
    const oficinaDoEvento: string = (evento as any).oficina_id;

    await entregarServico({ eventoId, solicitacaoId, oficinaDoEvento, oficinaNome, callerId });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
