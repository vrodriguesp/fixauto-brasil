// Seguradoras de automovel mais comuns por pais (para a oficina marcar as
// convencionadas e para sugerir no campo "seguradora" do cliente). Nao e o
// registro completo dos supervisores (IVASS, ASF, Finantsinspektsioon,
// SUSEP...), que inclui centenas de empresas e sucursais estrangeiras: sao as
// que concentram o mercado de auto; o campo continua aceitando qualquer outra.
export const SEGURADORAS_POR_PAIS: Record<string, string[]> = {
  IT: ['Generali', 'Unipol', 'Allianz', 'Allianz Direct', 'AXA', 'Reale Mutua', 'Zurich', 'Sara Assicurazioni', 'Vittoria Assicurazioni',
    'Cattolica Assicurazioni', 'HDI Assicurazioni', 'Groupama', 'Italiana Assicurazioni', 'Itas Mutua', 'Helvetia', 'Intesa Sanpaolo Assicurazioni',
    'Verti', 'Genertel', 'Linear', 'Quixa', 'ConTe.it', 'Prima Assicurazioni', 'BeRebel', 'Bene Assicurazioni', 'Nobis', 'Arca Assicurazioni'],
  PT: ['Fidelidade', 'Ageas Seguros', 'Generali Tranquilidade', 'Allianz', 'Zurich', 'Mapfre', 'Liberty Seguros', 'Caravela', 'Lusitania',
    'Una Seguros', 'Victoria Seguros', 'Ok! Teleseguros', 'Logo'],
  EE: ['If', 'ERGO', 'Swedbank P&C', 'LHV Kindlustus', 'Gjensidige', 'Compensa', 'BTA', 'Salva', 'Balcia', 'Inges Kindlustus'],
  LV: ['Balta', 'BTA', 'Gjensidige', 'If', 'ERGO', 'Compensa', 'Swedbank P&C', 'Balcia'],
  LT: ['Lietuvos draudimas', 'BTA', 'ERGO', 'Gjensidige', 'If', 'Compensa', 'Swedbank P&C', 'Balcia'],
  FI: ['If', 'LähiTapiola', 'OP Vakuutus', 'Fennia', 'Pohjantähti', 'POP Vakuutus', 'Turva'],
  BR: ['Porto Seguro', 'Azul Seguros', 'Itaú Seguros', 'Bradesco Seguros', 'Allianz', 'Tokio Marine', 'HDI', 'Yelum', 'Mapfre', 'Suhai',
    'Sompo', 'Zurich', 'Mitsui Sumitomo', 'Youse', 'Alfa Seguradora', 'Aliro', 'Pier'],
};
const GERAL = ['Allianz', 'AXA', 'Generali', 'Zurich', 'ERGO', 'Mapfre', 'If', 'Gjensidige'];

export const seguradorasDoPais = (pais?: string | null) => SEGURADORAS_POR_PAIS[(pais || '').toUpperCase()] || GERAL;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** A seguradora do cliente esta entre as convencionadas da oficina? (ignora acento/maiuscula) */
export function ehConvencionada(convencionadas: string[] | null | undefined, seguradoraCliente: string | null | undefined): boolean {
  const c = norm(seguradoraCliente || '');
  if (!c || !convencionadas?.length) return false;
  return convencionadas.some((s) => {
    const n = norm(s);
    return n === c || (n.length >= 4 && c.includes(n)) || (c.length >= 4 && n.includes(c));
  });
}
