import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { API_BASE_URL } from '../../lib/api';
import { IDIOMAS, escolherIdioma, idiomaPeloSistema, abrirAjustesDeIdioma } from '../../lib/idiomas';
import { confirmar, avisar } from '../../lib/confirmar';
import CampoTelefone from '../../components/CampoTelefone';

// mesma regra do pedido e de "Enviar meu numero" (TelefoneOficina): pelo menos 8 digitos
const TELEFONE_OK = (v: string) => v.replace(/\D/g, '').length >= 8;

export default function PerfilScreen() {
  // topo pela area segura (Dynamic Island / Android edge-to-edge) - auditoria E16
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { user, signOut, refreshProfile } = useAuth();

  const handleTrocarIdioma = async (codigo: string) => {
    if (!user) return;
    await escolherIdioma(codigo);
    await supabase.from('profiles').update({ idioma: codigo }).eq('id', user.id);
    await refreshProfile();
  };

  // telefone do perfil (dono 15/11): o "Muuda numbrit" do pedido aceito abre esta tela, que nao
  // tinha o campo. E o numero que a oficina escolhida ve e o do SMS (quando o pedido pediu SMS).
  const [telefone, setTelefone] = useState(user?.telefone || '');
  const [salvandoTel, setSalvandoTel] = useState(false);
  const [erroTel, setErroTel] = useState('');
  const [telSalvo, setTelSalvo] = useState(false);
  useEffect(() => { setTelefone(user?.telefone || ''); }, [user?.telefone]);
  const telMudou = telefone.trim() !== (user?.telefone || '').trim();
  const salvarTelefone = async () => {
    Keyboard.dismiss();
    if (!user || salvandoTel) return;
    const novo = telefone.trim();
    // apagar o numero e permitido (campo vazio); digitado tem que ter 8 digitos
    if (novo && !TELEFONE_OK(novo)) { setErroTel(t('telefoneOficina.numeroInvalido')); return; }
    setSalvandoTel(true); setErroTel(''); setTelSalvo(false);
    const { error } = await supabase.from('profiles').update({ telefone: novo || null }).eq('id', user.id);
    setSalvandoTel(false);
    if (error) { setErroTel(t('telefoneOficina.erro')); return; }
    setTelSalvo(true);
    refreshProfile().catch(() => {});
  };

  const handleSair = () => {
    confirmar(t('perfil.sair'), '', [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('perfil.sair'), style: 'destructive', onPress: () => { signOut(); router.replace('/(auth)/login'); } },
    ]);
  };

  // excluir a conta (exigido pela Apple e pelo Google): confirma duas vezes e
  // usa a mesma rota do site (/api/conta/excluir)
  // trava de toque duplo: o segundo pedido chegava com a conta ja excluida (E18)
  const [excluindo, setExcluindo] = useState(false);
  const handleExcluir = () => {
    if (excluindo) return;
    confirmar(t('perfil.excluirConta'), `${t('perfil.excluirContaTexto')}

${t('perfil.excluirContaDetalhes')}

${t('perfil.excluirContaConfirmar')}`, [
      { text: t('common.cancelar'), style: 'cancel' },
      {
        text: t('perfil.excluirContaSim'), style: 'destructive', onPress: async () => {
          if (excluindo) return;
          setExcluindo(true);
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${API_BASE_URL}/api/conta/excluir`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ confirmar: true }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
              avisar(t('perfil.excluirConta'), d.codigo === 'CARRO_EM_SERVICO' ? t('perfil.excluirContaEmServico') : t('perfil.excluirContaErro'));
              return;
            }
            avisar(t('perfil.excluirConta'), t('perfil.excluirContaFeita'));
            await signOut();
            router.replace('/(auth)/login');
          } catch {
            avisar(t('perfil.excluirConta'), t('perfil.excluirContaErro'));
          } finally {
            setExcluindo(false);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      <Text className="text-2xl font-bold text-gray-900 mb-6">{t('perfil.titulo')}</Text>

      <View className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
        <Text className="font-semibold text-gray-900">{user?.nome}</Text>
        <Text className="text-gray-500 text-sm">{user?.email}</Text>
        {(user as any)?.codigo ? (
          <>
            <Text className="mt-1 font-medium text-gray-800" selectable>{t('constants.codigoCliente', { n: (user as any).codigo })}</Text>
            <Text className="text-xs text-gray-500">{t('constants.codigoClienteDica')}</Text>
          </>
        ) : null}
      </View>

      <View className="mb-6" testID="perfil-telefone">
        <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.telefone')}</Text>
        <CampoTelefone rotulo={t('pedidoSemConta.telefone')} value={telefone} onChange={(v) => { setTelefone(v); setErroTel(''); setTelSalvo(false); }} />
        {erroTel ? <Text accessibilityRole="alert" className="text-sm text-red-700 mt-1">{erroTel}</Text> : null}
        {telSalvo ? <Text accessibilityRole="alert" className="text-sm text-emerald-800 mt-1" testID="perfil-telefone-salvo">{t('perfil.telefoneSalvo')}</Text> : null}
        {user?.tipo === 'cliente' ? (
          <View className="flex-row items-start gap-1.5 mt-2">
            <Ionicons name="lock-closed-outline" size={14} color="#15803d" style={{ marginTop: 2 }} />
            <Text className="flex-1 text-xs text-gray-600">{t('pedidoSemConta.smsPrivacidade')}</Text>
          </View>
        ) : null}
        {telMudou ? (
          <Pressable onPress={salvarTelefone} disabled={salvandoTel} accessibilityRole="button" testID="perfil-telefone-salvar"
            className="self-start bg-primary-600 rounded-lg px-5 py-3 items-center mt-3" style={{ opacity: salvandoTel ? 0.5 : 1 }}>
            {salvandoTel ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">{t('common.salvar')}</Text>}
          </Pressable>
        ) : null}
      </View>

      <Text className="text-sm font-medium text-gray-700 mb-2">{t('perfil.idioma')}</Text>
      {idiomaPeloSistema ? (
        // iPhone: o idioma do app e escolhido nos Ajustes (recomendacao da Apple)
        <View className="mb-8">
          <Text className="text-gray-900 mb-1">{IDIOMAS.find((i) => i.code === i18n.language)?.label}</Text>
          <Text className="text-gray-500 text-sm mb-3">{t('perfil.idiomaAjustesDica')}</Text>
          <Pressable onPress={abrirAjustesDeIdioma} accessibilityRole="button" className="self-start border border-gray-300 rounded-lg px-4 py-2">
            <Text className="text-primary-700 font-medium">{t('perfil.idiomaAjustes')}</Text>
          </Pressable>
        </View>
      ) : (
      <View className="flex-row flex-wrap gap-2 mb-8">
        {IDIOMAS.map((idi) => (
          <Pressable
            key={idi.code}
            onPress={() => handleTrocarIdioma(idi.code)}
            className={`px-4 py-2 rounded-full border ${i18n.language === idi.code ? 'bg-primary-600 border-primary-600' : 'border-gray-300'}`}
          >
            <Text className={i18n.language === idi.code ? 'text-white' : 'text-gray-700'}>{idi.label}</Text>
          </Pressable>
        ))}
      </View>
      )}

      <Pressable onPress={handleSair} className="border border-red-300 rounded-lg py-4 items-center">
        <Text className="text-red-600 font-semibold">{t('perfil.sair')}</Text>
      </Pressable>

      <Pressable onPress={handleExcluir} disabled={excluindo} accessibilityRole="button" accessibilityState={{ disabled: excluindo }} className="py-4 items-center mt-4" style={{ opacity: excluindo ? 0.5 : 1 }}>
        <Text className="text-gray-500 underline">{t('perfil.excluirConta')}</Text>
      </Pressable>

      {/* versao + atualizacao instalada (expo-updates): ajuda no suporte e confirma que a atualizacao chegou */}
      <Text className="text-center text-xs text-gray-400 mt-2">
        BipFix {Constants.expoConfig?.version ?? ''}{!Updates.isEmbeddedLaunch && Updates.updateId ? ` · ${Updates.updateId.slice(0, 8)}` : ''}
      </Text>
    </ScrollView>
  );
}
