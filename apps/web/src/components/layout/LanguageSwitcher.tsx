'use client';

import { useLocale } from 'next-intl';
import { useState, useRef, useEffect } from 'react';
import { usePathname } from '@/i18n/navigation';
import { routing, HREFLANG, caminhoNoIdioma, type Locale } from '@/i18n/routing';
import { lembrarIdioma } from '@/lib/idioma-escolhido';
import { useParams } from 'next/navigation';

// Codigo do IDIOMA em texto, nao bandeira: bandeira representa pais (W3C
// i18n desaconselha para idioma) e o Windows nao desenha bandeiras-emoji -
// mostrava so as letras do pais ("EE", "GB") e nada para o russo.
const LOCALE_LABEL: Record<Locale, { codigo: string; label: string }> = {
  pt: { codigo: 'PT-BR', label: 'Português (Brasil)' },
  'pt-PT': { codigo: 'PT-PT', label: 'Português (Portugal)' },
  en: { codigo: 'EN', label: 'English' },
  et: { codigo: 'ET', label: 'Eesti' },
  it: { codigo: 'IT', label: 'Italiano' },
  ru: { codigo: 'RU', label: 'Русский' },
};

function Codigo({ c }: { c: string }) {
  return (
    <span aria-hidden="true" className="inline-flex min-w-[2.75rem] justify-center rounded border border-gray-300 px-1 py-px text-[11px] font-semibold tracking-wide text-gray-700">
      {c}
    </span>
  );
}

// As opcoes sao LINKS de verdade (<a href hreflang>), sempre presentes no HTML
// (so escondidas visualmente quando o menu esta fechado): buscadores e IAs
// nao clicam em botoes, entao antes nao conseguiam descobrir as outras
// versoes de idioma navegando pelo site.
export default function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const params = useParams() as Record<string, string>;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  // Celular: o menu vira uma folha com a largura da tela logo abaixo do botao
  // (preso a borda direita do botao ele saia pela esquerda da tela).
  const [posMobile, setPosMobile] = useState<{ top: number } | null>(null);

  const alternar = () => {
    const b = botaoRef.current?.getBoundingClientRect();
    setPosMobile(b && window.innerWidth < 640 ? { top: Math.round(b.bottom + 6) } : null);
    setOpen((v) => !v);
  };

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
        ref={botaoRef}
        type="button"
        onClick={alternar}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={current.label}
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
      >
        <Codigo c={current.codigo} />
        <span className="hidden sm:inline">{current.label}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <ul
        style={open && posMobile ? { top: posMobile.top, maxHeight: `calc(100dvh - ${posMobile.top + 16}px)` } : undefined}
        className={`${posMobile ? 'fixed left-4 right-4 overflow-y-auto' : 'absolute right-0 top-full mt-1 w-56'} bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 ${open ? '' : 'hidden'}`}
      >
        {routing.locales.map((l) => (
          <li key={l}>
            <a
              href={caminhoNoIdioma(l, pathname, params)}
              hrefLang={HREFLANG[l]}
              lang={HREFLANG[l]}
              onClick={() => { lembrarIdioma(l); setOpen(false); }}
              aria-current={l === locale ? 'true' : undefined}
              className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left ${
                l === locale ? 'text-primary-700 bg-primary-50 font-medium' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Codigo c={LOCALE_LABEL[l].codigo} />
              {LOCALE_LABEL[l].label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
