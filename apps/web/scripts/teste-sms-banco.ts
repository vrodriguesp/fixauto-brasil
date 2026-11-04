// Teste do SMS contra o banco LOCAL (Supabase do ambiente de teste), sem Twilio:
// cada regra de avisarOrcamentoPorSms com consultas reais, o registro em
// sms_envios e as consultas da pagina do admin. Desfaz tudo no fim.
//
//   npx tsx scripts/teste-sms-banco.ts   (usa Documentos/_teste_local/site/apps/web/.env.local)
import fs from 'node:fs';

const ENV = '../../Documentos/_teste_local/site/apps/web/.env.local';
for (const l of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
  const i = l.indexOf('='); if (i < 1 || l.startsWith('#')) continue;
  const k = l.slice(0, i).trim(); if (k.startsWith('TWILIO')) continue; // nunca envia SMS de verdade
  process.env[k] = l.slice(i + 1).trim().replace(/^"|"$/g, '');
}
delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN;
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '')) { console.error('banco nao e o local - parado'); process.exit(1); }

let falhas = 0;
const confere = (nome: string, obtido: unknown, esperado: unknown) => {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado); if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}: ${JSON.stringify(obtido)}${ok ? '' : ` (esperado ${JSON.stringify(esperado)})`}`);
};

async function main() {
  const { supabaseAdmin: db } = await import('../src/lib/supabase-admin');
  const { avisarOrcamentoPorSms, smsAtivo } = await import('../src/lib/sms');

  // pedido aberto com orcamento e cliente com telefone
  const { data: sols } = await db.from('solicitacoes').select('id, numero, status, cliente_id, orcamentos(id)').in('status', ['aberta', 'em_orcamento']);
  const alvo = (sols || []).find((s: any) => s.orcamentos?.length);
  const semOrc = (sols || []).find((s: any) => !s.orcamentos?.length);
  if (!alvo || !semOrc) { console.error('faltam pedidos de teste no banco local'); process.exit(1); }
  const orcId = (alvo as any).orcamentos[0].id;
  const { data: cli } = await db.from('profiles').select('telefone').eq('id', alvo.cliente_id).single();
  const telAntes = cli?.telefone ?? null;
  const cfgAntes = await smsAtivo();
  const inicio = new Date().toISOString();
  const TOKEN = 'ExponentPushToken[teste-sms-banco]';

  try {
    // telefone estoniano: decisao "envia" -> Twilio sem chave -> recusado e registrado
    await db.from('profiles').update({ telefone: '+372 5123 4567' }).eq('id', alvo.cliente_id);
    await db.from('plataforma_config').update({ sms_ativo: true }).eq('id', 1);
    let r = await avisarOrcamentoPorSms({ solicitacaoId: alvo.id, orcamentoId: orcId, tipo: 'orcamento_auto' });
    confere('auto, tudo ok, sem chave Twilio -> recusado', r, { status: 'recusado', motivo: 'SMS service not configured' });
    const { data: linha } = await db.from('sms_envios').select('status, tipo, telefone_final, orcamento_id').eq('orcamento_id', orcId).gte('created_at', inicio).single();
    confere('registro gravado com final do numero', linha, { status: 'recusado', tipo: 'orcamento_auto', telefone_final: '567', orcamento_id: orcId });

    // telefone de outro pais: nunca sai
    await db.from('profiles').update({ telefone: '+39 333 1234567' }).eq('id', alvo.cliente_id);
    r = await avisarOrcamentoPorSms({ solicitacaoId: alvo.id, orcamentoId: orcId, tipo: 'orcamento_auto' });
    confere('telefone italiano -> recusado (so Estonia)', r.status === 'recusado' && /Estónia|configured/.test(r.motivo || ''), true);
    await db.from('profiles').update({ telefone: '+372 5123 4567' }).eq('id', alvo.cliente_id);

    // ja enviado: simula um envio de verdade para este orcamento
    const { data: fake } = await db.from('sms_envios').insert({ solicitacao_id: alvo.id, orcamento_id: orcId, profile_id: alvo.cliente_id, tipo: 'orcamento_auto', status: 'enviado' }).select('id').single();
    r = await avisarOrcamentoPorSms({ solicitacaoId: alvo.id, orcamentoId: orcId, tipo: 'orcamento_auto' });
    confere('mesmo orcamento de novo -> pulado ja_enviado', r, { status: 'pulado', motivo: 'ja_enviado' });
    r = await avisarOrcamentoPorSms({ solicitacaoId: alvo.id, tipo: 'manual' });
    confere('manual depois de enviado -> tenta de novo', r.status, 'recusado');
    await db.from('sms_envios').delete().eq('id', fake!.id);

    // interruptor desligado
    await db.from('plataforma_config').update({ sms_ativo: false }).eq('id', 1);
    confere('smsAtivo() le o interruptor', await smsAtivo(), false);
    r = await avisarOrcamentoPorSms({ solicitacaoId: alvo.id, orcamentoId: orcId, tipo: 'orcamento_auto' });
    confere('auto com SMS desligado -> pulado', r, { status: 'pulado', motivo: 'sms_desligado' });
    r = await avisarOrcamentoPorSms({ solicitacaoId: alvo.id, tipo: 'manual' });
    confere('manual com SMS desligado -> tenta', r.status, 'recusado');
    await db.from('plataforma_config').update({ sms_ativo: true }).eq('id', 1);

    // cliente com o app (token visto agora)
    await db.from('push_tokens').insert({ profile_id: alvo.cliente_id, token: TOKEN, plataforma: 'android' });
    r = await avisarOrcamentoPorSms({ solicitacaoId: alvo.id, orcamentoId: orcId, tipo: 'orcamento_auto' });
    confere('cliente com app -> pulado tem_app', r, { status: 'pulado', motivo: 'tem_app' });
    // app aberto ha mais de 60 dias -> volta a receber SMS
    await db.from('push_tokens').update({ last_seen_at: new Date(Date.now() - 61 * 86400000).toISOString() }).eq('token', TOKEN);
    r = await avisarOrcamentoPorSms({ solicitacaoId: alvo.id, orcamentoId: orcId, tipo: 'orcamento_auto' });
    confere('app nao aberto ha 61 dias -> tenta SMS', r.status, 'recusado');
    await db.from('push_tokens').delete().eq('token', TOKEN);

    // pedido cancelado
    await db.from('solicitacoes').update({ status: 'cancelada' }).eq('id', alvo.id);
    r = await avisarOrcamentoPorSms({ solicitacaoId: alvo.id, orcamentoId: orcId, tipo: 'orcamento_auto' });
    confere('pedido cancelado -> pulado', r, { status: 'pulado', motivo: 'pedido_fechado' });
    r = await avisarOrcamentoPorSms({ solicitacaoId: alvo.id, tipo: 'manual' });
    confere('manual em pedido cancelado -> pulado', r, { status: 'pulado', motivo: 'pedido_fechado' });
    await db.from('solicitacoes').update({ status: alvo.status }).eq('id', alvo.id);

    // pedido sem orcamento e pedido inexistente
    r = await avisarOrcamentoPorSms({ solicitacaoId: semOrc.id, tipo: 'manual' });
    confere('pedido sem orcamento -> pulado', r.motivo === 'sem_orcamento' || r.motivo === 'sem_telefone', true);
    r = await avisarOrcamentoPorSms({ solicitacaoId: '00000000-0000-0000-0000-000000000000', tipo: 'manual' });
    confere('pedido inexistente -> pulado', r, { status: 'pulado', motivo: 'pedido_nao_encontrado' });

    // consultas da pagina do admin (mesmo select da rota GET)
    const { data: lista, error } = await db.from('sms_envios')
      .select('id, tipo, status, motivo, telefone_final, created_at, solicitacao:solicitacoes(numero), profile:profiles!sms_envios_profile_id_fkey(nome)')
      .gte('created_at', inicio).order('created_at', { ascending: false }).limit(50);
    confere('select do admin sem erro', error?.message ?? null, null);
    confere('admin ve o numero do pedido', (lista || []).some((e: any) => String(e.solicitacao?.numero) === String(alvo.numero)), true);
    const { data: porNumero } = await db.from('solicitacoes').select('id').eq('numero', String(alvo.numero)).maybeSingle();
    confere('busca pelo numero digitado (texto)', porNumero?.id, alvo.id);

    // RLS: cliente logado (anon key) nao le sms_envios
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: vaz, error: eAnon } = await anon.from('sms_envios').select('id').limit(1);
    confere('anonimo nao le sms_envios', !!eAnon || (vaz || []).length === 0, true);
  } finally {
    await db.from('sms_envios').delete().gte('created_at', inicio);
    await db.from('push_tokens').delete().eq('token', TOKEN);
    await db.from('profiles').update({ telefone: telAntes }).eq('id', alvo.cliente_id);
    await db.from('solicitacoes').update({ status: alvo.status }).eq('id', alvo.id);
    await db.from('plataforma_config').update({ sms_ativo: cfgAntes }).eq('id', 1);
    console.log('(banco local restaurado)');
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
  process.exit(falhas ? 1 : 0);
}
main();
