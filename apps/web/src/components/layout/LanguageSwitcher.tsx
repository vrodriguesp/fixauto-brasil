'use client';

import { useLocale } from 'next-intl';
import { useState, useRef, useEffect } from 'react';
import { usePathname } from '@/i18n/navigation';
import { HREFLANG, MERCADOS, NOME_IDIOMA_NATIVO, caminhoNoIdioma, rotuloVersao, type Locale } from '@/i18n/routing';
import { lembrarIdioma } from '@/lib/idioma-escolhido';
import { useParams } from 'next/navigation';

// Codigo em texto, nao bandeira-emoji (o Windows nao desenha bandeiras -
// mostrava so as letras). Versao = pais + idioma: o menu agrupa por pais
// (Eesti: Eesti keel / Русский / English; Italia; Portugal; Brasil).
const CODIGO: Record<Locale, string> = { et: 'ET', ru: 'RU', en: 'EN', it: 'IT', 'pt-PT': 'PT', pt: 'BR' };

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
// compacto: logado, o menu do painel precisa do espaco - fica so o codigo (EN, IT...)
export default function LanguageSwitcher({ compacto = false }: { compacto?: boolean }) {
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

  const atual = rotuloVersao(locale);

  return (
    <div className="relative" ref={ref}>
      <button
        ref={botaoRef}
        type="button"
        onClick={alternar}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={atual}
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
      >
        <Codigo c={CODIGO[locale]} />
        {/* rotulo inteiro so em tela larga; no meio fica so o codigo (nao empurra o menu) */}
        <span className={compacto ? 'hidden' : 'hidden sm:inline lg:hidden xl:inline whitespace-nowrap'}>{atual}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <ul
        style={open && posMobile ? { top: posMobile.top, maxHeight: `calc(100dvh - ${posMobile.top + 16}px)` } : undefined}
        className={`${posMobile ? 'fixed left-4 right-4 overflow-y-auto' : 'absolute right-0 top-full mt-1 w-56'} bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 ${open ? '' : 'hidden'}`}
      >
        {MERCADOS.map((m) => (
          <li key={m.pais}>
            <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{m.nome}</p>
            <ul>
            {m.locales.map((l) => (
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
              <Codigo c={CODIGO[l]} />
              {NOME_IDIOMA_NATIVO[l]}
            </a>
          </li>
            ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
