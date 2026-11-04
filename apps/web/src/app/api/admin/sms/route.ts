import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { avisarOrcamentoPorSms, saldoTwilio, smsAtivo } from '@/lib/sms';

// SMS ao cliente, lado do admin (dono 04/11): interruptor do envio automatico,
// envio manual pelo numero do pedido (so o aviso "chegou orcamento") e registro.

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const [ativo, saldo, { data: envios }] = await Promise.all([
    smsAtivo(),
    saldoTwilio(),
    supabaseAdmin.from('sms_envios')
      .select('id, tipo, status, motivo, telefone_final, created_at, solicitacao:solicitacoes(numero), profile:profiles!sms_envios_profile_id_fkey(nome)')
      .order('created_at', { ascending: false }).limit(50),
  ]);
  return NextResponse.json({
    ativo, saldo, configurado: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    envios: (envios || []).map((e: any) => ({
      id: e.id, tipo: e.tipo, status: e.status, motivo: e.motivo, final: e.telefone_final, quando: e.created_at,
      numero: e.solicitacao?.numero ?? null, cliente: e.profile?.nome ?? null,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const corpo = await req.json().catch(() => ({}));
  if (typeof corpo.ativo !== 'boolean') return NextResponse.json({ error: 'ativo deve ser true/false' }, { status: 400 });
  const antes = await smsAtivo();
  const { error } = await supabaseAdmin.from('plataforma_config').upsert({ id: 1, sms_ativo: corpo.ativo, updated_by: auth.userId, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await registrarAuditoria(supabaseAdmin, { adminId: auth.userId, entidade: 'plataforma_config', entidadeId: '1', acao: 'sms_ativo', antes: { sms_ativo: antes }, depois: { sms_ativo: corpo.ativo } });
  return NextResponse.json({ ativo: corpo.ativo });
}

/** envio manual: { numero } = numero do pedido (ex. 100133) */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const corpo = await req.json().catch(() => ({}));
  const numero = String(corpo.numero ?? '').replace(/\D/g, '');
  if (!numero) return NextResponse.json({ error: 'Informe o número do pedido', codigo: 'SEM_NUMERO' }, { status: 400 });
  const { data: sol } = await supabaseAdmin.from('solicitacoes').select('id').eq('numero', numero).maybeSingle();
  if (!sol) return NextResponse.json({ error: 'Pedido não encontrado', codigo: 'NAO_ENCONTRADO' }, { status: 404 });
  const r = await avisarOrcamentoPorSms({ solicitacaoId: sol.id, tipo: 'manual', adminId: auth.userId });
  await registrarAuditoria(supabaseAdmin, { adminId: auth.userId, entidade: 'sms', entidadeId: sol.id, acao: 'sms_manual', depois: r, solicitacaoId: sol.id });
  return NextResponse.json(r, { status: r.status === 'enviado' ? 200 : 422 });
}
