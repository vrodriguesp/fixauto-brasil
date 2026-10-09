import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { entregarServico } from '@/lib/entrega';
import { iguaisSeguro } from '@/lib/segredos';

export const dynamic = 'force-dynamic';

const DIAS = 5;

// Carro "concluido" (cliente avisado para buscar) ha mais de 5 dias sem a
// oficina marcar a entrega: considerado entregue - fecha o servico, comeca a
// garantia, pede a avaliacao e lanca a comissao. Chamada de hora em hora
// pelo agendador do servidor (crontab), com a chave TAREFAS_CHAVE.
export async function POST(req: NextRequest) {
  const chave = process.env.TAREFAS_CHAVE;
  if (!chave || !iguaisSeguro(req.headers.get('x-tarefa-chave') || '', chave)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  const limite = new Date(Date.now() - DIAS * 86400000).toISOString();
  // so agendas em servico que tem etapa "concluido" antiga (filtro no banco - B-05)
  const { data: candidatas } = await supabaseAdmin.from('manutencao_etapas')
    .select('agenda_id').eq('status', 'concluido').lt('created_at', limite).limit(500);
  const ids = Array.from(new Set((candidatas || []).map((c: any) => c.agenda_id)));
  const { data: abertos } = ids.length ? await supabaseAdmin.from('agenda')
    .select('id, oficina_id, solicitacao_id, oficina:oficinas(nome_fantasia), etapas:manutencao_etapas(status, created_at)')
    .in('id', ids).eq('status', 'em_andamento') : { data: [] as any[] };
  const entregues: string[] = [];
  for (const ev of (abertos || []) as any[]) {
    const ultima = [...(ev.etapas || [])].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0];
    if (!ultima || ultima.status !== 'concluido' || ultima.created_at > limite) continue;
    if (await entregarServico({ eventoId: ev.id, solicitacaoId: ev.solicitacao_id, oficinaDoEvento: ev.oficina_id, oficinaNome: ev.oficina?.nome_fantasia || '', callerId: null, automatica: true })) entregues.push(ev.id);
  }
  return NextResponse.json({ ok: true, entregues: entregues.length });
}
