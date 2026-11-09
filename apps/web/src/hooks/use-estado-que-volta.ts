import { useEffect, useState } from 'react';
import { gravarEstadoUi, lerEstadoUi } from '@/lib/rascunho-troca-idioma';

// useState que volta depois de trocar a lingua (ex.: o formulario "mudar data" que estava aberto).
// So guarda texto simples; null = fechado.
export function useEstadoQueVolta<T extends string>(chave: string, inicial: T | null) {
  const [valor, setValor] = useState<T | null>(() => (typeof window === 'undefined' ? inicial : ((lerEstadoUi(chave) as T | null) ?? inicial)));
  useEffect(() => { gravarEstadoUi(chave, valor); }, [chave, valor]);
  return [valor, setValor] as const;
}

// Mesmo, para qualquer valor simples (numero, lista, objeto) guardado como JSON - ex.: passo e
// escolhas do assistente de pedido novo (teste em producao 09/11: trocar a lingua voltava ao passo 1).
export function useValorQueVolta<T>(chave: string, inicial: T) {
  const [valor, setValor] = useState<T>(() => {
    if (typeof window === 'undefined') return inicial;
    const salvo = lerEstadoUi(chave);
    if (salvo === null) return inicial;
    try { return JSON.parse(salvo) as T; } catch { return inicial; }
  });
  useEffect(() => { gravarEstadoUi(chave, JSON.stringify(valor)); }, [chave, valor]);
  return [valor, setValor] as const;
}
