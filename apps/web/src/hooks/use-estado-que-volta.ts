import { useEffect, useState } from 'react';
import { gravarEstadoUi, lerEstadoUi } from '@/lib/rascunho-troca-idioma';

// useState que volta depois de trocar a lingua (ex.: o formulario "mudar data" que estava aberto).
// So guarda texto simples; null = fechado.
export function useEstadoQueVolta<T extends string>(chave: string, inicial: T | null) {
  const [valor, setValor] = useState<T | null>(() => (typeof window === 'undefined' ? inicial : ((lerEstadoUi(chave) as T | null) ?? inicial)));
  useEffect(() => { gravarEstadoUi(chave, valor); }, [chave, valor]);
  return [valor, setValor] as const;
}
