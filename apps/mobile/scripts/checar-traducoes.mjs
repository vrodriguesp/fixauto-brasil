// Confere que toda chave de traducao usada no codigo do app existe nos 6
// idiomas (t('a.b'), t(`a.b`), i18n.t('a.b')). Chaves montadas em tempo de
// execucao (t(`x.${y}`)) sao conferidas pelo prefixo.
//   node scripts/checar-traducoes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IDIOMAS = ['pt', 'pt-PT', 'en', 'et', 'it', 'ru'];
const locales = Object.fromEntries(IDIOMAS.map((l) => [l, JSON.parse(fs.readFileSync(path.join(RAIZ, 'i18n/locales', `${l}.json`), 'utf8'))]));
const tem = (obj, chave) => chave.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj) !== undefined;
const temPrefixo = (obj, pre) => {
  const partes = pre.replace(/\.$/, '').split('.');
  const ult = pre.endsWith('.') ? null : partes.pop();
  const o = partes.reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), obj);
  if (!o || typeof o !== 'object') return false;
  return ult == null ? true : Object.keys(o).some((k) => k.startsWith(ult));
};

const arquivos = [];
const andar = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory() && !['node_modules', '.expo', 'dist', 'scripts'].includes(e.name)) andar(p);
  else if (/\.(tsx?|jsx?)$/.test(e.name)) arquivos.push(p);
});
['app', 'lib', 'components'].forEach((d) => fs.existsSync(path.join(RAIZ, d)) && andar(path.join(RAIZ, d)));

const problemas = [];
for (const f of arquivos) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /\bt\(\s*(['"`])([^'"`]+?)\1/g;
  let m;
  while ((m = re.exec(src))) {
    const chave = m[2];
    if (!/^[a-zA-Z]/.test(chave) || chave.includes(' ')) continue;
    const dinamica = m[1] === '`' && chave.includes('${');
    for (const l of IDIOMAS) {
      const ok = dinamica ? temPrefixo(locales[l], chave.split('${')[0]) : tem(locales[l], chave);
      if (!ok) problemas.push(`${path.relative(RAIZ, f)}: "${chave}" falta em ${l}`);
    }
  }
}
const unicos = [...new Set(problemas)];
console.log(unicos.length ? unicos.join('\n') + `\n${unicos.length} problema(s)` : 'todas as chaves existem nos 6 idiomas');
process.exit(unicos.length ? 1 : 0);
