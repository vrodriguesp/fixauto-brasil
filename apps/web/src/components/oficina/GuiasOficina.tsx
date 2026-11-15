'use client';

import { useLocale, useTranslations } from 'next-intl';
import { GUIAS_OFICINA, VIDEO_GUIA_OFICINA, NOME_IDIOMA_GUIA, urlGuia, ordenarIdiomas, type IdiomaGuia } from '@/lib/guias-oficina';

// Bloco "Guias e video" da pagina Aprender: o PDF mais recente de cada tema e o video mais recente, nos
// idiomas que existem (lib/guias-oficina.ts). Endereco fixo: /oficina/aprender#guias.
export default function GuiasOficina() {
  const t = useTranslations('oficinaAprender.guias');
  const locale = useLocale();
  const videos = ordenarIdiomas(Object.keys(VIDEO_GUIA_OFICINA) as IdiomaGuia[], locale);
  const semMinhaLingua = (ls: string[]) => !ls.some((l) => l === locale || (l.startsWith('pt') && locale.startsWith('pt')));
  const botao = 'inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50';

  return (
    <section id="guias" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 scroll-mt-20" aria-labelledby="guias-titulo" data-testid="guias-oficina">
      <div className="card">
        <h2 id="guias-titulo" className="text-xl font-semibold text-gray-900">📚 {t('titulo')}</h2>
        <p className="mt-1 text-sm text-gray-600">{t('texto')}</p>

        {GUIAS_OFICINA.map((g) => {
          const idiomas = ordenarIdiomas(g.idiomas, locale);
          return (
            <div key={g.id} className="mt-4 rounded-lg border border-gray-200 p-3">
              <p className="font-medium text-gray-900">📄 {t(`temas.${g.tema}`)}</p>
              {semMinhaLingua(idiomas) && <p className="mt-1 text-xs text-gray-500">{t('outraLingua')}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {idiomas.map((l) => (
                  <a key={l} href={urlGuia(g.id, l)} target="_blank" rel="noopener" lang={l} className={botao} data-testid={`guia-${g.id}-${l}`}
                    aria-label={t('baixarPdf', { idioma: NOME_IDIOMA_GUIA[l] })}>
                    <span aria-hidden="true">⬇️</span> PDF · {NOME_IDIOMA_GUIA[l]}
                  </a>
                ))}
              </div>
            </div>
          );
        })}

        {videos.length > 0 && (
          <div className="mt-4 rounded-lg border border-gray-200 p-3">
            <p className="font-medium text-gray-900">🎬 {t('video')}</p>
            {semMinhaLingua(videos) && <p className="mt-1 text-xs text-gray-500">{t('outraLingua')}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {videos.map((l) => (
                <a key={l} href={VIDEO_GUIA_OFICINA[l]} target="_blank" rel="noopener noreferrer" lang={l} className={botao} data-testid={`video-guia-${l}`}
                  aria-label={t('verVideo', { idioma: NOME_IDIOMA_GUIA[l] })}>
                  <span aria-hidden="true">▶️</span> YouTube · {NOME_IDIOMA_GUIA[l]}
                </a>
              ))}
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-gray-500">{t('sempreAtual')}</p>
      </div>
    </section>
  );
}
