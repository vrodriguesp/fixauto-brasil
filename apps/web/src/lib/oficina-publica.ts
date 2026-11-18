// Regras e formatacao das PAGINAS PUBLICAS das oficinas (perfil e lista) -
// auditoria Fable 18/11 (Documentos/Analises/Paginas_publicas_oficinas_2026-11-18).
// Sem React e sem banco: so funcoes puras, para o servidor, o cliente e os testes.

/** Selos e numeros de comportamento (hinnangud, ajuste de preco, "nova", volume...)
 *  so aparecem com pelo menos 3 avaliacoes OU 3 servicos concluidos (dono 18/11:
 *  "e cedo demais para este tipo de etiqueta"). */
export const MIN_HISTORICO_SELOS = 3;

/** Unica excecao: "responde normalmente em 1 dia" - so positivo, so com a mediana
 *  do tempo de resposta abaixo de 24 h e pelo menos 1 pedido orcado (dono 18/11). */
export const LIMITE_RESPOSTA_RAPIDA_H = 24;

export const LOCALES_SITE = ['pt', 'pt-PT', 'en', 'et', 'it', 'ru'] as const;
export type LocaleSite = (typeof LOCALES_SITE)[number];

/** Mediana em horas de uma lista de duracoes em ms (null sem amostra). */
export function medianaHoras(ms: number[]): number | null {
  const v = ms.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  const med = v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
  return med / 3_600_000;
}

export function respondeRapido(medianaH: number | null): boolean {
  return medianaH !== null && medianaH < LIMITE_RESPOSTA_RAPIDA_H;
}

export function temHistorico(totalAvaliacoes: number, totalConcluidos: number): boolean {
  return totalAvaliacoes >= MIN_HISTORICO_SELOS || totalConcluidos >= MIN_HISTORICO_SELOS;
}

// ---- regiao (campo `estado`) na lingua da pagina -------------------------
// O cadastro guarda o que o Geoapify devolve ("Harju County" ou "Harju maakond",
// conforme a lingua do navegador do dono) - vazava em ingles na pagina em
// estoniano e vice-versa. Normaliza para o nome base e escreve na lingua lida.
const SUFIXOS_REGIAO = /\s+(county|maakond|maakonna|region|oblast|district)$/i;
const FORMATO_REGIAO: Record<LocaleSite, (base: string) => string> = {
  et: (b) => `${b} maakond`,
  en: (b) => `${b} County`,
  ru: (b) => `${b}maa`, // "Harjumaa" - forma usual nos textos russos da Estonia
  pt: (b) => `${b}maa`,
  'pt-PT': (b) => `${b}maa`,
  it: (b) => `${b}maa`,
};
export function nomeRegiao(estado: string | null | undefined, locale: string, pais?: string | null): string {
  const e = (estado || '').trim();
  if (!e) return '';
  // so regioes da Estonia tem a forma "<base> County/maakond"; outros paises: como esta
  if ((pais || 'EE') !== 'EE' || !SUFIXOS_REGIAO.test(e) && !/maa$/i.test(e)) return e;
  const base = e.replace(SUFIXOS_REGIAO, '').replace(/maa$/i, '').trim();
  const f = FORMATO_REGIAO[locale as LocaleSite] || FORMATO_REGIAO.en;
  return f(base);
}

/** "Tallinn, Harju maakond" (sem o " - " de antes, que parecia um codigo). */
export function cidadeRegiao(cidade: string, estado: string | null | undefined, locale: string, pais?: string | null): string {
  const r = nomeRegiao(estado, locale, pais);
  return r ? `${cidade}, ${r}` : cidade;
}

// ---- endereco ------------------------------------------------------------
/** O cadastro grava "Rua, numero" (juntarEndereco). Na Estonia escreve-se
 *  "Akadeemia tee 45" (sem virgula); Brasil/Portugal/Italia mantem a virgula. */
export function formatarEndereco(endereco: string, pais?: string | null): string {
  const e = (endereco || '').trim();
  if ((pais || 'EE') !== 'EE') return e;
  const m = e.match(/^(.+?),\s*(\d[\w/\-]*)(.*)$/);
  return m ? `${m[1]} ${m[2]}${m[3]}` : e;
}

