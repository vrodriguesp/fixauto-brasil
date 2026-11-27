import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
import { createClient } from '@supabase/supabase-js';
import { fetchComPrazo } from './rede';
// sem prazo: envio de arquivo (storage) e login/renovacao (auth tem a propria logica de repeticao)
const semPrazo = (u: string) => u.includes('/storage/v1/object') || u.includes('/auth/v1/');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

// Sessao cifrada (padrao "LargeSecureStore" da documentacao do Supabase para
// Expo): o token (JWT + refresh token) passa de 2 KB, limite do SecureStore,
// entao ele fica no AsyncStorage CIFRADO com AES-256, e so a chave de 32
// bytes vai para o SecureStore (Keychain no iOS / Keystore no Android).
// Antes o token ficava em texto claro no AsyncStorage.
class LargeSecureStore {
  private async _encrypt(key: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async _decrypt(key: string, value: string) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return encryptionKeyHex;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return encrypted;
    return this._decrypt(key, encrypted);
  }

  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }

  async setItem(key: string, value: string) {
    const encrypted = await this._encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }
}

// Build sem as chaves (ex.: EAS sem env) abriria o app com login quebrado em
// silencio - avisa alto no console para o erro aparecer no teste da loja.
if (!supabaseUrl || !supabaseAnonKey) console.error('[supabase] EXPO_PUBLIC_SUPABASE_URL/ANON_KEY ausentes neste build');

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    // Sem rede o pedido ao banco pode ficar pendurado para sempre (teste 28/11: gateway parado = tela girando sem
    // fim); prazo de 20 s em toda chamada (as telas mostram 'sem conexao'); envio de arquivo (storage) e o login/renovacao (auth, que tem a propria logica de repeticao) sem prazo.
    global: { fetch: (url, init) => (typeof url !== 'string' && !(url instanceof URL)) || semPrazo(String(url)) ? fetch(url, init) : fetchComPrazo(String(url), 20000, init) },
    auth: {
      // Versao web do app (so para testes automatizados no navegador): SecureStore
      // nao existe na web, usa o AsyncStorage (localStorage).
      storage: Platform.OS === 'web' ? AsyncStorage : new LargeSecureStore(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
