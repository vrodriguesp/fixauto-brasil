import RolagemTeclado from '../../components/RolagemTeclado';
import { useEffect, useCallback, useState, useMemo } from 'react';
import { FotosPedido, SeguroPedido } from '../../components/FotosESeguroPedido';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, RefreshControl, Keyboard } from 'react-native';
import { avisar } from '../../lib/confirmar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useFocusEffect, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Solicitacao, Orcamento, DisponibilidadeSlot, ManutencaoEtapa, Avaliacao } from '@fixauto/shared';
import { formatCurrency, formatDate, currencyForCountry } from '@fixauto/shared';
import { supabase } from '../../lib/supabase';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { mensagemErro, ErroApi } from '../../lib/erro';
import { turnoDisponivel, type Turno } from '../../lib/turnos';
import { limparDescricao, ehAcidente } from '../../lib/texto';
import EditarPedido from '../../components/EditarPedido';
import RevisaoPendente from '../../components/RevisaoPendente';
import { useAvisos } from '../../lib/avisos';
import { abrirOficina } from '../../lib/oficina-link';
import { tDias } from '../../i18n';
import CartaoSituacao from '../../components/CartaoSituacao';
import OpcaoCartao from '../../components/OpcaoCartao';
import { situacaoDoPedido } from '../../lib/situacao';
import { useTraducoes, AvisoTraducao } from '../../lib/traducao';
import { fusoDoPais } from '../../lib/fuso';

type Ordem = 'preco' | 'nota' | 'cedo';
const ATIVO = ['enviado', 'visualizado'];
// mesmo prazo do site (apps/web/src/lib/pedido-validade.ts, migracao 072)
const VALIDADE_PEDIDO_DIAS = 30;

// itens do orcamento escritos pela oficina, na lingua de quem le (teste 05/11)
function ItensOrcamento({ itens, moeda, locale }: { itens: { id: string; descricao: string; quantidade: number; valor_total: number }[]; moeda: string; locale: string }) {
  const { t } = useTranslation();
  const [original, setOriginal] = useState(false);
  const tr = useTraducoes(itens.map((it) => it.descricao), original);
  return (
    <View className="border-t border-gray-100 pt-2 mb-2">
      <Text className="text-xs font-semibold text-gray-700 mb-1">{t('orcamentos.itens')}</Text>
      {itens.map((it, i) => (
        <View key={it.id} className="flex-row justify-between gap-3 py-0.5">
          <Text className="text-sm text-gray-700 flex-1">{it.quantidade > 1 ? `${it.quantidade}× ` : ''}{tr.textos[i]}</Text>
          <Text className="text-sm text-gray-900">{formatCurrency(it.valor_total, moeda as any, locale)}</Text>
        </View>
      ))}
      <AvisoTraducao traduzido={tr.traduzido} original={original} alternar={() => setOriginal((o) => !o)} />
    </View>
  );
}

// pedido expirado (072): o cartao de situacao ja explica; aqui so o botao de
// reabrir (volta com os mesmos orcamentos) - o aviso longo repetia o cartao
function PedidoExpirado({ solicitacaoId, aoReabrir }: { solicitacaoId: string; aoReabrir: () => void }) {
  const { t } = useTranslation();
  const [reabrindo, setReabrindo] = useState(false);
  const [erro, setErro] = useState(false);
  const reabrir = async () => {
    setReabrindo(true); setErro(false);
    const { error } = await supabase.rpc('reabrir_pedido', { p_solicitacao: solicitacaoId });
    setReabrindo(false);
    if (error) { setErro(true); return; }
    aoReabrir();
  };
  return (
    <View className="mb-4" testID="pedido-expirado" accessibilityHint={t('pedidoExpirado.texto', { dias: VALIDADE_PEDIDO_DIAS })}>
      {erro && <Text className="text-sm text-red-700 mb-2" accessibilityRole="alert">{t('pedidoExpirado.erro')}</Text>}
      <Pressable onPress={reabrir} disabled={reabrindo} accessibilityRole="button" testID="reabrir-pedido"
        className="bg-primary-600 rounded-lg py-3 items-center" style={{ opacity: reabrindo ? 0.6 : 1, minHeight: 44 }}>
        <Text className="text-white font-semibold">{reabrindo ? t('pedidoExpirado.reabrindo') : t('pedidoExpirado.reabrir')}</Text>
      </Pressable>
    </View>
  );
}

