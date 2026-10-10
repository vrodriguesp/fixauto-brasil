import { useEffect, useCallback, useState, useMemo } from 'react';
import { FotosPedido, SeguroPedido } from '../../components/FotosESeguroPedido';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, TextInput, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useFocusEffect, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Solicitacao, Orcamento, DisponibilidadeSlot, ManutencaoEtapa, Avaliacao } from '@fixauto/shared';
import { formatCurrency, formatDate, currencyForCountry } from '@fixauto/shared';
import { supabase } from '../../lib/supabase';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { mensagemErro } from '../../lib/erro';
import { turnoDisponivel, type Turno } from '../../lib/turnos';
import { limparDescricao, ehAcidente } from '../../lib/texto';
import EditarPedido from '../../components/EditarPedido';
import RevisaoPendente from '../../components/RevisaoPendente';
import { useAvisos } from '../../lib/avisos';
import { abrirOficina } from '../../lib/oficina-link';
import CartaoSituacao from '../../components/CartaoSituacao';
import { situacaoDoPedido } from '../../lib/situacao';

type Ordem = 'preco' | 'nota' | 'cedo';
const ATIVO = ['enviado', 'visualizado'];

export default function SolicitacaoDetailScreen() {
  const { t, i18n } = useTranslation();
  // Opcoes do cabecalho criadas uma vez: objeto novo a cada desenho fazia o
  // cabecalho e a tela se redesenharem sem fim no iPhone ("Maximum update depth").
  const tituloTela = t('acompanhamento.titulo');
  const opcoesTela = useMemo(() => ({ headerShown: true, title: tituloTela }), [tituloTela]);
  const locale = i18n.language;
  const { user } = useAuth();
  const { atualizar: atualizarAvisos } = useAvisos();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [solicitacao, setSolicitacao] = useState<Solicitacao | null>(null);
  const [etapas, setEtapas] = useState<ManutencaoEtapa[]>([]);
  const [avaliacao, setAvaliacao] = useState<Avaliacao | null>(null);
  const [notaSelecionada, setNotaSelecionada] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviandoAvaliacao, setEnviandoAvaliacao] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);
  const [slotSelecionado, setSlotSelecionado] = useState<Record<string, string>>({});
  const [entrega, setEntrega] = useState<{ oficinaId: string; dataFim: string } | null>(null);
  const [puxando, setPuxando] = useState(false);
  const [agenda, setAgenda] = useState<{ status: string; data_inicio: string | null }[]>([]);
  // comparar orcamentos (auditoria 10/10, C2): ordem escolhida e os "outros" recolhidos
  const [ordemOrc, setOrdemOrc] = useState<Ordem>('preco');
  const [verOutros, setVerOutros] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('solicitacoes')
      .select('*, veiculo:veiculos(*), orcamentos(*, oficina:oficinas(id, nome_fantasia, pais, profile_id, cidade, avaliacao_media, total_avaliacoes), itens:orcamento_itens(id, descricao, quantidade, valor_total), disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(*))')
      .eq('id', id)
      .single();
    setSolicitacao(data as Solicitacao);
    if (!data) { setLoading(false); return; }
    // avisos deste pedido (orcamento novo, carro chegou, etapas) ficam lidos
    if (user) {
      supabase.from('notificacoes').update({ lida: true }).eq('profile_id', user.id).neq('tipo', 'nova_mensagem').eq('dados->>solicitacao_id', id)
        .then(() => atualizarAvisos());
    }

    const { data: agendaRows } = await supabase
      .from('agenda')
      .select('id, oficina_id, status, data_inicio, data_fim')
      .eq('solicitacao_id', id);
    setAgenda((agendaRows || []) as any);
    const entregue = (agendaRows || []).find((a: any) => a.status === 'concluido' && a.data_fim);
    setEntrega(entregue ? { oficinaId: entregue.oficina_id, dataFim: entregue.data_fim } : null);
    const agendaIds = (agendaRows || []).map((a) => a.id);
    if (agendaIds.length > 0) {
      const { data: etapasData } = await supabase
        .from('manutencao_etapas')
        .select('*')
        .in('agenda_id', agendaIds)
        .order('created_at', { ascending: true });
      setEtapas((etapasData as ManutencaoEtapa[]) || []);
    } else {
      setEtapas([]);
    }

    const { data: avaliacaoData } = await supabase
      .from('avaliacoes')
      .select('*')
      .eq('solicitacao_id', id)
      .maybeSingle();
    setAvaliacao((avaliacaoData as Avaliacao) || null);

    setLoading(false);
  }, [id]);

  // aviso novo (orcamento, etapa do conserto, mensagem): recarrega na hora
  const { chegou: avisoChegou } = useAvisos();
  useEffect(() => { if (avisoChegou) carregar(); }, [avisoChegou]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  const handleEnviarAvaliacao = async () => {
    if (!notaSelecionada || !user || !solicitacao) return;
    const orcamentoAceito = (solicitacao.orcamentos || []).find((o) => o.status === 'aceito');
    const oficinaId = orcamentoAceito?.oficina?.id;
    if (!oficinaId) return;
    setEnviandoAvaliacao(true);
    try {
      const { data, error } = await supabase
        .from('avaliacoes')
        .insert({ solicitacao_id: solicitacao.id, oficina_id: oficinaId, cliente_id: user.id, nota: notaSelecionada, comentario: comentario.trim() || null })
        .select()
        .single();
      if (error) {
        Alert.alert(t('common.erroGenerico'), mensagemErro(error));
      } else if (data) {
        setAvaliacao(data as Avaliacao);
        await apiFetch('/api/atualizar-avaliacao-oficina', { method: 'POST', body: JSON.stringify({ oficinaId }) }).catch(() => {});
      }
    } catch (e) {
      Alert.alert(t('common.erroGenerico'), mensagemErro(e));
    } finally {
      setEnviandoAvaliacao(false);
    }
  };

  const handleAceitar = async (orcamento: Orcamento) => {
    const slotId = slotSelecionado[orcamento.id];
    if (!slotId) return;
    setProcessando(orcamento.id);
    try {
      await apiFetch('/api/aceitar-orcamento', { method: 'POST', body: JSON.stringify({ orcamentoId: orcamento.id, slotId }) });
      await carregar();
    } catch (e) {
      Alert.alert(t('common.erroGenerico'), mensagemErro(e));
    } finally {
      setProcessando(null);
    }
  };

  const handleRecusar = async (orcamento: Orcamento) => {
    setProcessando(orcamento.id);
    await supabase.from('orcamentos').update({ status: 'recusado' }).eq('id', orcamento.id);
    await carregar();
    setProcessando(null);
  };

  if (loading || !solicitacao) {
    // pedido apagado/cancelado ou sem acesso: aviso + voltar (antes girava para sempre)
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Stack.Screen options={opcoesTela} />
        {loading ? <ActivityIndicator color="#2563eb" /> : (
          <>
            <Text className="text-gray-600 text-center mb-4">{t('acompanhamento.naoEncontrado')}</Text>
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} accessibilityRole="button" className="bg-primary-600 rounded-lg px-6 py-3">
              <Text className="text-white font-semibold">{t('common.voltar')}</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  const veiculo = solicitacao.veiculo;
  const aceito = (solicitacao.orcamentos || []).find((o) => o.status === 'aceito') as any;
  // contagem da garantia: conta da entrega (dias informados no orcamento)
  const fimGarantia = aceito?.garantia_dias > 0 && entrega && entrega.oficinaId === aceito.oficina_id
    ? new Date(new Date(entrega.dataFim).getTime() + aceito.garantia_dias * 86400000) : null;
  const diasGarantia = fimGarantia ? Math.ceil((fimGarantia.getTime() - Date.now()) / 86400000) : 0;
  // escolhido primeiro; os ativos na ordem escolhida (menor preco, melhor
  // avaliada, dia mais cedo); recusados/vencidos recolhidos em "Outros"
  const primeiroDia = (o: any) => ((o.disponibilidade || []) as DisponibilidadeSlot[]).filter((d) => turnoDisponivel(d.data_checkin, d.turno as Turno)).map((d) => d.data_checkin).sort()[0] || '9999';
  const nota = (o: any) => (o.oficina?.total_avaliacoes ? Number(o.oficina.avaliacao_media || 0) : -1);
  const todos = (solicitacao.orcamentos || []) as any[];
  const ativos = todos.filter((o) => ATIVO.includes(o.status)).sort((a, b) =>
    ordemOrc === 'preco' ? a.valor_total - b.valor_total : ordemOrc === 'nota' ? nota(b) - nota(a) || a.valor_total - b.valor_total : primeiroDia(a).localeCompare(primeiroDia(b)) || a.valor_total - b.valor_total);
  const escolhidoOrc = todos.filter((o) => o.status === 'aceito');
  const outrosOrc = todos.filter((o) => !ATIVO.includes(o.status) && o.status !== 'aceito');
  const orcamentos = [...escolhidoOrc, ...ativos, ...(verOutros ? outrosOrc : [])];
  // marcadores (so com 2 ou mais para comparar): um por cartao, na ordem preco > nota > cedo
  const marca: Record<string, string> = {};
  if (ativos.length >= 2) {
    const porPreco = [...ativos].sort((a, b) => a.valor_total - b.valor_total)[0];
    const porNota = [...ativos].filter((o) => nota(o) >= 0).sort((a, b) => nota(b) - nota(a))[0];
    const porDia = [...ativos].filter((o) => primeiroDia(o) !== '9999').sort((a, b) => primeiroDia(a).localeCompare(primeiroDia(b)))[0];
    if (porPreco) marca[porPreco.id] = 'preco';
    if (porNota && !marca[porNota.id]) marca[porNota.id] = 'nota';
    if (porDia && !marca[porDia.id]) marca[porDia.id] = 'cedo';
  }
  const moedaPedido = currencyForCountry((ativos[0]?.oficina as any)?.pais);
  const situacao = situacaoDoPedido(solicitacao, { agenda, etapas: etapas as any, avaliado: solicitacao.status === 'concluida' ? !!avaliacao : undefined });
  const recarregar = async () => { setPuxando(true); await carregar(); setPuxando(false); };

  return (
    <ScrollView keyboardDismissMode="on-drag" className="flex-1 bg-gray-50" refreshControl={<RefreshControl refreshing={puxando} onRefresh={recarregar} />}>
      <Stack.Screen options={opcoesTela} />
      <View className="p-4">
        <Text className="text-xl font-bold text-gray-900">
          {veiculo?.fipe_marca ? `${veiculo.fipe_marca} ${veiculo.fipe_modelo}` : ehAcidente(solicitacao.descricao) ? t('acompanhamento.acidente') : ''}
        </Text>
        {limparDescricao(solicitacao.descricao) ? <Text className="text-gray-600 mb-1">{limparDescricao(solicitacao.descricao)}</Text> : null}
        {(solicitacao as any).numero ? <Text className="text-sm text-gray-500 mb-2" selectable>{t('constants.numeroPedido', { n: (solicitacao as any).numero })}</Text> : null}
        {/* situacao + o que acontece agora (auditoria 10/10, C2) */}
        <CartaoSituacao solicitacao={solicitacao} situacao={situacao} />

        {['aberta', 'em_orcamento'].includes(solicitacao.status) && (
          <EditarPedido key={`${solicitacao.id}-${veiculo?.fipe_marca || ''}`} solicitacaoId={solicitacao.id} descricao={solicitacao.descricao} veiculo={(veiculo as any) || null} aoSalvar={carregar} />
        )}

        {/* fotos enviadas e, no acidente, quem paga o reparo (teste 09/10, ponto 2) */}
        <FotosPedido solicitacaoId={solicitacao.id} />
        {(solicitacao as any).emergencia_id && !['cancelada', 'concluida'].includes(solicitacao.status) && (
          <SeguroPedido key={`${(solicitacao as any).pagamento_reparo}-${(solicitacao as any).sinistro_numero}`} emergenciaId={(solicitacao as any).emergencia_id}
            atual={{ pagamento_reparo: (solicitacao as any).pagamento_reparo ?? null, seguradora: (solicitacao as any).seguradora ?? null, sinistro_numero: (solicitacao as any).sinistro_numero ?? null, franquia: (solicitacao as any).franquia ?? null }}
            aoSalvar={carregar} />
        )}

        {fimGarantia && diasGarantia > 0 && (
          <View className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4">
            <Text className="text-gray-600 text-sm">{t('garantia.desteServico')} · {aceito?.oficina?.nome_fantasia}</Text>
            <Text className="text-emerald-800 text-xl font-bold">{t('garantia.diasRestantes', { dias: diasGarantia })}</Text>
            <Text className="text-gray-500 text-xs">{t('garantia.ate', { data: formatDate(fimGarantia.toISOString(), locale) })}</Text>
            <Pressable accessibilityRole="button"
              onPress={() => router.push({ pathname: '/conversa/[id]', params: { id: solicitacao.id, oficina: aceito.oficina_id } })}
              className="self-start bg-white border border-emerald-300 rounded-lg px-3 py-2 mt-2">
              <Text className="text-emerald-800 font-medium">💬 {t('garantia.falarComOficina')}</Text>
            </Pressable>
          </View>
        )}

        {/* revisao proposta pela oficina depois do aceite: o cliente decide */}
        <RevisaoPendente solicitacaoId={solicitacao.id} recarregar={avisoChegou} aoDecidir={carregar} />

        <Pressable onPress={() => router.push(`/conversa/${solicitacao.id}`)} className="bg-primary-50 rounded-lg py-3 items-center mb-6">
          <Text className="text-primary-700 font-medium">{t('mensagens.titulo')}</Text>
        </Pressable>

        <Text className="text-base font-semibold text-gray-900 mb-1">{t('orcamentos.titulo')}</Text>

        {todos.length === 0 && (
          <Text className="text-gray-500 mb-3">{t('orcamentos.nenhumAinda')}</Text>
        )}
        {ativos.length >= 2 && (
          <>
            <Text className="text-sm text-gray-600 mb-2" testID="orc-resumo">
              {t('orcamentos.resumo', { n: ativos.length, min: formatCurrency(Math.min(...ativos.map((o) => o.valor_total)), moedaPedido, locale), max: formatCurrency(Math.max(...ativos.map((o) => o.valor_total)), moedaPedido, locale) })}
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-3" accessibilityRole="radiogroup" accessibilityLabel={t('orcamentos.ordenar')}>
              {(['preco', 'nota', 'cedo'] as Ordem[]).map((o) => (
                <Pressable key={o} onPress={() => setOrdemOrc(o)} accessibilityRole="radio" accessibilityState={{ selected: ordemOrc === o }}
                  className={`px-3 py-1.5 rounded-full border ${ordemOrc === o ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-300'}`}>
                  <Text className={ordemOrc === o ? 'text-white text-sm font-medium' : 'text-gray-700 text-sm'}>{t(`orcamentos.ord_${o}`)}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {orcamentos.map((orc) => {
          const of = orc.oficina as any;
          const moeda = currencyForCountry(of?.pais);
          const itens = ((orc as any).itens || []) as { id: string; descricao: string; quantidade: number; valor_total: number }[];
          const escolhido = orc.status === 'aceito';
          return (
          <View key={orc.id} className={`rounded-xl p-4 mb-3 ${escolhido ? 'bg-emerald-50 border-2 border-emerald-500' : 'bg-white border border-gray-200'}`}
            style={orc.status === 'recusado' || orc.status === 'expirado' ? { opacity: 0.6 } : undefined}>
            {marca[orc.id] && (
              <View className="self-start bg-amber-100 rounded-full px-3 py-1 mb-2" testID={`marca-${marca[orc.id]}`}>
                <Text className="text-amber-900 text-xs font-semibold">★ {t(`orcamentos.marca_${marca[orc.id]}`)}</Text>
              </View>
            )}
            {escolhido && (
              <View className="self-start flex-row items-center gap-1 bg-emerald-600 rounded-full px-3 py-1 mb-2">
                <Ionicons name="checkmark-circle" size={14} color="#fff" />
                <Text className="text-white text-xs font-semibold">{t('orcamentos.escolhido')}</Text>
              </View>
            )}
            <Text className="font-semibold text-gray-900">{t('orcamentos.recebidoDe', { oficina: of?.nome_fantasia || '-' })}</Text>
            <Text className="text-xs text-gray-500 mb-1">
              {[of?.total_avaliacoes ? t('orcamentos.avaliacoes', { nota: Number(of.avaliacao_media || 0).toFixed(1), n: of.total_avaliacoes }) : t('orcamentos.semAvaliacoes'), of?.cidade].filter(Boolean).join(' · ')}
            </Text>
            {of?.id ? (
              <Pressable onPress={() => abrirOficina(of.id, locale)} accessibilityRole="link" hitSlop={6} className="self-start mb-2">
                <Text className="text-primary-700 text-sm font-medium">{t('orcamentos.verOficina')} ›</Text>
              </Pressable>
            ) : null}
            <Text className="text-2xl font-bold text-gray-900">{formatCurrency(orc.valor_total, moeda, locale)}</Text>
            <Text className="text-xs text-gray-500 mb-2">{[(orc as any).prazo_dias ? t('orcamentos.prazoDias', { n: (orc as any).prazo_dias }) : null, t(`orcamentos.status${orc.status.charAt(0).toUpperCase()}${orc.status.slice(1)}`)].filter(Boolean).join(' · ')}</Text>
            {itens.length > 0 && (
              <View className="border-t border-gray-100 pt-2 mb-2">
                <Text className="text-xs font-semibold text-gray-700 mb-1">{t('orcamentos.itens')}</Text>
                {itens.map((it) => (
                  <View key={it.id} className="flex-row justify-between gap-3 py-0.5">
                    <Text className="text-sm text-gray-700 flex-1">{it.quantidade > 1 ? `${it.quantidade}× ` : ''}{it.descricao}</Text>
                    <Text className="text-sm text-gray-900">{formatCurrency(it.valor_total, moeda, locale)}</Text>
                  </View>
                ))}
              </View>
            )}
            {(orc as any).garantia_dias != null && (
              <Text className="text-sm text-gray-700 mb-3">🛡️ {(orc as any).garantia_dias > 0 ? t('garantia.noOrcamento', { dias: (orc as any).garantia_dias }) : t('garantia.sem')}</Text>
            )}

            {orc.status === 'enviado' || orc.status === 'visualizado' ? (
              <>
                {(orc.disponibilidade || []).length > 0 && (
                  <Text className="text-sm font-medium text-gray-700 mb-2">{t('orcamentos.escolhaData')}</Text>
                )}
                {/* horario que ja passou nao se escolhe */}
                {(orc.disponibilidade || []).length > 0 && (orc.disponibilidade || []).every((slot: DisponibilidadeSlot) => !turnoDisponivel(slot.data_checkin, slot.turno as Turno)) && (
                  <Text className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3 mb-2">{t('orcamentos.horariosVencidos')}</Text>
                )}
                {(orc.disponibilidade || []).filter((slot: DisponibilidadeSlot) => turnoDisponivel(slot.data_checkin, slot.turno as Turno)).map((slot: DisponibilidadeSlot) => (
                  <Pressable
                    key={slot.id}
                    onPress={() => setSlotSelecionado((prev) => ({ ...prev, [orc.id]: slot.id }))}
                    className={`border rounded-lg px-3 py-2 mb-2 ${slotSelecionado[orc.id] === slot.id ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}
                  >
                    <Text className="text-sm font-medium text-gray-800">{formatDate(slot.data_checkin, locale)} · {t(`orcamentos.turno_${slot.turno}`, slot.turno)} ({slot.turno === 'manha' ? '08:00-12:00' : '13:00-17:00'})</Text>
                    {(slot as any).data_previsao_entrega ? <Text className="text-xs text-gray-500">{t('orcamentos.entregaPrevista', { data: formatDate((slot as any).data_previsao_entrega, locale) })}</Text> : null}
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => handleAceitar(orc)}
                  disabled={processando === orc.id || !slotSelecionado[orc.id]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: processando === orc.id || !slotSelecionado[orc.id] }}
                  className="bg-primary-600 rounded-lg py-3 items-center mt-2"
                  style={{ opacity: processando === orc.id || !slotSelecionado[orc.id] ? 0.45 : 1 }}
                >
                  {processando === orc.id ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">{t('orcamentos.aceitar')}</Text>}
                </Pressable>
                {/* recusar deixou de ser um botao do mesmo tamanho (auditoria 10/10, A5) */}
                <Pressable onPress={() => handleRecusar(orc)} disabled={processando === orc.id} accessibilityRole="button" hitSlop={8} className="self-center mt-3">
                  <Text className="text-gray-500 text-sm underline">{t('orcamentos.naoMeInteressa')}</Text>
                </Pressable>
              </>
            ) : null}
          </View>
          );
        })}
        {outrosOrc.length > 0 && (
          <Pressable onPress={() => setVerOutros((v) => !v)} accessibilityRole="button" className="self-start mb-4">
            <Text className="text-primary-700 text-sm font-medium">{verOutros ? '▾' : '▸'} {t('orcamentos.outros', { n: outrosOrc.length })}</Text>
          </Pressable>
        )}

        {etapas.length > 0 && (
          <>
            <Text className="text-base font-semibold text-gray-900 mb-3 mt-2">{t('acompanhamento.titulo')}</Text>
            <View className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
              {etapas.map((etapa, i) => (
                <View key={etapa.id} className={`flex-row items-start gap-3 ${i < etapas.length - 1 ? 'pb-4' : ''}`}>
                  <View className={`w-3 h-3 rounded-full mt-1 ${i === etapas.length - 1 ? 'bg-primary-600' : 'bg-gray-300'}`} />
                  <View className="flex-1">
                    <Text className={`text-sm ${i === etapas.length - 1 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                      {t(`constants.statusManutencao.${etapa.status}`, etapa.status)}
                    </Text>
                    <Text className="text-xs text-gray-400">{formatDate(etapa.created_at, locale)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {solicitacao.status === 'concluida' && (
          <View className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
            {avaliacao ? (
              <>
                <Text className="text-base font-semibold text-gray-900 mb-2">{t('avaliacao.jaAvaliado')}</Text>
                <View className="flex-row gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Ionicons key={n} name={n <= avaliacao.nota ? 'star' : 'star-outline'} size={22} color="#f59e0b" />
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text className="text-base font-semibold text-gray-900 mb-1">{t('avaliacao.titulo')}</Text>
                <Text className="text-sm text-gray-500 mb-3">{t('avaliacao.subtitulo')}</Text>
                <View className="flex-row gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable key={n} onPress={() => setNotaSelecionada(n)}>
                      <Ionicons name={n <= notaSelecionada ? 'star' : 'star-outline'} size={32} color="#f59e0b" />
                    </Pressable>
                  ))}
                </View>
                <TextInput accessibilityLabel={t('avaliacao.comentarioPlaceholder')}
                  value={comentario}
                  onChangeText={setComentario}
                  placeholder={t('avaliacao.comentarioPlaceholder')}
                  multiline
                  numberOfLines={3}
                  className="border border-gray-300 rounded-lg px-3 py-2 mb-3 text-sm"
                  style={{ textAlignVertical: 'top' }}
                />
                <Pressable
                  onPress={handleEnviarAvaliacao}
                  disabled={!notaSelecionada || enviandoAvaliacao}
                  className="bg-primary-600 rounded-lg py-3 items-center disabled:opacity-50"
                >
                  {enviandoAvaliacao ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-medium">{t('avaliacao.enviar')}</Text>}
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
