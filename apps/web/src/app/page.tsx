import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { routing, HREFLANG, LOCALE_PREFIX, type Locale } from '@/i18n/routing';

// "https://bipfix.com/" = pagina de escolha de idioma (x-default), sem
// redirecionamento automatico. E o que o Google recomenda ("x-default ... was
// designed for language selector pages and so it will work best with those";
// "avoid automatically redirecting users ... to a different language
// version") e o que fazem IKEA (ikea.com "Welcome to IKEA Global") e Wise:
// raiz 200 + x-default = raiz. O Yandex aceita x-default para essa pagina;
// o Bing usa o lang/Content-Language de cada pagina (ver middleware).
const SITE = 'https://bipfix.com';

const OPCOES: { locale: Locale; idioma: string; texto: string }[] = [
  { locale: 'et', idioma: 'Eesti', texto: 'Autoremont Tallinnas: võrdle töökodade hinnapakkumisi' },
  { locale: 'ru', idioma: 'Русский', texto: 'Ремонт авто в Таллинне: сравните сметы автосервисов' },
  { locale: 'en', idioma: 'English', texto: 'Car repair in Tallinn: compare quotes from garages' },
  { locale: 'pt', idioma: 'Português (Brasil)', texto: 'Compare orçamentos de oficinas mecânicas' },
  { locale: 'pt-PT', idioma: 'Português (Portugal)', texto: 'Compare orçamentos de oficinas' },
  { locale: 'it', idioma: 'Italiano', texto: 'Confronta i preventivi delle officine' },
];

export const metadata: Metadata = {
  title: { absolute: 'BipFix — Autoremont · Ремонт авто · Car repair quotes' },
  description: 'BipFix: võrdle autoremondi hinnapakkumisi Tallinnas · Сравните цены на ремонт авто в Таллинне · Compare car repair quotes in Tallinn.',
  alternates: {
    canonical: `${SITE}/`,
    languages: {
      'x-default': `${SITE}/`,
      ...Object.fromEntries(routing.locales.map((l) => [HREFLANG[l], `${SITE}${LOCALE_PREFIX[l]}`])),
    },
  },
  robots: { index: true, follow: true },
};

export default async function EscolherIdioma() {
  // idioma ja escolhido pela pessoa (cookie do seletor) vem primeiro - sem redirecionar
  const escolhido = (await cookies()).get('bipfix_idioma')?.value;
  const lista = [...OPCOES].sort((a, b) => Number(b.locale === escolhido) - Number(a.locale === escolhido));
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 text-center">
          Bip<span className="text-primary-600">Fix</span>
        </h1>
        <p className="text-center text-gray-600 mt-2 mb-8">Vali keel · Выберите язык · Choose your language</p>
        <ul className="space-y-3">
          {lista.map((o) => (
            <li key={o.locale}>
              <a href={LOCALE_PREFIX[o.locale]} hrefLang={HREFLANG[o.locale]} lang={HREFLANG[o.locale]}
                className={`card !p-4 flex flex-col hover:shadow-md transition-shadow ${o.locale === escolhido ? 'ring-2 ring-primary-500' : ''}`}>
                <span className="font-semibold text-gray-900">{o.idioma}</span>
                <span className="text-sm text-gray-600 break-words">{o.texto}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
