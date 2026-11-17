import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendResumoCotacoesPecasEmail } from '@/lib/notifications';
import { dataHoraTexto } from '@/lib/email-i18n';
import { fusoDoPais } from '@/lib/fuso';
import { interruptorPecasV3Global } from '@/lib/pecas-v3';
import { slotDoResumo, MAX_COTACOES_POR_RESUMO } from '@/lib/pecas-avisos';
import { linkNaoTenho } from '@/lib/pecas-nao-tenho';

// Lote 2 de pecas (17/11): resumo de e-mail das cotacoes da fila (urgencia "sem pressa" ou
// acima do teto diario). Chamada de hora em hora pelo crontab (UTC); so age nos slots de
// Tallinn (dias uteis: 08 = diario, 10/12/14/16/18 = 2 h). Por fornecedor:
//  1. pendentes que ainda valem (cotacao aberta/respondida e nao vencida, sem "nao tenho" nem
//     oferta propria); as que sairam ficam marcadas (enviado_em + erro 'saiu:<motivo>');
//  2. RESERVA (enviado_em + slot so onde ainda esta NULL) -> envia -> se o envio falhar desfaz
//     (enviado_em NULL, tentativas + 1; desiste na 3a). Perder um resumo e melhor que mandar dois.
// Por cotacao respeita o interruptor (global OU dona de teste), como a tarefa de vencer.
// Limpeza na mesma chamada: log com mais de 90 dias e tokens "nao tenho" vencidos ha mais de 1 dia.

const MAX_TENTATIVAS = 3;

