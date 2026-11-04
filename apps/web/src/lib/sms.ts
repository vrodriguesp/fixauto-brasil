import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendQuoteSms } from '@/lib/notifications';
import { decidirSms, SMS_APP_DIAS, type TipoSms } from '@/lib/sms-regras';

export type { TipoSms } from '@/lib/sms-regras';

// SMS "chegou orcamento" (dono 04/11) - quem decide se sai. Migracao 071.
// Regras: so pedido aberto; automatico so com o interruptor do admin ligado,
// uma vez por orcamento e so para quem NAO tem o app (o app recebe push);
// envio manual do admin ignora interruptor/app mas nunca pedido fechado.

export async function smsAtivo(): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('plataforma_config').select('sms_ativo').eq('id', 1).maybeSingle();
  if (error) { console.error('[sms] config:', error.message); return false; } // sem a coluna (migracao 071) nao envia
  return data?.sms_ativo ?? true;
}

export interface ResultadoSms { status: 'enviado' | 'recusado' | 'pulado'; motivo?: string }

/** decide, envia e registra em sms_envios. Nunca lanca erro (o aviso por e-mail segue). */
export async function avisarOrcamentoPorSms(p: {
  solicitacaoId: string; orcamentoId?: string | null; tipo: TipoSms; adminId?: string | null;
}): Promise<ResultadoSms> {
  try {
    const { data: sol } = await supabaseAdmin.from('solicitacoes')
      .select('id, status, cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(telefone, idioma)')
      .eq('id', p.solicitacaoId).maybeSingle();
    if (!sol) return { status: 'pulado', motivo: 'pedido_nao_encontrado' };
    const cliente = (sol as any).cliente as { telefone: string | null; idioma: string | null } | null;
    const desde = new Date(Date.now() - SMS_APP_DIAS * 86400000).toISOString();
    const [ativo, app, ja, orc] = await Promise.all([
      smsAtivo(),
      supabaseAdmin.from('push_tokens').select('id', { count: 'exact', head: true }).eq('profile_id', sol.cliente_id).gte('last_seen_at', desde),
      p.orcamentoId
        ? supabaseAdmin.from('sms_envios').select('id', { count: 'exact', head: true }).eq('orcamento_id', p.orcamentoId).eq('status', 'enviado')
        : Promise.resolve({ count: 0 }),
      supabaseAdmin.from('orcamentos').select('id', { count: 'exact', head: true }).eq('solicitacao_id', sol.id),
    ]);
    const decisao = decidirSms({
      tipo: p.tipo, smsAtivo: ativo, status: sol.status, telefone: cliente?.telefone ?? null,
      temApp: (app.count ?? 0) > 0, jaEnviado: (ja.count ?? 0) > 0, temOrcamento: (orc.count ?? 0) > 0,
    });
    const base = {
      solicitacao_id: sol.id, orcamento_id: p.orcamentoId ?? null, profile_id: sol.cliente_id, tipo: p.tipo,
      telefone_final: cliente?.telefone ? cliente.telefone.replace(/\D/g, '').slice(-3) : null, enviado_por: p.adminId ?? null,
    };
    if (!decisao.enviar) {
      // "ja enviado" e "desligado" nao vao para o registro (reenvio do orcamento repetiria a linha)
      if (decisao.motivo !== 'ja_enviado' && decisao.motivo !== 'sms_desligado') {
        await supabaseAdmin.from('sms_envios').insert({ ...base, status: 'pulado', motivo: decisao.motivo });
      }
      return { status: 'pulado', motivo: decisao.motivo };
    }
    // o mercado com SMS e a Estonia: numero sem "+" recebe o +372
    const r = await sendQuoteSms({ toPhone: cliente!.telefone!, pais: 'EE', solicitacaoId: sol.id, locale: cliente?.idioma ?? undefined });
    await supabaseAdmin.from('sms_envios').insert({
      ...base, status: r.success ? 'enviado' : 'recusado', motivo: r.success ? null : (r.error || '').slice(0, 200), twilio_sid: r.sid ?? null,
    });
    return r.success ? { status: 'enviado' } : { status: 'recusado', motivo: r.error };
  } catch (err) {
    console.error('[sms] falha:', (err as Error).message);
    return { status: 'recusado', motivo: 'erro_interno' };
  }
}

/** saldo da conta Twilio (para o admin ver quanto sobra) */
export async function saldoTwilio(): Promise<{ saldo: string; moeda: string } | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return { saldo: j.balance, moeda: j.currency };
  } catch { return null; }
}
