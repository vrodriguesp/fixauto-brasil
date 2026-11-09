import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehUuid } from '@/lib/validacao';
import { agendaDaOficina, motivoValido, MOTIVO_MIN, avisarNoChatENotificar } from '@/lib/agenda-oficina';

import { cancelarAgendamento } from '@/lib/mudanca-data';

export const dynamic = 'force-dynamic';

// A oficina cancela o agendamento de um carro de pedido antes do check-in
// (dono 07/11), com justificativa. O pedido volta a ficar aberto para o
// cliente escolher outra oficina: os orcamentos das outras, recusados no
// aceite e ainda validos, voltam a aparecer. O cliente recebe e-mail com o
// motivo (e o .ics que tira o evento do calendario), aviso e linha no chat.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const motivo = motivoValido(b?.motivo);
  if (!ehUuid(params.id) || motivo.length < MOTIVO_MIN) return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  const r = await agendaDaOficina(params.id, userId);
  if ('erro' in r) return NextResponse.json({ error: 'Não permitido', codigo: r.erro === 409 ? 'NAO_AGENDADO' : undefined }, { status: r.erro });
  const { ag, of } = r;

  // mesma rotina do cancelamento pelo cliente (lib/mudanca-data.ts): pedido aberto de novo,
  // orcamentos recusados no aceite voltam, proposta de data pendente cai
  const c = await cancelarAgendamento(ag, of, userId, motivo, false);
  if (!c.ok) return NextResponse.json({ error: 'Carro já na oficina', codigo: 'NAO_AGENDADO' }, { status: 409 });

  await avisarNoChatENotificar({
    solicitacaoId: ag.solicitacao_id, oficinaId: ag.oficina_id, remetenteId: userId, idiomaOficina: of?.profile?.idioma, pais: of?.pais,
    oficinaNome: of?.nome_fantasia || '', chave: 'chatCancelado', motivo,
    notif: { tipo: 'agendamento_cancelado_oficina', tituloChave: 'canceladoTitulo', msgChave: 'canceladoMsg' },
  }).catch((e) => console.error('[agenda/cancelar] aviso', e));
  return NextResponse.json({ ok: true, orcamentosDeVolta: c.orcamentosDeVolta, emailEnviado: c.emailEnviado });
}
