import { View, Text, Pressable, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { IDIOMAS, escolherIdioma } from '../../lib/idiomas';

export default function PerfilScreen() {
  const { t, i18n } = useTranslation();
  const { user, signOut, refreshProfile } = useAuth();

  const handleTrocarIdioma = async (codigo: string) => {
    if (!user) return;
    await escolherIdioma(codigo);
    await supabase.from('profiles').update({ idioma: codigo }).eq('id', user.id);
    await refreshProfile();
  };

  const handleSair = () => {
    Alert.alert(t('perfil.sair'), '', [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('perfil.sair'), style: 'destructive', onPress: () => { signOut(); router.replace('/(auth)/login'); } },
    ]);
  };

  return (
    <View className="flex-1 bg-gray-50 px-4 pt-14">
      <Text className="text-2xl font-bold text-gray-900 mb-6">{t('perfil.titulo')}</Text>

      <View className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
        <Text className="font-semibold text-gray-900">{user?.nome}</Text>
        <Text className="text-gray-500 text-sm">{user?.email}</Text>
      </View>

      <Text className="text-sm font-medium text-gray-700 mb-2">{t('perfil.idioma')}</Text>
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

      <Pressable onPress={handleSair} className="border border-red-300 rounded-lg py-4 items-center">
        <Text className="text-red-600 font-semibold">{t('perfil.sair')}</Text>
      </Pressable>
    </View>
  );
}
