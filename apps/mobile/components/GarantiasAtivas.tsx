import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';

interface Garantia { solicitacaoId: string; oficinaId: string; oficina: string; carro: string; fim: Date; dias: number }

// Servicos entregues ainda na garantia (informada pela oficina no orcamento,
// contada da entrega): contagem regressiva no inicio e atalho para a conversa.
export default function GarantiasAtivas({ recarregar }: { recarregar?: number }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [lista, setLista] = useState<Garantia[]>([]);

  const carregar = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('solicitacoes')
      .select('id, veiculo:veiculos(fipe_marca, fipe_modelo), orcamentos(oficina_id, status, garantia_dias, oficina:oficinas(nome_fantasia)), agenda(oficina_id, status, data_fim)')
      .eq('cliente_id', user.id).eq('status', 'concluida');
    const agora = Date.now();
    const out: Garantia[] = [];
    for (const s of (data || []) as any[]) {
      const orc = (s.orcamentos || []).find((o: any) => o.status === 'aceito' && o.garantia_dias > 0);
      const ent = (s.agenda || []).find((a: any) => a.oficina_id === orc?.oficina_id && a.status === 'concluido' && a.data_fim);
      if (!orc || !ent) continue;
      const fim = new Date(new Date(ent.data_fim).getTime() + orc.garantia_dias * 86400000);
      if (fim.getTime() < agora) continue;
      out.push({
        solicitacaoId: s.id, oficinaId: orc.oficina_id, oficina: orc.oficina?.nome_fantasia || '',
        carro: s.veiculo?.fipe_marca ? `${s.veiculo.fipe_marca} ${s.veiculo.fipe_modelo}` : '',
        fim, dias: Math.ceil((fim.getTime() - agora) / 86400000),
      });
    }
    setLista(out.sort((a, b) => a.fim.getTime() - b.fim.getTime()));
  }, [user]);

  // recarrega ao voltar para a tela (a entrega pode ter acontecido com a home aberta)
  useEffect(() => { carregar(); }, [carregar, recarregar]);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  if (!lista.length) return null;
  return (
    <View className="mb-4">
      <Text className="text-base font-semibold text-gray-900 mb-2">{t('garantia.titulo')}</Text>
      {lista.map((g) => (
        <Pressable key={g.solicitacaoId} accessibilityRole="button"
          onPress={() => router.push({ pathname: '/conversa/[id]', params: { id: g.solicitacaoId, oficina: g.oficinaId } })}
          className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-2">
          <Text className="text-gray-600 text-sm">{[g.carro, g.oficina].filter(Boolean).join(' · ')}</Text>
          <Text className="text-emerald-800 text-xl font-bold">{t('garantia.diasRestantes', { dias: g.dias })}</Text>
          <Text className="text-gray-500 text-xs">{t('garantia.ate', { data: g.fim.toLocaleDateString(i18n.language) })}</Text>
          <Text className="text-primary-700 font-medium mt-1">{t('garantia.falarComOficina')}</Text>
        </Pressable>
      ))}
    </View>
  );
}
