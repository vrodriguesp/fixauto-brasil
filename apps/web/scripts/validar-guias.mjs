// Valida content/guias/*.json antes do deploy:
// - estrutura (campos obrigatorios, datas, idiomas validos)
// - SEO: <title> ate 60 caracteres, meta description entre 70 e 160
// - HTML permitido so <strong> e <a href="https://...">
// - fontes: URL https que responde (status < 400)
// Uso (dentro de apps/web): node scripts/validar-guias.mjs [--sem-rede]
import fs from 'node:fs';
import path from 'node:path';

const LOCALES = ['pt', 'pt-PT', 'en', 'et', 'it', 'ru'];
const DIR = path.join(process.cwd(), 'content', 'guias');
const semRede = process.argv.includes('--sem-rede');
let erros = 0;
const erro = (onde, msg) => { erros++; console.log(`ERRO ${onde}: ${msg}`); };

const htmlOk = (s, onde) => {
  const tags = [...s.matchAll(/<\/?([a-zA-Z0-9]+)([^>]*)>/g)];
  for (const [t, nome, attrs] of tags) {
    if (!['strong', 'a'].includes(nome.toLowerCase())) erro(onde, `tag nao permitida ${t}`);
    if (nome === 'a' && !t.startsWith('</') && !/^\s+href="(https:\/\/[^"]+|\/[^"]*)"\s*$/.test(attrs)) erro(onde, `link invalido ${t}`);
  }
};

const urls = new Map();
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const onde = f;
  let g;
  try { g = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { erro(onde, 'JSON invalido ' + e.message); continue; }
  if (g.slug + '.json' !== f) erro(onde, 'slug diferente do nome do arquivo');
  if (!/^[a-z0-9-]+$/.test(g.slug || '')) erro(onde, 'slug invalido');
  for (const d of ['publicado', 'atualizado']) if (!/^\d{4}-\d{2}-\d{2}$/.test(g[d] || '')) erro(onde, `data ${d} invalida`);
  const idiomas = Object.keys(g.versoes || {});
  if (!idiomas.length) erro(onde, 'sem versoes');
  for (const l of idiomas) {
    const v = g.versoes[l];
    const o = `${f} [${l}]`;
    if (!LOCALES.includes(l)) erro(o, 'idioma invalido');
    for (const c of ['titulo', 'descricao', 'resumo']) if (typeof v[c] !== 'string' || !v[c].trim()) erro(o, `falta ${c}`);
    const titulo = v.tituloSeo || v.titulo || '';
    if (titulo.length > 60) erro(o, `title com ${titulo.length} caracteres (max 60): ${titulo}`);
    if ((v.descricao || '').length < 70 || (v.descricao || '').length > 160) erro(o, `descricao com ${(v.descricao || '').length} caracteres (70-160)`);
    if (!Array.isArray(v.secoes) || v.secoes.length < 3) erro(o, 'menos de 3 secoes');
    const textos = [v.resumo, ...(v.secoes || []).flatMap((s) => [...(s.paragrafos || []), ...(s.itens || [])]), ...(v.faq || []).map((q) => q.resposta)];
    textos.forEach((t, i) => typeof t === 'string' && htmlOk(t, `${o} texto ${i}`));
    const palavras = textos.join(' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    if (palavras < 500) erro(o, `so ${palavras} palavras (minimo 500)`);
    if (!Array.isArray(v.fontes) || v.fontes.length < 1) erro(o, 'sem fontes');
    for (const fo of v.fontes || []) {
      if (!/^https:\/\//.test(fo.url || '')) erro(o, `fonte sem https: ${fo.url}`);
      else urls.set(fo.url, o);
    }
    console.log(`ok ${o}: ${palavras} palavras, title ${titulo.length}, descricao ${(v.descricao || '').length}`);
  }
}

if (!semRede) {
  for (const [u, o] of urls) {
    try {
      const r = await fetch(u, { method: 'GET', redirect: 'follow', headers: {
        // Sites do governo estoniano (riigiteataja, transpordiamet, politsei) devolvem
        // 403 para clientes sem cabecalhos de navegador - nao e link quebrado.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'et,en;q=0.8',
      } });
      let status = r.status;
      // Alguns sites bloqueiam a conexao do Node pela "impressao digital" TLS,
      // mesmo com cabecalhos de navegador; o curl passa. Reconfirma com ele.
      if (status === 403) {
        const { execFileSync } = await import('node:child_process');
        status = Number(execFileSync('curl', ['-s', '-o', process.platform === 'win32' ? 'NUL' : '/dev/null', '-L', '--max-time', '30', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36', '-H', 'Accept: text/html', '-w', '%{http_code}', u]).toString());
      }
      if (status >= 400) erro(o, `fonte responde ${status}: ${u}`);
    } catch (e) {
      erro(o, `fonte inacessivel: ${u} (${e.message})`);
    }
  }
  console.log(`${urls.size} fontes verificadas`);
}
console.log(erros ? `${erros} erros` : 'tudo certo');
process.exit(erros ? 1 : 0);
