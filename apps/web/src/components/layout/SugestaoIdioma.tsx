'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { HREFLANG, caminhoNoIdioma, type Locale } from '@/i18n/routing';
import { lembrarIdioma } from '@/lib/idioma-escolhido';
import { useParams } from 'next/navigation';

// Sugere (sem redirecionar) a versao do site no idioma do navegador. O
// Google recomenda nao redirecionar automaticamente por idioma: o
// redirecionamento escondia versoes inteiras de robos e de quem compartilha
// um link. Aqui a pessoa decide; se fechar, a sugestao nao volta.

const CHAVE_FECHADA = 'bipfix_sugestao_idioma_fechada';

// Texto escrito no idioma SUGERIDO (quem le e quem fala aquele idioma).
const TEXTO: Record<Locale, { msg: string; ir: string; fechar: string }> = {
  pt: { msg: 'Esta página também está disponível em português do Brasil.', ir: 'Ver em português', fechar: 'Fechar' },
  'pt-PT': { msg: 'Esta página também está disponível em português de Portugal.', ir: 'Ver em português', fechar: 'Fechar' },
  en: { msg: 'This page is also available in English.', ir: 'View in English', fechar: 'Close' },
  et: { msg: 'See leht on saadaval ka eesti keeles.', ir: 'Vaata eesti keeles', fechar: 'Sulge' },
  it: { msg: 'Questa pagina è disponibile anche in italiano.', ir: 'Vedi in italiano', fechar: 'Chiudi' },
  ru: { msg: 'Эта страница есть и на русском языке.', ir: 'Открыть на русском', fechar: 'Закрыть' },
};

function idiomaDoNavegador(): Locale | null {
  for (const raw of navigator.languages || [navigator.language]) {
    const l = (raw || '').toLowerCase();
    if (l === 'pt-pt') return 'pt-PT';
    if (l.startsWith('pt')) return 'pt';
    if (l.startsWith('et')) return 'et';
    if (l.startsWith('it')) return 'it';
    if (l.startsWith('ru')) return 'ru';
    if (l.startsWith('en')) return 'en';
  }
  return null;
}

export default function SugestaoIdioma() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const params = useParams() as Record<string, string>;
  const [sugerido, setSugerido] = useState<Locale | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE_FECHADA) === '1') return;
    } catch {}
    const l = idiomaDoNavegador();
    if (l && l !== locale) setSugerido(l);
  }, [locale]);

  if (!sugerido) return null;
  const t = TEXTO[sugerido];

  const fechar = () => {
    try {
      localStorage.setItem(CHAVE_FECHADA, '1');
    } catch {}
    // Dispensou a sugestao: prefere a versao em que esta
    lembrarIdioma(locale);
    setSugerido(null);
  };

  return (
    <div lang={HREFLANG[sugerido]} className="bg-primary-50 border-b border-primary-100 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span className="text-gray-700">{t.msg}</span>
        <a href={caminhoNoIdioma(sugerido, pathname, params)} onClick={() => lembrarIdioma(sugerido)} hrefLang={HREFLANG[sugerido]} className="font-medium text-primary-700 hover:underline">
          {t.ir} →
        </a>
        <button type="button" onClick={fechar} className="text-gray-500 hover:text-gray-700" aria-label={t.fechar}>
          ×
        </button>
      </div>
    </div>
  );
}
