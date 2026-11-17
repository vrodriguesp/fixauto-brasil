import { INTL_LOCALE } from '@fixauto/shared';
import type { UnidadePeca } from '@fixauto/shared';

// Lote 1 de pecas (17/11): regras puras (tela e servidor) de quantidade com unidade,
// placa e validade. Os rotulos das unidades na tela vem de messages (pecas.unidades.*);
// os do e-mail/sino, de lib/email-i18n.ts (UNIDADES_PECA_TEXTO).

// a ordem e a do <select> (contrato dos testes)
export const UNIDADES_PECA: UnidadePeca[] = ['un', 'jogo', 'par', 'litro', 'kg', 'metro', 'caixa'];
export const VALIDADE_COTACAO_DIAS = 7;
export const TETO_REABERTURAS = 3;

/** "4,5" ou "4.5" -> 4.5 (2 casas, 0 < q <= 9999, como o CHECK da 091); invalido -> 1, como a tela de hoje */
export function lerQuantidade(texto: string): number {
  const n = Number(String(texto || '').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(9999, Math.round(n * 100) / 100) || 1;
}

/** numero no formato da lingua ("4,5" em et/pt/ru/it, "4.5" em en), ate 2 casas */
export function numeroDaQuantidade(q: number | string | null | undefined, locale: string): string {
  const n = Number(q) || 1;
  return new Intl.NumberFormat(INTL_LOCALE[locale] || INTL_LOCALE[locale.split('-')[0]] || 'en-GB', { maximumFractionDigits: 2 }).format(n);
}

// letras cirilicas que as placas russas usam e que tem gemea latina (А В Е К М Н О Р С Т У Х)
const CIRILICO_LATINO: Record<string, string> = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X' };

/** "123 abc" -> "123ABC": maiusculas, sem espaco/hifen/ponto (o CHECK do banco e ^[A-Z0-9]{2,12}$) */
export function normalizarPlaca(texto: string): string {
  return String(texto || '').toUpperCase().replace(/[А-ЯЁ]/g, (c) => CIRILICO_LATINO[c] ?? c).replace(/[^A-Z0-9]/g, '');
}

export const placaValida = (placa: string) => /^[A-Z0-9]{2,12}$/.test(placa);

/** dias inteiros ate vencer (no minimo 1 enquanto a cotacao esta aberta; a tarefa horaria troca o status) */
export function diasParaExpirar(expiraEm: string | null | undefined, agora = Date.now()): number {
  const t = Date.parse(expiraEm || '');
  if (!Number.isFinite(t)) return VALIDADE_COTACAO_DIAS;
  return Math.max(1, Math.ceil((t - agora) / 86400000));
}
