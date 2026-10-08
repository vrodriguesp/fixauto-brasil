// Quem paga o reparo de um acidente (solicitacoes.pagamento_reparo e campos
// do seguro). Usado no formulario do acidente, na pagina do acidente e na
// tela da oficina.
//
// Como funciona na pratica (pesquisa 30/09/2026):
// - Estonia: liikluskindlustus (obrigatorio) paga o dano causado aos outros;
//   kasko (opcional) paga o proprio carro, com franquia (omavastutus). Desde
//   2015 quem sofreu o dano pode abrir o pedido na PROPRIA seguradora mesmo
//   com a culpa do outro. Sem feridos e com acordo, os motoristas registram
//   o acidente no formulario digital (avarii.lkk.ee) ou no papel.
// - Brasil: seguro auto com franquia; com culpa de terceiro aciona-se o
//   seguro dele e a vitima escolhe a oficina (CDC); oficinas referenciadas
//   costumam dar desconto na franquia.
// - Oficina: com seguro, o orcamento vai para a seguradora aprovar antes do
//   servico; fotos antes/durante a desmontagem justificam o orcamento
//   complementar (danos ocultos).
import { ErroValidacao, texto } from './validacao';

export const PAGAMENTOS = ['proprio', 'seguro_terceiro', 'seguro_proprio', 'nao_sei'] as const;
export type PagamentoReparo = (typeof PAGAMENTOS)[number];

export interface SeguroReparo {
  pagamento_reparo: PagamentoReparo | null;
  seguradora: string | null;
  sinistro_numero: string | null;
  franquia: number | null;
}

export const usaSeguro = (p: string | null | undefined) => p === 'seguro_terceiro' || p === 'seguro_proprio';

/** Regiao das dicas: versao do Brasil (pt) ou Europa/Estonia (demais idiomas). */
// Regras do pos-acidente (numero de emergencia, formulario amigavel, seguro)
// sao do PAIS onde a batida aconteceu, nao do idioma: um italiano na Estonia
// segue as regras da Estonia. Pais vem da localizacao do acidente; sem ela,
// do idioma (pt-BR -> Brasil, pt-PT -> Portugal...). Pais sem regras
// proprias aqui recebe conselho generico (112 na Europa, declaracao europeia).
export type RegiaoSeguro = 'br' | 'ee' | 'it' | 'pt' | 'geral';
const POR_PAIS: Record<string, RegiaoSeguro> = { BR: 'br', EE: 'ee', IT: 'it', PT: 'pt' };
const POR_IDIOMA: Record<string, RegiaoSeguro> = { pt: 'br', 'pt-PT': 'pt', et: 'ee', it: 'it' };
export const regiaoSeguro = (locale: string, pais?: string | null): RegiaoSeguro =>
  pais ? POR_PAIS[pais.toUpperCase()] || 'geral' : POR_IDIOMA[locale] || 'geral';

// Sugestoes para o campo "seguradora" (texto livre; lista so ajuda a digitar)
// (it/pt: listas completas em lib/seguradoras.ts)
export const SEGURADORAS: Record<RegiaoSeguro, string[]> = {
  it: ['Generali', 'Unipol', 'Allianz', 'AXA', 'Reale Mutua', 'Zurich', 'Sara Assicurazioni', 'Vittoria', 'Verti', 'Prima'],
  pt: ['Fidelidade', 'Tranquilidade', 'Ageas', 'Allianz', 'Generali', 'Zurich', 'Liberty', 'Ok! Teleseguros', 'Lusitania', 'Caravela'],
  geral: [],
  ee: ['If', 'ERGO', 'Swedbank', 'LHV Kindlustus', 'Gjensidige', 'Compensa', 'BTA', 'Salva', 'Balcia', 'Inges'],
  br: ['Porto Seguro', 'Azul Seguros', 'Itaú Seguros', 'Bradesco Seguros', 'Allianz', 'Tokio Marine', 'HDI', 'Yelum', 'Mapfre', 'Suhai'],
};

/** Valida o que veio do navegador; campos do seguro so valem com seguro. */
export function validarSeguro(d: Record<string, unknown>): SeguroReparo {
  const p = d.pagamento_reparo;
  if (p == null || p === '') return { pagamento_reparo: null, seguradora: null, sinistro_numero: null, franquia: null };
  if (typeof p !== 'string' || !(PAGAMENTOS as readonly string[]).includes(p)) throw new ErroValidacao('pagamento inválido');
  const comSeguro = usaSeguro(p);
  let franquia: number | null = null;
  if (comSeguro && p === 'seguro_proprio' && d.franquia != null && d.franquia !== '') {
    const n = Number(String(d.franquia).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 100000) throw new ErroValidacao('franquia inválida');
    franquia = Math.round(n * 100) / 100;
  }
  return {
    pagamento_reparo: p as PagamentoReparo,
    seguradora: comSeguro ? texto(d.seguradora, 'seguradora', 100) : null,
    sinistro_numero: comSeguro ? texto(d.sinistro_numero, 'sinistro', 60) : null,
    franquia,
  };
}
