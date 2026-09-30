import { supabaseAdmin } from './supabase-admin';

const MARCA = '/storage/v1/object/public/damage-photos/';

/**
 * Baixa, no servidor, uma foto/audio guardado no espaco privado
 * 'damage-photos' (o endereco "public" gravado no banco nao abre mais sem
 * link assinado). Enderecos de outros lugares sao baixados normalmente.
 */
export async function baixarMidia(url: string): Promise<{ buffer: Buffer; tipo: string } | null> {
  const i = url.indexOf(MARCA);
  if (i >= 0) {
    const caminho = decodeURIComponent(url.slice(i + MARCA.length).split('?')[0]);
    const { data, error } = await supabaseAdmin.storage.from('damage-photos').download(caminho);
    if (error || !data) return null;
    return { buffer: Buffer.from(await data.arrayBuffer()), tipo: data.type || 'application/octet-stream' };
  }
  const res = await fetch(url);
  if (!res.ok) return null;
  return { buffer: Buffer.from(await res.arrayBuffer()), tipo: res.headers.get('content-type') || 'application/octet-stream' };
}
