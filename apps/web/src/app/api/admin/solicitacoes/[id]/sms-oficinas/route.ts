import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehUuid } from '@/lib/validacao';
import { umDeCadaVez } from '@/lib/triagem-pedido';
import { smsModoPasta } from '@/lib/notifications';
import { enviarSmsOficinas, oficinasAvisadasSms, textoSmsOficina, SMS_OFICINA_JANELA_H } from '@/lib/sms-oficinas';

export const dynamic = 'force-dynamic';

// "Oficinas avisadas" do detalhe do pedido no admin (dono 20/11): GET lista quem foi avisado e o estado
// de cada uma; POST { oficinaIds, modo } manda o SMS com o link do pedido. So admin; o telefone nunca sai
// daqui (so os 3 ultimos digitos). Regras e texto em lib/sms-oficinas.ts.

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  if (!ehUuid(params.id)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  const r = await oficinasAvisadasSms(params.id);
  if (!r) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });
  return NextResponse.json({
    numero: r.pedido.numero, status: r.pedido.status, janelaHoras: SMS_OFICINA_JANELA_H,
    configurado: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) || smsModoPasta(),
    // previa do texto exato que sai (idioma da oficina, link neutro)
    oficinas: r.oficinas.map((o) => ({ ...o, texto: textoSmsOficina(r.pedido.numero ?? '', o.idioma) })),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  if (!ehUuid(params.id)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  const corpo = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(corpo?.oficinaIds) ? corpo.oficinaIds.filter((x: unknown) => typeof x === 'string' && ehUuid(x)) : [];
  if (!ids.length || ids.length > 100) return NextResponse.json({ error: 'Escolha de 1 a 100 oficinas' }, { status: 400 });
  const modo = corpo?.modo === 'nao_abriu' ? 'nao_abriu' : 'uma';
  if (modo === 'uma' && ids.length !== 1) return NextResponse.json({ error: 'Envio individual: uma oficina' }, { status: 400 });
  // um envio por pedido de cada vez: dois cliques nao passam juntos pela trava das 12 h
  return umDeCadaVez(`sms-oficinas:${params.id}`, async () => {
    const r = await enviarSmsOficinas({ solicitacaoId: params.id, oficinaIds: ids, modo, adminId: auth.userId });
    if (!r) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });
    await registrarAuditoria(supabaseAdmin, {
      adminId: auth.userId, entidade: 'solicitacao', entidadeId: params.id, solicitacaoId: params.id,
      acao: 'sms_oficinas', depois: { modo, resultados: r.resultados.map(({ oficina_id, status, motivo }) => ({ oficina_id, status, motivo })) },
    });
    return NextResponse.json(r);
  });
}
