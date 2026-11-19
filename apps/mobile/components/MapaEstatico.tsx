import { useState } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import { API_BASE_URL } from '../lib/api';

// Mapa simples com o pino no passo do endereco (dono 19/11: "mapa estatico simples").
// A imagem vem do servidor do site (a chave do Geoapify fica la); so aparece depois de
// haver coordenada (sugestao escolhida ou "Kasuta minu asukohta") e, se a rota ainda nao
// existir ou falhar, o bloco some sem erro - o endereco escrito continua valendo.
export const ROTA_MAPA = '/api/mapa-estatico';

export default function MapaEstatico({ lat, lon, rotulo }: { lat: number; lon: number; rotulo: string }) {
  const [falhou, setFalhou] = useState(false);
  const { width } = useWindowDimensions();
  const w = Math.min(Math.max(Math.round(width - 32), 200), 640);
  const h = 140;
  if (falhou) return null;
  // o servidor devolve 640x300 (Geoapify); aqui recortada ao bloco (cover)
  const url = `${API_BASE_URL}${ROTA_MAPA}?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`;
  return (
    <View className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100 mb-2" style={{ height: h }} testID="mapa-estatico">
      <Image source={{ uri: url }} style={{ width: '100%', height: h }} resizeMode="cover" accessibilityLabel={rotulo} onError={() => setFalhou(true)} />
    </View>
  );
}
