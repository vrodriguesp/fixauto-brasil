import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';

// Rascunho do pedido de orcamento (app/pedido.tsx): o que a pessoa ja preencheu fica no
// aparelho por 24 h (igual ao site, localStorage `bipfix_pedido_rascunho`). Serve para
// o app fechado pelo sistema (camera/galeria no Android, troca de app) ou aberto de novo
// no dia seguinte voltar a mesma tela com tudo preenchido. Apagado ao enviar.
const CHAVE = 'bipfix_pedido_rascunho';
const VALIDADE = 24 * 60 * 60 * 1000;

export interface RascunhoPedido {
  em: number;
  etapa: string;
  tipo: string;
  servicos: string[];
  descricao: string;
  /** uri local das fotos escolhidas (a imagem fica no cache do app) */
  fotos: string[];
  fotosPuladas: boolean;
  marca: { code: string; name: string } | null;
  modelo: { code: string; name: string } | null;
  ano: string;
  placa: string;
  endereco: string;
  coords: { lat: number; lon: number } | null;
  pais: string | null;
  nome: string;
  email: string;
  querSms: boolean;
  telefone: string;
  termos: boolean;
  pendente: { id: string; email: string } | null;
  /** etapas do funil ja contadas neste pedido (voltar/avancar nao conta de novo) */
  contados: string[];
}

export async function lerRascunho(): Promise<RascunhoPedido | null> {
  try {
    const raw = await AsyncStorage.getItem(CHAVE);
    if (!raw) return null;
    const r = JSON.parse(raw) as RascunhoPedido;
    if (!r || typeof r.em !== 'number' || Date.now() - r.em > VALIDADE) { await apagarRascunho(); return null; }
    // foto cujo arquivo o sistema ja limpou do cache nao volta (na web o blob: nao sobrevive)
    const fotos: string[] = [];
    for (const uri of Array.isArray(r.fotos) ? r.fotos : []) {
      if (Platform.OS === 'web') continue;
      try { if (new File(uri).exists) fotos.push(uri); } catch { /* ignora a foto */ }
    }
    return { ...r, fotos, servicos: Array.isArray(r.servicos) ? r.servicos : [], contados: Array.isArray(r.contados) ? r.contados : [] };
  } catch {
    return null;
  }
}

export async function gravarRascunho(r: Omit<RascunhoPedido, 'em'>): Promise<void> {
  try { await AsyncStorage.setItem(CHAVE, JSON.stringify({ ...r, em: Date.now() })); } catch { /* sem armazenamento: vale so nesta sessao */ }
}

export async function apagarRascunho(): Promise<void> {
  try { await AsyncStorage.removeItem(CHAVE); } catch { /* ignora */ }
}
