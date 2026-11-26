// Ajudantes puros das sugestoes de endereco (/api/endereco/sugestoes), fora do route.ts para
// os testes (scripts/teste-endereco-robos.ts) e porque um route.ts so pode exportar os handlers.

// O Photon e o Geoapify nao conhecem (ou conhecem mal) os nomes russos dos lugares da Estonia:
// "Ласнамяэ" trazia uma igreja da Narva mnt antes do bairro (simulacao 26/11). No mercado EE o
// texto em cirilico vira latim: primeiro os nomes proprios (linnaosad de Tallinn, cidades e vilas
// mais pedidas, com a grafia estoniana exata), depois letra a letra no jeito estoniano (я depois
// de consoante = ä, que os buscadores igualam a "a"; Ярве -> Jarve ~ Järve; Йыхви -> Johvi ~ Jõhvi).
export const CIRILICO = /[а-яё]/i;
const LATIM: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'jo', ж: 'z', з: 'z', и: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 's', щ: 's', ъ: '', ы: 'o', ь: '', э: 'e',
};
const VOGAL = /[аеёиоуыэюяaeiou]/i;
export function latimEstonia(texto: string): string {
  let out = '';
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i], min = ch.toLowerCase(), ant = i > 0 ? texto[i - 1].toLowerCase() : '';
    const inicio = !ant || !/[а-яёa-z]/i.test(ant) || VOGAL.test(ant) || ant === 'ь' || ant === 'ъ';
    let l: string;
    if (min === 'я') l = inicio ? 'ja' : 'a';
    else if (min === 'ю') l = inicio ? 'ju' : 'u';
    else if (min === 'й') l = ant && VOGAL.test(ant) ? 'i' : 'j';
    else if (min in LATIM) l = LATIM[min];
    else { out += ch; continue; }
    out += ch !== min && l ? l[0].toUpperCase() + l.slice(1) : l;
  }
  return out;
}

// Nomes russos -> estonianos (minusculas, sem acento russo). Linnaosad e asumid de Tallinn, cidades
// e vilas de onde chegam pedidos (lote de 26/11). Um nome composto entra inteiro ("Пыхья-Таллинн").
export const LUGARES_RU_ET: Record<string, string> = {
  // Tallinn e as 8 linnaosad
  'таллинн': 'Tallinn', 'таллин': 'Tallinn',
  'кесклинн': 'Kesklinn', 'ласнамяэ': 'Lasnamäe', 'мустамяэ': 'Mustamäe', 'хааберсти': 'Haabersti',
  'кристийне': 'Kristiine', 'нымме': 'Nõmme', 'пирита': 'Pirita', 'пыхья-таллинн': 'Põhja-Tallinn', 'пыхья-таллин': 'Põhja-Tallinn',
  // asumid mais pedidos
  'ыйсмяэ': 'Õismäe', 'вяйке-ыйсмяэ': 'Väike-Õismäe', 'каламая': 'Kalamaja', 'копли': 'Kopli', 'пельгулинн': 'Pelgulinn',
  'кадриорг': 'Kadriorg', 'тонди': 'Tondi', 'юлемисте': 'Ülemiste', 'куристику': 'Kuristiku', 'приисле': 'Priisle',
  'паэ': 'Pae', 'сикупилли': 'Sikupilli', 'лиллекюла': 'Lilleküla', 'ярве': 'Järve', 'сыямяэ': 'Sõjamäe',
  'тискре': 'Tiskre', 'какумяэ': 'Kakumäe', 'пяэскюла': 'Pääsküla',
  // Harjumaa e cidades
  'маарду': 'Maardu', 'виймси': 'Viimsi', 'хаабнеэме': 'Haabneeme', 'лаагри': 'Laagri', 'сауэ': 'Saue',
  'пеэтри': 'Peetri', 'юри': 'Jüri', 'табасалу': 'Tabasalu', 'кейла': 'Keila', 'раэ': 'Rae', 'лоо': 'Loo', 'кийли': 'Kiili',
  'саку': 'Saku', 'харку': 'Harku', 'ассаку': 'Assaku', 'кехра': 'Kehra', 'палдиски': 'Paldiski',
  'тарту': 'Tartu', 'нарва': 'Narva', 'пярну': 'Pärnu', 'раквере': 'Rakvere', 'йыхви': 'Jõhvi', 'кохтла-ярве': 'Kohtla-Järve',
  'силламяэ': 'Sillamäe', 'вильянди': 'Viljandi', 'хаапсалу': 'Haapsalu', 'курессааре': 'Kuressaare', 'выру': 'Võru',
  'валга': 'Valga', 'пайде': 'Paide', 'тапа': 'Tapa', 'кивиыли': 'Kiviõli', 'пылва': 'Põlva', 'йыгева': 'Jõgeva',
};
const PALAVRA_RU = /[а-яё][а-яё-]*/gi;

// Rua escrita em russo de verdade ("Нарвское шоссе", "улица Паэ"): o OSM resolve pelo name:ru, e a
// transliteracao letra a letra ("Narvskoe sosse") so traz lixo - nesse caso o original vai primeiro.
// "теэ/тее", "мнт", "пуйестеэ" sao palavras estonianas em cirilico: letra a letra funciona, latim primeiro.
const RUA_RU = /шоссе|улиц|(^|[^а-яё])ул\.|проспект|бульвар|переул|площад|набережн/i;
export const ruaEmRusso = (q: string) => CIRILICO.test(q) && RUA_RU.test(q);

/** Ordem das buscas no mercado EE: [primeira, segunda?]. Rua em russo: original primeiro, latim depois;
 *  o resto (bairros, cidades, nomes estonianos em cirilico): latim primeiro, original depois. */
export function ordemBuscaEE(q: string): [string, string | null] {
  if (!CIRILICO.test(q)) return [q, null];
  const latim = paraLatimEE(q);
  return ruaEmRusso(q) ? [q, latim] : [latim, q];
}

/** Texto da busca para o mercado EE: cirilico -> nome estoniano conhecido, ou latim letra a letra. */
export function paraLatimEE(q: string): string {
  if (!CIRILICO.test(q)) return q;
  const comNomes = q.replace(PALAVRA_RU, (p) => LUGARES_RU_ET[p.toLowerCase()] ?? p);
  return CIRILICO.test(comNomes) ? latimEstonia(comNomes) : comNomes;
}

// Pontos de interesse (igreja, loja, hotel...) nao sao "onde esta o carro": so lugares e enderecos.
// Geoapify: result_type amenity; Photon: osm_key das categorias de POI (um lugar e place/boundary/highway/building).
const POI_GEOAPIFY = new Set(['amenity']);
const POI_PHOTON = new Set(['amenity', 'shop', 'tourism', 'leisure', 'office', 'craft', 'historic', 'aeroway', 'railway', 'man_made', 'emergency', 'healthcare', 'sport']);
export const ehPoiGeoapify = (resultType: unknown) => POI_GEOAPIFY.has(String(resultType || ''));
export const ehPoiPhoton = (osmKey: unknown) => POI_PHOTON.has(String(osmKey || ''));
