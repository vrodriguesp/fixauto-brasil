import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Keyboard } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, currencyForCountry, parseFlexibleNumber } from '@fixauto/shared';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { apiFetch } from '../../lib/api';
import { limparDescricao } from '../../lib/texto';
import { rotuloTipoOficina } from '../../lib/rotulo-pedido';
import { TextoTraduzido } from '../../lib/traducao';
import { hojeLocal, somarDias, faixasDoDia, formatarJanela, janelaAindaVale, expedienteDoDia, janelaDoSlot, maiorData, validadeSugerida, conflitoHorario, type ContextoOficina } from '../../lib/turnos';
import { validarOrcamento, validadeMinima, itensParaGravar, slotsParaGravar, observacoesComComissao, percentualComissao, totalDosItens, TIPOS_ITEM, type ItemForm, type SlotForm, type ErrosForm } from '../../lib/orcamento-form';

const PRAZO_PADRAO_DIAS = 1;
const TEMPO_PADRAO_HORAS = 2;
const GARANTIAS = [0, 30, 90, 180, 365, 730];
const MAX_DATAS = 5;
const DIAS_NO_SELETOR = 21;

// Formulario de orcamento da OFICINA no app (27/11): mesmas regras e gravacao do site
// (apps/web/src/app/[locale]/oficina/orcamento/[id]/page.tsx + hooks/use-orcamentos.ts). Novo orcamento ou
// alteracao de um enviado/recusado/vencido. Revisao de orcamento ACEITO fica no site (v2).
export default function OrcamentoScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { oficina, funcionario } = useAuth();
  const [sol, setSol] = useState<any | null | undefined>(undefined);
  const [horario, setHorario] = useState<ContextoOficina | null>(null);
  const [comissao, setComissao] = useState<{ taxa?: number; tipo?: string; valorFixo?: number } | null>(null);
  const [itens, setItens] = useState<ItemForm[]>([{ descricao: '', tipo: 'mao_de_obra', quantidade: 1, valor_unitario: 0 }]);
  const [valores, setValores] = useState<string[]>(['']);
  const [prazoDias, setPrazoDias] = useState(PRAZO_PADRAO_DIAS);
  const [garantia, setGarantia] = useState<number | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [slots, setSlots] = useState<SlotForm[]>([]);
  const [diaEscolhendo, setDiaEscolhendo] = useState<string | null>(null);
  const [validade, setValidade] = useState('');
  const [erros, setErros] = useState<ErrosForm | null>(null);
  const [erroEnvio, setErroEnvio] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const rolagem = useRef<ScrollView>(null);

  const pais = oficina?.pais ?? null;
  const moeda = currencyForCountry(pais);
  const meu = useMemo(() => (sol?.orcamentos || []).find((o: any) => o.oficina_id === oficina?.id), [sol, oficina?.id]);

  // pedido + meu orcamento (para alterar) + horario da oficina (dias fechados, faixas) + taxa de comissao
  const carregar = useCallback(async () => {
    if (!id || !oficina) return;
    const [{ data }, { data: of }] = await Promise.all([
      supabase.from('solicitacoes').select('id, numero, status, tipo, descricao, created_at, urgencia, veiculo:veiculos(fipe_marca, fipe_modelo, fipe_ano, placa), orcamentos(*, itens:orcamento_itens(*), disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(*))').eq('id', id).maybeSingle(),
      supabase.from('oficinas').select('horario_funcionamento, recepcao_inicio, recepcao_fim, almoco_inicio, almoco_fim').eq('id', oficina.id).maybeSingle(),
    ]);
    setSol(data || null);
    if (of) setHorario({ horario: (of as any).horario_funcionamento, recepcao_inicio: (of as any).recepcao_inicio, recepcao_fim: (of as any).recepcao_fim, almoco_inicio: (of as any).almoco_inicio, almoco_fim: (of as any).almoco_fim });
    // taxa real da oficina (so a dona le; funcionario fica com os 10% padrao, igual ao site)
    apiFetch(`/api/comissao-atual?oficinaId=${oficina.id}`, { method: 'GET' }).then((c) => setComissao(c)).catch(() => {});
    const existente = ((data as any)?.orcamentos || []).find((o: any) => o.oficina_id === oficina.id);
    if (existente && existente.status !== 'aceito') {
      const its: ItemForm[] = (existente.itens || []).map((i: any) => ({ descricao: i.descricao || '', tipo: i.tipo || 'mao_de_obra', quantidade: Number(i.quantidade) || 1, valor_unitario: Number(i.valor_unitario) || 0 }));
      if (its.length) { setItens(its); setValores(its.map((i) => String(i.valor_unitario || ''))); }
      setPrazoDias(Number(existente.prazo_dias) || PRAZO_PADRAO_DIAS);
      setGarantia(existente.garantia_dias ?? null);
      setObservacoes(limparDescricao(existente.observacoes));
      // datas antigas que ja passaram saem (a validacao recusaria); validade recomeca
      const agora = new Date();
      setSlots((existente.disponibilidade || []).map((d: any) => ({ data: d.data_checkin, ...janelaDoSlot(d) })).map((s: any) => ({ data: s.data, hora_inicio: s.inicio, hora_fim: s.fim })).filter((s: SlotForm) => janelaAindaVale(s.data, { inicio: s.hora_inicio, fim: s.hora_fim }, agora, pais)));
    }
  }, [id, oficina?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [carregar]);

  const total = totalDosItens(itens);
  const pct = percentualComissao(total, comissao);
  const datasVisiveis = sol?.status !== 'em_andamento';
  const hoje = hojeLocal(new Date(), pais);
  // dias que a oficina pode oferecer: os proximos 21, so os abertos pelo horario do perfil (dia fechado = bloqueio no envio)
  const dias = useMemo(() => Array.from({ length: DIAS_NO_SELETOR }, (_, i) => somarDias(hoje, i)).filter((d) => !!expedienteDoDia(d, horario?.horario) && conflitoHorario(d, 'manha', horario?.horario) !== 'fechado'), [hoje, horario]);
  const faixasDe = (d: string) => faixasDoDia(d, horario).filter((j) => janelaAindaVale(d, j, new Date(), pais));
  const ultimaValida = maiorData(slots.filter((s) => janelaAindaVale(s.data, { inicio: s.hora_inicio, fim: s.hora_fim }, new Date(), pais)).map((s) => s.data));
  const sugestaoValidade = validadeSugerida(ultimaValida, horario?.horario);
  const minValidade = validadeMinima(slots, pais);
  const opcoesValidade = useMemo(() => {
    const base = ultimaValida || hoje;
    const lista = [sugestaoValidade, somarDias(base, 14), somarDias(base, 30)].filter((d, i, a) => d && d >= minValidade && a.indexOf(d) === i);
    return lista.length ? lista : [somarDias(minValidade, 7)];
  }, [sugestaoValidade, ultimaValida, hoje, minValidade]);
  // validade sugerida acompanha as datas ate a oficina escolher outra
  const validadeManual = useRef(false);
  useEffect(() => { if (!validadeManual.current && (sugestaoValidade || !validade)) setValidade(sugestaoValidade || opcoesValidade[0]); }, [sugestaoValidade]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtDia = useMemo(() => new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }), [i18n.language]);
  const fmtLonga = useMemo(() => new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }), [i18n.language]);
  const dataUtc = (ymd: string) => new Date(`${ymd}T12:00:00Z`);

  const mudarItem = (i: number, campo: Partial<ItemForm>) => setItens((l) => l.map((it, j) => (j === i ? { ...it, ...campo } : it)));
  const mudarValor = (i: number, txt: string) => { setValores((l) => l.map((v, j) => (j === i ? txt : v))); mudarItem(i, { valor_unitario: parseFlexibleNumber(txt) || 0 }); };
  const addItem = () => { setItens((l) => [...l, { descricao: '', tipo: 'mao_de_obra', quantidade: 1, valor_unitario: 0 }]); setValores((l) => [...l, '']); };
  const removerItem = (i: number) => { if (itens.length === 1) return; setItens((l) => l.filter((_, j) => j !== i)); setValores((l) => l.filter((_, j) => j !== i)); };
  const addSlot = (data: string, j: { inicio: string; fim: string }) => {
    setDiaEscolhendo(null);
    if (slots.some((s) => s.data === data && s.hora_inicio === j.inicio && s.hora_fim === j.fim) || slots.length >= MAX_DATAS) return;
    setSlots((l) => [...l, { data, hora_inicio: j.inicio, hora_fim: j.fim }].sort((a, b) => (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio)));
  };

  const enviar = async () => {
    Keyboard.dismiss();
    if (enviando || !oficina || !sol) return;
    setErroEnvio('');
    const e = validarOrcamento({ itens, slots, validade, horario: horario?.horario, pais, datasVisiveis });
    setErros(e);
    if (e.faltas.length) { rolagem.current?.scrollTo({ y: e.faltas[0] === 'valor' ? 0 : 400, animated: true }); return; }
    setEnviando(true);
    const nomePadrao = rotuloTipoOficina(t, sol.tipo, sol.descricao);
    const itensPayload = itensParaGravar(itens, nomePadrao);
    const slotsPayload = slotsParaGravar(slots, prazoDias);
    const obs = observacoesComComissao(observacoes, 'absorver', pct);
    let orcId: string | null = null;
    let erro: any = null;
    if (meu && meu.status !== 'aceito') {
      // alteracao (use-orcamentos.update): horarios novos primeiro; so depois o orcamento, os itens e os antigos saem
      const { data: antigos } = await supabase.from('orcamento_disponibilidade').select('id').eq('orcamento_id', meu.id);
      let novosIds: string[] = [];
      if (slotsPayload.length) {
        const { data: novos, error: eS } = await supabase.from('orcamento_disponibilidade').insert(slotsPayload.map((s) => ({ ...s, orcamento_id: meu.id }))).select('id');
        if (eS) erro = eS; else novosIds = (novos || []).map((n: any) => n.id);
      }
      if (!erro) {
        const { error: eU } = await supabase.from('orcamentos').update({
          valor_total: total, prazo_dias: prazoDias, tempo_execucao_horas: meu.tempo_execucao_horas ?? TEMPO_PADRAO_HORAS, observacoes: obs, validade,
          valor_original: meu.valor_original || meu.valor_total, revisao_numero: (meu.revisao_numero || 0) + 1, garantia_dias: garantia,
          revisado_em: new Date().toISOString(), status: 'enviado', disponibilidade_escolhida_id: null,
        }).eq('id', meu.id);
        if (eU) { erro = eU; if (novosIds.length) await supabase.from('orcamento_disponibilidade').delete().in('id', novosIds); }
        else {
          await supabase.from('orcamento_itens').delete().eq('orcamento_id', meu.id);
          if (itensPayload.length) await supabase.from('orcamento_itens').insert(itensPayload.map((i) => ({ ...i, orcamento_id: meu.id })));
          const idsAntigos = (antigos || []).map((a: any) => a.id).filter((x: string) => !novosIds.includes(x));
          if (idsAntigos.length) await supabase.from('orcamento_disponibilidade').delete().in('id', idsAntigos);
          await supabase.from('solicitacoes').update({ status: 'em_orcamento' }).eq('id', sol.id);
          orcId = meu.id;
        }
      }
    } else {
      // novo (use-orcamentos.create): orcamento, itens, horarios; horario recusado pelo banco apaga o orcamento recem-criado
      const { data: orc, error: eC } = await supabase.from('orcamentos').insert({
        solicitacao_id: sol.id, oficina_id: oficina.id, valor_total: total, prazo_dias: prazoDias, tempo_execucao_horas: TEMPO_PADRAO_HORAS,
        observacoes: obs, validade, garantia_dias: garantia,
      }).select().single();
      if (eC || !orc) erro = eC || { message: 'Failed' };
      else {
        if (itensPayload.length) await supabase.from('orcamento_itens').insert(itensPayload.map((i) => ({ ...i, orcamento_id: orc.id })));
        if (slotsPayload.length) {
          const { error: eS } = await supabase.from('orcamento_disponibilidade').insert(slotsPayload.map((s) => ({ ...s, orcamento_id: orc.id })));
          if (eS) { await supabase.from('orcamentos').delete().eq('id', orc.id); erro = eS; }
        }
        if (!erro) {
          await supabase.from('solicitacoes').update({ status: 'em_orcamento' }).eq('id', sol.id).eq('status', 'aberta');
          orcId = orc.id;
        }
      }
    }
    setEnviando(false);
    if (erro || !orcId) {
      // codigo do erro junto (revisao Fable): o suporte entende o que o banco recusou
      setErroEnvio(/DIA_FECHADO/.test(erro?.message || '') ? t('oficina.erroDiaFechadoEnvio') : `${t('oficina.erroEnvioOrcamento')} (${erro?.code || erro?.message || '?'})`);
      return;
    }
    // aviso ao motorista (sino + e-mail + SMS) e comissao recalculada: no servidor, como no site; nao bloqueiam
    // 1a vez: sino + e-mail + SMS; alteracao: sino "revisado" (ou "novo" depois de recusado) + resumo no chat, como o
    // site (lib/avisar-revisao-orcamento.ts). Falha aqui nao desfaz o orcamento gravado.
    const alteracao = !!meu && meu.status !== 'aceito';
    apiFetch('/api/notificar-orcamento', { method: 'POST', body: JSON.stringify(alteracao ? { orcamentoId: orcId, revisao: true, eraRecusado: meu.status === 'recusado' } : { orcamentoId: orcId }) }).catch(() => {});
    if (!funcionario) apiFetch('/api/recalcular-comissao', { method: 'POST', body: JSON.stringify({ oficinaId: oficina.id }) }).catch(() => {});
    setEnviado(true);
    setTimeout(() => router.replace({ pathname: '/(oficina)', params: { aba: 'respondidos' } } as any), 1800);
  };

  if (sol === undefined) return <View className="flex-1 items-center justify-center bg-white"><ActivityIndicator color="#2563eb" /></View>;
  if (sol === null) return <View className="flex-1 items-center justify-center bg-gray-50 p-6"><Text className="text-gray-700 text-center">{t('oficina.pedidoNaoEncontrado')}</Text></View>;
  if (enviado) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6" testID="orcamento-enviado">
        <Ionicons name="checkmark-circle" size={64} color="#059669" />
        <Text className="text-xl font-bold text-gray-900 mt-3">{meu ? t('oficina.orcamentoRevisado') : t('oficina.orcamentoEnviado')}</Text>
        <Text className="text-gray-600 text-center mt-1">{t('oficina.clienteNotificadoAceite')}</Text>
      </View>
    );
  }
  // sem o que fazer aqui: pedido fechado, carro ja na oficina com orcamento aceito, ou mecanico (so a dona/admin orca)
  // equipe (qualquer cargo): a RLS so deixa a conta da dona gravar orcamento (orcamentos_insert) - avisa antes de
  // preencher, nao depois (revisao Fable S4)
  const bloqueado = ['concluida', 'cancelada', 'expirada'].includes(sol.status) ? 'fechado' : meu?.status === 'aceito' ? 'aceito' : funcionario ? 'equipe' : null;
  if (bloqueado) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-6">
        <Stack.Screen options={{ title: t('oficina.orcamentoTitulo') }} />
        <Text className="text-gray-700 text-center">{t(`oficina.bloqueado_${bloqueado}`)}</Text>
        <Pressable onPress={() => router.replace(`/pedido-oficina/${sol.id}`)} accessibilityRole="button" className="mt-4 bg-primary-600 rounded-xl px-6 py-3"><Text className="text-white font-semibold">{t('oficina.verPedido')}</Text></Pressable>
      </View>
    );
  }
  const v = sol.veiculo;
  return (
    <ScrollView ref={rolagem} className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: meu ? t('oficina.modificarOrcamento') : t('oficina.orcamentoTitulo') }} />
      {/* resumo do pedido */}
      <Pressable onPress={() => router.push(`/pedido-oficina/${sol.id}`)} accessibilityRole="button" className="bg-white rounded-xl border border-gray-200 p-3 mb-4">
        <Text className="font-semibold text-gray-900">{[rotuloTipoOficina(t, sol.tipo, sol.descricao), v?.fipe_marca ? [v.fipe_marca, v.fipe_modelo, v.fipe_ano].filter(Boolean).join(' ') : ''].filter(Boolean).join(' · ')}</Text>
        <TextoTraduzido texto={limparDescricao(sol.descricao)} className="text-sm text-gray-600 mt-1" numberOfLines={3} />
        <Text className="text-xs text-primary-700 mt-1">{t('oficina.verPedido')} ›</Text>
      </Pressable>
      {meu ? <Text className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-4">{t('oficina.jaEnviouOrcamento', { numero: (meu.revisao_numero || 0) + 1 })}</Text> : null}

      {/* itens */}
      <Text className="text-base font-semibold text-gray-900 mb-2">{t('oficina.itensOrcamento')}</Text>
      {itens.map((it, i) => (
        <View key={i} className={`bg-white rounded-xl border p-3 mb-2 ${erros?.semValor && i === 0 ? 'border-red-400' : 'border-gray-200'}`} testID={`item-${i}`}>
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-gray-500">{t('oficina.itemNumero', { numero: i + 1 })}</Text>
            {itens.length > 1 ? <Pressable onPress={() => removerItem(i)} accessibilityRole="button" accessibilityLabel={t('oficina.remover')} hitSlop={8}><Ionicons name="trash-outline" size={18} color="#6b7280" /></Pressable> : null}
          </View>
          <TextInput value={it.descricao} onChangeText={(x) => mudarItem(i, { descricao: x })} placeholder={t('oficina.placeholderDescricaoItem')} testID={`item-desc-${i}`}
            className="border border-gray-300 rounded-lg px-3 py-2 text-[16px] mt-2" />
          <View className="flex-row flex-wrap gap-1.5 mt-2">
            {TIPOS_ITEM.map((tp) => (
              <Pressable key={tp} onPress={() => mudarItem(i, { tipo: tp })} accessibilityRole="button" accessibilityState={{ selected: it.tipo === tp }}
                className={`px-3 py-1.5 rounded-full border ${it.tipo === tp ? 'bg-primary-600 border-primary-600' : 'border-gray-300 bg-white'}`}>
                <Text className={`text-xs font-medium ${it.tipo === tp ? 'text-white' : 'text-gray-700'}`}>{t(`oficina.tipoItem_${tp}`)}</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row gap-2 mt-2">
            <View className="flex-[2]">
              <Text className="text-xs text-gray-500 mb-1">{t('oficina.valorUnitario', { moeda })}</Text>
              <TextInput value={valores[i] ?? ''} onChangeText={(x) => mudarValor(i, x)} keyboardType="decimal-pad" placeholder="0" testID={`item-valor-${i}`}
                className={`border rounded-lg px-3 py-2 text-[16px] ${erros?.semValor ? 'border-red-400' : 'border-gray-300'}`} />
            </View>
            <View className="flex-1">
              <Text className="text-xs text-gray-500 mb-1">{t('oficina.qtd')}</Text>
              <View className="flex-row items-center border border-gray-300 rounded-lg">
                <Pressable onPress={() => mudarItem(i, { quantidade: Math.max(1, it.quantidade - 1) })} accessibilityRole="button" className="px-3 py-2"><Text className="text-lg text-gray-700">−</Text></Pressable>
                <Text className="flex-1 text-center text-[16px]">{it.quantidade}</Text>
                <Pressable onPress={() => mudarItem(i, { quantidade: it.quantidade + 1 })} accessibilityRole="button" className="px-3 py-2"><Text className="text-lg text-gray-700">+</Text></Pressable>
              </View>
            </View>
          </View>
        </View>
      ))}
      {erros?.semValor ? <Text accessibilityRole="alert" className="text-sm text-red-700 mb-2" testID="erro-valor">{t('oficina.erroItemValor')}</Text> : null}
      <Pressable onPress={addItem} accessibilityRole="button" className="self-start py-2 px-1 mb-3"><Text className="text-primary-700 font-medium">{t('oficina.adicionarItem')}</Text></Pressable>
      <View className="bg-white rounded-xl border border-gray-200 p-3 mb-5">
        <View className="flex-row justify-between"><Text className="text-gray-700 font-semibold">{t('oficina.total')}</Text><Text className="text-xl font-bold text-gray-900" testID="total">{formatCurrency(total, moeda, i18n.language)}</Text></View>
        {/* comissao: so com valor; "sem comissao" so quando o servidor disse que a taxa e zero (como o site) */}
        {total > 0 ? <Text className="text-xs text-gray-500 mt-1">{pct > 0 ? t('oficina.comissaoInfo', { pct: String(pct).replace('.', ',') }) : comissao ? t('oficina.semComissaoOrcamento') : ''}</Text> : null}
      </View>

      {/* prazo e garantia */}
      <Text className="text-base font-semibold text-gray-900 mb-2">{t('oficina.prazoTotalDias')}</Text>
      <View className="flex-row items-center bg-white border border-gray-300 rounded-xl self-start mb-5">
        <Pressable onPress={() => setPrazoDias((p) => Math.max(1, p - 1))} accessibilityRole="button" className="px-4 py-2"><Text className="text-xl text-gray-700">−</Text></Pressable>
        <Text className="text-[16px] font-semibold min-w-[90px] text-center" testID="prazo">{prazoDias === 1 ? t('oficina.dia_um') : t('oficina.dias', { d: prazoDias })}</Text>
        <Pressable onPress={() => setPrazoDias((p) => p + 1)} accessibilityRole="button" className="px-4 py-2"><Text className="text-xl text-gray-700">+</Text></Pressable>
      </View>
      <Text className="text-base font-semibold text-gray-900 mb-2">{t('oficina.garantia')} <Text className="text-sm font-normal text-gray-500">({t('common.opcional')})</Text></Text>
      <View className="flex-row flex-wrap gap-2 mb-5">
        {GARANTIAS.map((g) => (
          <Pressable key={g} onPress={() => setGarantia(garantia === g ? null : g)} accessibilityRole="button" accessibilityState={{ selected: garantia === g }}
            className={`px-3 py-2 rounded-full border ${garantia === g ? 'bg-primary-600 border-primary-600' : 'border-gray-300 bg-white'}`}>
            <Text className={`text-sm ${garantia === g ? 'text-white' : 'text-gray-700'}`}>{g === 0 ? t('oficina.semGarantia') : g % 365 === 0 ? (g === 365 ? t('oficina.ano_um') : t('oficina.anos', { n: g / 365 })) : t('oficina.dias', { d: g })}</Text>
          </Pressable>
        ))}
      </View>

      {/* datas de chegada */}
      {datasVisiveis ? (
        <View className="mb-5">
          <Text className="text-base font-semibold text-gray-900">{t('oficina.disponibilidadeCheckin')}</Text>
          <Text className="text-sm text-gray-600 mb-2">{t('oficina.ofereceDatas')}</Text>
          {slots.map((s, i) => {
            const passou = !janelaAindaVale(s.data, { inicio: s.hora_inicio, fim: s.hora_fim }, new Date(), pais);
            const fechadoDia = conflitoHorario(s.data, 'manha', horario?.horario) === 'fechado';
            return (
              <View key={`${s.data}-${s.hora_inicio}`} className={`bg-white rounded-xl border p-3 mb-2 flex-row items-center justify-between ${passou || fechadoDia ? 'border-red-400' : 'border-gray-200'}`} testID={`slot-${i}`}>
                <View className="flex-1">
                  <Text className="font-medium text-gray-900">{fmtLonga.format(dataUtc(s.data))}</Text>
                  <Text className="text-sm text-gray-600">{formatarJanela({ inicio: s.hora_inicio, fim: s.hora_fim })} · {t('oficina.entregaAprox', { data: fmtDia.format(dataUtc(somarDias(s.data, prazoDias))) })}</Text>
                  {passou ? <Text className="text-xs text-red-700 mt-1">{t('oficina.horarioPassado')}</Text> : fechadoDia ? <Text className="text-xs text-red-700 mt-1">{t('oficina.erroDiaFechado')}</Text> : null}
                </View>
                <Pressable onPress={() => setSlots((l) => l.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={t('oficina.remover')} hitSlop={8} className="p-2"><Ionicons name="close-circle" size={22} color="#6b7280" /></Pressable>
              </View>
            );
          })}
          {erros?.semCheckin ? <Text accessibilityRole="alert" className="text-sm text-red-700 mb-2" testID="erro-datas">{t('oficina.erroSemCheckin')}</Text> : null}
          {slots.length < MAX_DATAS ? (
            diaEscolhendo === null ? (
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">{t('oficina.escolhaDia')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View className="flex-row gap-2 pr-4">
                    {dias.filter((d) => faixasDe(d).length).map((d) => (
                      <Pressable key={d} onPress={() => setDiaEscolhendo(d)} accessibilityRole="button" testID={`dia-${d}`}
                        className={`px-3 py-2 rounded-xl border ${slots.some((s) => s.data === d) ? 'border-primary-600 bg-primary-50' : 'border-gray-300 bg-white'}`}>
                        <Text className="text-sm text-gray-900 text-center">{fmtDia.format(dataUtc(d))}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            ) : (
              <View className="bg-white rounded-xl border border-primary-200 p-3" testID="faixas">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-medium text-gray-900">{fmtLonga.format(dataUtc(diaEscolhendo))}</Text>
                  <Pressable onPress={() => setDiaEscolhendo(null)} accessibilityRole="button" hitSlop={8}><Ionicons name="close" size={20} color="#6b7280" /></Pressable>
                </View>
                <Text className="text-sm text-gray-600 mb-2">{t('oficina.escolhaPeriodo')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {faixasDe(diaEscolhendo).map((j) => (
                    <Pressable key={j.inicio} onPress={() => addSlot(diaEscolhendo, j)} accessibilityRole="button" testID={`faixa-${j.inicio}`}
                      className="px-3 py-2 rounded-full border border-gray-300 bg-white">
                      <Text className="text-sm text-gray-900">{formatarJanela(j)}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )
          ) : null}
          {slots.length > 0 && new Set(slots.map((s) => s.data)).size < 2 ? <Text className="text-xs text-gray-500 mt-2">{t('oficina.dicaMaisDatas')}</Text> : null}
        </View>
      ) : (
        <Text className="text-sm text-gray-600 bg-gray-100 rounded-lg p-3 mb-5">{t('oficina.checkinJaRealizado')}</Text>
      )}

      {/* validade */}
      <Text className="text-base font-semibold text-gray-900 mb-1">{t('oficina.validadeOrcamento')}</Text>
      <Text className="text-sm text-gray-600 mb-2">{t('oficina.validadeAjuda')}</Text>
      <View className="flex-row flex-wrap gap-2 mb-1">
        {opcoesValidade.map((d) => (
          <Pressable key={d} onPress={() => { validadeManual.current = true; setValidade(d); }} accessibilityRole="button" accessibilityState={{ selected: validade === d }} testID={`validade-${d}`}
            className={`px-3 py-2 rounded-full border ${validade === d ? 'bg-primary-600 border-primary-600' : 'border-gray-300 bg-white'}`}>
            <Text className={`text-sm ${validade === d ? 'text-white' : 'text-gray-700'}`}>{fmtDia.format(dataUtc(d))}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => { validadeManual.current = true; setValidade(somarDias(validade || minValidade, 1)); }} accessibilityRole="button" className="px-3 py-2 rounded-full border border-gray-300 bg-white"><Text className="text-sm text-gray-700">+1 {t('oficina.diaCurto')}</Text></Pressable>
      </View>
      <Text className="text-sm text-gray-700 mb-1" testID="validade">{validade ? t('oficina.validadeAte', { data: fmtLonga.format(dataUtc(validade)) }) : ''}</Text>
      {erros?.validade ? <Text accessibilityRole="alert" className="text-sm text-red-700 mb-2" testID="erro-validade">{t(`oficina.erroValidade_${erros.validade}`)}</Text> : null}

      {/* observacoes */}
      <Text className="text-base font-semibold text-gray-900 mt-4 mb-2">{t('oficina.observacoesOpcional')}</Text>
      <TextInput value={observacoes} onChangeText={setObservacoes} placeholder={t('oficina.placeholderObservacoes')} multiline testID="observacoes"
        className="bg-white border border-gray-300 rounded-xl px-3 py-2 text-[16px] mb-6" style={{ minHeight: 80 }} />

      {erroEnvio ? <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3" testID="erro-envio">{erroEnvio}</Text> : null}
      {erros?.faltas.length ? <Text className="text-sm text-red-700 mb-2">{t('oficina.faltam')}: {erros.faltas.map((f) => t(`oficina.falta_${f}`)).join(', ')}</Text> : null}
      <Pressable onPress={enviar} disabled={enviando} accessibilityRole="button" testID="enviar-orcamento"
        className="bg-primary-600 rounded-xl min-h-[52px] items-center justify-center" style={{ opacity: enviando ? 0.6 : 1 }}>
        {enviando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{meu ? t('oficina.atualizarOrcamento') : t('oficina.enviarOrcamento')} · {formatCurrency(total, moeda, i18n.language)}</Text>}
      </Pressable>
    </ScrollView>
  );
}
