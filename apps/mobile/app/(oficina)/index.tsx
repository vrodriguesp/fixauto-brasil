import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, currencyForCountry, TIPOS_SERVICO } from '@fixauto/shared';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { useAvisos } from '../../lib/avisos';
import { TextoTraduzido } from '../../lib/traducao';
import { limparDescricao } from '../../lib/texto';
import { hojeLocal, janelaDoSlot, formatarJanela, janelaDaAgenda, semQuebra } from '../../lib/turnos';
import { fusoDoPais } from '../../lib/fuso';
import { agruparPedidos, corDaEspera, partesDaEspera, distanciaDoPedido, ehAcidente, ABAS, type Aba, type ItemCaixa, type Dispensa, type PedidoCaixa } from '../../lib/caixa-pedidos';
import { rotuloTipoOficina } from '../../lib/rotulo-pedido';

const MIN = 60e3;
const COR = {
  verde: { fundo: 'bg-emerald-100', texto: 'text-emerald-800' },
  ambar: { fundo: 'bg-amber-100', texto: 'text-amber-900' },
  vermelho: { fundo: 'bg-red-100', texto: 'text-red-800' },
  cinza: { fundo: 'bg-gray-100', texto: 'text-gray-700' },
};

// Caixa de pedidos da oficina (27/11): mesma regra e ordem do site (lib/caixa-pedidos.ts). Foco: receber o
// pedido e mandar o orcamento em poucos toques - o botao "Fazer orcamento" fica no proprio cartao.
export default function PedidosOficinaScreen() {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { user, oficina } = useAuth();
  const { naoLidos, chegou } = useAvisos();
  const { aba: abaParam } = useLocalSearchParams<{ aba?: string }>();
  const [aba, setAba] = useState<Aba>(ABAS.includes(abaParam as Aba) ? (abaParam as Aba) : 'responder');
  useEffect(() => { if (ABAS.includes(abaParam as Aba)) setAba(abaParam as Aba); }, [abaParam]);
  const [pedidos, setPedidos] = useState<PedidoCaixa[]>([]);
  const [vistos, setVistos] = useState<Set<string>>(new Set());
  const [dispensas, setDispensas] = useState<Map<string, Dispensa>>(new Map());
  const [agendas, setAgendas] = useState<Map<string, { inicio: string; ate: string | null }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setAgora(Date.now()), MIN); return () => clearInterval(i); }, []);

  const carregar = useCallback(async () => {
    if (!oficina) return;
    const [{ data: sols }, { data: v }, { data: d }, { data: ag }] = await Promise.all([
      // mesma consulta do site (use-solicitacoes): a RLS ja limita ao que a oficina pode ver; cancelados fora
      supabase.from('solicitacoes')
        .select('*, veiculo:veiculos(fipe_marca, fipe_modelo, fipe_ano, placa), fotos:solicitacao_fotos(id), convites:pedido_convites(oficina_id, origem), orcamentos(id, oficina_id, status, created_at, validade, valor_total, recusado_motivo, disponibilidade_escolhida_id, disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(id, data_checkin, turno, hora_inicio, hora_fim))')
        .neq('status', 'cancelada').order('created_at', { ascending: false }).limit(300),
      supabase.from('pedido_vistos').select('solicitacao_id').eq('oficina_id', oficina.id),
      supabase.from('pedido_dispensas').select('solicitacao_id, motivo, comentario, created_at').eq('oficina_id', oficina.id),
      supabase.from('agenda').select('solicitacao_id, data_inicio, checkin_ate').eq('oficina_id', oficina.id).in('status', ['agendado', 'em_andamento']).not('solicitacao_id', 'is', null),
    ]);
    setPedidos((sols as PedidoCaixa[]) || []);
    setVistos(new Set(((v || []) as any[]).map((x) => x.solicitacao_id)));
    setDispensas(new Map(((d || []) as Dispensa[]).map((x) => [x.solicitacao_id, x])));
    setAgendas(new Map(((ag || []) as any[]).map((a) => [a.solicitacao_id, { inicio: a.data_inicio, ate: a.checkin_ate ?? null }])));
    setLoading(false);
  }, [oficina?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  // aviso novo (pedido, aceite, mensagem) ou mudanca nos pedidos/orcamentos: recarrega
  useEffect(() => { if (chegou) carregar(); }, [chegou]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!oficina) return;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const recarregar = () => { if (espera) clearTimeout(espera); espera = setTimeout(carregar, 600); };
    const canal = supabase.channel(`pedidos-oficina-app-${oficina.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes' }, recarregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orcamentos' }, recarregar)
      .subscribe();
    return () => { if (espera) clearTimeout(espera); supabase.removeChannel(canal); };
  }, [oficina?.id, carregar]);

  const hojeYmd = hojeLocal(new Date(agora), oficina?.pais ?? null);
  const grupos = useMemo(() => (oficina ? agruparPedidos(pedidos, oficina as any, dispensas, hojeYmd, agora) : { responder: [], respondidos: [], encerrados: [] }), [pedidos, oficina, dispensas, hojeYmd, agora]);
  const moeda = currencyForCountry(oficina?.pais ?? null);
  const fuso = fusoDoPais(oficina?.pais ?? null);
  const fmtDia = useMemo(() => new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }), [i18n.language]);
  const fmtDiaAg = useMemo(() => new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: fuso }), [i18n.language, fuso]);
  const fmtData = useMemo(() => new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: fuso }), [i18n.language, fuso]);

  const espera = (ms: number) => {
    const { d, h, m } = partesDaEspera(ms);
    if (d > 0) return h ? t('oficina.diasHoras', { d, h }) : t('oficina.dias', { d });
    if (h > 0) return m ? t('oficina.horasMin', { h, m }) : t('oficina.horas', { h });
    return t('oficina.min', { n: m });
  };
  const carroDe = (s: any) => { const v = s.veiculo; return v?.fipe_marca ? [v.fipe_marca, v.fipe_modelo, v.fipe_ano].filter(Boolean).join(' ') : ''; };
  const iconeTipo = (tipo: string) => TIPOS_SERVICO.find((x) => x.value === tipo)?.icon || '🔧';
  const novosNaAba = grupos.responder.filter(({ s }) => !vistos.has(s.id)).length;

  const textoEstado = (it: ItemCaixa) => {
    const { s, meu, estado, disp } = it;
    if (estado === 'aceito') {
      const ag = agendas.get(s.id);
      const slot = meu?.disponibilidade?.find((x: any) => x.id === meu.disponibilidade_escolhida_id);
      const chegada = ag ? t('oficina.chegaEm', { dia: fmtDiaAg.format(new Date(ag.inicio)), periodo: formatarJanela(janelaDaAgenda(ag.inicio, ag.ate, oficina?.pais ?? null)) })
        : slot ? t('oficina.chegaEm', { dia: fmtDia.format(new Date(`${slot.data_checkin}T12:00:00Z`)), periodo: formatarJanela(janelaDoSlot(slot)) }) : '';
      return { cor: 'text-emerald-700', txt: semQuebra(`✔ ${t('oficina.clienteAceitou')}${chegada ? ` — ${chegada}` : ''}`) };
    }
    if (estado === 'entregue') return { cor: 'text-gray-700', txt: `✔ ${t('oficina.servicoEntregue')}` };
    if (estado === 'recusado') return { cor: 'text-gray-600', txt: `${t('oficina.clienteRecusou')}${meu?.recusado_motivo ? ` — ${t(`oficina.recusaMotivos.${meu.recusado_motivo}`, { defaultValue: '' })}` : ''}` };
    if (estado === 'expirado') return { cor: 'text-amber-800', txt: t('oficina.orcamentoVenceu') };
    if (estado === 'perdido') return { cor: 'text-gray-600', txt: t('oficina.outraOficina') };
    if (estado === 'dispensado') return { cor: 'text-gray-600', txt: t('oficina.voceDispensou', { motivo: t(`oficina.motivo_${disp?.motivo}`, { defaultValue: '' }) }) };
    return { cor: 'text-gray-700', txt: `✔ ${t('oficina.respondidoEm', { tempo: espera(Date.parse(meu!.created_at || '') - Date.parse(s.created_at)) })} · ${estado === 'visto' ? t('oficina.clienteViu') : t('oficina.clienteNaoDecidiu')}` };
  };

  const lista = grupos[aba];
  return (
    <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top + 8 }}>
      <View className="px-4 flex-row items-center justify-between mb-1">
        <Text className="text-2xl font-bold text-gray-900 flex-1" numberOfLines={1}>{oficina?.nome_fantasia || t('oficina.abaPedidos')}</Text>
        <Pressable onPress={() => router.push('/notificacoes')} accessibilityRole="button" accessibilityLabel={t('notificacoes.titulo')} hitSlop={10} className="p-2">
          <Ionicons name="notifications-outline" size={26} color="#111827" />
          {naoLidos.length > 0 && (
            <View className="absolute right-0 top-0 bg-red-500 rounded-full min-w-[18px] h-[18px] px-1 items-center justify-center">
              <Text className="text-white text-[10px] font-bold">{naoLidos.length > 9 ? '9+' : naoLidos.length}</Text>
            </View>
          )}
        </Pressable>
      </View>
      {(oficina as any)?.ativa === false ? (
        <Text accessibilityRole="alert" className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('oficina.cadastroEmAnalise')}</Text>
      ) : null}
      <View className="mx-4 mb-3 flex-row rounded-xl bg-gray-200 p-1" accessibilityRole="tablist">
        {ABAS.map((a) => (
          <Pressable key={a} onPress={() => setAba(a)} accessibilityRole="tab" accessibilityState={{ selected: aba === a }} testID={`aba-${a}`}
            className={`flex-1 min-h-[44px] rounded-lg px-1 items-center justify-center ${aba === a ? 'bg-white' : ''}`}>
            <Text className={`text-sm font-medium text-center ${aba === a ? 'text-gray-900' : 'text-gray-600'}`} numberOfLines={2}>
              {t(`oficina.aba_${a}`)}{a !== 'encerrados' && grupos[a].length > 0 ? ` (${grupos[a].length})` : ''}
            </Text>
            {a === 'responder' && novosNaAba > 0 ? <View className="absolute right-1 top-1 w-2.5 h-2.5 rounded-full bg-red-600" /> : null}
          </Pressable>
        ))}
      </View>
      <FlatList keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'} keyboardShouldPersistTaps="handled"
        data={lista}
        keyExtractor={(it) => it.s.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carregar} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={!loading ? (
          <View className="bg-white rounded-2xl border border-gray-200 p-6 items-center mt-2">
            <Text className="text-4xl mb-2">{aba === 'responder' ? '📭' : '🗂️'}</Text>
            <Text className="text-gray-700 text-center">{t(`oficina.vazio_${aba}`)}</Text>
          </View>
        ) : null}
        renderItem={({ item }) => {
          const { s, meu, estado } = item;
          const acidente = ehAcidente(s);
          const novo = aba === 'responder' && !vistos.has(s.id);
          const cor = aba === 'responder' ? corDaEspera(s.created_at, agora) : null;
          const dist = oficina ? distanciaDoPedido(s, oficina as any) : null;
          const fotos = ((s as any).fotos || []).length;
          const est = estado ? textoEstado(item) : null;
          const convidada = !!oficina && !!s.convites?.some((c) => c.oficina_id === oficina.id && c.origem !== 'tipo_alterado');
          return (
            <View className={`bg-white rounded-2xl px-4 py-3 mb-3 border ${acidente || cor === 'vermelho' ? 'border-l-4 border-l-red-500 border-gray-200' : 'border-gray-200'}`} testID="pedido-cartao">
              <Pressable onPress={() => router.push(`/pedido-oficina/${s.id}`)} accessibilityRole="button">
                <View className="flex-row items-start justify-between gap-2">
                  <Text className={`flex-1 text-base text-gray-900 ${novo ? 'font-bold' : 'font-medium'}`}>
                    {acidente ? <Text className="text-xs font-bold text-white bg-red-600 rounded px-1">🚨 {t('oficina.acidente')} </Text> : null}
                    {iconeTipo(s.tipo)} {rotuloTipoOficina(t, s.tipo, s.descricao)}{carroDe(s) ? ` · ${carroDe(s)}` : ''}
                    {(s as any).numero ? <Text className="text-sm font-normal text-gray-500">  {t('constants.numeroPedido', { n: (s as any).numero })}</Text> : null}
                  </Text>
                  {cor ? (
                    <View className={`rounded-full px-2.5 py-1 ${COR[cor].fundo}`} testID="contador">
                      <Text className={`text-sm font-semibold ${COR[cor].texto}`}>⏱ {espera(agora - Date.parse(s.created_at))}</Text>
                    </View>
                  ) : null}
                </View>
                <TextoTraduzido texto={limparDescricao(s.descricao)} className="mt-1 text-sm text-gray-600" numberOfLines={2} />
                <Text className="mt-1 text-sm text-gray-500">
                  {[fotos ? t('oficina.fotos', { n: fotos }) : t('oficina.semFotos'), dist != null ? `${dist.toFixed(1)} km` : null, (s as any).pagamento_reparo && (s as any).pagamento_reparo !== 'proprio' ? `🛡 ${t('oficina.seguro')}` : null, novo ? `● ${t('oficina.novo')}` : null].filter(Boolean).join(' · ')}
                </Text>
                {meu ? (
                  <Text className="mt-1 text-xs text-gray-500">
                    {[t('oficina.pedidoEm', { data: fmtData.format(new Date(s.created_at)) }), t('oficina.orcamentoEm', { data: fmtData.format(new Date(meu.created_at || '')) }), meu.valor_total != null ? formatCurrency(Number(meu.valor_total), moeda, i18n.language) : null].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                {convidada ? <Text className="mt-2 self-start rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-900">📨 {t('oficina.convidada')}</Text> : null}
                {est ? <Text className={`mt-2 text-sm font-medium ${est.cor}`}>{est.txt}</Text> : null}
              </Pressable>
              {aba === 'responder' ? (
                <Pressable onPress={() => router.push(`/orcamento/${s.id}`)} accessibilityRole="button" testID="fazer-orcamento"
                  className="mt-3 bg-primary-600 rounded-xl min-h-[48px] items-center justify-center">
                  <Text className="text-white font-semibold text-base">{t('oficina.fazerOrcamento')} ›</Text>
                </Pressable>
              ) : null}
              {aba === 'encerrados' && (estado === 'recusado' || estado === 'expirado') && ['aberta', 'em_orcamento'].includes(s.status) ? (
                <Pressable onPress={() => router.push(`/orcamento/${s.id}`)} accessibilityRole="button"
                  className="mt-3 border border-gray-300 rounded-xl min-h-[44px] items-center justify-center">
                  <Text className="text-gray-800 font-semibold">{t('oficina.novoOrcamento')} ›</Text>
                </Pressable>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}
