import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { dentroDoLimite } from '@/lib/rate-limit';
import { ehUuid } from '@/lib/validacao';
import { horaLocalEmUtc, fusoDoPais } from '@/lib/fuso';
import { textosAgenda, preencher, dataHora } from '@/lib/notif-agenda';

export const dynamic = 'force-dynamic';

// A oficina PROPOE uma nova data de entrega pelo orcamento aceito, antes do
// check-in, com justificativa (dono 07/11; migracao 076, revisao tipo 'data').
// Nada muda ate o cliente decidir (rota /decidir): aceitar = a agenda passa a
// nova data; recusar = fica a data atual e o servico continua.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!dentroDoLimite(`revisao:${userId}`, 20, 60 * 60 * 1000)) return NextResponse.json({ error: 'Muitas requisições', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const motivo = typeof b?.motivo === 'string' ? b.motivo.trim().slice(0, 1000) : '';
  const data = String(b?.data || ''), turno = b?.turno, previsao = b?.previsao ? String(b.previsao) : null;
  if (!ehUuid(b?.orcamentoId) || motivo.length < 5 || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !['manha', 'tarde'].includes(turno)
      || (previsao && (!/^\d{4}-\d{2}-\d{2}$/.test(previsao) || previsao < data))) {
    return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  }
  const { data: orc } = await supabaseAdmin.from('orcamentos')
    .select('id, status, valor_total, revisao_numero, solicitacao_id, oficina_id, oficina:oficinas(profile_id, nome_fantasia, pais, profile:profiles!oficinas_profile_id_fkey(idioma)), solicitacao:solicitacoes(cliente_id, status, cliente:profiles!solicitacoes_cliente_id_fkey(idioma))')
    .eq('id', b.orcamentoId).maybeSingle();
  if (!orc) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const of = (orc as any).oficina;
  let pode = of?.profile_id === userId;
  if (!pode) {
    const { data: f } = await supabaseAdmin.from('funcionarios').select('cargo').eq('oficina_id', orc.oficina_id).eq('profile_id', userId).eq('ativo', true).maybeSingle();
    pode = !!f && f.cargo !== 'mecanico';
  }
  if (!pode) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  if (orc.status !== 'aceito') return NextResponse.json({ error: 'Orçamento não está aceito', codigo: 'ORCAMENTO_INDISPONIVEL' }, { status: 409 });
  // so antes do check-in: carro ainda nao chegou
  const { data: ag } = await supabaseAdmin.from('agenda').select('id, data_inicio').eq('solicitacao_id', orc.solicitacao_id).eq('oficina_id', orc.oficina_id).eq('status', 'agendado').maybeSingle();
  if (!ag) return NextResponse.json({ error: 'Carro já na oficina', codigo: 'NAO_AGENDADO' }, { status: 409 });
  const inicio = horaLocalEmUtc(data, turno === 'manha' ? '08:00' : '13:00', of?.pais);
  if (new Date(inicio).getTime() < Date.now()) return NextResponse.json({ error: 'Data no passado', codigo: 'HORARIO_VENCIDO' }, { status: 409 });
  if (new Date(inicio).getTime() === new Date(ag.data_inicio).getTime()) return NextResponse.json({ error: 'Mesma data', codigo: 'REVISAO_SEM_MUDANCA' }, { status: 400 });

  const { data: rev, error } = await supabaseAdmin.from('orcamento_revisoes').insert({
    tipo: 'data', orcamento_id: orc.id, solicitacao_id: orc.solicitacao_id, oficina_id: orc.oficina_id,
    numero: (orc.revisao_numero || 0) + 1, valor_anterior: orc.valor_total, valor_novo: orc.valor_total, itens: [],
    nova_data_checkin: data, novo_turno: turno, nova_previsao_entrega: previsao, motivo, criado_por: userId,
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Já existe uma revisão pendente', codigo: 'REVISAO_PENDENTE' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const sol = (orc as any).solicitacao;
  const fuso = fusoDoPais(of?.pais);
  const tCli = textosAgenda(sol?.cliente?.idioma);
  await supabaseAdmin.from('notificacoes').insert({
    profile_id: sol.cliente_id, tipo: 'revisao_orcamento', titulo: tCli.propostaTitulo,
    mensagem: preencher(tCli.propostaMsg, { oficina: of?.nome_fantasia || '', quando: dataHora(inicio, sol?.cliente?.idioma, fuso), motivo }),
    dados: { solicitacao_id: orc.solicitacao_id, orcamento_id: orc.id, revisao_id: rev.id },
  });
  const tOf = textosAgenda(of?.profile?.idioma);
  await supabaseAdmin.from('mensagens').insert({
    solicitacao_id: orc.solicitacao_id, oficina_id: orc.oficina_id, remetente_id: userId,
    texto: preencher(tOf.chatProposta, { quando: dataHora(inicio, of?.profile?.idioma, fuso), motivo }),
  });
  return NextResponse.json({ ok: true, revisaoId: rev.id });
}
