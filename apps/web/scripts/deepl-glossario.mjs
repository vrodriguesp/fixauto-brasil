// Glossario de oficina do DeepL (dono 03/11): termos que o DeepL errava no teste
// cego ET<->RU (Documentos/Comparacao_tradutores_2026-11-03): "stange" = para-choque,
// "проточить диски" = retificar (nao trocar), techosmotr, alinhamento etc.
// O site usa o glossario quando sabe a lingua de origem (lib/lingua-provavel.ts).
//   node scripts/deepl-glossario.mjs <arquivo com a chave>            -> cria e mostra o id
//   node scripts/deepl-glossario.mjs <arquivo com a chave> <id>       -> substitui as entradas
// O id vai em DEEPL_GLOSSARIO_ID (.env.production.local na VM).
import fs from 'node:fs';

const ET_RU = [
  ['stange', 'бампер'], ['esistange', 'передний бампер'], ['tagastange', 'задний бампер'],
  ['mõlk', 'вмятина'], ['mõlki', 'вмятину'],
  ['ülevaatus', 'техосмотр'], ['tehnoülevaatus', 'техосмотр'],
  ['hammasrihm', 'ремень ГРМ'], ['sillareguleerimine', 'развал-схождение'],
  ['kulumaterjalid', 'расходные материалы'], ['pidurikettade treimine', 'проточка тормозных дисков'],
];
const RU_ET = [
  ['проточить диски', 'pidurikettaid treida'], ['проточка дисков', 'pidurikettade treimine'], ['проточить', 'treida'],
  ['развал-схождение', 'sillareguleerimine'], ['расходники', 'kulumaterjalid'], ['расходные материалы', 'kulumaterjalid'],
  ['ремень ГРМ', 'hammasrihm'], ['техосмотр', 'tehnoülevaatus'], ['автосервис', 'autoremonditöökoda'],
  ['вмятина', 'mõlk'],
];

const [arqChave, id] = process.argv.slice(2);
if (!arqChave) { console.log('uso: node scripts/deepl-glossario.mjs <arquivo com a chave> [id]'); process.exit(1); }
const chave = fs.readFileSync(arqChave, 'utf8').trim();
const API = chave.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
const H = { Authorization: `DeepL-Auth-Key ${chave}`, 'Content-Type': 'application/json' };
// o glossario do DeepL diferencia maiusculas: entra tambem a forma do comeco da frase
const maiuscula = (x) => x.charAt(0).toUpperCase() + x.slice(1);
const tsv = (l) => l.flatMap(([a, b]) => [[a, b], ...(maiuscula(a) !== a ? [[maiuscula(a), maiuscula(b)]] : [])]).map(([a, b]) => `${a}\t${b}`).join('\n');
const dicionarios = [
  { source_lang: 'et', target_lang: 'ru', entries: tsv(ET_RU), entries_format: 'tsv' },
  { source_lang: 'ru', target_lang: 'et', entries: tsv(RU_ET), entries_format: 'tsv' },
];

if (!id) {
  const r = await fetch(`${API}/v3/glossaries`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'BipFix oficina', dictionaries: dicionarios }) });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d));
  console.log('glossario criado:', d.glossary_id);
} else {
  for (const dic of dicionarios) {
    const r = await fetch(`${API}/v3/glossaries/${id}/dictionaries`, { method: 'PUT', headers: H, body: JSON.stringify(dic) });
    if (!r.ok) throw new Error(`${dic.source_lang}->${dic.target_lang}: ${r.status} ${await r.text()}`);
  }
  console.log('glossario atualizado:', id);
}
