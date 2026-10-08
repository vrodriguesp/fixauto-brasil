// fetch com prazo (AbortSignal.timeout nao existe em todo motor de JS do
// celular): sem resposta no prazo, desiste - a tela nunca fica girando.
export function fetchComPrazo(url: string, ms = 8000, init: RequestInit = {}) {
  const ctl = new AbortController();
  const tmr = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...init, signal: ctl.signal }).finally(() => clearTimeout(tmr));
}
