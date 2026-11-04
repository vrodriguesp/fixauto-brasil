// Teste do SMS contra o banco LOCAL (Supabase do ambiente de teste) com a Twilio
// SIMULADA (fetch interceptado - nenhum SMS sai): cada regra de
// avisarOrcamentoPorSms com consultas reais, o registro em sms_envios, a trava
// contra envio duplo, o numero escondido no erro e as consultas do admin.
// Desfaz tudo no fim.
//
//   npx tsx scripts/teste-sms-banco.ts   (usa Documentos/_teste_local/site/apps/web/.env.local)
import fs from 'node:fs';

const ENV = '../../Documentos/_teste_local/site/apps/web/.env.local';
for (const l of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
  const i = l.indexOf('='); if (i < 1 || l.startsWith('#')) continue;
  const k = l.slice(0, i).trim(); if (k.startsWith('TWILIO')) continue;
  process.env[k] = l.slice(i + 1).trim().replace(/^"|"$/g, '');
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '')) { console.error('banco nao e o local - parado'); process.exit(1); }

// Twilio simulada: chaves falsas + fetch interceptado (as outras chamadas vao para o Supabase local)
process.env.TWILIO_ACCOUNT_SID = 'ACteste'; process.env.TWILIO_AUTH_TOKEN = 'teste';
let twilioModo: 'ok' | 'erro' | 'lento' = 'ok'; const enviados: { to: string; body: string }[] = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = (async (url: any, o: any) => {
  if (!String(url).startsWith('https://api.twilio.com')) return fetchReal(url, o);
  const corpo = new URLSearchParams(o.body);
  if (twilioModo === 'lento') await new Promise((r) => setTimeout(r, 300));
  if (twilioModo === 'erro') return new Response(JSON.stringify({ code: 21211, message: `The 'To' number ${corpo.get('To')} is not a valid phone number.` }), { status: 400 });
  enviados.push({ to: corpo.get('To')!, body: corpo.get('Body')! });
  return new Response(JSON.stringify({ sid: 'SMteste' + enviados.length, status: 'queued' }), { status: 201 });
}) as typeof fetch;

