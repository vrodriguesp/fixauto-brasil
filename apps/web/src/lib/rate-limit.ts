import type { NextRequest } from 'next/server';

// Limite de requisicoes por chave (IP + rota) em memoria - o app roda em um
// processo PM2 so. OWASP API4 (consumo irrestrito de recursos).
const janelas = new Map<string, number[]>();

export function ipDe(req: NextRequest | Request): string {
  const h = req.headers;
  // nginx sempre define X-Real-IP; sem ele, o ULTIMO item do X-Forwarded-For
  // (o primeiro pode ser inventado pelo visitante - auditoria B-14)
  return h.get('x-real-ip')?.trim() || h.get('x-forwarded-for')?.split(',').pop()?.trim() || 'desconhecido';
}

/** true = pode seguir; false = passou do limite (responder 429). */
export function dentroDoLimite(chave: string, max: number, janelaMs: number): boolean {
  const agora = Date.now();
  const lista = (janelas.get(chave) || []).filter((t) => agora - t < janelaMs);
  if (lista.length >= max) {
    janelas.set(chave, lista);
    return false;
  }
  lista.push(agora);
  janelas.set(chave, lista);
  if (janelas.size > 20000) {
    // limpeza simples para nao crescer sem fim
    Array.from(janelas.entries()).forEach(([k, v]) => {
      if (!v.some((t) => agora - t < janelaMs)) janelas.delete(k);
    });
  }
  return true;
}

export function limitarPorIp(req: NextRequest | Request, rota: string, max: number, janelaMs: number): boolean {
  return dentroDoLimite(`${rota}:${ipDe(req)}`, max, janelaMs);
}
