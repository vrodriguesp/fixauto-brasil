import { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, TextInput, ActivityIndicator, ScrollView, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { avisar, confirmar } from '../lib/confirmar';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { apiFetch, API_BASE_URL } from '../lib/api';
import { mensagemErro, ErroApi } from '../lib/erro';
import { arquivoDaFoto } from '../lib/anexo';

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

export type FotoDoPedido = { id: string; foto_url: string; origem?: string | null; created_at?: string | null; url?: string };
export const STATUS_FOTOS_EDITAVEIS = ['aberta', 'em_orcamento'];
const FOTOS_POR_PEDIDO = 10;

// Lote A (18/11, chega por OTA): com o pedido aberta/em_orcamento o motorista adiciona fotos (camera ou
// galeria, mesmo ImagePicker do pedido) pela rota /api/solicitacoes/[id]/fotos (reencode no servidor,
// aviso as oficinas) e apaga as que ele mesmo adicionou. `aoFotos` devolve a lista para a tela marcar
// os orcamentos feitos antes das fotos novas. O app ANTIGO (sem este JS) continua lendo foto_url.
export function FotosPedido({ solicitacaoId, status, aoMudar, aoFotos }: { solicitacaoId: string; status?: string; aoMudar?: () => void; aoFotos?: (fotos: FotoDoPedido[]) => void }) {
  const { t } = useTranslation();
  const [fotos, setFotos] = useState<FotoDoPedido[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [apagando, setApagando] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [versao, setVersao] = useState(0);
  const podeEditar = !!status && STATUS_FOTOS_EDITAVEIS.includes(status);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase.from('solicitacao_fotos').select('id, foto_url, origem, created_at').eq('solicitacao_id', solicitacaoId).order('created_at');
      const lista: FotoDoPedido[] = [];
      for (const f of (data || []) as FotoDoPedido[]) {
        const c = caminhoPrivado(f.foto_url);
        if (!c) { lista.push({ ...f, url: f.foto_url }); continue; }
        const { data: s } = await supabase.storage.from('damage-photos').createSignedUrl(c, 3600);
        if (s?.signedUrl) lista.push({ ...f, url: s.signedUrl });
      }
      if (vivo) { setFotos(lista); aoFotos?.(lista); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitacaoId, versao]);

  const total = fotos?.length || 0;
  const restam = Math.max(0, FOTOS_POR_PEDIDO - total);

  const enviar = async (assets: ImagePicker.ImagePickerAsset[]) => {
    if (!assets.length) return;
    setErro(''); setAviso('');
    if (assets.length > restam) { setErro(t('erros.FOTOS_PEDIDO_MAX', { max: FOTOS_POR_PEDIDO })); return; }
    setEnviando(true);
    try {
      const form = new FormData();
      for (const [i, foto] of assets.entries()) form.append('fotos', await arquivoDaFoto(foto.uri), `foto-${i}.jpg`);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/solicitacoes/${solicitacaoId}/fotos`, {
        method: 'POST', body: form,
        headers: { 'x-bipfix-origem': 'app', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(mensagemErro(new ErroApi(res.status, d.codigo))); return; }
      setAviso(t('acompanhamento.fotosEnviadas', { n: (d.fotos || []).length }));
      setVersao((v) => v + 1);
      aoMudar?.();
    } catch {
      setErro(t('acompanhamento.fotosErro'));
    } finally {
      setEnviando(false);
    }
  };
  const camera = async () => {
    const { status: perm } = await ImagePicker.requestCameraPermissionsAsync();
    if (perm !== 'granted') {
      confirmar(t('emergencia.cameraNegadaTitulo'), t('emergencia.cameraNegadaTexto'), [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('emergencia.abrirAjustes'), onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled) await enviar(r.assets);
  };
  const galeria = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible, allowsMultipleSelection: true, selectionLimit: Math.max(1, restam) });
    if (!r.canceled) await enviar(r.assets);
  };
  const apagar = (f: FotoDoPedido) => {
    confirmar(t('acompanhamento.fotosApagar'), t('acompanhamento.fotosApagarConfirma'), [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('acompanhamento.fotosApagar'), style: 'destructive', onPress: async () => {
        setErro(''); setAviso(''); setApagando(f.id);
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch(`${API_BASE_URL}/api/solicitacoes/${solicitacaoId}/fotos?foto=${f.id}`, {
            method: 'DELETE', headers: { 'x-bipfix-origem': 'app', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          });
          const d = await res.json().catch(() => ({}));
          if (!res.ok) { setErro(mensagemErro(new ErroApi(res.status, d.codigo))); return; }
          setVersao((v) => v + 1);
          aoMudar?.();
        } catch {
          setErro(t('acompanhamento.fotosErro'));
        } finally {
          setApagando(null);
        }
      } },
    ]);
  };

  if (!fotos || (fotos.length === 0 && !podeEditar)) return null;
  return (
    <View className="bg-white rounded-xl border border-gray-200 p-4 mb-4" testID="fotos-pedido">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="font-semibold text-gray-900">{t('acompanhamento.fotosTitulo', { count: total })}</Text>
        {podeEditar ? <Text className="text-xs text-gray-500" testID="fotos-contador">{t('acompanhamento.fotosContador', { n: total, max: FOTOS_POR_PEDIDO })}</Text> : null}
      </View>
      {total > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {fotos.map((f) => {
            const adicionada = f.origem === 'adicionada';
            return (
              <View key={f.id} className="mr-2 mb-1" testID={adicionada ? 'foto-adicionada' : 'foto-criacao'}>
                <Image source={{ uri: f.url }} accessibilityLabel={t('acompanhamento.fotoDoPedido')} className="w-28 h-28 rounded-lg bg-gray-100" resizeMode="cover" />
                {adicionada ? (
                  <View className="absolute bottom-1 left-1 bg-primary-600 rounded px-1.5 py-0.5"><Text className="text-white text-[10px] font-semibold">{t('acompanhamento.fotosNova')}</Text></View>
                ) : null}
                {podeEditar && adicionada ? (
                  <Pressable onPress={() => apagar(f)} disabled={apagando === f.id} accessibilityRole="button" accessibilityLabel={t('acompanhamento.fotosApagar')} hitSlop={8} testID="foto-apagar"
                    className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-red-600 items-center justify-center">
                    <Text className="text-white font-bold">×</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
      {podeEditar ? (
        <View className="mt-2">
          {restam > 0 ? (
            <View className="flex-row gap-2">
              <Pressable onPress={camera} disabled={enviando} accessibilityRole="button" testID="fotos-camera" className="flex-1 border-2 border-dashed border-gray-300 rounded-lg py-3 items-center">
                <Text className="text-gray-700 text-sm">📷 {t('acompanhamento.fotosCamera')}</Text>
              </Pressable>
              <Pressable onPress={galeria} disabled={enviando} accessibilityRole="button" testID="fotos-galeria" className="flex-1 border-2 border-dashed border-gray-300 rounded-lg py-3 items-center">
                <Text className="text-gray-700 text-sm">🖼️ {t('acompanhamento.fotosGaleria')}</Text>
              </Pressable>
            </View>
          ) : (
            <Text className="text-sm text-gray-600" testID="fotos-cheio">{t('acompanhamento.fotosLimiteCheio', { max: FOTOS_POR_PEDIDO })}</Text>
          )}
          {enviando ? <View className="flex-row items-center gap-2 mt-2"><ActivityIndicator /><Text className="text-sm text-gray-600">{t('acompanhamento.fotosEnviando')}</Text></View> : null}
          {aviso && !enviando ? <Text className="text-sm text-emerald-700 mt-2" testID="fotos-ok">{aviso}</Text> : null}
          {erro ? <Text className="text-sm text-red-700 mt-2" accessibilityRole="alert" testID="fotos-erro">{erro}</Text> : null}
          <Text className="text-xs text-gray-500 mt-2">{t('acompanhamento.fotosAjuda')}</Text>
        </View>
      ) : null}
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
      avisar(t('common.erroGenerico'), mensagemErro(e));
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
