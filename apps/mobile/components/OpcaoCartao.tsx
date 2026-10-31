import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Opcao de escolha unica em cartao de largura total (carro do pedido, horario
// sugerido pela oficina): o cartao inteiro e tocavel, com bolinha de radio e
// selecao bem visivel (borda + fundo + check). Antes eram "pilulas" pequenas
// que o dono achou pouco claras de tocar (teste do APK 31/10).
export default function OpcaoCartao({
  selecionado, onPress, titulo, subtitulo, icone, desativado, testID,
}: {
  selecionado: boolean;
  onPress: () => void;
  titulo: string;
  subtitulo?: string | null;
  icone?: keyof typeof Ionicons.glyphMap;
  desativado?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desativado}
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected: selecionado, checked: selecionado, disabled: !!desativado }}
      accessibilityLabel={subtitulo ? `${titulo}, ${subtitulo}` : titulo}
      hitSlop={4}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : desativado ? 0.5 : 1, minHeight: 56 })}
      className={`w-full flex-row items-center gap-3 px-4 py-3 mb-2 rounded-xl border-2 ${selecionado ? 'border-primary-600 bg-primary-50' : 'border-gray-300 bg-white'}`}
    >
      {/* radio */}
      <View className={`w-6 h-6 rounded-full border-2 items-center justify-center ${selecionado ? 'border-primary-600 bg-primary-600' : 'border-gray-400 bg-white'}`}>
        {selecionado && <Ionicons name="checkmark" size={16} color="#fff" />}
      </View>
      {icone && <Ionicons name={icone} size={22} color={selecionado ? '#0369a1' : '#6b7280'} />}
      <View className="flex-1">
        <Text className={`text-base ${selecionado ? 'font-semibold text-primary-900' : 'font-medium text-gray-900'}`}>{titulo}</Text>
        {!!subtitulo && <Text className="text-sm text-gray-600 mt-0.5">{subtitulo}</Text>}
      </View>
      {selecionado && <Ionicons name="checkmark-circle" size={24} color="#0284c7" />}
    </Pressable>
  );
}
