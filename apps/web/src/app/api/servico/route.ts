import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { notifCarroChegou, notifEtapa } from '@/lib/notif-servico';

export const dynamic = 'force-dynamic';

const ETAPAS = ['recebido', 'diagnostico', 'aguardando_pecas', 'em_execucao', 'pausa_cliente', 'pausa_pecas', 'pausa_geral', 'teste_final', 'concluido', 'entregue'];

// Andamento do servico na oficina (check-in, etapas, mecanico). Antes cada
// tela gravava direto no banco: o pedido do cliente nao mudava para "em
// andamento" no check-in, o cliente nao era avisado das etapas, e nao ficava
// historico de quem atribuiu/trocou o mecanico. Agora tudo passa aqui:
// - quem pode: o dono da oficina (todas as acoes, inclusive em nome de um
//   mecanico) ou um mecanico com acesso ao portal (check-in e etapas);
// - check-in de agendamento futuro so com confirmacao (antecipar: true),
//   e a data de entrada passa a ser agora;
// - funciona sem nenhum mecanico cadastrado.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  const { acao, eventoId, status, observacao, funcionarioId, antecipar } = corpo as Record<string, any>;
  if (!['checkin', 'etapa', 'atribuir'].includes(acao) || typeof eventoId !== 'string') {
    return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  }

  const { data: ev } = await supabaseAdmin
    .from('agenda')
    .select('id, oficina_id, solicitacao_id, status, data_inicio, data_fim, funcionario_id, titulo, oficina:oficinas(profile_id, nome_fantasia)')
    .eq('id', eventoId)
    .maybeSingle();
  if (!ev) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const ehDono = (ev as any).oficina?.profile_id === userId;
  const { data: euFunc } = await supabaseAdmin.from('funcionarios').select('id')
    .eq('oficina_id', ev.oficina_id).eq('profile_id', userId).eq('ativo', true).maybeSingle();
  if (!ehDono && !euFunc) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  if (acao === 'atribuir' && !ehDono) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  // mecanico em nome de quem a acao e feita: o dono escolhe qualquer um da
  // equipe (ou nenhum); o mecanico logado e sempre ele mesmo
  let funcId: string | null = euFunc && !ehDono ? euFunc.id : null;
  if (ehDono && funcionarioId) {
    const { data: f } = await supabaseAdmin.from('funcionarios').select('id').eq('id', funcionarioId).eq('oficina_id', ev.oficina_id).maybeSingle();
    if (!f) return NextResponse.json({ error: 'Mecânico inválido' }, { status: 400 });
    funcId = f.id;
  }
  const historico = (acaoH: string, detalhe: Record<string, unknown> = {}) =>
    supabaseAdmin.from('agenda_historico').insert({ agenda_id: ev.id, acao: acaoH, funcionario_id: funcId, por_profile_id: userId, detalhe });

  // cliente do pedido (so servicos vindos da plataforma)
  const avisarCliente = async (montar: (idioma: string | null, carro: string) => { titulo: string; mensagem: string }) => {
    if (!ev.solicitacao_id) return;
    const { data: sol } = await supabaseAdmin.from('solicitacoes')
      .select('cliente_id, veiculo:veiculos(fipe_marca, fipe_modelo), cliente:profiles!solicitacoes_cliente_id_fkey(idioma)')
      .eq('id', ev.solicitacao_id).maybeSingle();
    if (!sol?.cliente_id) return;
    const v = (sol as any).veiculo;
    const carro = v?.fipe_marca ? `${v.fipe_marca} ${v.fipe_modelo}` : '';
    const n = montar((sol as any).cliente?.idioma, carro);
    await supabaseAdmin.from('notificacoes').insert({
      profile_id: sol.cliente_id, tipo: 'servico_atualizado', titulo: n.titulo, mensagem: n.mensagem,
      dados: { solicitacao_id: ev.solicitacao_id },
    });
  };

  if (acao === 'checkin') {
    if (ev.status !== 'agendado') return NextResponse.json({ error: 'Check-in já feito', codigo: 'CHECKIN_JA_FEITO' }, { status: 409 });
    const futuro = new Date(ev.data_inicio).getTime() > Date.now();
    if (futuro && !antecipar) {
      return NextResponse.json({ error: 'Agendado para outra data', codigo: 'CHECKIN_FUTURO', dataAgendada: ev.data_inicio }, { status: 409 });
    }
    const agora = new Date();
    const mudancas: Record<string, unknown> = { status: 'em_andamento' };
    if (futuro) {
      // carro chegou antes: a entrada passa a ser agora; a entrega prevista fica
      mudancas.data_inicio = agora.toISOString();
    }
    if (funcId) mudancas.funcionario_id = funcId;
    await supabaseAdmin.from('agenda').update(mudancas).eq('id', ev.id);
    await supabaseAdmin.from('manutencao_etapas').insert({
      agenda_id: ev.id, funcionario_id: funcId, status: 'recebido', observacao: typeof observacao === 'string' ? observacao.slice(0, 500) || null : null,
    });
    await historico(futuro ? 'checkin_antecipado' : 'checkin', futuro ? { data_agendada: ev.data_inicio } : {});
    if (ev.solicitacao_id) {
      // o cliente passa a ver "em andamento" (antes ficava "aceita")
      await supabaseAdmin.from('solicitacoes').update({ status: 'em_andamento' }).eq('id', ev.solicitacao_id).in('status', ['aceita', 'em_orcamento', 'aberta']);
    }
    await avisarCliente((idioma, carro) => notifCarroChegou(idioma, { oficina: (ev as any).oficina?.nome_fantasia || '', carro }));
    return NextResponse.json({ ok: true });
  }

  if (acao === 'etapa') {
    if (!ETAPAS.includes(status)) return NextResponse.json({ error: 'Etapa inválida', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
    if (ev.status !== 'em_andamento') return NextResponse.json({ error: 'Faça o check-in antes', codigo: 'SEM_CHECKIN' }, { status: 409 });
    await supabaseAdmin.from('manutencao_etapas').insert({
      agenda_id: ev.id, funcionario_id: funcId, status, observacao: typeof observacao === 'string' ? observacao.slice(0, 500) || null : null,
    });
    await historico('etapa', { status });
    await avisarCliente((idioma, carro) => notifEtapa(idioma, { carro, status }));
    return NextResponse.json({ ok: true });
  }

  // atribuir (ou tirar) o mecanico responsavel
  await supabaseAdmin.from('agenda').update({ funcionario_id: funcId }).eq('id', ev.id);
  await historico('atribuido', { anterior: ev.funcionario_id });
  return NextResponse.json({ ok: true });
}
