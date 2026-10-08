import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { limparDescricao, marcasDaDescricao } from '../lib/texto';
import VehicleCatalogPicker from './VehicleCatalogPicker';

interface Veiculo { id: string; fipe_marca: string; fipe_modelo: string; fipe_ano: string; placa: string | null }

// Completar/editar o pedido depois de criado: dados do carro (o acidente
// pode ter sido registrado sem eles) e a descricao. O carro fica salvo nos
// veiculos da pessoa.
export default function EditarPedido({ solicitacaoId, descricao, veiculo, aoSalvar }: {
  solicitacaoId: string;
  descricao: string | null;
  veiculo: Veiculo | null;
  aoSalvar: () => void;
}) {
  const { t } = useTranslation();
  const incompleto = !veiculo?.fipe_marca;
  const [aberto, setAberto] = useState(false);
  const [marca, setMarca] = useState<{ code: string; name: string } | null>(veiculo?.fipe_marca ? { code: '', name: veiculo.fipe_marca } : null);
  const [modelo, setModelo] = useState<{ code: string; name: string } | null>(veiculo?.fipe_modelo ? { code: '', name: veiculo.fipe_modelo } : null);
  const [ano, setAno] = useState(veiculo?.fipe_ano && veiculo.fipe_ano !== '-' ? veiculo.fipe_ano : '');
  const [placa, setPlaca] = useState(veiculo?.placa || '');
  const [texto, setTexto] = useState(limparDescricao(descricao));
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    try {
      if (veiculo) {
        const { error } = await supabase.from('veiculos').update({
          fipe_marca: marca?.name || '', fipe_modelo: modelo?.name || '', fipe_ano: ano.trim() || '-', placa: placa.trim() || null,
        }).eq('id', veiculo.id);
        if (error) throw error;
      }
      const { error } = await supabase.from('solicitacoes')
        .update({ descricao: `${marcasDaDescricao(descricao).trim()} ${texto.trim()}`.trim() }).eq('id', solicitacaoId);
      if (error) throw error;
      setAberto(false);
      aoSalvar();
    } catch {
      Alert.alert(t('common.erroGenerico'), t('veiculos.erroSalvar'));
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) {
    return incompleto ? (
      <Pressable onPress={() => setAberto(true)} accessibilityRole="button" className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
        <Text className="text-amber-900 font-medium">{t('acompanhamento.completarCarro')}</Text>
        <Text className="text-amber-800 text-xs mt-0.5">{t('acompanhamento.completarCarroDica')}</Text>
      </Pressable>
    ) : (
      <Pressable onPress={() => setAberto(true)} accessibilityRole="button" className="self-start py-2 mb-2">
        <Text className="text-primary-700 font-medium">{t('acompanhamento.editarPedido')}</Text>
      </Pressable>
    );
  }

  return (
    <View className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <Text className="font-semibold text-gray-900 mb-3">{t('acompanhamento.editarPedido')}</Text>
      {veiculo && (
        <>
          <VehicleCatalogPicker label={t('veiculos.marca')} value={marca} onChange={(m) => { setMarca(m); setModelo(null); }} fetchUrl="/api/vehicle-catalog?tipo=cars" />
          {marca?.code ? (
            <VehicleCatalogPicker label={t('veiculos.modelo')} value={modelo} onChange={setModelo} fetchUrl={`/api/vehicle-catalog?tipo=cars&marca=${marca.code}`} />
          ) : marca ? (
            <>
              <Text className="text-sm font-medium text-gray-700 mb-1">{t('veiculos.modelo')}</Text>
              <TextInput accessibilityLabel={t('veiculos.modelo')} value={modelo?.name || ''} onChangeText={(v) => setModelo({ code: '', name: v })}
                className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-[16px]" />
            </>
          ) : null}
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-700 mb-1">{t('veiculos.ano')}</Text>
              <TextInput accessibilityLabel={t('veiculos.ano')} value={ano} onChangeText={setAno} keyboardType="number-pad" maxLength={4}
                className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-[16px]" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-700 mb-1">{t('veiculos.placa')}</Text>
              <TextInput accessibilityLabel={t('veiculos.placa')} value={placa} onChangeText={setPlaca} autoCapitalize="characters" maxLength={15}
                className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-[16px]" />
            </View>
          </View>
        </>
      )}
      <Text className="text-sm font-medium text-gray-700 mb-1">{t('acompanhamento.descricaoPedido')}</Text>
      <TextInput accessibilityLabel={t('acompanhamento.descricaoPedido')} value={texto} onChangeText={setTexto} multiline numberOfLines={4} maxLength={2000}
        className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-[16px]" style={{ textAlignVertical: 'top', minHeight: 90 }} />
      <View className="flex-row gap-2">
        <Pressable onPress={() => setAberto(false)} className="flex-1 border border-gray-300 rounded-lg py-3 items-center">
          <Text className="text-gray-700 font-medium">{t('common.cancelar')}</Text>
        </Pressable>
        <Pressable onPress={salvar} disabled={salvando} className="flex-1 bg-primary-600 rounded-lg py-3 items-center">
          {salvando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">{t('common.salvar')}</Text>}
        </Pressable>
      </View>
    </View>
  );
}
