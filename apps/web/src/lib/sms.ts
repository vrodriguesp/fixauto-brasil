import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendQuoteSms } from '@/lib/notifications';
import { decidirSms, SMS_APP_DIAS, type TipoSms } from '@/lib/sms-regras';

export type { TipoSms } from '@/lib/sms-regras';

// SMS "chegou orcamento" (dono 04/11) - quem decide se sai. Migracao 071.
// Regras: so pedido aberto; automatico so com o interruptor do admin ligado,
// uma vez por orcamento e so para quem NAO tem o app (o app recebe push);
// envio manual do admin ignora interruptor/app mas nunca pedido fechado.

async function smsConfig(): Promise<{ ativo: boolean; desde: string | null }> {
  const { data, error } = await supabaseAdmin.from('plataforma_config').select('sms_ativo, sms_desde').eq('id', 1).maybeSingle();
  if (error) { console.error('[sms] config:', error.message); return { ativo: false, desde: null }; } // sem a migracao 071 nao envia
  return { ativo: data?.sms_ativo ?? true, desde: data?.sms_desde ?? null };
}
export async function smsAtivo(): Promise<boolean> {
  return (await smsConfig()).ativo;
}

export interface ResultadoSms { status: 'enviado' | 'recusado' | 'pulado'; motivo?: string }

const semNumero = (t: string) => t.replace(/\+?\d[\d\s]{5,}\d/g, '…').slice(0, 200);

/** decide, envia e registra em sms_envios. Nunca lanca erro (o aviso por e-mail segue). */
export async function avisarOrcamentoPorSms(p: {
  solicitacaoId: string; orcamentoId?: string | null; tipo: TipoSms; adminId?: string | null;
  /** reserva: pais quando o pedido nao tem (o pais do pedido do cliente vem primeiro) */
  pais?: string | null;
}): Promise<ResultadoSms> {
  // sem as chaves nao tenta nem registra (a pagina do admin ja avisa)
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return { status: 'pulado', motivo: 'nao_configurado' };
  try {
    const { data: sol } = await supabaseAdmin.from('solicitacoes')
      .select('id, numero, status, pais, cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(telefone, idioma)')
      .eq('id', p.solicitacaoId).maybeSingle();
    if (!sol) return { status: 'pulado', motivo: 'pedido_nao_encontrado' };
    const cliente = (sol as any).cliente as { telefone: string | null; idioma: string | null } | null;
    const desde = new Date(Date.now() - SMS_APP_DIAS * 86400000).toISOString();
    const [cfg, app, ja, orc, este] = await Promise.all([
      smsConfig(),
      supabaseAdmin.from('push_tokens').select('id', { count: 'exact', head: true }).eq('profile_id', sol.cliente_id).gte('last_seen_at', desde),
      p.orcamentoId
        ? supabaseAdmin.from('sms_envios').select('id', { count: 'exact', head: true }).eq('orcamento_id', p.orcamentoId).eq('status', 'enviado')
        : Promise.resolve({ count: 0 }),
      // so orcamento ainda valido (recusado/expirado nao e "orcamento novo")
      supabaseAdmin.from('orcamentos').select('id', { count: 'exact', head: true }).eq('solicitacao_id', sol.id).in('status', ['enviado', 'visualizado']),
      p.orcamentoId
        ? supabaseAdmin.from('orcamentos').select('created_at').eq('id', p.orcamentoId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const criado = (este.data as { created_at?: string } | null)?.created_at;
    const decisao = decidirSms({
      tipo: p.tipo, smsAtivo: cfg.ativo, status: sol.status, telefone: cliente?.telefone ?? null,
      temApp: (app.count ?? 0) > 0, jaEnviado: (ja.count ?? 0) > 0, temOrcamento: (orc.count ?? 0) > 0,
      // automatico sem data confiavel (sem config ou orcamento) nao envia
      orcamentoAnterior: !cfg.desde || !criado || new Date(criado) < new Date(cfg.desde),
    });
    const base = {
      solicitacao_id: sol.id, orcamento_id: p.orcamentoId ?? null, profile_id: sol.cliente_id, tipo: p.tipo,
      telefone_final: cliente?.telefone ? cliente.telefone.replace(/\D/g, '').slice(-3) : null, enviado_por: p.adminId ?? null,
    };
    if (!decisao.enviar) {
      // "ja enviado" e "desligado" nao vao para o registro (reenvio do orcamento repetiria a linha)
      if (!['ja_enviado', 'sms_desligado', 'orcamento_anterior'].includes(decisao.motivo)) {
        await supabaseAdmin.from('sms_envios').insert({ ...base, status: 'pulado', motivo: decisao.motivo });
      }
      return { status: 'pulado', motivo: decisao.motivo };
    }
    // reserva antes da Twilio: o indice unico (071) barra o 2o aviso simultaneo do mesmo orcamento
    const { data: reserva, error: eRes } = await supabaseAdmin.from('sms_envios').insert({ ...base, status: 'enviando' }).select('id').single();
    if (eRes) {
      if (eRes.code === '23505') return { status: 'pulado', motivo: 'ja_enviado' };
      throw new Error(eRes.message);
    }
    // numero sem "+" recebe o DDI do pais do PEDIDO do cliente (o cadastro nao pergunta o pais
    // do telefone); o envio so aceita +372
    const r = await sendQuoteSms({ toPhone: cliente!.telefone!, pais: (sol as any).pais || p.pais || 'EE', numero: (sol as any).numero, locale: cliente?.idioma ?? undefined });
    // erro da Twilio pode trazer o numero inteiro: nao guarda nem mostra
    const motivo = r.success ? null : semNumero(r.error || '');
    await supabaseAdmin.from('sms_envios').update({ status: r.success ? 'enviado' : 'recusado', motivo, twilio_sid: r.sid ?? null }).eq('id', reserva.id);
    return r.success ? { status: 'enviado' } : { status: 'recusado', motivo: motivo || undefined };
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
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return { saldo: j.balance, moeda: j.currency };
  } catch { return null; }
}
