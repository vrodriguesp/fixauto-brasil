import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { supabase } from '../lib/supabase';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Caminho no espaco privado a partir do endereco gravado na mensagem
// (.../storage/v1/object/public/damage-photos/audio/...)
const caminhoPrivado = (url: string) => {
  const m = url.match(/\/damage-photos\/(.+?)(\?|$)/);
  return m ? decodeURIComponent(m[1]) : null;
};

// Audio da conversa (antes o app mostrava so "[Audio]"): toca pelo link
// temporario do espaco privado e mostra a transcricao quando existe.
export default function AudioMensagem({ url, duracao, transcricao, minha }: {
  url: string;
  duracao?: number | null;
  transcricao?: string | null;
  minha: boolean;
}) {
  const { t } = useTranslation();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando');

  useEffect(() => {
    let vivo = true;
    const caminho = caminhoPrivado(url);
    (caminho
      ? supabase.storage.from('damage-photos').createSignedUrl(caminho, 3600).then(({ data }) => data?.signedUrl || null)
      : Promise.resolve(url)
    ).then((assinada) => {
      if (!vivo) return;
      if (!assinada) { setEstado('erro'); return; }
      player.replace({ uri: assinada });
      setEstado('pronto');
    }).catch(() => vivo && setEstado('erro'));
    return () => { vivo = false; };
  }, [url, player]);

  // terminou: volta ao inicio para poder ouvir de novo
  useEffect(() => {
    if (status.didJustFinish) player.seekTo(0).catch(() => {});
  }, [status.didJustFinish, player]);

  const cor = minha ? '#fff' : '#2563eb';
  const total = duracao || 0;
  return (
    <View style={{ minWidth: 180 }}>
      <View className="flex-row items-center gap-3">
        {estado === 'carregando' ? (
          <ActivityIndicator color={cor} />
        ) : (
          <Pressable
            onPress={() => (status.playing ? player.pause() : player.play())}
            disabled={estado === 'erro'}
            accessibilityRole="button"
            accessibilityLabel={status.playing ? t('mensagens.pausar') : t('mensagens.ouvir')}
            hitSlop={8}
          >
            <Ionicons name={status.playing ? 'pause-circle' : 'play-circle'} size={34} color={estado === 'erro' ? '#9ca3af' : cor} />
          </Pressable>
        )}
        <Text className={minha ? 'text-white' : 'text-gray-700'}>
          {estado === 'erro' ? t('mensagens.audioIndisponivel') : `${mmss(status.currentTime || 0)} / ${mmss(total)}`}
        </Text>
      </View>
      {transcricao ? <Text className={`text-xs mt-1 italic ${minha ? 'text-primary-100' : 'text-gray-500'}`}>“{transcricao}”</Text> : null}
    </View>
  );
}