export async function resumoCotacoesPecas(agora = Date.now()): Promise<{ slot: string | null; resumos: number }> {
  const agoraReal = new Date();
  await supabaseAdmin.from('avisos_email_pecas').delete().lt('criado_em', new Date(agoraReal.getTime() - 90 * 86400000).toISOString());
  await supabaseAdmin.from('pecas_links_email').delete().lt('expira_em', new Date(agoraReal.getTime() - 86400000).toISOString());

  const slot = slotDoResumo(agora);
  if (!slot) return { slot: null, resumos: 0 };
  const global = await interruptorPecasV3Global();

  const { data: pend, error } = await supabaseAdmin.from('avisos_email_pecas')
    .select('id, profile_id, cotacao_id, fornecedor_tipo, fornecedor_id, reaberta, tentativas, cotacao:cotacoes_pecas(id, status, expira_em, peca_descricao, fipe_marca, fipe_modelo, fipe_ano, quantidade, unidade, tipo, urgencia, oficina:oficinas!cotacoes_pecas_oficina_id_fkey(cidade, profile:profiles!oficinas_profile_id_fkey(conta_teste)))')
    .eq('tipo', 'resumo').is('enviado_em', null)
    .order('criado_em')
    .limit(3000);
  if (error) throw new Error(error.message);

  const porFornecedor = new Map<string, any[]>();
  for (const r of (pend || []) as any[]) {
    // conta real com o interruptor desligado: fica parada (nunca vira e-mail "novo")
    if (!global && !r.cotacao?.oficina?.profile?.conta_teste) continue;
    const k = `${r.profile_id}:${r.fornecedor_tipo}`;
    porFornecedor.set(k, [...(porFornecedor.get(k) || []), r]);
  }

  let resumos = 0;
  for (const todas of Array.from(porFornecedor.values())) {
    const { profile_id: profileId, fornecedor_tipo: tipo } = todas[0];
    // a mesma cotacao em duas rodadas ainda na fila (aviso + re-aviso do reabrir): so a mais nova entra
    const maisNova = new Map<string, any>();
    for (const r of todas) { const a = maisNova.get(r.cotacao_id); if (!a || (Number(r.reaberta) || 0) > (Number(a.reaberta) || 0)) maisNova.set(r.cotacao_id, r); }
    for (const r of todas.filter((x) => maisNova.get(x.cotacao_id) !== x)) {
      await supabaseAdmin.from('avisos_email_pecas').update({ enviado_em: agoraReal.toISOString(), erro: 'saiu:repetida' }).eq('id', r.id).is('enviado_em', null);
    }
    const linhas = Array.from(maisNova.values());
    const { data: perfil } = await supabaseAdmin.from('profiles').select('email, nome, idioma, ativo').eq('id', profileId).maybeSingle();
    // lote 3 (item 1 do Fable): o fornecedor pelo id gravado na linha; linha antiga (NULL) pelo perfil, como antes
    const fornecedorId = linhas.find((r) => r.fornecedor_id)?.fornecedor_id || null;
    const forn = tipo === 'loja'
      ? (await (fornecedorId
        ? supabaseAdmin.from('lojas_pecas').select('id, nome_fantasia, pais, ativa').eq('id', fornecedorId).eq('profile_id', profileId)
        : supabaseAdmin.from('lojas_pecas').select('id, nome_fantasia, pais, ativa').eq('profile_id', profileId)).maybeSingle()).data
      : (await (fornecedorId
        ? supabaseAdmin.from('oficinas').select('id, nome_fantasia, pais, ativa, vende_pecas').eq('id', fornecedorId).eq('profile_id', profileId).eq('vende_pecas', true)
        : supabaseAdmin.from('oficinas').select('id, nome_fantasia, pais, ativa, vende_pecas').eq('profile_id', profileId).eq('vende_pecas', true)).maybeSingle()).data;
    const ids = linhas.map((r) => r.cotacao_id);
    const [{ data: disp }, { data: resp }] = await Promise.all([
      forn ? supabaseAdmin.from('cotacoes_pecas_dispensas').select('cotacao_id').eq('fornecedor_tipo', tipo).eq('fornecedor_id', forn.id).in('cotacao_id', ids) : Promise.resolve({ data: [] as any[] }),
      forn ? supabaseAdmin.from('cotacoes_pecas_respostas').select('cotacao_id').eq(tipo === 'loja' ? 'loja_id' : 'oficina_fornecedora_id', forn.id).in('cotacao_id', ids) : Promise.resolve({ data: [] as any[] }),
    ]);
    const dispensadas = new Set(((disp as any[]) || []).map((d) => d.cotacao_id));
    const respondidas = new Set(((resp as any[]) || []).map((d) => d.cotacao_id));
    const fornecedorAtivo = !!forn && forn.ativa !== false && perfil?.ativo !== false && !!perfil?.email;

    // 1. as que sairam da fila entre o aviso e o slot
    const saiu = (r: any): string | null => {
      if (!fornecedorAtivo) return 'inativo';
      if (!r.cotacao) return 'apagada';
      if (!['aberta', 'respondida'].includes(String(r.cotacao.status))) return String(r.cotacao.status);
      if (r.cotacao.expira_em && Date.parse(r.cotacao.expira_em) <= agoraReal.getTime()) return 'vencida';
      if (dispensadas.has(r.cotacao_id)) return 'dispensada';
      if (respondidas.has(r.cotacao_id)) return 'respondida';
      return null;
    };
    const fora = linhas.map((r) => ({ r, motivo: saiu(r) })).filter((x) => x.motivo);
    for (const { r, motivo } of fora) {
      await supabaseAdmin.from('avisos_email_pecas').update({ enviado_em: agoraReal.toISOString(), erro: `saiu:${motivo}` }).eq('id', r.id).is('enviado_em', null);
    }
    const validas = linhas.filter((r) => !saiu(r)).slice(0, MAX_COTACOES_POR_RESUMO);
    if (!validas.length || !forn || !perfil?.email) continue;

    // 2. reserva: so as linhas que esta execucao ganhou entram no e-mail
    const { data: ganhas } = await supabaseAdmin.from('avisos_email_pecas')
      .update({ enviado_em: agoraReal.toISOString(), slot, erro: null })
      .in('id', validas.map((r) => r.id)).is('enviado_em', null)
      .select('id');
    const ganhasIds = new Set(((ganhas as any[]) || []).map((g) => g.id));
    const doEmail = validas.filter((r) => ganhasIds.has(r.id));
    if (!doEmail.length) continue;

    const fuso = fusoDoPais(forn.pais);
    const inicioEnvio = new Date(Date.now() - 1000).toISOString();
    const cotacoes = [];
    for (const r of doEmail) {
      const c = r.cotacao;
      cotacoes.push({
        id: c.id,
        peca: c.peca_descricao || '-',
        carro: c.tipo === 'sem_carro' ? null : [c.fipe_marca, c.fipe_modelo, c.fipe_ano].filter(Boolean).join(' ') || null,
        semCarro: c.tipo === 'sem_carro',
        quantidade: Number(c.quantidade) || 1,
        unidade: c.unidade,
        urgencia: c.urgencia,
        cidade: c.oficina?.cidade || null,
        abertaAte: dataHoraTexto(perfil.idioma, c.expira_em, fuso),
        // um token por linha (preso a este fornecedor e a esta cotacao)
        naoTenhoUrl: await linkNaoTenho({ profileId, cotacaoId: c.id, fornecedorTipo: tipo, fornecedorId: forn.id, expiraEm: c.expira_em, idioma: perfil.idioma }),
      });
    }
    const r = await sendResumoCotacoesPecasEmail({
      toEmail: perfil.email, toName: perfil.nome || forn.nome_fantasia || '', locale: perfil.idioma || undefined,
      linkInterno: tipo === 'loja' ? '/loja/cotacoes' : '/oficina/pecas?aba=vender', cotacoes,
    }).catch(() => ({ success: false }));
    if (r.success) { resumos++; continue; }

    // 3. falhou: desfaz a reserva (tenta no proximo slot) e apaga os tokens que nao chegaram
    for (const linha of doEmail) {
      const tentativas = (Number(linha.tentativas) || 0) + 1;
      await supabaseAdmin.from('avisos_email_pecas').update(tentativas >= MAX_TENTATIVAS
        ? { tentativas, erro: 'falha_envio:desistiu', enviado_em: agoraReal.toISOString() }
        : { tentativas, erro: 'falha_envio', enviado_em: null, slot: null }).eq('id', linha.id);
    }
    await supabaseAdmin.from('pecas_links_email').delete().eq('profile_id', profileId).in('cotacao_id', doEmail.map((x) => x.cotacao_id)).is('usado_em', null).gte('criado_em', inicioEnvio);
  }
  return { slot, resumos };
}
