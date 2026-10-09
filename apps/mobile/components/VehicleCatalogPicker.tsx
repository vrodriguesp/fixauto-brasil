import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  // topo pela area segura (Dynamic Island / Android edge-to-edge) - auditoria E16
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErro(false);
    fetch(`${API_BASE_URL}${fetchUrl}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setErro(true))
      .finally(() => setLoading(false));
  }, [open, fetchUrl, tentativa]);

  // busca sem acento: "skoda" acha "Škoda", "citroen" acha "Citroën"
  const sem = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtrados = items.filter((i) => sem(i.name).includes(sem(busca.trim())));

  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-gray-700 mb-1">{label}</Text>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label} className="border border-gray-300 rounded-lg px-4 py-3">
        <Text className={value ? 'text-gray-900' : 'text-gray-400'}>{value?.name || t('common.selecione')}</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 bg-white px-4" style={{ paddingTop: insets.top + 12 }}>
          <TextInput
            accessibilityLabel={label}
            value={busca}
            onChangeText={setBusca}
            placeholder={label}
            autoFocus
            className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-[16px]"
          />
          <FlatList keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
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
            ListEmptyComponent={loading ? null : erro ? (
              <Pressable onPress={() => setTentativa((n) => n + 1)} className="items-center mt-8">
                <Text className="text-gray-600 text-center">{t('common.erroGenerico')}</Text>
                <Text className="text-primary-600 font-medium mt-2">{t('common.tentarNovamente')}</Text>
              </Pressable>
            ) : (
              <Text className="text-gray-500 text-center mt-8">{t('common.nenhumResultado')}</Text>
            )}
          />
          <Pressable onPress={() => setOpen(false)} className="py-4 items-center">
            <Text className="text-primary-600 font-medium">{t('common.cancelar')}</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
