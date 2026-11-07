import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency, currencyForCountry } from '@fixauto/shared';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { mensagemErro } from '../lib/erro';
import { tDias } from '../i18n';

interface Revisao {
  id: string; valor_anterior: number; valor_novo: number; prazo_dias_novo: number | null; motivo: string;
  itens: { descricao: string; quantidade: number; valor_total: number }[];
  oficina: { nome_fantasia: string; pais: string | null } | null;
  // 076: proposta de nova data de entrega (antes do check-in)
  tipo?: 'valor' | 'data'; nova_data_checkin?: string | null; novo_turno?: 'manha' | 'tarde' | null; nova_previsao_entrega?: string | null;
}

// O carro ja esta na oficina? (check-in feito, servico andando/feito ou o
// horario marcado ja passou). So entao recusar significa retirar o carro.
const carroNaOficina = (ags: { status: string; checkin_em: string | null; data_inicio: string | null }[]) =>
  ags.some((a) => !!a.checkin_em || a.status === 'em_andamento' || a.status === 'concluido' || (!!a.data_inicio && new Date(a.data_inicio).getTime() <= Date.now()));

// Proposta de revisao de orcamento ja aceito (mesma regra do site): aprovar |
// recusar (encerra o servico e o cliente retira o carro; confirmacao dupla).
export default function RevisaoPendente({ solicitacaoId, recarregar, aoDecidir }: { solicitacaoId: string; recarregar?: number; aoDecidir?: () => void }) {
  const { t, i18n } = useTranslation();
  const [rev, setRev] = useState<Revisao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [naOficina, setNaOficina] = useState(false);
  const [dataAtual, setDataAtual] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('orcamento_revisoes')
      .select('id, tipo, nova_data_checkin, novo_turno, nova_previsao_entrega, valor_anterior, valor_novo, prazo_dias_novo, motivo, itens, oficina:oficinas(nome_fantasia, pais)')
      .eq('solicitacao_id', solicitacaoId).eq('status', 'pendente').maybeSingle();
    setRev((data as any) || null);
    const { data: ags } = await supabase.from('agenda').select('status, checkin_em, data_inicio').eq('solicitacao_id', solicitacaoId).neq('status', 'cancelado');
    setNaOficina(carroNaOficina((ags as any) || []));
    setDataAtual(((ags as any) || []).find((a: any) => a.status === 'agendado')?.data_inicio || null);
  }, [solicitacaoId]);
  useEffect(() => { carregar(); }, [carregar, recarregar]);

  if (!rev) return null;
  const moeda = currencyForCountry(rev.oficina?.pais);
  const fmt = (v: number) => formatCurrency(Number(v), moeda, i18n.language);
  const pct = Number(rev.valor_anterior) > 0 ? Math.round(((Number(rev.valor_novo) - Number(rev.valor_anterior)) / Number(rev.valor_anterior)) * 100) : 0;

  const decidir = async (decisao: 'aprovar' | 'recusar') => {
    setEnviando(true);
    try {
      await apiFetch('/api/orcamento-revisao/decidir', { method: 'POST', body: JSON.stringify({ revisaoId: rev.id, decisao }) });
      Alert.alert(rev.tipo === 'data' ? t(decisao === 'aprovar' ? 'agendaMudanca.feitoAceita' : 'agendaMudanca.feitoMantida') : t(decisao === 'recusar' && !naOficina ? 'revisao.feito_recusarSemCarro' : `revisao.feito_${decisao}`));
      setRev(null);
      aoDecidir?.();
    } catch (e) {
      Alert.alert(t('common.erroGenerico'), mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  };
  const confirmarRetirada = () => Alert.alert(
    t(naOficina ? 'revisao.recusar' : 'revisao.recusarSemCarro'),
    t(naOficina ? 'revisao.retirarConfirma' : 'revisao.recusarSemCarroConfirma'),
    [
      { text: t('revisao.voltar'), style: 'cancel' },
      { text: t(naOficina ? 'revisao.retirarSim' : 'revisao.recusarSemCarroSim'), style: 'destructive', onPress: () => decidir('recusar') },
    ],
  );

  if (rev.tipo === 'data') {
    // nova data: aceitar muda o agendamento; manter nao cancela nada (mesma regra do site)
    const loc = i18n.language === 'pt' ? 'pt-BR' : i18n.language;
    const dia = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
    return (
      <View className="bg-blue-50 border-2 border-blue-400 rounded-xl p-4 mb-4" testID="proposta-nova-data">
        <Text className="text-base font-semibold text-gray-900">📅 {t('agendaMudanca.dataTitulo', { oficina: rev.oficina?.nome_fantasia || '' })}</Text>
        {dataAtual ? <Text className="mt-2 text-sm text-gray-600">{t('agendaMudanca.dataDe')}: <Text className="line-through">{new Date(dataAtual).toLocaleString(loc, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</Text></Text> : null}
        <Text className="mt-1 text-sm text-gray-900">{t('agendaMudanca.dataPara')}: <Text className="font-bold">{rev.nova_data_checkin ? `${dia(rev.nova_data_checkin)}, ${t(rev.novo_turno === 'tarde' ? 'agendaMudanca.tarde' : 'agendaMudanca.manha')}` : ''}</Text></Text>
        {rev.nova_previsao_entrega ? <Text className="text-sm text-gray-700">{t('agendaMudanca.previsaoNova', { data: dia(rev.nova_previsao_entrega) })}</Text> : null}
        <Text className="mt-2 text-sm text-gray-800"><Text className="font-medium">{t('agendaMudanca.motivoOficina')}: </Text>{rev.motivo}</Text>
        <Text className="mt-2 text-xs text-gray-600">{t('agendaMudanca.dataExplicacao')}</Text>
        <View className="mt-3 gap-2">
          <Pressable disabled={enviando} onPress={() => decidir('aprovar')} className="bg-primary-600 rounded-lg py-3 items-center disabled:opacity-50" accessibilityRole="button">
            {enviando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">{t('agendaMudanca.aceitarData')}</Text>}
          </Pressable>
          <Pressable disabled={enviando} onPress={() => decidir('recusar')} className="bg-white border border-gray-300 rounded-lg py-3 items-center" accessibilityRole="button">
            <Text className="text-gray-800 font-semibold">{t('agendaMudanca.manterData')}</Text>
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
      {(rev.itens || []).map((it, i) => (
        <View key={i} className="flex-row justify-between gap-3 py-0.5">
          <Text className="text-sm text-gray-700 flex-1">{it.quantidade > 1 ? `${it.quantidade}× ` : ''}{it.descricao}</Text>
          <Text className="text-sm text-gray-900">{fmt(it.valor_total)}</Text>
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
