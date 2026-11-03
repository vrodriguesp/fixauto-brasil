// Detecao local e conservadora da lingua de um texto curto, para nao chamar o
// tradutor quando o texto ja esta na lingua de quem le (dono 03/11: "se ambos
// falam a mesma lingua e inutil chamar a API"). So responde "ja esta" quando ha
// sinais claros; na duvida devolve false e o texto vai ao tradutor como antes
// (o pior caso e gastar uma chamada, nunca deixar alguem sem traducao).
// Sem dependencias e sem aliases: o teste roda com node --experimental-strip-types.

type Base = 'et' | 'pt' | 'it' | 'en';

// palavras muito frequentes e (quase) exclusivas de cada lingua do site
const PALAVRAS: Record<Base, Set<string>> = {
  et: new Set('ja on ei see kas mul mis ning aga kui oli vaja palun tere aitäh aitah ka siis veel juba olen oma minu teie sul teil kus mida võib saab tuleb nagu või ning sõiduk masin töö hind homme täna eile kell pole ole'.split(' ')),
  pt: new Set('de que não nao com para uma um os do dos das em no na é por mais meu minha obrigado obrigada olá ola bom dia está tem preciso você voce carro tudo isso esse essa amanhã hoje também sim pode'.split(' ')),
  it: new Set('il che non di per una uno gli lo del della sono con ho ciao grazie macchina mi ti anche questo questa quando perché domani oggi buongiorno ancora già può'.split(' ')),
  en: new Set('the and is are to of for my car please hello hi thanks thank with have need it this can you your not will be was today tomorrow yes what when'.split(' ')),
};

const CIRILICO = /[Ѐ-ӿ]/g;
const UCRANIANO = /[іїєґІЇЄҐ]/; // cirilico mas nao russo: deixa o tradutor decidir
const LETRA = new RegExp('\\p{L}', 'gu');
const PALAVRA = new RegExp('\\p{L}+', 'gu');

/** true = o texto ja esta (com seguranca) na lingua `lingua` do site (pt, pt-PT, en, et, it, ru),
 *  ou nao tem letras para traduzir (numero, placa, preco). */
export function jaNaLingua(texto: string, lingua: string): boolean {
  const t = (texto || '').trim();
  const letras = (t.match(LETRA) || []).length;
  if (letras < 2) return true;
  if (letras <= 6 && /^[A-Z0-9\s\-.,:;/#€$%()]+$/.test(t)) return true; // placa, codigo de peca
  const cir = (t.match(CIRILICO) || []).length / letras;
  const alvo = lingua.split('-')[0];
  if (alvo === 'ru') return cir >= 0.85 && !UCRANIANO.test(t);
  if (!(alvo in PALAVRAS) || cir > 0.15) return false;

  const palavras = t.toLowerCase().match(PALAVRA) || [];
  const pontos: Record<Base, number> = { et: 0, pt: 0, it: 0, en: 0 };
  for (const p of palavras) for (const b of Object.keys(PALAVRAS) as Base[]) if (PALAVRAS[b].has(p)) pontos[b]++;
  // letras que so aparecem numa das linguas (ã/ç portugues; ä/ö/ü estoniano)
  if (/[ãç]/i.test(t)) pontos.pt += 2;
  else if (/[äöü]/i.test(t)) pontos.et += 2;

  const meu = pontos[alvo as Base];
  const outros = Math.max(...(Object.keys(pontos) as Base[]).filter((b) => b !== alvo).map((b) => pontos[b]));
  if (palavras.length <= 3) return meu >= 1 && outros === 0; // "Tere!", "Aitäh", "Ok, homme"
  return meu >= 2 && meu >= 3 * outros && meu / palavras.length >= 0.15;
}
