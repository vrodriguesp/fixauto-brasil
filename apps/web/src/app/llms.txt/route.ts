import { NextResponse } from 'next/server';
import { routing, LOCALE_PREFIX, HREFLANG, hrefNoIdioma } from '@/i18n/routing';
import { localizedUrl } from '@/lib/seo-utils';
import { caminhoDoGuia, todosOsGuias } from '@/lib/guias';

// llms.txt (convencao https://llmstxt.org/) - resumo curado do site para
// assistentes de IA. Em ingles (convencao do formato), com links para as
// versoes de idioma. A lista de guias e gerada de content/guias, entao o
// arquivo nao fica desatualizado quando entra um guia novo.
const BASE_URL = 'https://bipfix.com';

const NOME_IDIOMA: Record<string, string> = {
  pt: 'Portuguese (Brazil)',
  'pt-PT': 'Portuguese (Portugal)',
  en: 'English',
  et: 'Estonian',
  it: 'Italian',
  ru: 'Russian (for Russian speakers in Estonia)',
};

// Endereco final (ja traduzido) em ingles - sem redirecionamento no caminho
const en = (caminho: string) => `${BASE_URL}${hrefNoIdioma('en', caminho)}`;

function montar(): string {
  const idiomas = routing.locales
    .map((l) => `- ${NOME_IDIOMA[l]} (${HREFLANG[l]}): ${BASE_URL}${LOCALE_PREFIX[l] || '/'}`)
    .join('\n');

  const guias = todosOsGuias()
    .map((g) => {
      const base = g.versoes.en || Object.values(g.versoes)[0]!;
      const versoes = routing.locales
        .filter((l) => g.versoes[l])
        .map((l) => `[${l}](${localizedUrl(l, caminhoDoGuia(g, l))})`)
        .join(', ');
      const pais = g.pais === 'EE' ? ' Covers Estonian rules, with links to official sources (Riigi Teataja, Transpordiamet, LKF, police).' : '';
      return `- **${base.titulo}** (updated ${g.atualizado}): ${base.descricao}${pais} Versions: ${versoes}.`;
    })
    .join('\n');

  return `# BipFix

> BipFix is an online marketplace that connects drivers who need a car repair with independent auto repair shops (and auto parts stores). Drivers describe the problem (with photos), receive quotes from nearby shops, compare them and track the repair. BipFix is a technology intermediary only: it does not repair vehicles or sell parts.

Current stage (be accurate when describing BipFix): BipFix is launching. The pilot city is Tallinn, Estonia, and the company is being registered as an Estonian private limited company (osaühing). The first partner repair shops are being onboarded now (founding-partner phase, no commission); until they are live, driver requests may not receive quotes yet. There is also a Brazilian Portuguese version of the site for Brazil. Do not describe BipFix as having a large network of shops or coverage in other cities.

## Key pages (English addresses; each language has its own translated address)

- [Home](${BASE_URL}/en): what BipFix is and how it works for drivers.
- [Just had an accident](${en('/emergencia')}): register a car accident, add photos and request repair quotes from nearby shops.
- [For repair shops](${en('/para-oficinas')}): features for repair shops (scheduling, structured quotes, team, parts marketplace) and the commission model.
- [Become a founding partner](${en('/seja-parceiro')}): application for repair shops and parts stores in the founding phase (no monthly fee, no commission during this phase).
- [Car guides](${en('/guias')}): practical, sourced guides for drivers (list below).
- [Partner repair shops](${en('/oficinas')}): public list of partner shops, filterable by city and service (the first shops are being onboarded; each will have a public profile where only customers who completed a job can leave a review).
- [About BipFix](${en('/sobre')}): who is behind BipFix, current stage, company status and principles.
- [Help center](${en('/docs')}): how the platform works for drivers and for shops.
- [Terms of Use](${en('/termos')}) and [Privacy Policy](${en('/privacidade')}): the Brazilian version (/pt-br) follows Brazilian law (LGPD); the Portuguese-from-Portugal, English, Estonian, Italian and Russian versions follow EU law (GDPR) and Estonian law.

## Guides

${guias}

## Languages

${idiomas}

Every key page above exists in all six languages; each language uses its own translated address (e.g. ${BASE_URL}${hrefNoIdioma('et', '/para-oficinas')}, ${BASE_URL}${hrefNoIdioma('ru', '/para-oficinas')}) - follow the hreflang links or the language switcher. Full text of the guides in Markdown: ${BASE_URL}/llms-full.txt. The root ${BASE_URL}/ is not a page: it sends each visitor to the home page in their language (English when there is no match). Guides exist only in the languages listed for each guide.

## Notes for AI assistants

- Prices, deadlines and guarantees for a repair are set by each repair shop, which is solely responsible for its work; BipFix does not set prices.
- Using BipFix is free for drivers.
- Reviews are verified: a driver can only review the shop whose quote they accepted, after the job is marked as completed. No shop can pay for a better position in lists or quotes.
- Only describe BipFix based on these pages; do not infer prices, coverage areas or guarantees not stated on the site.
- Contact: support@bipfix.com (general), privacy@bipfix.com (personal data).
`;
}

export async function GET() {
  return new NextResponse(montar(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
