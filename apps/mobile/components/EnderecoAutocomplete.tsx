import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import * as Localization from 'expo-localization';
import { API_BASE_URL } from '../lib/api';

// Enquanto o GPS nao responde, prioriza a regiao do aparelho (capital do pais)
// para as sugestoes nao virem de outra cidade; com a posicao real, ela vale.
const CENTRO_REGIAO: Record<string, { lat: number; lon: number }> = {
  EE: { lat: 59.437, lon: 24.745 }, BR: { lat: -23.55, lon: -46.63 }, PT: { lat: 38.72, lon: -9.14 },
  IT: { lat: 41.9, lon: 12.5 }, LV: { lat: 56.95, lon: 24.11 }, LT: { lat: 54.69, lon: 25.28 }, FI: { lat: 60.17, lon: 24.94 },
};
const centroDaRegiao = () => CENTRO_REGIAO[Localization.getLocales()[0]?.regionCode || ''] || null;

export interface SugestaoEndereco {
  rotulo: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  paisCodigo: string;
  latitude: number;
  longitude: number;
}

// Endereco com sugestoes enquanto digita (mesma rota do site, a partir de 3
// letras). Aceita texto livre; ao escolher, devolve coordenadas e pais.
export default function EnderecoAutocomplete({
  value, onChange, onSelect, placeholder, perto, rotulo, aoFocar,
}: {
  rotulo?: string;
  /** a tela rola para deixar o campo no alto: a lista de sugestoes fica acima do teclado */
  aoFocar?: () => void;
  value: string;
  onChange: (v: string) => void;
  onSelect: (s: SugestaoEndereco) => void;
  placeholder?: string;
  perto?: { lat: number; lon: number } | null;
}) {
  const [sugestoes, setSugestoes] = useState<SugestaoEndereco[]>([]);
  const escolhido = useRef('');
  const focado = useRef(false);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3 || q === escolhido.current || !focado.current) { setSugestoes([]); return; }
    let cancelado = false;
    const tmr = setTimeout(async () => {
      try {
        const ref = perto || centroDaRegiao();
        const p = ref ? `&lat=${ref.lat}&lon=${ref.lon}` : '';
        const r = await fetch(`${API_BASE_URL}/api/endereco/sugestoes?q=${encodeURIComponent(q)}${p}`);
        const d = r.ok ? ((await r.json()) as SugestaoEndereco[]) : [];
        if (!cancelado) setSugestoes(d);
      } catch { /* segue texto livre */ }
    }, 300);
    return () => { cancelado = true; clearTimeout(tmr); };
  }, [value, perto]);

  return (
    <View className="mb-6">
      <TextInput
        accessibilityLabel={rotulo || placeholder}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        onFocus={() => { focado.current = true; aoFocar?.(); }}
        onBlur={() => { focado.current = false; }}
        autoCorrect={false}
        className="border border-gray-300 rounded-lg px-4 py-3 text-[16px]"
      />
      {sugestoes.length > 0 && (
        <View className="border border-gray-200 rounded-lg mt-1 bg-white overflow-hidden">
          {sugestoes.map((s) => (
            <Pressable
              key={s.rotulo}
              onPress={() => { escolhido.current = s.rotulo; onSelect(s); setSugestoes([]); }}
              className="px-4 py-3 border-b border-gray-100 active:bg-gray-50"
              accessibilityRole="button"
            >
              <Text className="text-sm text-gray-800">{s.rotulo}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
