// Teste da detecao local de lingua (lib/lingua-provavel.ts), sem site nem banco:
//   node --experimental-strip-types scripts/testes/lingua-provavel.mjs
// "pula" = o texto ja esta na lingua de quem le e NAO vai ao tradutor.
// O importante: nunca pular quando a lingua e outra (a pessoa ficaria sem traducao).
import { jaNaLingua } from '../../src/lib/lingua-provavel.ts';

const casos = [
  // [texto, lingua de quem le, deve pular?]
  ['Tagumised pidurisadulad kriuksuvad, vaja vahetada klotsid ja kettad.', 'et', true],
  ['Tere! Kas homme kell 10 sobib?', 'et', true],
  ['Aitäh', 'et', true],
  ['Задние суппорта скрипят, нужно поменять колодки и диски.', 'ru', true],
  ['Здравствуйте, можно завтра в 10? BMW X5', 'ru', true],
  ['Preciso trocar as pastilhas de freio do meu carro, está fazendo barulho.', 'pt', true],
  ['Preciso trocar as pastilhas de freio do meu carro.', 'pt-PT', true],
  ['The rear brakes are squeaking, I need new pads for my car please.', 'en', true],
  ['Ciao, la macchina non parte, ho bisogno di una mano per domani.', 'it', true],
  ['120 €', 'ru', true],
  ['123 ABC', 'et', true],
  // lingua diferente: tem que traduzir
  ['Tagumised pidurisadulad kriuksuvad, vaja vahetada klotsid ja kettad.', 'ru', false],
  ['Tere! Kas homme kell 10 sobib?', 'ru', false],
  ['Задние суппорта скрипят, нужно поменять колодки и диски.', 'et', false],
  ['Здравствуйте', 'et', false],
  ['Добрий день, потрібно замінити колодки', 'ru', false], // ucraniano
  ['The rear brakes are squeaking, I need new pads for my car please.', 'et', false],
  ['Preciso trocar as pastilhas de freio do meu carro.', 'en', false],
  ['Ciao, la macchina non parte, ho bisogno di una mano per domani.', 'pt', false],
  ['Preciso trocar as pastilhas de freio do meu carro.', 'it', false],
  ['Ma no, grazie', 'et', false],
  ['I will see you tomorrow', 'et', false],
  ['Tagumised pidurid. Задние тормоза скрипят сильно, очень.', 'et', false], // misto
  ['Tagumised pidurid ja klotsid. Задние тормоза.', 'ru', false],
  ['Ok', 'et', false], // sem sinal: vai ao tradutor (cache depois)
  ['СРОЧНО', 'et', false],
  ['BMW X5 2015', 'ru', true],
];

let falhas = 0;
for (const [texto, lingua, esperado] of casos) {
  const r = jaNaLingua(texto, lingua);
  const certo = r === esperado;
  if (!certo) falhas++;
  console.log(`${certo ? 'ok  ' : 'FALHA'} ${lingua.padEnd(5)} ${esperado ? 'pula     ' : 'traduz   '} ${texto.slice(0, 60)}`);
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exit(falhas ? 1 : 0);
