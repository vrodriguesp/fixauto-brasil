// Detecao local e conservadora da lingua de um texto curto, para nao chamar o
// tradutor quando o texto ja esta na lingua de quem le (dono 03/11: "se ambos
// falam a mesma lingua e inutil chamar a API"). So responde "ja esta" quando ha
// sinais claros; na duvida devolve false e o texto vai ao tradutor como antes
// (o pior caso e gastar uma chamada, nunca deixar alguem sem traducao).
// Auditoria Fable 03/11: lingua vizinha nao pode passar por lingua do site -
// finlandes/alemao por estoniano, bulgaro/ucraniano por russo. Para escolher o
// glossario (lingua de origem fixa no DeepL) a regra e mais rigida que para pular.
// Sem dependencias e sem aliases: o teste roda com node --experimental-strip-types.

type Base = 'et' | 'pt' | 'it' | 'en';

// palavras muito frequentes e (quase) exclusivas de cada lingua do site
const PALAVRAS: Record<Base, Set<string>> = {
  et: new Set(('ja on ei see kas mul mis ning aga kui oli vaja palun tere aitäh aitah ka siis veel juba olen oma minu teie sul teil kus mida võib saab tuleb nagu või sõiduk masin töö hind homme täna eile kell pole ole' +
    ' saate saan saab sobib hommikul õhtul päeval kuidas miks millal palju väga hea tänan head päeva õhtut kohe kiiresti pärast enne juures katki töötab vajab vahetada vahetus remont remonti töökoda töökotta hinnapakkumine hinnapakkumist ülevaatus õli aku rool rehvid pidurid klotsid kettad mootor käivitu sõita toon tooma').split(' ')),
  pt: new Set('de que não nao com para uma um os do dos das em no na é por mais meu minha obrigado obrigada olá ola bom dia está tem preciso você voce carro tudo isso esse essa amanhã hoje também sim pode'.split(' ')),
  it: new Set('il che non di per una uno gli lo del della sono con ho ciao grazie macchina mi ti anche questo questa quando perché domani oggi buongiorno ancora già può'.split(' ')),
  en: new Set('the and is are to of for my car please hello hi thanks thank with have need it this can you your not will be was today tomorrow yes what when'.split(' ')),
};
// palavras que o estoniano divide com o finlandes: nao contam como prova de estoniano
const COMUM_FI = new Set('ja on ei ole kui see oma mul'.split(' '));
// sinais de linguas vizinhas: se aparecem, nao e a lingua do site (vai ao tradutor)
const VIZINHAS = new Set((
  'hei moi kiitos mutta että onko voiko huomenna tänään hyvää päivää kyllä minä sinä tämä mikä miten' + // finlandes
  ' danke bitte gerne und ich nicht ist das der die grüße schöne guten morgen tag' + // alemao
  ' paldies labdien lūdzu ačiū labas prašau' // leto/lituano
).split(/\s+/).filter(Boolean));
// russo: palavras de ucraniano/bulgaro com letras que o russo tambem tem
const VIZINHAS_CIR = new Set('дякую добре будь ласка що щось також благодаря утре ще също здравей много може'.split(' '));
const RUSSO = new Set('и в не на что я с он как это по но вы мы да нет здравствуйте привет спасибо можно нужно надо машина машину хорошо завтра сегодня пожалуйста добрый день утром вечером когда сколько стоит есть будет буду можете'.split(' '));

const CIRILICO = /[Ѐ-ӿ]/g;
const UCRANIANO = /[іїєґІЇЄҐ]/; // so no ucraniano (e bielorrusso): nunca e russo
const LETRA = new RegExp('\\p{L}', 'gu');
const PALAVRA = new RegExp('\\p{L}+', 'gu');

const semLetras = (t: string) => {
  const letras = (t.match(LETRA) || []).length;
  // numero, preco, placa, codigo de peca ("123 ABC", "BMW X5"); "URGENT" ou "SOS" sem numero vai ao tradutor
  return letras < 2 || (letras <= 6 && /\d/.test(t) && /^[A-Z0-9\s\-.,:;/#€$%()]+$/.test(t));
};

/** o texto esta (com seguranca) na lingua base `alvo` (pt, en, et, it, ru)?
 *  estrito: exige mais provas (para fixar a origem e usar o glossario). */
function ehLingua(t: string, alvo: string, estrito = false): boolean {
  const letras = (t.match(LETRA) || []).length;
  const cir = (t.match(CIRILICO) || []).length / letras;
  const palavras = t.toLowerCase().match(PALAVRA) || [];
  if (alvo === 'ru') {
    if (cir < 0.85 || UCRANIANO.test(t) || palavras.some((p) => VIZINHAS_CIR.has(p))) return false;
    const ru = palavras.filter((p) => RUSSO.has(p)).length;
    // curto precisa de uma palavra claramente russa; longo, de algumas
    return palavras.length <= 3 ? ru >= 1 : ru >= (estrito ? 2 : 1);
  }
  if (!(alvo in PALAVRAS) || cir > 0.15) return false;
  if (palavras.some((p) => VIZINHAS.has(p))) return false;
  // "y" quase nao existe em estoniano e e comum em finlandes; õ e so estoniano
  if (alvo === 'et' && /y/i.test(t) && !/õ/i.test(t)) return false;

  const pontos: Record<Base, number> = { et: 0, pt: 0, it: 0, en: 0 };
  for (const p of palavras) {
    for (const b of Object.keys(PALAVRAS) as Base[]) {
      if (PALAVRAS[b].has(p) && !(b === 'et' && COMUM_FI.has(p))) pontos[b]++;
    }
  }
  const acertos = pontos[alvo as Base]; // so palavras, sem o bonus das letras
  // letras que so aparecem numa das linguas (ã/ç portugues; õ estoniano; ä/ö/ü ajudam o estoniano)
  if (/[ãç]/i.test(t)) pontos.pt += 2;
  else if (/õ/i.test(t)) pontos.et += 2;
  else if (/[äöü]/i.test(t)) pontos.et += 1;

  const meu = pontos[alvo as Base];
  const outros = Math.max(...(Object.keys(pontos) as Base[]).filter((b) => b !== alvo).map((b) => pontos[b]));
  if (acertos < 1) return false; // so letras com acento nao provam a lingua
  if (palavras.length <= 3) return !estrito && outros === 0; // "Tere!", "Aitäh", "Ok, homme"
  if (estrito && acertos < 3) return false;
  return acertos >= 2 && meu >= 3 * outros && acertos / palavras.length >= 0.15;
}

/** true = o texto ja esta (com seguranca) na lingua `lingua` do site (pt, pt-PT, en, et, it, ru),
 *  ou nao tem letras para traduzir (numero, placa, preco). */
export function jaNaLingua(texto: string, lingua: string): boolean {
  const t = (texto || '').trim();
  return semLetras(t) || ehLingua(t, lingua.split('-')[0]);
}

/** lingua base do texto quando ha muita certeza (para fixar a origem e usar o glossario
 *  do DeepL - origem errada e pior que uma chamada sem glossario); senao null */
export function linguaDoTexto(texto: string): string | null {
  const t = (texto || '').trim();
  if (semLetras(t)) return null;
  return ['ru', 'et', 'pt', 'it', 'en'].find((l) => ehLingua(t, l, true)) || null;
}
