import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Keyboard } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency, currencyForCountry } from '@fixauto/shared';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { mensagemErro } from '../lib/erro';
import { tDias } from '../i18n';
import { fusoDoPais } from '../lib/fuso';
import { confirmar, avisar } from '../lib/confirmar';
import { useRouter } from 'expo-router';

interface Revisao {
  id: string; valor_anterior: number; valor_novo: number; prazo_dias_novo: number | null; motivo: string;
  itens: { descricao: string; quantidade: number; valor_total: number }[];
  oficina: { nome_fantasia: string; pais: string | null } | null;
  // 076: proposta de nova data de entrega (antes do check-in)
  tipo?: 'valor' | 'data'; nova_data_checkin?: string | null; novo_turno?: 'manha' | 'tarde' | null; nova_previsao_entrega?: string | null;
  // 077: hora exata, a data atual ainda serve?, mudanca combinada
  nova_hora?: string | null; data_atual_serve?: boolean | null; combinado?: boolean; oficina_id?: string;
}

// O carro ja esta na oficina? (check-in feito, servico andando/feito ou o
// horario marcado ja passou). So entao recusar significa retirar o carro.
const carroNaOficina = (ags: { status: string; checkin_em: string | null; data_inicio: string | null }[]) =>
  ags.some((a) => !!a.checkin_em || a.status === 'em_andamento' || a.status === 'concluido' || (!!a.data_inicio && new Date(a.data_inicio).getTime() <= Date.now()));