/** Complemento ja contido no endereco (CARVEX: "Punane tn. 6, DRIFTIKESKUS CARVEX"
 *  + complemento "DRIFTIKESKUS CARVEX") aparecia duas vezes. */
export function complementoVisivel(endereco: string, complemento: string | null | undefined): string | null {
  const c = (complemento || '').trim();
  if (!c) return null;
  return (endereco || '').toLowerCase().includes(c.toLowerCase()) ? null : c;
}

// ---- telefone ------------------------------------------------------------
const DDI_PAIS: Record<string, string> = { EE: '+372', BR: '+55', PT: '+351', IT: '+39' };
/** Numero gravado sem indicativo ("54572188") ganha o do pais e espacos legiveis;
 *  o href tel: fica sem espacos. */
export function formatarTelefone(tel: string | null | undefined, pais?: string | null): { visivel: string; href: string } | null {
  let t = (tel || '').replace(/[^\d+]/g, '');
  if (!t) return null;
  if (!t.startsWith('+')) {
    const ddi = DDI_PAIS[pais || 'EE'] || '';
    t = t.startsWith('00') ? `+${t.slice(2)}` : ddi && t.length <= 10 ? `${ddi}${t.replace(/^0/, '')}` : t;
  }
  const ddi = Object.values(DDI_PAIS).find((d) => t.startsWith(d));
  const resto = ddi ? t.slice(ddi.length) : t;
  // 8 digitos "5457 2188", 7 "600 1501", 9 "xxx xxx xxx", resto em grupos de 3
  const n = resto.length;
  const grupos = n <= 4 ? resto : n === 8 ? `${resto.slice(0, 4)} ${resto.slice(4)}` : n === 7 ? `${resto.slice(0, 3)} ${resto.slice(3)}` : resto.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
  return { visivel: ddi ? `${ddi} ${grupos}` : grupos, href: t };
}

// ---- especialidades ------------------------------------------------------
/** "Muu/Outro" sempre por ultimo (A-Autokile aparecia como "Muu, Kere- ja varvitood"). */
export function ordenarEspecialidades(esp: string[] | null | undefined): string[] {
  const lista = Array.from(new Set(esp || []));
  return lista.filter((e) => e !== 'outro').concat(lista.includes('outro') ? ['outro'] : []);
}

/** Tipo de oficina para o title/description: carroceria (so kere/varv/kokkuporge),
 *  geral (so "outro": vidros, etc. - sem chamar de "autoremonditöökoda") ou remont. */
export type TipoOficinaTitulo = 'carroceria' | 'geral' | 'remont';
export function tipoOficinaTitulo(esp: string[] | null | undefined): TipoOficinaTitulo {
  const s = new Set(esp || []);
  const carroceria = s.has('funilaria') || s.has('colisao') || s.has('pintura');
  const mecanica = s.has('mecanica') || s.has('revisao') || s.has('eletrica') || s.has('pneu') || s.has('manutencao');
  if (carroceria && !mecanica) return 'carroceria';
  if (!carroceria && !mecanica) return 'geral';
  return 'remont';
}

// ---- descricao traduzida -------------------------------------------------
export type DescricaoTraducoes = Partial<Record<LocaleSite, string>> & { origem?: string | null; hash?: string };

/** Texto a mostrar e se e traducao: a versao guardada na lingua da pagina, senao o original. */
export function descricaoParaLocale(
  descricao: string | null | undefined,
  traducoes: DescricaoTraducoes | null | undefined,
  locale: string,
): { texto: string | null; traduzida: boolean; origem: string | null } {
  const original = (descricao || '').trim() || null;
  if (!original) return { texto: null, traduzida: false, origem: null };
  const origem = (traducoes?.origem || null) as string | null;
  // o original ja esta na lingua da pagina (ou so mudou de variante pt/pt-PT)
  if (origem && (origem === locale || origem.split('-')[0] === locale.split('-')[0] && !traducoes?.[locale as LocaleSite])) {
    return { texto: original, traduzida: false, origem };
  }
  const t = traducoes?.[locale as LocaleSite];
  if (t && t.trim() && t.trim() !== original) return { texto: t.trim(), traduzida: true, origem };
  return { texto: original, traduzida: false, origem };
}
