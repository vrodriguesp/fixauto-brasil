import sharp from 'sharp';
import { ErroValidacao, IMAGEM_MAX_BYTES } from './validacao';

// Foto que entra pelo servidor (pedido sem conta e fotos adicionadas ao pedido - lote 0 da
// auditoria Fable 18/11): o tipo e lido pelos BYTES (assinatura), nao pelo File.type que o
// navegador manda; a imagem e reencodada com o sharp (lado maior 1600 px, JPEG q80) SEM
// withMetadata() - EXIF, GPS e orientacao saem (a orientacao e aplicada antes com rotate()).
// Antes, foto < 300 KB e HEIC no Chrome subiam com o GPS do celular.
export const LADO_MAXIMO = 1600;
const QUALIDADE = 80;

export type TipoImagem = 'jpeg' | 'png' | 'webp' | 'heic';

/** Tipo pela assinatura dos primeiros bytes; null = nao e uma imagem aceita. */
export function tipoPelosBytes(b: Buffer): TipoImagem | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  // ISO BMFF: "....ftyp" + marca (heic, heix, hevc, mif1, msf1, heif)
  if (b.toString('ascii', 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|heif)/.test(b.toString('ascii', 8, 12))) return 'heic';
  return null;
}

export type ImagemTratada = { buffer: Buffer; largura: number; altura: number; bytes: number; tipo: 'image/jpeg'; extensao: 'jpg' };

/**
 * Confere a assinatura e reencoda em JPEG sem metadados. Erros com codigo da tela:
 * FOTO_TIPO (nao e imagem / HEIC que o servidor nao decodifica), FOTO_TAMANHO, FOTO_INVALIDA.
 */
export async function tratarImagem(entrada: Buffer): Promise<ImagemTratada> {
  if (entrada.length > IMAGEM_MAX_BYTES) throw new ErroValidacao('foto maior que 10 MB', 'FOTO_TAMANHO');
  const tipo = tipoPelosBytes(entrada);
  if (!tipo) throw new ErroValidacao('tipo de arquivo não permitido', 'FOTO_TIPO');
  try {
    // limitInputPixels: imagem "bomba" (dimensoes absurdas) nao derruba o processo
    const { data, info } = await sharp(entrada, { limitInputPixels: 50_000_000, failOn: 'error' })
      .rotate() // aplica a orientacao do EXIF antes de o EXIF ser descartado
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: QUALIDADE, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, largura: info.width, altura: info.height, bytes: data.length, tipo: 'image/jpeg', extensao: 'jpg' };
  } catch (e) {
    // HEIC sem libheif no servidor cai aqui: a tela pede JPEG (iPhone pelo site e o app ja mandam JPEG)
    if (tipo === 'heic') throw new ErroValidacao('HEIC não suportado; envie em JPEG', 'FOTO_TIPO');
    throw new ErroValidacao(`imagem inválida: ${(e as Error).message}`, 'FOTO_INVALIDA');
  }
}

/** O servidor decodifica HEIC? (depende do libheif compilado no sharp da maquina) */
export function servidorLeHeic(): boolean {
  try { return !!(sharp.format as any)?.heif?.input?.file || !!(sharp.format as any)?.heif?.input?.buffer; } catch { return false; }
}
