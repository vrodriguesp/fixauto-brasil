import crypto from 'node:crypto';

// Segredos com gerador criptografico (Math.random() e previsivel - OWASP).
export function senhaAleatoria(tamanho = 24): string {
  return crypto.randomBytes(tamanho).toString('base64url');
}

export function tokenAleatorio(): string {
  return crypto.randomBytes(32).toString('base64url');
}

// Guarda-se so o hash do token (se o banco vazar, o token nao vaza junto).
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function iguaisSeguro(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
