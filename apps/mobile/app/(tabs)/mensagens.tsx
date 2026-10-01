import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';

interface ConversaItem {
  solicitacaoId: string;
  oficinaId: string;
  oficinaNome: string;
  veiculoDesc: string;
  ultimaMensagem: string;
  ultimaMensagemAt: string;
  naoLidas: number;
}

// v1: so cobre a conversa com a oficina por solicitacao (paridade com o
// caso de uso principal). O fluxo de chat entre motoristas de um acidente
// (emergencia_mensagens) fica pra uma proxima leva - ver
// docs/ESPECIFICACAO_APP_MOBILE_CLIENTE.md.
export default function MensagensScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [conversas, setConversas] = useState<ConversaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user) return;
    const { data: solicitacoes } = await supabase
      .from('solicitacoes')
      .select('id, veiculo:veiculos(fipe_marca, fipe_modelo)')
      .eq('cliente_id', user.id)
      .order('created_at', { ascending: false });

    if (!solicitacoes || solicitacoes.length === 0) {
      setConversas([]);
      setLoading(false);
      return;
    }

    const solIds = solicitacoes.map((s: any) => s.id);
    const { data: mensagens } = await supabase
      .from('mensagens')
      .select('solicitacao_id, oficina_id, remetente_id, texto, tipo, lida, created_at')
      .in('solicitacao_id', solIds)
      .order('created_at', { ascending: false });

    const { data: orcamentos } = await supabase
      .from('orcamentos')
      .select('solicitacao_id, oficina_id, oficina:oficinas(nome_fantasia)')
      .in('solicitacao_id', solIds);

    // nome das oficinas (as que so escreveram ainda nao tem orcamento)
    const nomes = new Map<string, string>();
    (orcamentos || []).forEach((o: any) => nomes.set(o.oficina_id, o.oficina?.nome_fantasia || ''));
    const faltam = Array.from(new Set((mensagens || []).map((m: any) => m.oficina_id).filter((o: string) => !nomes.has(o))));
    if (faltam.length) {
      const { data: ofs } = await supabase.from('oficinas').select('id, nome_fantasia').in('id', faltam);
      (ofs || []).forEach((o: any) => nomes.set(o.id, o.nome_fantasia || ''));
    }

    const items: ConversaItem[] = [];
    for (const sol of solicitacoes as any[]) {
      const solMsgs = (mensagens || []).filter((m: any) => m.solicitacao_id === sol.id);
      // cada oficina tem a sua conversa com o cliente
      const oficinas = Array.from(new Set(solMsgs.map((m: any) => m.oficina_id as string)));
      for (const oficinaId of oficinas) {
        const daOficina = solMsgs.filter((m: any) => m.oficina_id === oficinaId);
        const last = daOficina[0];
        items.push({
          solicitacaoId: sol.id,
          oficinaId,
          oficinaNome: nomes.get(oficinaId) || '-',
          veiculoDesc: sol.veiculo ? `${sol.veiculo.fipe_marca} ${sol.veiculo.fipe_modelo}` : '',
          ultimaMensagem: last.tipo === 'audio' ? '🎤' : last.texto,
          ultimaMensagemAt: last.created_at,
          naoLidas: daOficina.filter((m: any) => !m.lida && m.remetente_id !== user.id).length,
        });
      }
    }
    items.sort((a, b) => b.ultimaMensagemAt.localeCompare(a.ultimaMensagemAt));
    setConversas(items);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  return (
    <View className="flex-1 bg-gray-50 px-4 pt-14">
      <Text className="text-2xl font-bold text-gray-900 mb-4">{t('mensagens.titulo')}</Text>
      <FlatList
        data={conversas}
        keyExtractor={(item) => `${item.solicitacaoId}-${item.oficinaId}`}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carregar} />}
        ListEmptyComponent={!loading ? <Text className="text-gray-500 text-center mt-8">{t('mensagens.nenhumaConversa')}</Text> : null}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/conversa/[id]', params: { id: item.solicitacaoId, oficina: item.oficinaId } })}
            className="bg-white rounded-xl p-4 mb-3 border border-gray-200 flex-row justify-between items-center"
          >
            <View className="flex-1 mr-2">
              <Text className="font-semibold text-gray-900">{item.oficinaNome}</Text>
              {!!item.veiculoDesc && <Text className="text-gray-400 text-xs">{item.veiculoDesc}</Text>}
              <Text className="text-gray-500 text-sm" numberOfLines={1}>{item.ultimaMensagem}</Text>
            </View>
            {item.naoLidas > 0 && (
              <View className="bg-primary-600 rounded-full w-5 h-5 items-center justify-center">
                <Text className="text-white text-xs font-bold">{item.naoLidas > 9 ? '9+' : item.naoLidas}</Text>
              </View>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}