// Proposta de revisao de orcamento ja aceito (mesma regra do site): aprovar |
// recusar (encerra o servico e o cliente retira o carro; confirmacao dupla).
export default function RevisaoPendente({ solicitacaoId, recarregar, aoDecidir }: { solicitacaoId: string; recarregar?: number; aoDecidir?: () => void }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [rev, setRev] = useState<Revisao | null>(null);
  // mudanca COMBINADA ja valendo: o cliente pode dizer "nao combinei isso" (igual ao site)
  const [combinada, setCombinada] = useState<Revisao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [naOficina, setNaOficina] = useState(false);
  const [dataAtual, setDataAtual] = useState<string | null>(null);
  // itens do orcamento aceito: destaca novo/alterado/removido (dono 07/11, igual ao site)
  const [itensAntes, setItensAntes] = useState<{ descricao: string; quantidade: number; valor_total: number }[]>([]);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('orcamento_revisoes')
      .select('id, orcamento_id, oficina_id, tipo, nova_data_checkin, novo_turno, nova_hora, nova_previsao_entrega, data_atual_serve, combinado, valor_anterior, valor_novo, prazo_dias_novo, motivo, itens, oficina:oficinas(nome_fantasia, pais)')
      .eq('solicitacao_id', solicitacaoId).eq('status', 'pendente').maybeSingle();
    setRev((data as any) || null);
    if ((data as any)?.orcamento_id) {
      const { data: its } = await supabase.from('orcamento_itens').select('descricao, quantidade, valor_total').eq('orcamento_id', (data as any).orcamento_id);
      setItensAntes((its as any) || []);
    }
    const { data: comb } = await supabase.from('orcamento_revisoes')
      .select('id, oficina_id, tipo, motivo, valor_anterior, valor_novo, prazo_dias_novo, itens, combinado, status, contestada_em, oficina:oficinas(nome_fantasia, pais)')
      .eq('solicitacao_id', solicitacaoId).eq('tipo', 'data').in('status', ['pendente', 'aprovada', 'recusada'])
      .order('created_at', { ascending: false }).limit(1);
    // so a ULTIMA mudanca de data pode ser contestada: se depois veio outra, a combinada antiga ja nao vale (auditoria 09/11)
    const ult = ((comb as any) || [])[0];
    setCombinada(ult && ult.status === 'aprovada' && ult.combinado && !ult.contestada_em ? ult : null);
    const { data: ags } = await supabase.from('agenda').select('status, checkin_em, data_inicio').eq('solicitacao_id', solicitacaoId).neq('status', 'cancelado');
    setNaOficina(carroNaOficina((ags as any) || []));
    setDataAtual(((ags as any) || []).find((a: any) => a.status === 'agendado')?.data_inicio || null);
  }, [solicitacaoId]);
  useEffect(() => { carregar(); }, [carregar, recarregar]);

  if (!rev && combinada && dataAtual && !naOficina) {
    const loc = i18n.language === 'pt' ? 'pt-BR' : i18n.language;
    const contestar = async () => {
      setEnviando(true);
      try {
        await apiFetch('/api/orcamento-revisao/decidir', { method: 'POST', body: JSON.stringify({ revisaoId: combinada.id, decisao: 'contestar' }) });
        avisar(t('agendaMudanca.naoCombineiFeito'));
        setCombinada(null);
        aoDecidir?.();
      } catch (e) {
        avisar(t('common.erroGenerico'), mensagemErro(e));
      } finally {
        setEnviando(false);
      }
    };
    return (
      <View className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4" testID="mudanca-combinada">
        <Text className="text-base font-semibold text-gray-900">📅 {t('agendaMudanca.combinadoTitulo', { oficina: combinada.oficina?.nome_fantasia || '' })}</Text>
        <Text className="mt-1 text-sm text-gray-800">{new Date(dataAtual).toLocaleString(loc, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: fusoDoPais(combinada.oficina?.pais) })}</Text>
        <Text className="mt-2 text-sm text-gray-700"><Text className="font-medium">{t('agendaMudanca.motivoOficina')}: </Text>{combinada.motivo}</Text>
        <Pressable disabled={enviando} onPress={contestar} accessibilityRole="button" className="mt-2 py-2 self-start" testID="nao-combinei">
          {enviando ? <ActivityIndicator color="#b91c1c" /> : <Text className="text-red-700 font-medium underline">{t('agendaMudanca.naoCombinei')}</Text>}
        </Pressable>
      </View>
    );
  }
  if (!rev) return null;
  const chave = (d: string) => (d || '').trim().toLowerCase();
  const moeda = currencyForCountry(rev.oficina?.pais);
  const fmt = (v: number) => formatCurrency(Number(v), moeda, i18n.language);
  const pct = Number(rev.valor_anterior) > 0 ? Math.round(((Number(rev.valor_novo) - Number(rev.valor_anterior)) / Number(rev.valor_anterior)) * 100) : 0;

  const decidir = async (decisao: 'aprovar' | 'recusar' | 'cancelar') => {
    Keyboard.dismiss();
    setEnviando(true);
    try {
      await apiFetch('/api/orcamento-revisao/decidir', { method: 'POST', body: JSON.stringify({ revisaoId: rev.id, decisao }) });
      avisar(rev.tipo === 'data' ? t(decisao === 'aprovar' ? 'agendaMudanca.feitoAceita' : decisao === 'cancelar' ? 'agendaMudanca.feitoCanceladoCliente' : 'agendaMudanca.feitoMantida') : t(decisao === 'recusar' && !naOficina ? 'revisao.feito_recusarSemCarro' : `revisao.feito_${decisao}`));
      setRev(null);
      aoDecidir?.();
    } catch (e) {
      avisar(t('common.erroGenerico'), mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  };
  const confirmarRetirada = () => confirmar(
    t(naOficina ? 'revisao.recusar' : 'revisao.recusarSemCarro'),
    t(naOficina ? 'revisao.retirarConfirma' : 'revisao.recusarSemCarroConfirma'),
    [
      { text: t('revisao.voltar'), style: 'cancel' },
      { text: t(naOficina ? 'revisao.retirarSim' : 'revisao.recusarSemCarroSim'), style: 'destructive', onPress: () => decidir('recusar') },
    ],
  );

  if (rev.tipo === 'data') {
    // nova data (mesma regra do site): aceitar | manter (so se a data atual ainda serve) |
    // pedir outra data (conversa) | cancelar com esta oficina (o pedido reabre)
    const podeManter = rev.data_atual_serve !== false;
    const confirmarCancelar = () => confirmar(
      t('agendaMudanca.confirmarCancelar', { oficina: rev.oficina?.nome_fantasia || '' }),
      t('agendaMudanca.cancelarComOficinaTexto'),
      [
        { text: t('agendaMudanca.voltar'), style: 'cancel' },
        { text: t('agendaMudanca.cancelarComOficina'), style: 'destructive', onPress: () => decidir('cancelar') },
      ],
    );
    const loc = i18n.language === 'pt' ? 'pt-BR' : i18n.language;
    const dia = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
    return (
      <View className="bg-blue-50 border-2 border-blue-400 rounded-xl p-4 mb-4" testID="proposta-nova-data">
        <Text className="text-base font-semibold text-gray-900">📅 {t('agendaMudanca.dataTitulo', { oficina: rev.oficina?.nome_fantasia || '' })}</Text>
        {dataAtual ? <Text className="mt-2 text-sm text-gray-600">{t('agendaMudanca.dataDe')}: <Text className="line-through">{new Date(dataAtual).toLocaleString(loc, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: fusoDoPais(rev.oficina?.pais) })}</Text></Text> : null}
        <Text className="mt-1 text-sm text-gray-900">{t('agendaMudanca.dataPara')}: <Text className="font-bold">{rev.nova_data_checkin ? `${dia(rev.nova_data_checkin)}, ${rev.nova_hora || t(rev.novo_turno === 'tarde' ? 'agendaMudanca.tarde' : 'agendaMudanca.manha')}` : ''}</Text></Text>
        {rev.nova_previsao_entrega ? <Text className="text-sm text-gray-700">{t('agendaMudanca.previsaoNova', { data: dia(rev.nova_previsao_entrega) })}</Text> : null}
        <Text className="mt-2 text-sm text-gray-800"><Text className="font-medium">{t('agendaMudanca.motivoOficina')}: </Text>{rev.motivo}</Text>
        {podeManter
          ? <Text className="mt-2 text-xs text-gray-600">{t('agendaMudanca.dataExplicacao')}</Text>
          : <Text className="mt-2 rounded-lg bg-amber-50 p-2 text-sm font-medium text-amber-900" testID="nao-serve">{t('agendaMudanca.naoServeAviso')}</Text>}
        <View className="mt-3 gap-2">
          <Pressable disabled={enviando} onPress={() => decidir('aprovar')} className="bg-primary-600 rounded-lg py-3 items-center disabled:opacity-50" accessibilityRole="button">
            {enviando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">{t('agendaMudanca.aceitarData')}</Text>}
          </Pressable>
          {podeManter ? (
            <Pressable disabled={enviando} onPress={() => decidir('recusar')} className="bg-white border border-gray-300 rounded-lg py-3 items-center" accessibilityRole="button">
              <Text className="text-gray-800 font-semibold">{t('agendaMudanca.manterData')}</Text>
            </Pressable>
          ) : null}
          <Pressable disabled={enviando} onPress={() => router.push({ pathname: '/conversa/[id]', params: { id: solicitacaoId, ...(rev.oficina_id ? { oficina: rev.oficina_id } : {}) } })} className="bg-white border border-gray-300 rounded-lg py-3 items-center" accessibilityRole="button" testID="pedir-outra-data">
            <Text className="text-gray-800 font-semibold">💬 {t('agendaMudanca.pedirOutraData')}</Text>
          </Pressable>
          <Pressable disabled={enviando} onPress={confirmarCancelar} className="bg-white border border-red-300 rounded-lg py-3 items-center" accessibilityRole="button" testID="cancelar-com-oficina">
            <Text className="text-red-700 font-medium">{t('agendaMudanca.cancelarComOficina')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 mb-4">
      <Text className="text-base font-semibold text-gray-900">{t('revisao.titulo', { oficina: rev.oficina?.nome_fantasia || '' })}</Text>
      <Text className="mt-2 text-gray-800">
        <Text className="line-through text-gray-500">{fmt(rev.valor_anterior)}</Text>{'  →  '}
        <Text className="font-bold text-lg">{fmt(rev.valor_novo)}</Text>
        {pct !== 0 ? <Text className={pct > 0 ? 'text-red-700 font-semibold' : 'text-green-700 font-semibold'}>{`  (${pct > 0 ? '+' : ''}${pct}%)`}</Text> : null}
      </Text>
      {rev.prazo_dias_novo ? <Text className="text-sm text-gray-700">{tDias(t, 'revisao.novoPrazo', rev.prazo_dias_novo)}</Text> : null}
      <Text className="mt-2 text-sm text-gray-800"><Text className="font-medium">{t('revisao.motivo')}: </Text>{rev.motivo}</Text>
      {(rev.itens || []).map((it, i) => {
        const antes = itensAntes.find((a) => chave(a.descricao) === chave(it.descricao));
        const estado = !itensAntes.length ? null : !antes ? 'novo' : (Number(antes.quantidade) !== Number(it.quantidade) || Number(antes.valor_total) !== Number(it.valor_total)) ? 'alterado' : null;
        return (
          <View key={i} className="flex-row justify-between gap-3 py-0.5" testID={estado ? `item-${estado}` : undefined}>
            <Text className={`text-sm text-gray-700 flex-1 ${estado ? 'font-semibold' : ''}`}>
              {estado ? <Text className={estado === 'novo' ? 'text-green-700' : 'text-amber-800'}>{t(estado === 'novo' ? 'agendaMudanca.itemNovo' : 'agendaMudanca.itemAlterado')} · </Text> : null}
              {it.quantidade > 1 ? `${it.quantidade}× ` : ''}{it.descricao}
            </Text>
            <View className="items-end">
              <Text className="text-sm text-gray-900">{fmt(it.valor_total)}</Text>
              {estado === 'alterado' && antes ? <Text className="text-xs text-gray-500 line-through">{fmt(antes.valor_total)}</Text> : null}
            </View>
          </View>
        );
      })}
      {itensAntes.filter((a) => !(rev.itens || []).some((it) => chave(it.descricao) === chave(a.descricao))).map((a, i) => (
        <View key={`r${i}`} className="flex-row justify-between gap-3 py-0.5" testID="item-removido">
          <Text className="text-sm text-gray-500 flex-1"><Text className="text-red-700 font-semibold">{t('agendaMudanca.itemRemovido')} · </Text><Text className="line-through">{a.descricao}</Text></Text>
          <Text className="text-sm text-gray-500 line-through">{fmt(a.valor_total)}</Text>
        </View>
      ))}
      <Text className="mt-2 text-xs text-gray-600">{t(naOficina ? 'revisao.explicacao' : 'revisao.explicacaoSemCarro')}</Text>
      {enviando ? <ActivityIndicator className="mt-3" color="#2563eb" /> : (
        <View className="mt-3 gap-2">
          <Pressable onPress={() => decidir('aprovar')} accessibilityRole="button" className="bg-green-600 rounded-lg py-3 items-center">
            <Text className="text-white font-semibold">{t('revisao.aprovar')}</Text>
          </Pressable>
          <Pressable onPress={confirmarRetirada} accessibilityRole="button" className="border border-red-300 bg-white rounded-lg py-3 items-center">
            <Text className="text-red-700 font-medium">{t(naOficina ? 'revisao.recusar' : 'revisao.recusarSemCarro')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
