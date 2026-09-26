'use client';

import { useLocale } from 'next-intl';
import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

const LOCALE_LABEL: Record<string, { flag: string; label: string }> = {
  pt: { flag: '🇧🇷', label: 'Português' },
  en: { flag: '🇬🇧', label: 'English' },
  et: { flag: '🇪🇪', label: 'Eesti' },
  it: { flag: '🇮🇹', label: 'Italiano' },
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
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

  const handleSelect = (nextLocale: string) => {
    setOpen(false);
    router.replace(pathname, { locale: nextLocale });
  };

  const current = LOCALE_LABEL[locale] || LOCALE_LABEL.pt;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Selecionar idioma"
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
      >
        <span aria-hidden="true">{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
          {routing.locales.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => handleSelect(l)}
              className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left ${
                l === locale ? 'text-primary-700 bg-primary-50 font-medium' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span aria-hidden="true">{LOCALE_LABEL[l].flag}</span>
              {LOCALE_LABEL[l].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
