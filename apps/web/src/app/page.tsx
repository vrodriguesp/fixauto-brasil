import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { routing, HREFLANG, LOCALE_PREFIX, MERCADOS, NOME_IDIOMA_NATIVO, hreflangsDe, type Locale } from '@/i18n/routing';

// "https://bipfix.com/" = escolha de PAIS e idioma (x-default), sem
// redirecionamento automatico, no padrao Norwegian ("Greetings, traveller!":
// lista de paises com bandeira) e IKEA ("Welcome to IKEA Global"). Google:
// "x-default ... was designed for language selector pages"; "avoid
// automatically redirecting users ... to a different language version".
// Bandeira representa PAIS (aqui e o pais mesmo); o idioma vai escrito.
const SITE = 'https://bipfix.com';

const TEXTO_PAIS: Record<string, string> = {
  EE: 'Autoremont Tallinnas · Ремонт авто в Таллинне · Car repair in Tallinn',
  IT: 'Confronta i preventivi delle officine',
  PT: 'Compare orçamentos de oficinas',
  BR: 'Compare orçamentos de oficinas mecânicas',
};

export const metadata: Metadata = {
  title: { absolute: 'BipFix — Autoremont · Ремонт авто · Car repair quotes' },
  description: 'BipFix: võrdle autoremondi hinnapakkumisi Tallinnas · Сравните цены на ремонт авто в Таллинне · Compare car repair quotes in Tallinn.',
  alternates: {
    canonical: `${SITE}/`,
    languages: {
      'x-default': `${SITE}/`,
      ...Object.fromEntries(routing.locales.flatMap((l) => hreflangsDe(l).map((c) => [c, `${SITE}${LOCALE_PREFIX[l]}`]))),
    },
  },
  robots: { index: true, follow: true },
};

function Bandeira({ pais }: { pais: string }) {
  const comum = { width: 48, height: 32, viewBox: '0 0 48 32', 'aria-hidden': true, className: 'rounded-md shadow-sm ring-1 ring-black/10 shrink-0' } as const;
  if (pais === 'EE') return (
    <svg {...comum}><rect width="48" height="11" fill="#0072CE" /><rect y="10.67" width="48" height="10.67" fill="#000" /><rect y="21.33" width="48" height="10.67" fill="#fff" /></svg>
  );
  if (pais === 'IT') return (
    <svg {...comum}><rect width="16" height="32" fill="#009246" /><rect x="16" width="16" height="32" fill="#fff" /><rect x="32" width="16" height="32" fill="#CE2B37" /></svg>
  );
  if (pais === 'PT') return (
    <svg {...comum}><rect width="19.2" height="32" fill="#046A38" /><rect x="19.2" width="28.8" height="32" fill="#DA291C" /><circle cx="19.2" cy="16" r="7" fill="#FFE900" /><circle cx="19.2" cy="16" r="4.2" fill="#DA291C" stroke="#fff" strokeWidth="1" /></svg>
  );
  return (
    <svg {...comum}><rect width="48" height="32" fill="#009C3B" /><path d="M24 4 44 16 24 28 4 16Z" fill="#FFDF00" /><circle cx="24" cy="16" r="7" fill="#002776" /><path d="M17.3 14.3c4.5-.9 9.4-.3 13.3 2" stroke="#fff" strokeWidth="1.3" fill="none" /></svg>
  );
}

export default async function EscolherPais() {
  // versao ja escolhida pela pessoa (cookie do seletor) fica destacada - sem redirecionar
  const escolhido = (await cookies()).get('bipfix_idioma')?.value as Locale | undefined;
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <img src="/logo-80.webp" alt="BipFix" width={188} height={40} className="h-9 sm:h-10 w-auto" />
        </div>
      </header>

      <main className="flex-1 px-4 py-10 sm:py-14">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center">
            Tere! <span className="text-gray-400">·</span> Привет! <span className="text-gray-400">·</span> Ciao! <span className="text-gray-400">·</span> Olá!
          </h1>
          <p className="text-center text-gray-600 mt-3">Vali riik ja keel · Выберите страну и язык · Choose your country and language</p>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {MERCADOS.map((m) => {
              const umIdioma = m.locales.length === 1;
              const destaque = escolhido && (m.locales as string[]).includes(escolhido);
              return (
                <li key={m.pais} className={`bg-white rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md ${destaque ? 'border-primary-500 ring-2 ring-primary-500' : 'border-gray-200'} ${m.pais === 'EE' ? 'sm:col-span-2' : ''}`}>
                  {umIdioma ? (
                    <a href={LOCALE_PREFIX[m.locales[0]]} hrefLang={HREFLANG[m.locales[0]]} lang={HREFLANG[m.locales[0]]} className="flex items-center gap-4 group">
                      <Bandeira pais={m.pais} />
                      <span className="min-w-0">
                        <span className="block text-lg font-semibold text-gray-900 group-hover:text-primary-700">{m.nome} <span className="font-normal text-gray-500">({NOME_IDIOMA_NATIVO[m.locales[0]]})</span></span>
                        <span className="block text-sm text-gray-600 break-words">{TEXTO_PAIS[m.pais]}</span>
                      </span>
                    </a>
                  ) : (
                    <div>
                      <div className="flex items-center gap-4">
                        <Bandeira pais={m.pais} />
                        <span className="min-w-0">
                          <span className="block text-lg font-semibold text-gray-900">{m.nome} <span className="font-normal text-gray-500">· Estonia</span></span>
                          <span className="block text-sm text-gray-600 break-words">{TEXTO_PAIS[m.pais]}</span>
                        </span>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        {m.locales.map((l) => (
                          <a key={l} href={LOCALE_PREFIX[l]} hrefLang={HREFLANG[l]} lang={HREFLANG[l]}
                            className={`rounded-xl border px-4 py-3 text-center font-medium transition-colors ${l === escolhido ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-800 hover:border-primary-400 hover:bg-primary-50'}`}>
                            {NOME_IDIOMA_NATIVO[l]}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-10 grid gap-3 text-sm text-gray-600 sm:grid-cols-3">
            <p lang="et">BipFix aitab Tallinna autojuhtidel küsida mitmelt töökojalt hinnapakkumisi, neid võrrelda ja broneerida remondi ühes kohas. Autojuhile tasuta.</p>
            <p lang="ru">BipFix помогает водителям в Таллинне получить сметы от нескольких автосервисов, сравнить их и записаться на ремонт в одном месте. Для водителей бесплатно.</p>
            <p lang="en">BipFix helps drivers in Tallinn get quotes from several garages, compare them and book the repair in one place. Free for drivers.</p>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-5 text-center text-sm text-gray-500">support@bipfix.com</div>
      </footer>
    </div>
  );
}
