// Traducoes do site: (1) todo idioma tem as mesmas chaves que o pt (todos os
// arquivos messages/{idioma}*.json juntos, como o i18n/request.ts carrega);
// (2) toda chave usada no codigo (useTranslations/getTranslations + t('x'))
// existe nos 6 idiomas. Chaves dinamicas (t(`x.${y}`)) conferidas pelo prefixo.
//   node scripts/checar-traducoes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IDIOMAS = ['pt', 'pt-PT', 'en', 'et', 'it', 'ru'];
const AREAS = ['', '.cliente', '.oficina', '.loja', '.auth', '.misc'];
const msgs = Object.fromEntries(IDIOMAS.map((l) => [l, Object.assign({}, ...AREAS.map((a) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'messages', `${l}${a}.json`), 'utf8'))))]));
const chaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? chaves(v, p + k + '.') : [p + k]));
const pega = (o, c) => c.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o);

// Termos e privacidade: a versao do Brasil (pt, LGPD/CDC) e a europeia
// (demais, GDPR) tem estrutura propria de proposito - comparadas a parte.
const LEGAL = ['termos', 'privacidade'];
const problemas = [];
const base = new Set(chaves(msgs.pt).filter((k) => !LEGAL.includes(k.split('.')[0])));
for (const l of IDIOMAS.slice(1)) {
  const s = new Set(chaves(msgs[l]).filter((k) => !LEGAL.includes(k.split('.')[0])));
  for (const k of chaves(msgs.en).filter((k) => LEGAL.includes(k.split('.')[0]))) if (!new Set(chaves(msgs[l])).has(k)) problemas.push(`[${l}] falta "${k}" (versao europeia)`);
  for (const k of base) if (!s.has(k)) problemas.push(`[${l}] falta "${k}"`);
  for (const k of s) if (!base.has(k)) problemas.push(`[${l}] sobra "${k}" (nao existe em pt)`);
}

// uso no codigo
const arquivos = [];
const andar = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) andar(p);
  else if (/\.(tsx?)$/.test(e.name)) arquivos.push(p);
});
andar(path.join(RAIZ, 'src'));
for (const f of arquivos) {
  const src = fs.readFileSync(f, 'utf8');
  // const t = useTranslations('ns') / getTranslations({ ..., namespace: 'ns' }) / getTranslations('ns')
  const ns = {};
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:'([\w.]+)'|\{[^}]*namespace:\s*'([\w.]+)'[^}]*\})\s*\)/g)) ns[m[1]] = m[2] || m[3];
  for (const [fn, nome] of Object.entries(ns)) {
    if (LEGAL.includes(nome)) continue; // paginas legais: pt usa chaves proprias, UE usa 'secoes'
    const re = new RegExp(`\\b${fn}(?:\\.rich|\\.raw|\\.has)?\\(\\s*(['"\`])([^'"\`]+?)\\1`, 'g');
    for (const m of src.matchAll(re)) {
      if (/\.has\(/.test(m[0])) continue;
      const k = m[2];
      if (k.includes(' ')) continue;
      for (const l of IDIOMAS) {
        const alvo = pega(msgs[l], nome);
        if (m[1] === '`' && k.includes('${')) {
          const pre = k.split('${')[0];
          const partes = pre.split('.').filter(Boolean);
          const dono = pre.endsWith('.') ? pega(alvo, partes.join('.')) : alvo;
          if (!dono || typeof dono !== 'object') problemas.push(`${path.relative(RAIZ, f)}: "${nome}.${pre}*" falta em ${l}`);
        } else if (pega(alvo, k) === undefined) {
          problemas.push(`${path.relative(RAIZ, f)}: "${nome}.${k}" falta em ${l}`);
        }
      }
    }
  }
}
const u = [...new Set(problemas)];
console.log(u.length ? u.join('\n') + `\n${u.length} problema(s)` : 'traducoes completas nos 6 idiomas');
process.exit(u.length ? 1 : 0);
