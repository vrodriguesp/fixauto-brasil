import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { API_BASE_URL } from '../lib/api';

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
  value, onChange, onSelect, placeholder, perto, rotulo,
}: {
  rotulo?: string;
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
        const p = perto ? `&lat=${perto.lat}&lon=${perto.lon}` : '';
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
        onFocus={() => { focado.current = true; }}
        onBlur={() => { focado.current = false; }}
        autoCorrect={false}
        className="border border-gray-300 rounded-lg px-4 py-3 text-base"
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
