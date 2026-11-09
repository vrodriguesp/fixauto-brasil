// Copia de apps/web/src/lib/validar-carro.ts (app nao importa o site). Placa e ano do carro (item 53, dono 09/11: um carro ficou com placa "167€" e ano 1800).
// Mesma regra na tela e no servidor. Os dois campos sao opcionais: vazio vale.
//  - placa: letras, numeros, espaco e hifen, de 2 a 10 caracteres (placas da Estonia,
//    Italia, Portugal e Brasil cabem; simbolos como € ou ! nao);
//  - ano: 4 digitos, de 1950 ate o ano que vem.
export const ANO_MINIMO = 1950;
export const anoMaximo = () => new Date().getFullYear() + 1;

export function placaValida(placa: string | null | undefined): boolean {
  const p = (placa || '').trim();
  // letras latinas (com acento: Õ, Ä, Š...) e cirilicas, numeros; espaco/hifen so no meio
  return !p || /^[A-Za-z0-9À-ɏЀ-ӿ][A-Za-z0-9À-ɏЀ-ӿ -]{0,8}[A-Za-z0-9À-ɏЀ-ӿ]$/.test(p);
}

export function anoValido(ano: string | number | null | undefined): boolean {
  const a = String(ano ?? '').trim();
  if (!a || a === '-') return true;
  if (!/^\d{4}$/.test(a)) return false;
  const n = Number(a);
  return n >= ANO_MINIMO && n <= anoMaximo();
}

/** Codigo de erro do primeiro campo invalido (para a API) ou null. */
export function erroCarro(placa: string | null | undefined, ano?: string | number | null): 'PLACA_INVALIDA' | 'ANO_INVALIDO' | null {
  if (!placaValida(placa)) return 'PLACA_INVALIDA';
  if (!anoValido(ano)) return 'ANO_INVALIDO';
  return null;
}

/** Ano vindo de lista (FIPE do Brasil: "2015 Gasolina", "32000" = zero km) ou digitado: vale o ano do inicio. */
export function anoDoCarroValido(ano: string | number | null | undefined): boolean {
  const a = String(ano ?? '').trim();
  if (!a || /^32000/.test(a)) return true;
  const inicio = a.match(/^(\d{4})(?:\D|$)/)?.[1];
  return anoValido(inicio ?? a);
}
