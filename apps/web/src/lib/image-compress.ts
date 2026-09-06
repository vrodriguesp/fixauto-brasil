'use client';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.75;
const SKIP_BELOW_BYTES = 300 * 1024; // already small enough, not worth re-encoding

/**
 * Resizes + re-encodes an image file as JPEG using the canvas API (no
 * external deps) before it goes to Supabase Storage, since damage-photo
 * uploads from phone cameras run 3-8MB each and storage/egress cost scales
 * with that. Falls back to the original file on any failure or if it isn't
 * an image / is already small.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return file;
  }
  if (file.size <= SKIP_BELOW_BYTES) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export async function compressImages(files: File[]): Promise<File[]> {
  return Promise.all(files.map(compressImage));
}
