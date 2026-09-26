// Moeda decidida pelo PAIS DA OFICINA/LOJA que emitiu o preco - nunca
// pelo idioma de quem esta olhando a tela. Um usuario em pt pode ser
// brasileiro (BRL) ou portugues (EUR); um usuario em en pode estar em
// qualquer lugar. So o pais real da oficina/loja diz a moeda certa.
// Codigos ISO 3166-1 alpha-2 (o mesmo formato salvo em oficinas.pais /
// lojas_pecas.pais, resolvido via geocodificacao no cadastro).

const EURO_COUNTRIES = new Set([
  'AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV',
  'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES', 'AD', 'MC', 'SM', 'VA',
]);

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  BR: 'BRL',
  GB: 'GBP',
  CH: 'CHF',
  NO: 'NOK',
  SE: 'SEK',
  DK: 'DKK',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  BG: 'BGN',
};

/**
 * Moeda pro pais informado. Pais nao reconhecido (ou ausente, ex: cadastro
 * antigo antes desta coluna existir) cai em EUR - mais seguro que BRL dado
 * que o piloto e europeu; BRL so quando o pais e explicitamente Brasil.
 */
export function currencyForCountry(pais: string | null | undefined): string {
  if (!pais) return 'EUR';
  const code = pais.toUpperCase();
  if (CURRENCY_BY_COUNTRY[code]) return CURRENCY_BY_COUNTRY[code];
  if (EURO_COUNTRIES.has(code)) return 'EUR';
  return 'EUR';
}
