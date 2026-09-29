// Gera src/lib/guias-indice.json: { <slug do arquivo>: { <idioma>: <slug no idioma> } }.
// O seletor de idioma usa para linkar direto a versao do guia em cada idioma
// (ou a lista de guias do idioma, se o guia nao existe nele) sem carregar o
// conteudo dos guias no navegador. Roda sozinho antes de cada build (prebuild).
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'content', 'guias');
const indice = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const g = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  indice[g.slug] = Object.fromEntries(Object.entries(g.versoes).map(([l, v]) => [l, v.slug || g.slug]));
}
fs.writeFileSync(path.join(process.cwd(), 'src', 'lib', 'guias-indice.json'), JSON.stringify(indice, null, 2) + '\n');
console.log(`indice de guias: ${Object.keys(indice).length} guias`);
