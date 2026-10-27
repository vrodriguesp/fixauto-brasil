import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency, currencyForCountry } from '@fixauto/shared';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { mensagemErro } from '../lib/erro';

interface Revisao {
  id: string; valor_anterior: number; valor_novo: number; prazo_dias_novo: number | null; motivo: string;
  itens: { descricao: string; quantidade: number; valor_total: number }[];
  oficina: { nome_fantasia: string; pais: string | null } | null;
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

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('orcamento_revisoes')
      .select('id, valor_anterior, valor_novo, prazo_dias_novo, motivo, itens, oficina:oficinas(nome_fantasia, pais)')
      .eq('solicitacao_id', solicitacaoId).eq('status', 'pendente').maybeSingle();
    setRev((data as any) || null);
    const { data: ags } = await supabase.from('agenda').select('status, checkin_em, data_inicio').eq('solicitacao_id', solicitacaoId).neq('status', 'cancelado');
    setNaOficina(carroNaOficina((ags as any) || []));
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
      Alert.alert(t(decisao === 'recusar' && !naOficina ? 'revisao.feito_recusarSemCarro' : `revisao.feito_${decisao}`));
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

  return (
    <View className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 mb-4">
      <Text className="text-base font-semibold text-gray-900">{t('revisao.titulo', { oficina: rev.oficina?.nome_fantasia || '' })}</Text>
      <Text className="mt-2 text-gray-800">
        <Text className="line-through text-gray-500">{fmt(rev.valor_anterior)}</Text>{'  →  '}
        <Text className="font-bold text-lg">{fmt(rev.valor_novo)}</Text>
        {pct !== 0 ? <Text className={pct > 0 ? 'text-red-700 font-semibold' : 'text-green-700 font-semibold'}>{`  (${pct > 0 ? '+' : ''}${pct}%)`}</Text> : null}
      </Text>
      {rev.prazo_dias_novo ? <Text className="text-sm text-gray-700">{t('revisao.novoPrazo', { dias: rev.prazo_dias_novo })}</Text> : null}
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
