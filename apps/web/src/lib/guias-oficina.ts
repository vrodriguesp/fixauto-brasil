// Guias (PDF) e video mais recentes para a oficina baixar na pagina Aprender (pedido do dono 15/11:
// "deixar sempre o guia mais recente de cada tema", sem mandar anexos por e-mail).
// - PDF: apps/web/public/guias/<tema>-<idioma>.pdf, NOME FIXO por tema e idioma. Versao nova = sobrescrever
//   o arquivo com o mesmo nome (o link nunca muda). Material publico: sem dados de leads/clientes.
//   Fonte: Documentos/Guias (gerar_guia_perfil.mjs) -> copiar para public/guias com o nome fixo.
// - Video: o YouTube nao troca o arquivo mantendo o link; video novo = trocar o link AQUI (um lugar so).
// So aparecem os idiomas listados (arquivo existente). Idioma da tela primeiro; sem ele, os outros.

export type IdiomaGuia = 'et' | 'ru' | 'en' | 'it' | 'pt' | 'pt-PT';

export interface GuiaOficina {
  /** nome do arquivo sem idioma: public/guias/<id>-<idioma>.pdf */
  id: string;
  /** chave do titulo em oficinaAprender.guias.temas */
  tema: string;
  /** idiomas que TEM arquivo em public/guias */
  idiomas: IdiomaGuia[];
}

export const GUIAS_OFICINA: GuiaOficina[] = [
  { id: 'perfil-oficina', tema: 'perfilOficina', idiomas: ['et', 'ru'] },
];

// Video mais recente por idioma (guia do perfil e do orcamento). Trocar aqui quando sair o video novo.
export const VIDEO_GUIA_OFICINA: Partial<Record<IdiomaGuia, string>> = {
  et: 'https://youtu.be/xERYpCB-yhI',
  ru: 'https://youtu.be/zmCLEkNA_e8',
};

// Nome de cada idioma na propria lingua (padrao dos seletores de idioma)
export const NOME_IDIOMA_GUIA: Record<IdiomaGuia, string> = {
  et: 'Eesti keeles', ru: 'На русском', en: 'In English', it: 'In italiano', pt: 'Em português', 'pt-PT': 'Em português',
};

export const urlGuia = (id: string, idioma: IdiomaGuia) => `/guias/${id}-${idioma.toLowerCase()}.pdf`;

/** Idiomas na ordem de exibicao: o da tela primeiro (pt-PT aceita pt e vice-versa), depois et, ru, en... */
export function ordenarIdiomas<T extends string>(disponiveis: T[], tela: string): T[] {
  const ordem = ['et', 'ru', 'en', 'it', 'pt-PT', 'pt'];
  const peso = (l: string) => (l === tela ? -2 : l.startsWith('pt') && tela.startsWith('pt') ? -1 : ordem.indexOf(l));
  return [...disponiveis].sort((a, b) => peso(a) - peso(b));
}
