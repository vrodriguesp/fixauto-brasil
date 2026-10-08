import { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import VehicleCatalogPicker from '../../components/VehicleCatalogPicker';

export default function NovoVeiculoScreen() {
  const { t } = useTranslation();
  // Opcoes do cabecalho criadas uma vez: objeto novo a cada desenho fazia o
  // cabecalho e a tela se redesenharem sem fim no iPhone ("Maximum update depth").
  const tituloTela = t('veiculos.adicionar');
  const opcoesTela = useMemo(() => ({ headerShown: true, title: tituloTela }), [tituloTela]);
  const { user } = useAuth();
  const [marca, setMarca] = useState<{ code: string; name: string } | null>(null);
  const [modelo, setModelo] = useState<{ code: string; name: string } | null>(null);
  const [ano, setAno] = useState('');
  const [placa, setPlaca] = useState('');
  const [apelido, setApelido] = useState('');
  const [salvando, setSalvando] = useState(false);

  const handleSalvar = async () => {
    if (!user || !marca || !modelo) return;
    setSalvando(true);
    const { error } = await supabase.from('veiculos').insert({
      profile_id: user.id,
      fipe_tipo: 'cars',
      fipe_marca: marca.name,
      fipe_modelo: modelo.name,
      fipe_ano: ano || '-',
      fipe_codigo: null,
      fipe_valor: null,
      placa: placa || null,
      cor: null,
      apelido: apelido || null,
    });
    setSalvando(false);
    if (error) {
      Alert.alert(t('common.erroGenerico'), t('veiculos.erroSalvar'));
      return;
    }
    router.back();
  };

  return (
    <ScrollView keyboardDismissMode="on-drag" className="flex-1 bg-white px-4 pt-4">
      <Stack.Screen options={opcoesTela} />

      <VehicleCatalogPicker label={t('veiculos.marca')} value={marca} onChange={(m) => { setMarca(m); setModelo(null); }} fetchUrl="/api/vehicle-catalog?tipo=cars" />

      {marca && (
        <VehicleCatalogPicker label={t('veiculos.modelo')} value={modelo} onChange={setModelo} fetchUrl={`/api/vehicle-catalog?tipo=cars&marca=${marca.code}`} />
      )}

      <Text className="text-sm font-medium text-gray-700 mb-1">{t('veiculos.ano')}</Text>
      <TextInput accessibilityLabel={t('veiculos.ano')} value={ano} onChangeText={setAno} keyboardType="number-pad" className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-[16px]" />

      <Text className="text-sm font-medium text-gray-700 mb-1">
        {t('veiculos.placa')} <Text className="text-gray-400">({t('common.opcional')})</Text>
      </Text>
      <TextInput accessibilityLabel={t('veiculos.placa')} value={placa} onChangeText={setPlaca} autoCapitalize="characters" className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-[16px]" />

      <Text className="text-sm font-medium text-gray-700 mb-1">
        {t('veiculos.apelido')} <Text className="text-gray-400">({t('common.opcional')})</Text>
      </Text>
      <TextInput accessibilityLabel={t('veiculos.apelido')} value={apelido} onChangeText={setApelido} className="border border-gray-300 rounded-lg px-4 py-3 mb-6 text-[16px]" />

      <Pressable onPress={handleSalvar} disabled={!marca || !modelo || salvando} className="bg-primary-600 rounded-lg py-4 items-center mb-8 disabled:opacity-50">
        {salvando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{t('common.salvar')}</Text>}
      </Pressable>
    </ScrollView>
  );
}
