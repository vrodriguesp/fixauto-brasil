import AsyncStorage from '@react-native-async-storage/async-storage';

// Cache do perfil e da oficina no aparelho (abrir sem rede). Um lugar so para as chaves e para limpar em TODO
// caminho de saida da conta (auth-context e api.ts) - revisao 28/11: o cache da oficina nao podia ficar de uma
// conta para outra.
export const CHAVE_PERFIL = 'bipfix_perfil_cache';
export const CHAVE_OFICINA = 'bipfix_oficina_cache';

export function limparCachePerfil() {
  AsyncStorage.multiRemove([CHAVE_PERFIL, CHAVE_OFICINA]).catch(() => {});
}

/** o cache da oficina so vale para a conta que o gravou (dona = oficina.profile_id; equipe = funcionario.profile_id) */
export function cacheOficinaVale(cache: { oficina?: { profile_id?: string } | null; funcionario?: { profile_id?: string } | null } | null | undefined, userId: string): boolean {
  if (!cache?.oficina) return false;
  return cache.oficina.profile_id === userId || cache.funcionario?.profile_id === userId;
}