let falhas = 0;
const confere = (nome: string, obtido: unknown, esperado: unknown) => {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado); if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}: ${JSON.stringify(obtido)}${ok ? '' : ` (esperado ${JSON.stringify(esperado)})`}`);
};

async function main() {
  const { supabaseAdmin: db } = await import('../src/lib/supabase-admin');
  const { avisarOrcamentoPorSms, smsAtivo } = await import('../src/lib/sms');

  const { data: sols } = await db.from('solicitacoes').select('id, numero, status, cliente_id, orcamentos(id, status)').in('status', ['aberta', 'em_orcamento']);
  const alvo = (sols || []).find((s: any) => s.orcamentos?.some((o: any) => ['enviado', 'visualizado'].includes(o.status)));
  const semOrc = (sols || []).find((s: any) => !s.orcamentos?.length);
  if (!alvo || !semOrc) { console.error('faltam pedidos de teste no banco local'); process.exit(1); }
  const orc = (alvo as any).orcamentos.find((o: any) => ['enviado', 'visualizado'].includes(o.status));
  const orcId = orc.id; const orcStatusAntes = orc.status;
  const { data: cli } = await db.from('profiles').select('telefone, idioma').eq('id', alvo.cliente_id).single();
  const telAntes = cli?.telefone ?? null; const idiomaAntes = cli?.idioma ?? null;
  const cfgAntes = await smsAtivo();
  const inicio = new Date().toISOString();
  const TOKEN = 'ExponentPushToken[teste-sms-banco]';
  const auto = () => avisarOrcamentoPorSms({ solicitacaoId: alvo.id, orcamentoId: orcId, tipo: 'orcamento_auto', pais: 'EE' });
  const manual = () => avisarOrcamentoPorSms({ solicitacaoId: alvo.id, tipo: 'manual' });
  const limparRegistro = () => db.from('sms_envios').delete().gte('created_at', inicio);

  try {
    await db.from('profiles').update({ telefone: '5123 4567', idioma: 'et' }).eq('id', alvo.cliente_id);
    await db.from('plataforma_config').update({ sms_ativo: true }).eq('id', 1);

    // envio normal: numero nacional vira +372, texto estoniano com o link do pedido
    let r = await auto();
    confere('auto, tudo ok -> enviado', r, { status: 'enviado' });
    confere('para +37251234567', enviados.at(-1)?.to, '+37251234567');
    const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bipfix.com').replace('://www.', '://').replace(/\/$/, '');
    confere('texto ET com link curto do pedido', enviados.at(-1)?.body, `BipFix: sinu päringule saabus uus hinnapakkumine. Vaata ja vali: ${base}/r/${alvo.numero}`);
    const { data: l1 } = await db.from('sms_envios').select('status, tipo, telefone_final, twilio_sid').eq('orcamento_id', orcId).gte('created_at', inicio).single();
    confere('registro: enviado, final 567, sid', l1, { status: 'enviado', tipo: 'orcamento_auto', telefone_final: '567', twilio_sid: 'SMteste1' });

    // mesmo orcamento de novo (reenvio/revisao)
    r = await auto();
    confere('mesmo orcamento de novo -> ja_enviado', r, { status: 'pulado', motivo: 'ja_enviado' });
    confere('nenhum SMS a mais', enviados.length, 1);
    await limparRegistro();

    // dois avisos AO MESMO TEMPO do mesmo orcamento: so 1 SMS
    twilioModo = 'lento'; const n0 = enviados.length;
    const [a, b] = await Promise.all([auto(), auto()]);
    confere('simultaneos: um envia, outro e barrado', [a.status, b.status].sort(), ['enviado', 'pulado']);
    confere('simultaneos: 1 SMS so', enviados.length - n0, 1);
    twilioModo = 'ok'; await limparRegistro();

    // Twilio recusa: numero nao aparece no registro nem na resposta
    twilioModo = 'erro';
    r = await auto();
    confere('erro Twilio -> recusado', r.status, 'recusado');
    confere('motivo sem o numero', /\d{6,}/.test(r.motivo || ''), false);
    const { data: l2 } = await db.from('sms_envios').select('status, motivo').eq('orcamento_id', orcId).gte('created_at', inicio).single();
    confere('registro recusado sem numero', l2?.status === 'recusado' && !/\d{6,}/.test(l2?.motivo || ''), true);
    twilioModo = 'ok';
    r = await auto();
    confere('depois de recusado, nova tentativa envia', r.status, 'enviado');
    await limparRegistro();

    // russo
    await db.from('profiles').update({ idioma: 'ru' }).eq('id', alvo.cliente_id);
    r = await auto();
    confere('cliente RU -> texto russo com link curto', enviados.at(-1)?.body.startsWith('BipFix: новая смета') && enviados.at(-1)?.body.endsWith(`/r/${alvo.numero}`), true);
    await db.from('profiles').update({ idioma: 'et' }).eq('id', alvo.cliente_id); await limparRegistro();

    // telefones fora da Estonia: nunca saem
    const nE = enviados.length;
    for (const t of ['+39 333 1234567', '+55 11 91234 5678']) {
      await db.from('profiles').update({ telefone: t }).eq('id', alvo.cliente_id);
      r = await auto(); confere(`telefone ${t.slice(0, 3)} -> recusado`, r.status, 'recusado'); await limparRegistro();
    }
    // numero nacional brasileiro com oficina do Brasil vira +55 (bloqueado)
    await db.from('profiles').update({ telefone: '11987654321' }).eq('id', alvo.cliente_id);
    r = await auto();
    confere('celular BR sem "+" num pedido da Estonia -> recusado (formato)', r, { status: 'recusado', motivo: 'Número estoniano inválido' });
    await limparRegistro();
    // pedido de outro pais (BR): numero nacional vira +55 -> bloqueado
    const { data: pAntes } = await db.from('solicitacoes').select('pais').eq('id', alvo.id).single();
    await db.from('solicitacoes').update({ pais: 'BR' }).eq('id', alvo.id);
    r = await auto();
    confere('pedido do Brasil -> DDI do pedido (+55) -> recusado', r, { status: 'recusado', motivo: 'SMS só para a Estónia' });
    await db.from('solicitacoes').update({ pais: pAntes?.pais ?? 'EE' }).eq('id', alvo.id);
    // numeros estonianos validos: 8 digitos (celular) e 7 digitos
    await db.from('profiles').update({ telefone: '+372 512 3456' }).eq('id', alvo.cliente_id); await limparRegistro();
    r = await auto(); confere('+372 com 7 digitos -> envia', r.status, 'enviado');
    confere('nenhum SMS para fora da Estonia (so o +372 valido saiu)', enviados.length, nE + 1);
    await db.from('profiles').update({ telefone: '5123 4567' }).eq('id', alvo.cliente_id); await limparRegistro();

    // interruptor desligado
    await db.from('plataforma_config').update({ sms_ativo: false }).eq('id', 1);
    r = await auto(); confere('auto com SMS desligado -> pulado', r, { status: 'pulado', motivo: 'sms_desligado' });
    r = await manual(); confere('manual com SMS desligado -> envia', r.status, 'enviado');
    await db.from('plataforma_config').update({ sms_ativo: true }).eq('id', 1); await limparRegistro();

    // cliente com o app
    await db.from('push_tokens').insert({ profile_id: alvo.cliente_id, token: TOKEN, plataforma: 'android' });
    r = await auto(); confere('cliente com app -> pulado tem_app', r, { status: 'pulado', motivo: 'tem_app' });
    r = await manual(); confere('manual com app -> envia', r.status, 'enviado');
    await db.from('push_tokens').update({ last_seen_at: new Date(Date.now() - 61 * 86400000).toISOString() }).eq('token', TOKEN);
    await limparRegistro();
    r = await auto(); confere('app nao aberto ha 61 dias -> envia', r.status, 'enviado');
    await db.from('push_tokens').delete().eq('token', TOKEN); await limparRegistro();

    // pedido cancelado
    await db.from('solicitacoes').update({ status: 'cancelada' }).eq('id', alvo.id);
    r = await auto(); confere('pedido cancelado -> pulado', r, { status: 'pulado', motivo: 'pedido_fechado' });
    r = await manual(); confere('manual em pedido cancelado -> pulado', r, { status: 'pulado', motivo: 'pedido_fechado' });
    await db.from('solicitacoes').update({ status: alvo.status }).eq('id', alvo.id);

    // orcamento recusado nao conta como "orcamento novo"
    const { count: validos } = await db.from('orcamentos').select('id', { count: 'exact', head: true }).eq('solicitacao_id', alvo.id).in('status', ['enviado', 'visualizado']);
    if (validos === 1) {
      await db.from('orcamentos').update({ status: 'recusado' }).eq('id', orcId);
      r = await manual(); confere('so orcamento recusado -> sem_orcamento', r, { status: 'pulado', motivo: 'sem_orcamento' });
      await db.from('orcamentos').update({ status: orcStatusAntes }).eq('id', orcId);
    }

    // pedido sem orcamento e inexistente
    r = await avisarOrcamentoPorSms({ solicitacaoId: semOrc.id, tipo: 'manual' });
    confere('pedido sem orcamento -> pulado', ['sem_orcamento', 'sem_telefone'].includes(r.motivo || ''), true);
    r = await avisarOrcamentoPorSms({ solicitacaoId: '00000000-0000-0000-0000-000000000000', tipo: 'manual' });
    confere('pedido inexistente -> pulado', r, { status: 'pulado', motivo: 'pedido_nao_encontrado' });

    // sem chaves: nao tenta nem registra
    delete process.env.TWILIO_ACCOUNT_SID;
    const antes = (await db.from('sms_envios').select('id', { count: 'exact', head: true }).gte('created_at', inicio)).count;
    r = await auto(); confere('sem chaves -> nao_configurado', r, { status: 'pulado', motivo: 'nao_configurado' });
    const depois = (await db.from('sms_envios').select('id', { count: 'exact', head: true }).gte('created_at', inicio)).count;
    confere('sem chaves -> nada no registro', depois, antes);
    process.env.TWILIO_ACCOUNT_SID = 'ACteste';

    // consultas da pagina do admin
    await auto();
    const { data: lista, error } = await db.from('sms_envios')
      .select('id, tipo, status, motivo, telefone_final, created_at, solicitacao:solicitacoes(numero), profile:profiles!sms_envios_profile_id_fkey(nome)')
      .gte('created_at', inicio).order('created_at', { ascending: false }).limit(50);
    confere('select do admin sem erro', error?.message ?? null, null);
    confere('admin ve o numero do pedido', (lista || []).some((e: any) => String(e.solicitacao?.numero) === String(alvo.numero)), true);
    const { data: porNumero } = await db.from('solicitacoes').select('id').eq('numero', String(alvo.numero)).maybeSingle();
    confere('busca pelo numero digitado (texto)', porNumero?.id, alvo.id);

    // link curto /r/<numero>: leva a pagina do pedido no idioma do cliente
    const { GET: linkCurto } = await import('../src/app/r/[numero]/route');
    const destino = async (n: string) => (await linkCurto({} as any, { params: { numero: n } })).headers.get('location');
    const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bipfix.com').replace(/\/$/, '');
    await db.from('profiles').update({ idioma: 'et' }).eq('id', alvo.cliente_id);
    confere('/r/<numero> cliente ET -> /ee/et/...orcamentos/<id>', await destino(String(alvo.numero)), `${site}/ee/et/cliente/orcamentos/${alvo.id}`);
    await db.from('profiles').update({ idioma: 'ru' }).eq('id', alvo.cliente_id);
    confere('/r/<numero> cliente RU -> /ee/ru/...', (await destino(String(alvo.numero)))?.startsWith(`${site}/ee/ru/`), true);
    await db.from('profiles').update({ idioma: 'et' }).eq('id', alvo.cliente_id);
    confere('/r/ numero inexistente -> pagina inicial', (await destino('999999999'))?.replace(/\/$/, ''), site);
    confere('/r/ lixo -> pagina inicial', (await destino("abc'--"))?.replace(/\/$/, ''), site);

    // RLS: anonimo nao le sms_envios
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: vaz, error: eAnon } = await anon.from('sms_envios').select('id').limit(1);
    confere('anonimo nao le sms_envios', !!eAnon || (vaz || []).length === 0, true);
  } finally {
    await limparRegistro();
    await db.from('push_tokens').delete().eq('token', TOKEN);
    await db.from('profiles').update({ telefone: telAntes, idioma: idiomaAntes }).eq('id', alvo.cliente_id);
    await db.from('solicitacoes').update({ status: alvo.status }).eq('id', alvo.id);
    await db.from('orcamentos').update({ status: orcStatusAntes }).eq('id', orcId);
    await db.from('plataforma_config').update({ sms_ativo: cfgAntes }).eq('id', 1);
    console.log('(banco local restaurado)');
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
  process.exit(falhas ? 1 : 0);
}
main();
