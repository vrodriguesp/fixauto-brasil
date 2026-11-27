import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { IDIOMAS, escolherIdioma, idiomaPeloSistema, abrirAjustesDeIdioma } from '../../lib/idiomas';
import { confirmar, avisar } from '../../lib/confirmar';
import { API_BASE_URL } from '../../lib/api';

// Perfil da oficina no app (27/11): quem esta logado, a oficina, idioma e sair. Os dados da oficina
// (endereco, horario, especialidades, fotos) continuam no site - aqui so o que a pessoa precisa no celular.
// "Excluir conta" (Apple 5.1.1(v) / Play; revisao Fable S6): a mesma rota do site (/api/conta/excluir, lib/excluir-conta.ts
// trata oficina: pedidos abertos cancelados, carro em servico bloqueia), igual ao perfil do motorista.
export default function PerfilOficinaScreen() {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { user, oficina, funcionario, signOut, refreshProfile } = useAuth();

  const handleTrocarIdioma = async (codigo: string) => {
    if (!user) return;
    await escolherIdioma(codigo);
    await supabase.from('profiles').update({ idioma: codigo }).eq('id', user.id);
    await refreshProfile();
  };
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
            if (!res.ok) { avisar(t('perfil.excluirConta'), d.codigo === 'CARRO_EM_SERVICO' ? t('perfil.excluirContaEmServico') : t('perfil.excluirContaErro')); return; }
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
  const handleSair = () => {
    confirmar(t('perfil.sair'), '', [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('perfil.sair'), style: 'destructive', onPress: () => { signOut(); router.replace('/(auth)/login'); } },
    ]);
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 24 }}>
      <Text className="text-2xl font-bold text-gray-900 mb-6">{t('perfil.titulo')}</Text>

      <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200" testID="perfil-oficina">
        <View className="flex-row items-center gap-2 mb-1">
          <Ionicons name="storefront-outline" size={18} color="#1d4ed8" />
          <Text className="font-semibold text-gray-900 flex-1" numberOfLines={2}>{oficina?.nome_fantasia}</Text>
        </View>
        <Text className="text-gray-500 text-sm">{[oficina?.endereco, oficina?.cidade].filter(Boolean).join(', ')}</Text>
        {(oficina as any)?.ativa === false ? <Text className="mt-2 text-sm text-amber-900">{t('oficina.cadastroEmAnalise')}</Text> : null}
      </View>

      <View className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
        <Text className="font-semibold text-gray-900">{user?.nome}</Text>
        <Text className="text-gray-500 text-sm">{user?.email}</Text>
        <Text className="text-gray-500 text-xs mt-1">{funcionario ? t(`oficina.cargo_${funcionario.cargo}`, { defaultValue: funcionario.cargo }) : t('oficina.dona')}</Text>
      </View>

      <Text className="text-sm font-medium text-gray-700 mb-2">{t('perfil.idioma')}</Text>
      {idiomaPeloSistema ? (
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
            <Pressable key={idi.code} onPress={() => handleTrocarIdioma(idi.code)} accessibilityRole="button"
              className={`px-4 py-2 rounded-full border ${i18n.language === idi.code ? 'bg-primary-600 border-primary-600' : 'border-gray-300'}`}>
              <Text className={i18n.language === idi.code ? 'text-white' : 'text-gray-700'}>{idi.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text className="text-sm text-gray-600 mb-6">{t('oficina.dadosNoSite')}</Text>

      <Pressable onPress={handleSair} accessibilityRole="button" className="border border-red-300 rounded-lg py-4 items-center" testID="perfil-sair">
        <Text className="text-red-600 font-semibold">{t('perfil.sair')}</Text>
      </Pressable>

      <Pressable onPress={handleExcluir} disabled={excluindo} accessibilityRole="button" accessibilityState={{ disabled: excluindo }} className="py-4 items-center mt-4" style={{ opacity: excluindo ? 0.5 : 1 }} testID="perfil-excluir">
        <Text className="text-gray-500 underline">{t('perfil.excluirConta')}</Text>
      </Pressable>

      <Text className="text-center text-xs text-gray-400 mt-6">
        BipFix {Constants.expoConfig?.version ?? ''}{!Updates.isEmbeddedLaunch && Updates.updateId ? ` · ${Updates.updateId.slice(0, 8)}` : ''}
      </Text>
    </ScrollView>
  );
}
