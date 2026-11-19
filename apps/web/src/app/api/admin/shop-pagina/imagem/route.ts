import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { tratarImagem } from '@/lib/imagem-servidor';
import { ErroValidacao } from '@/lib/validacao';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const MAX_ENTRADA = 8 * 1024 * 1024;

// Pecas lote 5 (106): banner da pagina do Shop. So admin. Tipo pelos BYTES (jpeg/png/webp; HEIC so se o servidor
// decodificar), ate 8 MB, re-codificado em JPEG sem EXIF/GPS (lib/imagem-servidor, o mesmo das fotos do pedido),
// lado maior 1600 px. Guardado no bucket PRIVADO shop-pagina (banners/<uuid>.jpg); a tela le por /api/pecas/shop-imagem.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get('arquivo');
  if (!arquivo || typeof arquivo === 'string') return NextResponse.json({ error: 'arquivo obrigatório', codigo: 'SEM_ARQUIVO' }, { status: 400 });
  if (arquivo.size > MAX_ENTRADA) return NextResponse.json({ error: 'maior que 8 MB', codigo: 'FOTO_TAMANHO' }, { status: 400 });
  try {
    const img = await tratarImagem(Buffer.from(await arquivo.arrayBuffer()));
    const caminho = `banners/${randomUUID()}.jpg`;
    const { error } = await supabaseAdmin.storage.from('shop-pagina').upload(caminho, img.buffer, { contentType: 'image/jpeg', upsert: false });
    if (error) return NextResponse.json({ error: error.message, codigo: 'ERRO' }, { status: 500 });
    return NextResponse.json({ caminho, largura: img.largura, altura: img.altura, bytes: img.bytes });
  } catch (e) {
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: (e as any).codigo || 'FOTO_INVALIDA' }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message, codigo: 'ERRO' }, { status: 500 });
  }
}
