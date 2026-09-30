// Validacao de entrada das rotas de API (OWASP: validar tipo, tamanho e
// formato de tudo que vem do cliente antes de usar).

export class ErroValidacao extends Error {}

export function texto(v: unknown, campo: string, max: number, obrigatorio = false): string | null {
  if (v == null || v === '') {
    if (obrigatorio) throw new ErroValidacao(`${campo} obrigatório`);
    return null;
  }
  if (typeof v !== 'string') throw new ErroValidacao(`${campo} inválido`);
  const s = v.trim();
  if (obrigatorio && !s) throw new ErroValidacao(`${campo} obrigatório`);
  if (s.length > max) throw new ErroValidacao(`${campo} muito longo`);
  return s || null;
}

export function email(v: unknown, obrigatorio = false): string | null {
  const s = texto(v, 'email', 254, obrigatorio);
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new ErroValidacao('email inválido');
  return s ? s.toLowerCase() : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(v: unknown, campo: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new ErroValidacao(`${campo} inválido`);
  return v;
}
export const ehUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export function numero(v: unknown, campo: string, min: number, max: number): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new ErroValidacao(`${campo} inválido`);
  return n;
}

export function umDe<T extends string>(v: unknown, campo: string, opcoes: readonly T[]): T {
  if (typeof v !== 'string' || !(opcoes as readonly string[]).includes(v)) throw new ErroValidacao(`${campo} inválido`);
  return v as T;
}

export const IMAGEM_TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export const IMAGEM_MAX_BYTES = 10 * 1024 * 1024;

export function validarImagens(arquivos: File[], max: number): File[] {
  if (arquivos.length > max) throw new ErroValidacao(`no máximo ${max} fotos`);
  for (const f of arquivos) {
    if (!(IMAGEM_TIPOS as readonly string[]).includes(f.type)) throw new ErroValidacao('tipo de arquivo não permitido');
    if (f.size > IMAGEM_MAX_BYTES) throw new ErroValidacao('foto maior que 10 MB');
  }
  return arquivos;
}

export function extensaoDe(tipo: string): string {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' } as Record<string, string>)[tipo] || 'bin';
}
