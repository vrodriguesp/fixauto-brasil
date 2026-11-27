// Valor digitado pela oficina no orcamento (auditoria 27/11, caso 104): aceita "50", "50,5", "50.5", "1 234,56",
// "1.234,56", "1,234.56", "1 234"; recusa letras ("abc", "12abc"), negativo e vazio -> null (a tela marca o campo e
// nao envia). Espaco (inclusive o fino U+202F/U+00A0) e separador de milhar.
export function lerValor(texto: string | null | undefined): number | null {
  const t = String(texto ?? '').replace(/[\s  ]/g, '').trim();
  if (!t) return null;
  if (!/^[0-9.,]+$/.test(t)) return null;
  const ultimaVirgula = t.lastIndexOf(','), ultimoPonto = t.lastIndexOf('.');
  let inteiro = t, decimal = '';
  const sep = Math.max(ultimaVirgula, ultimoPonto);
  if (sep >= 0) {
    const depois = t.slice(sep + 1);
    // "1.234" / "1,234" sozinhos (3 digitos depois do unico separador) = milhar; senao decimal
    const unicoSeparador = (t.match(/[.,]/g) || []).length === 1;
    if (unicoSeparador && depois.length === 3) { inteiro = t; decimal = ''; }
    else { inteiro = t.slice(0, sep); decimal = depois; }
  }
  inteiro = inteiro.replace(/[.,]/g, '');
  if (!/^\d*$/.test(inteiro) || !/^\d*$/.test(decimal)) return null;
  const n = Number(`${inteiro || '0'}.${decimal || '0'}`);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}