export default function SolicitacaoDetailScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets(); // barra do sistema no Android ponta a ponta
  // Opcoes do cabecalho criadas uma vez: objeto novo a cada desenho fazia o
  // cabecalho e a tela se redesenharem sem fim no iPhone ("Maximum update depth").
  const locale = i18n.language;
  const { user } = useAuth();
  const { atualizar: atualizarAvisos } = useAvisos();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [solicitacao, setSolicitacao] = useState<Solicitacao | null>(null);
  // titulo: o carro do pedido (antes "Acompanhamento do reparo" mesmo na fase de orcamentos) e
  // sempre um voltar - aberto por link (e-mail/aviso) nao ha tela anterior: leva ao inicio (teste 09/11)
  const carroTitulo = (solicitacao as any)?.veiculo?.fipe_marca ? `${(solicitacao as any).veiculo.fipe_marca} ${(solicitacao as any).veiculo.fipe_modelo || ''}`.trim() : '';
  const tituloTela = carroTitulo || t('acompanhamento.tituloPedido');
  const opcoesTela = useMemo(() => ({
    headerShown: true, title: tituloTela,
    ...(router.canGoBack() ? {} : { headerLeft: () => (
      <Pressable onPress={() => router.replace('/(tabs)')} accessibilityRole="button" accessibilityLabel={t('common.voltar')} hitSlop={10} style={{ paddingHorizontal: 8 }}>
        <Ionicons name="chevron-back" size={24} color="#111827" />
      </Pressable>
    ) }),
  }), [tituloTela]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // cancelar o proprio pedido (dono 09/11): painel na tela, motivo opcional; depois, reabrir
  const [painelCancelar, setPainelCancelar] = useState(false);
  const [motivoCancelar, setMotivoCancelar] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [avisoCancelar, setAvisoCancelar] = useState('');
  // conversa com a oficina escolhida ja encerrada (servico terminou, sem garantia)
  const [conversaFechada, setConversaFechada] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('solicitacoes')
      .select('*, veiculo:veiculos(*), orcamentos(*, oficina:oficinas(id, nome_fantasia, pais, profile_id, cidade, avaliacao_media, total_avaliacoes), itens:orcamento_itens(id, descricao, quantidade, valor_total), disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(*)), orcamento_revisoes(status, tipo)')
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
    Keyboard.dismiss();
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
        avisar(t('common.erroGenerico'), mensagemErro(error));
      } else if (data) {
        setAvaliacao(data as Avaliacao);
        await apiFetch('/api/atualizar-avaliacao-oficina', { method: 'POST', body: JSON.stringify({ oficinaId }) }).catch(() => {});
      }
    } catch (e) {
      avisar(t('common.erroGenerico'), mensagemErro(e));
    } finally {
      setEnviandoAvaliacao(false);
    }
  };

  const handleAceitar = async (orcamento: Orcamento) => {
    Keyboard.dismiss();
    const slotId = slotSelecionado[orcamento.id];
    if (!slotId) return;
    setProcessando(orcamento.id);
    try {
      await apiFetch('/api/aceitar-orcamento', { method: 'POST', body: JSON.stringify({ orcamentoId: orcamento.id, slotId }) });
      await carregar();
    } catch (e) {
      avisar(t('common.erroGenerico'), mensagemErro(e));
    } finally {
      setProcessando(null);
    }
  };

  const handleRecusar = async (orcamento: Orcamento) => {
    Keyboard.dismiss();
    setProcessando(orcamento.id);
    await supabase.from('orcamentos').update({ status: 'recusado' }).eq('id', orcamento.id);
    await carregar();
    setProcessando(null);
  };

  useEffect(() => {
    const ac = (solicitacao?.orcamentos || []).find((o) => o.status === 'aceito');
    if (!solicitacao || !ac) { setConversaFechada(false); return; }
    supabase.rpc('conversa_aberta', { p_sol: solicitacao.id, p_of: ac.oficina_id }).then(({ data }) => setConversaFechada(data === false));
  }, [solicitacao]);

  const cancelarPedido = async () => {
    if (!solicitacao || cancelando) return;
    setCancelando(true); setAvisoCancelar('');
    try {
      await apiFetch(`/api/solicitacoes/${solicitacao.id}/cancelar`, { method: 'POST', body: JSON.stringify(motivoCancelar ? { motivo: motivoCancelar } : {}) });
      setPainelCancelar(false); setMotivoCancelar(null);
      setAvisoCancelar(t('cancelarPedido.feito'));
      await carregar();
    } catch (e) {
      setAvisoCancelar(e instanceof ErroApi && e.codigo === 'CARRO_NA_OFICINA' ? t('cancelarPedido.carroNaOficina') : mensagemErro(e));
    } finally {
      setCancelando(false);
    }
  };
  const reabrirPedido = async () => {
    if (!solicitacao || cancelando) return;
    setCancelando(true); setAvisoCancelar('');
    try {
      await apiFetch(`/api/solicitacoes/${solicitacao.id}/reabrir`, { method: 'POST', body: '{}' });
      setAvisoCancelar(t('cancelarPedido.reaberto'));
      await carregar();
    } catch (e) {
      setAvisoCancelar(mensagemErro(e));
    } finally {
      setCancelando(false);
    }
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
  // ate o carro chegar na oficina (depois, so pela conversa com ela)
  const podeCancelar = ['aberta', 'em_orcamento', 'aceita', 'expirada'].includes(solicitacao.status as string)
    && !agenda.some((a: any) => ['em_andamento', 'concluido'].includes(a.status));

  return (
    <RolagemTeclado bottomOffset={24} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" className="flex-1 bg-gray-50" contentContainerStyle={{ paddingBottom: insets.bottom }} refreshControl={<RefreshControl refreshing={puxando} onRefresh={recarregar} />}>
      <Stack.Screen options={opcoesTela} />
      <View className="p-4">
        <Text className="text-xl font-bold text-gray-900">
          {veiculo?.fipe_marca ? `${veiculo.fipe_marca} ${veiculo.fipe_modelo}` : ehAcidente(solicitacao.descricao) ? t('acompanhamento.acidente') : ''}
        </Text>
        {limparDescricao(solicitacao.descricao) ? <Text className="text-gray-600 mb-1">{limparDescricao(solicitacao.descricao)}</Text> : null}
        {(solicitacao as any).numero ? <Text className="text-sm text-gray-500 mb-2" selectable>{t('constants.numeroPedido', { n: (solicitacao as any).numero })}</Text> : null}
        {/* situacao + o que acontece agora (auditoria 10/10, C2) */}
        <CartaoSituacao solicitacao={solicitacao} situacao={situacao} />
        {(solicitacao.status as string) === 'expirada' && <PedidoExpirado solicitacaoId={solicitacao.id} aoReabrir={carregar} />}

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
            <Text className="text-emerald-800 text-xl font-bold">{tDias(t, 'garantia.diasRestantes', diasGarantia)}</Text>
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

        <Pressable onPress={() => (aceito ? router.push({ pathname: '/conversa/[id]', params: { id: solicitacao.id, oficina: aceito.oficina_id } }) : router.push(`/conversa/${solicitacao.id}`))}
          className={`rounded-lg py-3 items-center mb-6 ${aceito && conversaFechada ? 'bg-gray-100' : 'bg-primary-50'}`} testID="botao-conversa">
          <Text className={aceito && conversaFechada ? 'text-gray-600 font-medium' : 'text-primary-700 font-medium'}>{aceito && conversaFechada ? t('mensagens.verConversaEncerrada') : t('mensagens.titulo')}</Text>
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
            <Text className="text-xs text-gray-500 mb-2">{[(orc as any).prazo_dias ? tDias(t, 'orcamentos.prazoDias', (orc as any).prazo_dias, 'n') : null, t(`orcamentos.status${orc.status.charAt(0).toUpperCase()}${orc.status.slice(1)}`)].filter(Boolean).join(' · ')}</Text>
            {itens.length > 0 && <ItensOrcamento itens={itens} moeda={moeda} locale={locale} />}
            {(orc as any).garantia_dias != null && (
              <Text className="text-sm text-gray-700 mb-3">🛡️ {(orc as any).garantia_dias > 0 ? tDias(t, 'garantia.noOrcamento', (orc as any).garantia_dias) : t('garantia.sem')}</Text>
            )}
            {/* antes de escolher: perguntar a ESTA oficina sobre o orcamento dela (no site cada orcamento ja
                tinha "escrever a oficina"; no app so havia o botao geral - teste 09/11) */}
            {!escolhido && orc.status !== 'recusado' && (
              <Pressable onPress={() => router.push({ pathname: '/conversa/[id]', params: { id: solicitacao.id, oficina: orc.oficina_id } })} accessibilityRole="button"
                className="self-start mb-3 bg-white border border-primary-200 rounded-lg px-3 py-2" testID="conversar-oficina-orcamento">
                <Text className="text-primary-700 text-sm font-medium">💬 {t('agendaMudanca.conversar')}</Text>
              </Pressable>
            )}
            {/* data atual da agenda (pode ter mudado depois do aceite) + como remarcar/cancelar (076) */}
            {escolhido && (() => {
              const ag = agenda.find((a: any) => a.status === 'agendado' && a.oficina_id === orc.oficina_id) as any;
              if (!ag?.data_inicio) return null;
              return (
                <View className="border-t border-emerald-200 pt-3 mb-3" testID="agendamento-atual">
                  <Text className="text-sm text-emerald-900"><Text className="font-semibold">📅 {t('agendaMudanca.levarCarro')}: </Text>{new Date(ag.data_inicio).toLocaleString(locale === 'pt' ? 'pt-BR' : locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: fusoDoPais((orc as any).oficina?.pais) })}</Text>
                  <Text className="text-xs text-emerald-900 mt-2">{t('agendaMudanca.notaRemarcar')}</Text>
                  <Pressable onPress={() => router.push({ pathname: '/conversa/[id]', params: { id: solicitacao.id, oficina: orc.oficina_id } })} accessibilityRole="button"
                    className="self-start mt-2 bg-white border border-primary-200 rounded-lg px-3 py-2" testID="conversar-oficina">
                    <Text className="text-primary-700 text-sm font-medium">💬 {t('agendaMudanca.conversar')}</Text>
                  </Pressable>
                </View>
              );
            })()}

            {/* pedido expirado: aceitar/recusar so depois de reabrir (aviso no topo) */}
            {(orc.status === 'enviado' || orc.status === 'visualizado') && (solicitacao.status as string) !== 'expirada' ? (
              <>
                {(orc.disponibilidade || []).length > 0 && (
                  <Text className="text-sm font-medium text-gray-700 mb-2">{t('orcamentos.escolhaData')}</Text>
                )}
                {/* horario que ja passou nao se escolhe */}
                {(orc.disponibilidade || []).length > 0 && (orc.disponibilidade || []).every((slot: DisponibilidadeSlot) => !turnoDisponivel(slot.data_checkin, slot.turno as Turno)) && (
                  <Text className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3 mb-2">{t('orcamentos.horariosVencidos')}</Text>
                )}
                {/* horario sugerido pela oficina: cartao inteiro tocavel com radio (teste do dono 31/10) */}
                <View accessibilityRole="radiogroup">
                {(orc.disponibilidade || []).filter((slot: DisponibilidadeSlot) => turnoDisponivel(slot.data_checkin, slot.turno as Turno)).map((slot: DisponibilidadeSlot) => (
                  <OpcaoCartao
                    key={slot.id}
                    selecionado={slotSelecionado[orc.id] === slot.id}
                    onPress={() => setSlotSelecionado((prev) => ({ ...prev, [orc.id]: slot.id }))}
                    icone="calendar-outline"
                    titulo={`${formatDate(slot.data_checkin, locale)} · ${t(`orcamentos.turno_${slot.turno}`, slot.turno)} (${slot.turno === 'manha' ? '08:00-12:00' : '13:00-17:00'})`}
                    subtitulo={(slot as any).data_previsao_entrega ? t('orcamentos.entregaPrevista', { data: formatDate((slot as any).data_previsao_entrega, locale) }) : null}
                  />
                ))}
                </View>
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
                  className="border border-gray-300 rounded-lg px-3 py-2 mb-3 text-[16px]"
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

        {/* cancelar o pedido (antes do carro chegar) ou reabrir o cancelado */}
        {avisoCancelar ? <Text className="text-sm text-gray-800 bg-gray-100 rounded-lg px-3 py-2 mb-3" testID="aviso-cancelar">{avisoCancelar}</Text> : null}
        {podeCancelar && !painelCancelar && (
          <Pressable onPress={() => { setPainelCancelar(true); setAvisoCancelar(''); }} accessibilityRole="button" className="self-center py-3 mb-6" testID="cancelar-pedido">
            <Text className="text-red-600 font-medium">{t('cancelarPedido.botao')}</Text>
          </Pressable>
        )}
        {podeCancelar && painelCancelar && (
          <View className="bg-white border border-red-200 rounded-xl p-4 mb-6" testID="painel-cancelar">
            <Text className="text-base font-semibold text-gray-900">{t('cancelarPedido.titulo')}</Text>
            <Text className="text-sm text-gray-600 mt-1 mb-3">{t('cancelarPedido.texto')}</Text>
            <Text className="text-sm font-medium text-gray-700 mb-2">{t('cancelarPedido.motivoTitulo')}</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {['resolvido', 'outraOficina', 'desisti'].map((m) => (
                <Pressable key={m} onPress={() => setMotivoCancelar((x) => (x === m ? null : m))} accessibilityRole="radio" accessibilityState={{ checked: motivoCancelar === m }}
                  className={`px-3 py-2 rounded-full border ${motivoCancelar === m ? 'bg-red-50 border-red-400' : 'bg-white border-gray-300'}`}>
                  <Text className={motivoCancelar === m ? 'text-red-800 text-sm font-medium' : 'text-gray-700 text-sm'}>{t(`cancelarPedido.motivo_${m}`)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={cancelarPedido} disabled={cancelando} accessibilityRole="button" className="bg-red-600 rounded-lg py-3 items-center mb-2 disabled:opacity-50" testID="confirmar-cancelar-pedido">
              {cancelando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">{t('cancelarPedido.confirmar')}</Text>}
            </Pressable>
            <Pressable onPress={() => { setPainelCancelar(false); setMotivoCancelar(null); }} accessibilityRole="button" className="py-2 items-center">
              <Text className="text-gray-700 font-medium">{t('common.voltar')}</Text>
            </Pressable>
          </View>
        )}
        {solicitacao.status === 'cancelada' && (
          <Pressable onPress={reabrirPedido} disabled={cancelando} accessibilityRole="button" className="bg-white border border-primary-300 rounded-lg py-3 items-center mb-6" testID="reabrir-pedido">
            {cancelando ? <ActivityIndicator color="#2563eb" /> : <Text className="text-primary-700 font-semibold">{t('cancelarPedido.reabrir')}</Text>}
          </Pressable>
        )}
      </View>
    </RolagemTeclado>
  );
}
