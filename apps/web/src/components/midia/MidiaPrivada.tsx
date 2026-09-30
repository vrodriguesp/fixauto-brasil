'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

// Fotos de dano, audios e imagens de conversa ficam no espaco PRIVADO
// 'damage-photos' (docs do Supabase, "Storage access control": conteudo
// sensivel em bucket privado + link temporario). O banco guarda o endereco
// no formato antigo (.../object/public/damage-photos/<caminho>); aqui ele
// vira um link assinado de 1 hora - que o Supabase so gera para quem tem
// acesso pela regra do storage.objects. Enderecos de outros espacos passam
// direto.
const MARCA = '/storage/v1/object/public/damage-photos/';
const cache = new Map<string, { url: string; expira: number }>();

export function caminhoPrivado(url: string | null | undefined): string | null {
  if (!url) return null;
  const i = url.indexOf(MARCA);
  return i >= 0 ? decodeURIComponent(url.slice(i + MARCA.length).split('?')[0]) : null;
}

export function useUrlMidia(url: string | null | undefined): string | null {
  const caminho = caminhoPrivado(url);
  const [assinada, setAssinada] = useState<string | null>(() => {
    if (!caminho) return url ?? null;
    const c = cache.get(caminho);
    return c && c.expira > Date.now() ? c.url : null;
  });

  useEffect(() => {
    if (!caminho) {
      setAssinada(url ?? null);
      return;
    }
    const c = cache.get(caminho);
    if (c && c.expira > Date.now()) {
      setAssinada(c.url);
      return;
    }
    let vivo = true;
    supabase.storage
      .from('damage-photos')
      .createSignedUrl(caminho, 3600)
      .then(({ data }) => {
        if (!data?.signedUrl) return;
        cache.set(caminho, { url: data.signedUrl, expira: Date.now() + 50 * 60 * 1000 });
        if (vivo) setAssinada(data.signedUrl);
      });
    return () => {
      vivo = false;
    };
  }, [caminho, url]);

  return assinada;
}

/** Renderiza os filhos com o link assinado (nada enquanto ele nao chega). */
export default function MidiaPrivada({ url, children }: { url: string | null | undefined; children: (u: string) => ReactNode }) {
  const u = useUrlMidia(url);
  return u ? <>{children(u)}</> : null;
}
