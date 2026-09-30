import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Modal, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../lib/api';

interface CatalogItem {
  code: string;
  name: string;
}

interface Props {
  label: string;
  value: CatalogItem | null;
  onChange: (item: CatalogItem) => void;
  fetchUrl: string;
}

// Picker generico marca/modelo, reaproveitando o mesmo endpoint publico
// /api/vehicle-catalog que o site ja usa (VehiclesDB, mundo todo).
export default function VehicleCatalogPicker({ label, value, onChange, fetchUrl }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${API_BASE_URL}${fetchUrl}`)
      .then((r) => r.json())
      .then((data) => setItems(data))
      .finally(() => setLoading(false));
  }, [open, fetchUrl]);

  const filtrados = items.filter((i) => i.name.toLowerCase().includes(busca.toLowerCase()));

  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-gray-700 mb-1">{label}</Text>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label} className="border border-gray-300 rounded-lg px-4 py-3">
        <Text className={value ? 'text-gray-900' : 'text-gray-400'}>{value?.name || t('common.continuar')}</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 bg-white pt-16 px-4">
          <TextInput
            accessibilityLabel={label}
            value={busca}
            onChangeText={setBusca}
            placeholder={label}
            autoFocus
            className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base"
          />
          <FlatList
            data={filtrados}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                  setBusca('');
                }}
                className="py-3 border-b border-gray-100"
              >
                <Text className="text-base text-gray-900">{item.name}</Text>
              </Pressable>
            )}
            ListEmptyComponent={!loading ? <Text className="text-gray-400 text-center mt-8">-</Text> : null}
          />
          <Pressable onPress={() => setOpen(false)} className="py-4 items-center">
            <Text className="text-primary-600 font-medium">{t('common.cancelar')}</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
