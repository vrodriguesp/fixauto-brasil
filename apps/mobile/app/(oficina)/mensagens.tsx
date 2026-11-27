import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { useAvisos } from '../../lib/avisos';

interface Conversa {
  solicitacaoId: string;
  pagadorId: string | null;
  ultima: { texto: string | null; tipo: string | null; created_at: string; minha: boolean };
  novas: number;
  carro: string;
  placa: string;
  cliente: string;
  numero: number | null;
}

// Conversas da oficina (27/11): espelho de apps/web/src/app/[locale]/oficina/mensagens/page.tsx. Uma linha
// por pedido (e por responsavel pelo pagamento, nos acidentes), a mais recente em cima. Regra do dono (27/10):
// pedidos ativos; servicos entregues so aparecem se a garantia vale E o cliente reabriu a conversa.
export default function MensagensOficinaScreen() {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { user, oficina } = useAuth();
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [puxando, setPuxando] = useState(false);

  const carregar = useCallback(async () => {
    if (!oficina?.id || !user?.id) return;
    const { data: msgs } = await supabase.from('mensagens')
      .select('solicitacao_id, pagador_id, remetente_id, texto, tipo, lida, created_at')
      .eq('oficina_id', oficina.id).order('created_at', { ascending: false }).limit(1000);
    const porConversa = new Map<string, Conversa>();
    for (const m of (msgs || []) as any[]) {
      const chave = `${m.solicitacao_id}|${m.pagador_id || ''}`;
      let c = porConversa.get(chave);
      if (!c) {
        c = { solicitacaoId: m.solicitacao_id, pagadorId: m.pagador_id, ultima: { texto: m.texto, tipo: m.tipo, created_at: m.created_at, minha: m.remetente_id === user.id }, novas: 0, carro: '', placa: '', cliente: '', numero: null };
        porConversa.set(chave, c);
      }
      if (!m.lida && m.remetente_id !== user.id) c.novas++;
    }
    const ids = Array.from(new Set(Array.from(porConversa.values()).map((c) => c.solicitacaoId)));
    const fora = new Set<string>();
    if (ids.length) {
      const { data: sols } = await supabase.from('solicitacoes')
        .select('id, numero, status, cliente_id, veiculo:veiculos!solicitacoes_veiculo_id_fkey(fipe_marca, fipe_modelo, placa)').in('id', ids);
      // nome do cliente so depois do aceite (102): resumo por pedido, como no site (completarClientes)
      const { data: resumo } = await supabase.rpc('resumo_clientes_pedidos', { p_sols: ids });
      const nomes = new Map(((resumo as any[]) || []).map((c) => [c.solicitacao_id, c.nome ? c.nome : (c.codigo ? `${t('oficina.cliente')} · ${c.codigo}` : '')]));
      for (const c of Array.from(porConversa.values())) {
        const s: any = (sols || []).find((x: any) => x.id === c.solicitacaoId);
        c.carro = s?.veiculo?.fipe_marca ? `${s.veiculo.fipe_marca} ${s.veiculo.fipe_modelo || ''}`.trim() : '';
        c.placa = s?.veiculo?.placa || '';
        c.cliente = nomes.get(c.solicitacaoId) || '';
        c.numero = s?.numero ?? null;
      }
      (sols || []).filter((s: any) => ['cancelada', 'no_show'].includes(s.status)).forEach((s: any) => fora.add(s.id));
      const entregues = (sols || []).filter((s: any) => s.status === 'concluida').map((s: any) => s.id);
      if (entregues.length) {
        // mesma regra do banco (conversa_aberta): entregue so na garantia e se o cliente reabriu
        const respostas = await Promise.all(entregues.map((sid: string) => supabase.rpc('conversa_aberta', { p_sol: sid, p_of: oficina.id })));
        entregues.forEach((sid: string, i: number) => { if (!respostas[i].data) fora.add(sid); });
      }
    }
    setConversas(Array.from(porConversa.values()).filter((c) => !fora.has(c.solicitacaoId)));
    setPuxando(false);
  }, [oficina?.id, user?.id, t]);

  const { chegou } = useAvisos();
  useEffect(() => { if (chegou) carregar(); }, [chegou]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const quando = (iso: string) => {
    const d = new Date(iso);
    const hoje = new Date().toDateString() === d.toDateString();
    return d.toLocaleString(i18n.language, hoje ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View className="flex-1 bg-gray-50 px-4" style={{ paddingTop: insets.top + 8 }}>
      <Text className="text-2xl font-bold text-gray-900 mb-4">{t('mensagens.titulo')}</Text>
      <FlatList keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'} keyboardShouldPersistTaps="handled"
        data={conversas || []}
        keyExtractor={(c) => `${c.solicitacaoId}|${c.pagadorId || ''}`}
        refreshControl={<RefreshControl refreshing={puxando} onRefresh={() => { setPuxando(true); carregar(); }} />}
        ListEmptyComponent={conversas ? <Text className="text-gray-500 text-center mt-8">{t('oficina.semConversas')}</Text> : null}
        renderItem={({ item: c }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/conversa/[id]', params: { id: c.solicitacaoId, oficina: oficina!.id, ...(c.pagadorId ? { pagador: c.pagadorId } : {}) } })}
            accessibilityRole="button" testID="conversa-oficina"
            className={`rounded-xl p-4 mb-3 border flex-row justify-between items-center ${c.novas ? 'bg-primary-50 border-primary-200' : 'bg-white border-gray-200'}`}>
            <View className="flex-1 mr-2">
              <Text className={`text-gray-900 ${c.novas ? 'font-bold' : 'font-semibold'}`} numberOfLines={1}>{[c.carro, c.placa].filter(Boolean).join(' · ') || t('oficina.semCarro')}</Text>
              <Text className="text-gray-500 text-xs" numberOfLines={1}>{[c.cliente, c.numero ? t('constants.numeroPedido', { n: c.numero }) : '', c.pagadorId ? t('oficina.pagador') : ''].filter(Boolean).join(' · ')}</Text>
              <Text className={`text-sm mt-0.5 ${c.novas ? 'text-gray-900' : 'text-gray-600'}`} numberOfLines={1}>{c.ultima.minha ? `${t('oficina.voce')}: ` : ''}{c.ultima.tipo === 'audio' ? '🎤' : c.ultima.texto}</Text>
            </View>
            <View className="items-end gap-1">
              <Text className="text-xs text-gray-500">{quando(c.ultima.created_at)}</Text>
              {c.novas > 0 ? (
                <View className="bg-primary-600 rounded-full min-w-[20px] h-5 px-1.5 items-center justify-center">
                  <Text className="text-white text-xs font-bold">{c.novas > 9 ? '9+' : c.novas}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
