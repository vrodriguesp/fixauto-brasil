import { distanciaKm } from '@/lib/utils';
import { sendCotacaoPecaDisponivelEmail } from '@/lib/notifications';
import { notifCotacaoPecaDisponivel } from '@/lib/notif-i18n';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { emTodasAsLinguas } from '@/lib/notif-textos';
import { dataHoraTexto } from '@/lib/email-i18n';
import { fusoDoPais } from '@/lib/fuso';
import { TETO_IMEDIATOS_DIA, inicioDoDiaTallinn } from '@/lib/pecas-avisos';
import { linkNaoTenho } from '@/lib/pecas-nao-tenho';
import { enviarPushNavegador } from '@/lib/push-navegador';

// Avisa (sino + e-mail) quem pode vender a peca de um pedido (antes, o corpo da rota
// notificar-fornecedores-cotacao-peca; lote 2 tirou para ca para o "reabrir" re-avisar):
//  - lojas de pecas ATIVAS do mesmo pais da oficina compradora (B3, 16/11). Nao
//    depende de a compradora ter coordenadas (M12). O raio da loja (M2) ainda nao filtra.
//  - oficinas que vendem sobra (vende_pecas) dentro do raio de cada uma, quando a
//    compradora tem coordenadas; nunca com "so lojas" (alvo, lote 1).
// Conta de teste so avisa conta de teste, e conta real so conta real (regra da 063).
// Lote 2 (17/11), pelo DADO da cotacao (a tela de hoje grava urgencia NULL):
//  - urgencia NULL: sino + e-mail imediato de hoje, sem teto (log 'imediato' depois do envio);
//  - hoje/amanha: e-mail imediato com urgencia, "aberta ate" e botao "Nao tenho" (token), ate
//    TETO_IMEDIATOS_DIA por fornecedor no dia de Tallinn; acima vai a fila ('resumo', 'teto');
//  - sem_pressa: so o sino; o e-mail vai a fila do resumo de 2 h ('resumo', 'sem_pressa');
//  - quem ja respondeu ou disse "nao tenho" nao e avisado (vale para o re-aviso ao reabrir);
//  - o sino e sempre imediato; dedupe por tipo + cotacao + reabertura (dados.reaberta) e a fila
//    por (fornecedor, cotacao, reabertura). A placa nunca vai no aviso nem no e-mail.

export type CotacaoParaAviso = {
  id: string; oficina_id: string; peca_descricao: string | null; fipe_marca: string | null; fipe_modelo: string | null; fipe_ano: string | null;
  quantidade: number; observacao: string | null; fotos: unknown; status: string; tipo?: string | null; unidade?: string | null; alvo?: string | null;
  expira_em?: string | null; urgencia?: string | null; reaberta_vezes?: number | null;
};
export type ResultadoAviso = { success: true; lojasNotificadas: number; oficinasNotificadas: number; semCoordenadas?: boolean; emailsImediatos: number; naFila: number };

export const CAMPOS_COTACAO_AVISO = 'id, oficina_id, peca_descricao, fipe_marca, fipe_modelo, fipe_ano, quantidade, observacao, fotos, status, tipo, unidade, alvo, expira_em, urgencia, reaberta_vezes';
export const SEM_AVISO: ResultadoAviso = { success: true, lojasNotificadas: 0, oficinasNotificadas: 0, emailsImediatos: 0, naFila: 0 };

export async function carregarCotacaoParaAviso(cotacaoId: string): Promise<CotacaoParaAviso | null> {
  const { data } = await supabaseAdmin.from('cotacoes_pecas').select(CAMPOS_COTACAO_AVISO).eq('id', cotacaoId).maybeSingle();
  return (data as CotacaoParaAviso | null) || null;
}

/** aberta/respondida e nao vencida: so assim alguem e avisado */
export const cotacaoAvisavel = (cot: CotacaoParaAviso) => ['aberta', 'respondida'].includes(String(cot.status)) && !(cot.expira_em && Date.parse(cot.expira_em) < Date.now());

/**
 * reaberta = numero da reabertura (0 = aviso do pedido novo; n = re-aviso da n-esima reabertura).
 * Devolve o JSON da rota (o de hoje + emailsImediatos/naFila) ou { erro, status }.
 */
