import { supabase } from './supabase';

// Fotos do pedido ficam no espaco PRIVADO 'damage-photos'; o banco guarda o endereco no formato publico
// antigo, que responde 400 - vira link assinado de 1 h (mesma regra do site, components/midia/MidiaPrivada.tsx
// e de components/FotosESeguroPedido.tsx).
const MARCA = '/storage/v1/object/public/damage-photos/';
export const caminhoPrivado = (url: string) => {
  const i = url.indexOf(MARCA);
  return i >= 0 ? decodeURIComponent(url.slice(i + MARCA.length).split('?')[0]) : null;
};

export async function urlAssinada(url: string): Promise<string | null> {
  const c = caminhoPrivado(url);
  if (!c) return url;
  const { data } = await supabase.storage.from('damage-photos').createSignedUrl(c, 3600);
  return data?.signedUrl || null;
}
