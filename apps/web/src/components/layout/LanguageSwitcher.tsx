'use client';

import { useLocale } from 'next-intl';
import { useState, useRef, useEffect } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { routing, HREFLANG, type Locale } from '@/i18n/routing';

const LOCALE_LABEL: Record<Locale, { flag: string; label: string }> = {
  pt: { flag: '🇧🇷', label: 'Português (Brasil)' },
  'pt-PT': { flag: '🇵🇹', label: 'Português (Portugal)' },
  en: { flag: '🇬🇧', label: 'English' },
  et: { flag: '🇪🇪', label: 'Eesti' },
  it: { flag: '🇮🇹', label: 'Italiano' },
};

// As opcoes sao LINKS de verdade (<a href hreflang>), sempre presentes no HTML
// (so escondidas visualmente quando o menu esta fechado): buscadores e IAs
// nao clicam em botoes, entao antes nao conseguiam descobrir as outras
// versoes de idioma navegando pelo site.
export default function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const current = LOCALE_LABEL[locale] || LOCALE_LABEL.pt;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={current.label}
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
      >
        <span aria-hidden="true">{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <ul
        className={`absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 ${open ? '' : 'hidden'}`}
      >
        {routing.locales.map((l) => (
          <li key={l}>
            <Link
              href={pathname}
              locale={l}
              hrefLang={HREFLANG[l]}
              lang={HREFLANG[l]}
              onClick={() => setOpen(false)}
              aria-current={l === locale ? 'true' : undefined}
              className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left ${
                l === locale ? 'text-primary-700 bg-primary-50 font-medium' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span aria-hidden="true">{LOCALE_LABEL[l].flag}</span>
              {LOCALE_LABEL[l].label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
