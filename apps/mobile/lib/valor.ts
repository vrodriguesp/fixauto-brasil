// Valor digitado pela oficina no orcamento (auditoria 27/11, caso 104; revisao 28/11): aceita "50", "50,5", "50.5",
// "99,90", "1 234,56", "1.234,56", "1,234.56", "1.234", "1.000.000", "1,234,567"; recusa letras ("abc", "12abc"),
// negativo, vazio, separador sem digito (",", "5,"), grupos de milhar errados ("1.5.0", "1.23.456") e mais de 2
// casas decimais ("1,2345") -> null (a tela marca o campo e nao envia). Espaco (inclusive U+202F/U+00A0) e milhar.
const gruposDeMilharOk = (partes: string[]) => partes.length >= 2 && /^[1-9]\d{0,2}$/.test(partes[0]) && partes.slice(1).every((p) => /^\d{3}$/.test(p));

export function lerValor(texto: string | null | undefined): number | null {
  const t = String(texto ?? '').replace(/[\s  ]/g, '');
  if (!t || !/^[0-9.,]+$/.test(t) || !/\d/.test(t)) return null;
  const seps = t.match(/[.,]/g) || [];
  let inteiro: string;
  let decimal = '';
  if (seps.length === 0) {
    inteiro = t;
  } else {
    const ultimo = seps[seps.length - 1];
    const repetido = seps.filter((s) => s === ultimo).length > 1;
    if (repetido) {
      // o ultimo separador se repete: todos sao de milhar ("1.000.000", "1,234,567"); grupos tem de ser certos
      if (seps.some((s) => s !== ultimo)) return null;
      const partes = t.split(ultimo);
      if (!gruposDeMilharOk(partes)) return null;
      inteiro = partes.join('');
    } else {
      const pos = t.lastIndexOf(ultimo);
      const antes = t.slice(0, pos), depois = t.slice(pos + 1);
      if (!antes || !depois) return null; // ",", "5,", ",5"
      const outro = ultimo === ',' ? '.' : ',';
      const grupos = antes.split(outro);
      if (grupos.length > 1) {
        // "1.234,56": o outro separador e de milhar e os grupos tem de ser certos
        if (!gruposDeMilharOk(grupos)) return null;
        inteiro = grupos.join('');
        decimal = depois;
      } else if (depois.length === 3 && /^[1-9]\d{0,2}$/.test(antes)) {
        // "1.234" / "1,234" = milhar (so com a parte inteira sem zero a esquerda; "0.500" = 0,5)
        inteiro = antes + depois;
      } else {
        inteiro = antes;
        decimal = depois;
      }
      // "0.500" = 0,5: zeros a direita nao contam; sobrando mais de 2 casas ("1,2345") e invalido
      if (decimal.length > 2) decimal = decimal.replace(/0+$/, '');
      if (decimal.length > 2) return null;
    }
  }
  if (!/^\d+$/.test(inteiro) || !/^\d*$/.test(decimal)) return null;
  const n = Number(`${inteiro}.${decimal || '0'}`);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}
