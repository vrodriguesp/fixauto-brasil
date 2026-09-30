import { NextResponse } from 'next/server';
import { routing, hrefNoIdioma } from '@/i18n/routing';
import { todosOsGuias, caminhoDoGuia } from '@/lib/guias';

// llms-full.txt (convencao https://llmstxt.org/): o conteudo completo dos
// guias em Markdown, para assistentes de IA lerem sem precisar do HTML.
// Gerado de content/guias - nao fica desatualizado.
const BASE_URL = 'https://bipfix.com';

const NOME_IDIOMA: Record<string, string> = {
  pt: 'Portuguese (Brazil)',
  'pt-PT': 'Portuguese (Portugal)',
  en: 'English',
  et: 'Estonian',
  it: 'Italian',
  ru: 'Russian',
};

// HTML simples dos guias (so <strong> e <a>) -> Markdown, com links internos absolutos
function markdown(html: string, locale: string): string {
  return html
    .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g, (_, href: string, texto: string) => {
      const url = href.startsWith('/') ? `${BASE_URL}${hrefNoIdioma(locale, href)}` : href;
      return `[${texto}](${url})`;
    })
    .replace(/<[^>]+>/g, '');
}

function montar(): string {
  const partes: string[] = [
    '# BipFix - car guides (full text)',
    '',
    '> Practical, sourced guides for drivers, published by BipFix (a car-repair quote marketplace piloting in Tallinn, Estonia). Summary of the site: ' +
      `${BASE_URL}/llms.txt`,
    '',
  ];
  for (const guia of todosOsGuias()) {
    for (const l of routing.locales) {
      const v = guia.versoes[l];
      if (!v) continue;
      partes.push(`## ${v.titulo}`, '');
      partes.push(`- Language: ${NOME_IDIOMA[l]}`);
      partes.push(`- URL: ${BASE_URL}${hrefNoIdioma(l, caminhoDoGuia(guia, l))}`);
      partes.push(`- Updated: ${guia.atualizado}`, '');
      partes.push(markdown(v.resumo, l), '');
      for (const secao of v.secoes) {
        partes.push(`### ${secao.titulo}`, '');
        for (const p of secao.paragrafos || []) partes.push(markdown(p, l), '');
        for (const item of secao.itens || []) partes.push(`- ${markdown(item, l)}`);
        if (secao.itens?.length) partes.push('');
      }
      if (v.faq?.length) {
        partes.push('### FAQ', '');
        for (const q of v.faq) partes.push(`**${markdown(q.pergunta, l)}**`, '', markdown(q.resposta, l), '');
      }
      if (v.fontes?.length) {
        partes.push('### Sources', '');
        for (const f of v.fontes) partes.push(`- [${f.nome}](${f.url})`);
        partes.push('');
      }
    }
  }
  return partes.join('\n');
}

export async function GET() {
  return new NextResponse(montar(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
