import { Image, Platform } from 'react-native';
import { iconeTipoMotorista } from '@fixauto/shared';

// Icone do tipo de servico (TIPOS_SERVICO.icon). O do pneu e o 🛞 (Emoji 14,
// dono 15/11): a fonte de emoji do Android < 13 e do iOS < 15.4 nao tem esse
// desenho e mostraria um quadrado vazio - nesses aparelhos vai a imagem do
// mesmo emoji (Noto Color Emoji, licenca OFL, 120 px). So JS + um PNG: chega
// por OTA, sem modulo nativo. Pode ficar dentro de um <Text> (imagem em linha).
const PNG_PNEU = require('../assets/emoji-pneu.png');

export const semEmojiPneu = (() => {
  if (Platform.OS === 'android') return Number(Platform.Version) < 33;
  if (Platform.OS === 'ios') {
    const [maior, menor] = String(Platform.Version).split('.').map(Number);
    return maior < 15 || (maior === 15 && (menor || 0) < 4);
  }
  return false;
})();

// tamanho = tamanho da letra do <Text> em volta (a imagem tem margem em volta do pneu)
export default function IconeServico({ tipo, icon, tamanho }: { tipo: string; icon: string; tamanho: number }) {
  // o app e so do motorista: 'outro' aparece como ❓ ("Muu / ei tea", dono 18/11)
  if (tipo !== 'pneu' || !semEmojiPneu) return <>{iconeTipoMotorista(tipo, icon)}</>;
  const lado = Math.round(tamanho * 1.25);
  return <Image source={PNG_PNEU} style={{ width: lado, height: lado }} accessibilityIgnoresInvertColors />;
}
