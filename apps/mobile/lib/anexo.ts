import { Platform } from 'react-native';
import { File } from 'expo-file-system';

// Foto escolhida (uri local) pronta para enviar. O fetch do Expo SDK 57 nao
// aceita mais o formato antigo { uri, name, type } no FormData ("Unsupported
// FormDataPart implementation"): no celular usa o File do expo-file-system
// (que e um Blob); na versao web, o blob da propria uri.
export async function arquivoDaFoto(uri: string): Promise<Blob> {
  if (Platform.OS === 'web') return (await fetch(uri)).blob();
  return new File(uri) as unknown as Blob;
}