export async function avisarFornecedoresCotacao(cot: CotacaoParaAviso, reaberta = 0): Promise<ResultadoAviso | { erro: string; status: number }> {
  if (!cotacaoAvisavel(cot)) return SEM_AVISO;
  const cotacaoId = cot.id;

  const { data: compradora } = await supabaseAdmin
    .from('oficinas')
    .select('id, nome_fantasia, pais, latitude, longitude, profile:profiles!oficinas_profile_id_fkey(conta_teste)')
    .eq('id', cot.oficina_id)
    .single();
  if (!compradora) return { erro: 'Oficina nao encontrada', status: 404 };
  const compradoraTeste = !!(compradora as any).profile?.conta_teste;

  const pecaDescricao = cot.peca_descricao || '-';
  const oficinaCompradoraNome = compradora.nome_fantasia || '-';
  const semCarro = cot.tipo === 'sem_carro';
  const carro = semCarro ? '' : [cot.fipe_marca, cot.fipe_modelo, cot.fipe_ano].filter(Boolean).join(' ');
  const quantidade = Number(cot.quantidade) || 1;
  const unidade = cot.unidade || 'un';
  const foto = Array.isArray(cot.fotos) && cot.fotos.length ? String(cot.fotos[0]) : null;
  const vars = (perto: boolean) => ({ peca: pecaDescricao, oficina: oficinaCompradoraNome, carro, quantidade, unidade, semCarro, perto });
  const urgencia = cot.urgencia || null;
  const marcaReaberta = String(reaberta);

  // Auditoria Fable 16/11 (M-A): cada fornecedor e avisado uma vez por cotacao (e por reabertura),
  // mesmo se a rota for chamada de novo (rede, F5) - nada de e-mail repetido.
  const [{ data: jaAvisados }, { data: respostas }, { data: dispensas }] = await Promise.all([
    supabaseAdmin.from('notificacoes').select('profile_id, dados').eq('tipo', 'cotacao_peca_disponivel').eq('dados->>cotacao_id', cotacaoId),
    supabaseAdmin.from('cotacoes_pecas_respostas').select('fornecedor_tipo, loja_id, oficina_fornecedora_id').eq('cotacao_id', cotacaoId),
    supabaseAdmin.from('cotacoes_pecas_dispensas').select('fornecedor_tipo, fornecedor_id').eq('cotacao_id', cotacaoId),
  ]);
  const avisados = new Set((jaAvisados || []).filter((n: any) => String(n.dados?.reaberta ?? '0') === marcaReaberta).map((n: any) => n.profile_id));
  const fora = new Set<string>([
    ...((respostas as any[]) || []).map((r) => `${r.fornecedor_tipo}:${r.loja_id || r.oficina_fornecedora_id}`),
    ...((dispensas as any[]) || []).map((d) => `${d.fornecedor_tipo}:${d.fornecedor_id}`),
  ]);

  let emailsImediatos = 0, naFila = 0;
  const inicioDia = inicioDoDiaTallinn();

  // linha do log/fila: UNIQUE (fornecedor, cotacao, rodada). O re-aviso do "reabrir" e outra rodada.
  // lote 3 (093): fornecedor_id na linha (o resumo deixa de procurar o fornecedor pelo perfil)
  const gravarLinha = async (profileId: string, fornecedorTipo: 'loja' | 'oficina', fornecedorId: string, campos: { tipo: 'imediato' | 'resumo'; motivo: 'sem_pressa' | 'teto' | null; enviado_em?: string | null }): Promise<string | null> => {
    const linha = { profile_id: profileId, cotacao_id: cotacaoId, fornecedor_tipo: fornecedorTipo, fornecedor_id: fornecedorId, reaberta, tipo: campos.tipo, motivo: campos.motivo, enviado_em: campos.enviado_em ?? null };
    // ON CONFLICT DO NOTHING: se outra chamada ja tratou este fornecedor nesta rodada, nao manda de novo
    const { data, error } = await supabaseAdmin.from('avisos_email_pecas').upsert(linha, { onConflict: 'profile_id,cotacao_id,reaberta', ignoreDuplicates: true }).select('id');
    if (error) { console.error('[avisar-fornecedores] fila:', error.message); return null; }
    return data?.[0]?.id || null;
  };

  const avisar = async (alvo: { profileId: string; idioma?: string | null; email?: string | null; nome?: string | null; tipo: 'loja' | 'oficina'; fornecedorId: string; pais?: string | null }, paraLoja: boolean) => {
    if (avisados.has(alvo.profileId) || fora.has(`${alvo.tipo}:${alvo.fornecedorId}`)) return false;
    avisados.add(alvo.profileId);
    const link = paraLoja ? '/loja/cotacoes' : '/oficina/pecas?aba=vender';
    const nn = notifCotacaoPecaDisponivel(alvo.idioma, vars(!paraLoja));
    await supabaseAdmin.from('notificacoes').insert({
      profile_id: alvo.profileId,
      tipo: 'cotacao_peca_disponivel',
      titulo: nn.titulo,
      mensagem: nn.mensagem,
      dados: { cotacao_id: cotacaoId, link, ...(reaberta > 0 ? { reaberta: marcaReaberta } : {}), textos: emTodasAsLinguas((l) => notifCotacaoPecaDisponivel(l, vars(!paraLoja))) },
    });
    if (!alvo.email) return true;
    const email = { toEmail: alvo.email, toName: alvo.nome || '', pecaDescricao, oficinaCompradoraNome, carro, quantidade, unidade, observacao: cot.observacao, foto, paraLoja, linkInterno: link, locale: alvo.idioma || undefined };

    // cotacao da tela de hoje (sem urgencia): o e-mail imediato de sempre; o log vem depois
    if (!urgencia) {
      const r = await sendCotacaoPecaDisponivelEmail(email).catch(() => ({ success: false }));
      if (r.success) emailsImediatos++;
      await gravarLinha(alvo.profileId, alvo.tipo, alvo.fornecedorId, { tipo: 'imediato', motivo: null, enviado_em: new Date().toISOString() }).catch(() => null);
      return true;
    }
    if (urgencia === 'sem_pressa') {
      if (await gravarLinha(alvo.profileId, alvo.tipo, alvo.fornecedorId, { tipo: 'resumo', motivo: 'sem_pressa' })) naFila++;
      return true;
    }
    // hoje / amanha: imediato ate o teto do dia (Tallinn); o teto e "macio" (sem trava)
    const { count } = await supabaseAdmin.from('avisos_email_pecas').select('id', { count: 'exact', head: true })
      .eq('profile_id', alvo.profileId).eq('tipo', 'imediato').gte('enviado_em', inicioDia);
    if ((count || 0) >= TETO_IMEDIATOS_DIA) {
      if (await gravarLinha(alvo.profileId, alvo.tipo, alvo.fornecedorId, { tipo: 'resumo', motivo: 'teto' })) naFila++;
      return true;
    }
    const linhaId = await gravarLinha(alvo.profileId, alvo.tipo, alvo.fornecedorId, { tipo: 'imediato', motivo: null });
    if (!linhaId) return true; // outra chamada ja mandou
    const naoTenhoUrl = cot.expira_em ? await linkNaoTenho({ profileId: alvo.profileId, cotacaoId, fornecedorTipo: alvo.tipo, fornecedorId: alvo.fornecedorId, expiraEm: cot.expira_em, idioma: alvo.idioma }) : null;
    const abertaAte = cot.expira_em ? dataHoraTexto(alvo.idioma, cot.expira_em, fusoDoPais(alvo.pais || compradora.pais)) : null;
    const r = await sendCotacaoPecaDisponivelEmail({ ...email, urgencia, abertaAte, naoTenhoUrl }).catch(() => ({ success: false }));
    if (r.success) emailsImediatos++;
    // lote 3 (item 2 do Fable): imediato que falhou vai para a fila do resumo (sai do teto do dia)
    await supabaseAdmin.from('avisos_email_pecas').update(r.success ? { enviado_em: new Date().toISOString() } : { enviado_em: null, tipo: 'resumo', motivo: 'falha', erro: 'falha_envio' }).eq('id', linhaId);
    if (!r.success) naFila++;
    // 3c (D-8): cotacao urgente com e-mail imediato tambem avisa no navegador (nunca o resumo)
    else enviarPushNavegador(alvo.profileId, { titulo: nn.titulo, mensagem: nn.mensagem, link, urgente: urgencia === 'hoje' }).catch(() => {});
    return true;
  };

  // ---- lojas de pecas do mesmo pais ----
  let lojasNotificadas = 0;
  if (compradora.pais) {
    const { data: lojas } = await supabaseAdmin
      .from('lojas_pecas')
      .select('id, profile_id, nome_fantasia, profile:profiles(email, nome, idioma, conta_teste, ativo)')
      .eq('ativa', true)
      .eq('pais', compradora.pais);
    for (const l of lojas || []) {
      const p = (l as any).profile;
      if (!l.profile_id || !p || p.ativo === false || !!p.conta_teste !== compradoraTeste) continue;
      if (await avisar({ profileId: l.profile_id, idioma: p.idioma, email: p.email, nome: p.nome || l.nome_fantasia, tipo: 'loja', fornecedorId: l.id, pais: compradora.pais }, true)) lojasNotificadas++;
    }
  }

  // ---- oficinas vizinhas que vendem sobra (precisa das coordenadas da compradora) ----
  // "so lojas" (alvo, lote 1): nenhuma oficina e avisada
  let oficinasNotificadas = 0;
  const latitude = compradora.latitude;
  const longitude = compradora.longitude;
  if (latitude != null && longitude != null && cot.alvo !== 'so_lojas') {
    // Caixa larga (100km) so pra pre-filtrar no banco; o corte de verdade e o
    // raio de atendimento de cada oficina (o mesmo da aba "Vender excedente").
    const BOUNDING_BOX_KM = 100;
    const radiusLat = BOUNDING_BOX_KM / 111;
    const radiusLon = BOUNDING_BOX_KM / (111 * Math.cos(latitude * Math.PI / 180));
    const CAMPOS_VENDEDORA = 'id, profile_id, nome_fantasia, pais, latitude, longitude, raio_atendimento_km, pecas_alcance, profile:profiles!oficinas_profile_id_fkey(email, nome, idioma, conta_teste)';
    const { data: candidatas, error } = await supabaseAdmin
      .from('oficinas')
      .select(CAMPOS_VENDEDORA)
      .eq('vende_pecas', true)
      .eq('ativa', true)
      .neq('id', compradora.id)
      .gte('latitude', latitude - radiusLat)
      .lte('latitude', latitude + radiusLat)
      .gte('longitude', longitude - radiusLon)
      .lte('longitude', longitude + radiusLon);
    if (error) return { erro: error.message, status: 500 };
    // lote 3 (3b, N-6): a vendedora com alcance 'pais' recebe do pais inteiro, sem a caixa de 100 km
    // (so muda QUEM e avisado; o texto do sino/e-mail e o de hoje)
    const { data: doPais } = compradora.pais
      ? await supabaseAdmin.from('oficinas').select(CAMPOS_VENDEDORA).eq('vende_pecas', true).eq('ativa', true).eq('pecas_alcance', 'pais').eq('pais', compradora.pais).neq('id', compradora.id)
      : { data: [] as any[] };
    const vistas = new Set<string>();
    const todas = [...((candidatas as any[]) || []), ...((doPais as any[]) || [])].filter((o) => !vistas.has(o.id) && !!vistas.add(o.id));

    for (const o of todas) {
      if (!o.profile_id) continue;
      const p = (o as any).profile;
      if (!!p?.conta_teste !== compradoraTeste) continue;
      if (o.pecas_alcance === 'pais') {
        if (o.pais !== compradora.pais) continue;
      } else {
        if (o.latitude == null || o.longitude == null) continue;
        if (distanciaKm(latitude, longitude, o.latitude, o.longitude) > (o.raio_atendimento_km || 30)) continue;
      }
      if (await avisar({ profileId: o.profile_id, idioma: p?.idioma, email: p?.email, nome: p?.nome || o.nome_fantasia, tipo: 'oficina', fornecedorId: o.id, pais: (o as any).pais }, false)) oficinasNotificadas++;
    }
  }

  return { success: true, lojasNotificadas, oficinasNotificadas, semCoordenadas: latitude == null || longitude == null, emailsImediatos, naFila };
}
