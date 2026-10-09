import { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, TextInput, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { mensagemErro } from '../lib/erro';

// Fotos do pedido e "quem paga o reparo" na tela do pedido (teste do dono
// 09/10, ponto 2): a foto nao aparecia e nao dava para completar o seguro e o
// numero do sinistro depois do "acabei de bater".
// Fotos: ficam no espaco PRIVADO 'damage-photos'; o banco guarda o endereco no
// formato publico antigo, que responde 400 - aqui vira link assinado de 1 h
// (mesma regra do site, components/midia/MidiaPrivada.tsx).
const MARCA = '/storage/v1/object/public/damage-photos/';
const caminhoPrivado = (url: string) => {
  const i = url.indexOf(MARCA);
  return i >= 0 ? decodeURIComponent(url.slice(i + MARCA.length).split('?')[0]) : null;
};

export function FotosPedido({ solicitacaoId }: { solicitacaoId: string }) {
  const { t } = useTranslation();
  const [urls, setUrls] = useState<string[] | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase.from('solicitacao_fotos').select('foto_url').eq('solicitacao_id', solicitacaoId);
      const lista: string[] = [];
      for (const f of data || []) {
        const c = caminhoPrivado(f.foto_url);
        if (!c) { lista.push(f.foto_url); continue; }
        const { data: s } = await supabase.storage.from('damage-photos').createSignedUrl(c, 3600);
        if (s?.signedUrl) lista.push(s.signedUrl);
      }
      if (vivo) setUrls(lista);
    })();
    return () => { vivo = false; };
  }, [solicitacaoId]);
  if (!urls || urls.length === 0) return null;
  return (
    <View className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <Text className="font-semibold text-gray-900 mb-2">{t('acompanhamento.fotosTitulo', { count: urls.length })}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {urls.map((u) => (
          <Image key={u} source={{ uri: u }} accessibilityLabel={t('acompanhamento.fotoDoPedido')} className="w-28 h-28 rounded-lg mr-2 bg-gray-100" resizeMode="cover" />
        ))}
      </ScrollView>
    </View>
  );
}

const PAGAMENTOS = ['proprio', 'seguro_terceiro', 'seguro_proprio', 'nao_sei'] as const;
type Pagamento = (typeof PAGAMENTOS)[number];
export interface SeguroAtual { pagamento_reparo: Pagamento | null; seguradora: string | null; sinistro_numero: string | null; franquia: number | null }

// Quem paga o reparo: so no pedido de acidente e so o dono (a rota confere)
export function SeguroPedido({ emergenciaId, atual, aoSalvar }: { emergenciaId: string; atual: SeguroAtual; aoSalvar: () => void }) {
  const { t } = useTranslation();
  const [editando, setEditando] = useState(false);
  const [pagamento, setPagamento] = useState<Pagamento | ''>(atual.pagamento_reparo || '');
  const [seguradora, setSeguradora] = useState(atual.seguradora || '');
  const [sinistro, setSinistro] = useState(atual.sinistro_numero || '');
  const [franquia, setFranquia] = useState(atual.franquia != null ? String(atual.franquia) : '');
  const [salvando, setSalvando] = useState(false);
  const comSeguro = pagamento === 'seguro_terceiro' || pagamento === 'seguro_proprio';

  const salvar = async () => {
    setSalvando(true);
    try {
      await apiFetch(`/api/emergencia/${emergenciaId}/seguro`, {
        method: 'POST',
        body: JSON.stringify({ pagamento_reparo: pagamento || null, seguradora, sinistro_numero: sinistro, franquia }),
      });
      setEditando(false);
      aoSalvar();
    } catch (e) {
      Alert.alert(t('common.erroGenerico'), mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };

  if (!editando) {
    return (
      <View className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="font-semibold text-gray-900">{t('seguro.secaoTitulo')}</Text>
          <Pressable onPress={() => setEditando(true)} accessibilityRole="button" hitSlop={10}>
            <Text className="text-primary-700 font-medium">{t('seguro.editar')}</Text>
          </Pressable>
        </View>
        <Text className="text-gray-700">{t('seguro.labelPagamento')}: {atual.pagamento_reparo ? t(`seguro.opcao_${atual.pagamento_reparo}`) : '—'}</Text>
        {atual.seguradora ? <Text className="text-gray-700">{t('seguro.labelSeguradora')}: {atual.seguradora}</Text> : null}
        {atual.sinistro_numero ? <Text className="text-gray-700">{t('seguro.labelSinistro')}: {atual.sinistro_numero}</Text> : null}
        {!atual.sinistro_numero && (atual.pagamento_reparo === 'seguro_terceiro' || atual.pagamento_reparo === 'seguro_proprio') ? (
          <Text className="text-amber-700 text-sm mt-1">{t('seguro.ajudaSinistro')}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View className="bg-white rounded-xl border border-primary-300 p-4 mb-4">
      <Text className="font-semibold text-gray-900 mb-1">{t('seguro.titulo')}</Text>
      <Text className="text-gray-600 text-sm mb-3">{t('seguro.subtitulo')}</Text>
      {PAGAMENTOS.map((p) => (
        <Pressable key={p} onPress={() => setPagamento(p)} accessibilityRole="radio" accessibilityState={{ checked: pagamento === p }}
          className={`border rounded-lg px-4 py-3 mb-2 ${pagamento === p ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}>
          <Text className={pagamento === p ? 'text-primary-800 font-medium' : 'text-gray-800'}>{t(`seguro.opcao_${p}`)}</Text>
        </Pressable>
      ))}
      {comSeguro && (
        <>
          <Text className="text-sm font-medium text-gray-700 mt-2 mb-1">{t('seguro.labelSeguradora')}</Text>
          <TextInput accessibilityLabel={t('seguro.labelSeguradora')} value={seguradora} onChangeText={setSeguradora} maxLength={100} className="bg-white border border-gray-300 rounded-lg px-4 py-3 mb-2 text-[16px]" />
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('seguro.labelSinistro')}</Text>
          <TextInput accessibilityLabel={t('seguro.labelSinistro')} value={sinistro} onChangeText={setSinistro} maxLength={60} autoCapitalize="characters" className="bg-white border border-gray-300 rounded-lg px-4 py-3 mb-2 text-[16px]" />
          {pagamento === 'seguro_proprio' && (
            <>
              <Text className="text-sm font-medium text-gray-700 mb-1">{t('seguro.labelFranquia')}</Text>
              <TextInput accessibilityLabel={t('seguro.labelFranquia')} value={franquia} onChangeText={(v) => setFranquia(v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" className="bg-white border border-gray-300 rounded-lg px-4 py-3 mb-2 text-[16px]" />
            </>
          )}
        </>
      )}
      <View className="flex-row gap-2 mt-2">
        <Pressable onPress={salvar} disabled={salvando} accessibilityRole="button" className="flex-1 bg-primary-600 rounded-lg py-3 items-center">
          {salvando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">{t('common.salvar')}</Text>}
        </Pressable>
        <Pressable onPress={() => setEditando(false)} accessibilityRole="button" className="flex-1 border border-gray-300 rounded-lg py-3 items-center">
          <Text className="text-gray-800 font-medium">{t('common.cancelar')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
