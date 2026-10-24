import type { Metadata } from 'next';
import { Link, rota } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { contarOficinasPublicas } from '@/lib/oficinas-publicas';
import StructuredData from '@/components/seo/StructuredData';
import VideoYouTube from '@/components/videos/VideoYouTube';
import { OG_LOCALE, isBrasil, type Locale } from '@/i18n/routing';
import { generateFAQSchema, hreflangAlternates, localizedUrl, imagemCompartilhamento } from '@/lib/seo-utils';


export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'paraOficinas' });
  const alternates = hreflangAlternates(locale, '/para-oficinas');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates,
    openGraph: {
      images: imagemCompartilhamento(locale),
      type: 'website',
      locale: OG_LOCALE[locale as Locale] || 'pt_BR',
      siteName: 'BipFix',
      title: `${t('ogTitle')} | BipFix`,
      description: t('ogDescription'),
      url: alternates.canonical,
    },
  };
}

// Videos educativos do canal youtube.com/@BipFix (em estoniano: so nas versoes da Estonia).
// Miniaturas servidas pelo proprio site (public/videos) - nada do YouTube carrega antes do play.
const VIDEOS = [
  { id: 'RhCdt85F14g', chave: 'Responder', miniatura: '/videos/vasta-paringule.webp', duracao: 'PT1M32S' },
  { id: 'pee8GvB249g', chave: 'Cadastro', miniatura: '/videos/registreerimine.webp', duracao: 'PT1M17S' },
] as const;
const LOCALES_COM_VIDEOS = ['et', 'ru', 'en'];

type FuncCategoria = { titulo: string; itens: string[] };
type DorSolucao = { dor: string; solucao: string };
type Step = { title: string; description: string };
type Faq = { pergunta: string; resposta: string };

export default async function ParaOficinasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'paraOficinas' });
  const temOficinas = (await contarOficinasPublicas().catch(() => 0)) > 0;

  const funcCategorias = t.raw('funcCategorias') as FuncCategoria[];
  const dores = t.raw('dores') as DorSolucao[];
  const steps = t.raw('steps') as Step[];
  const faqItems = t.raw('faq') as Faq[];

  const faqSchema = generateFAQSchema(faqItems);

  const softwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: t('ogTitle'),
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: localizedUrl(locale, '/para-oficinas'),
    description: t('metaDescription'),
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: isBrasil(locale) ? 'BRL' : 'EUR',
    },
  };

  const mostrarVideos = LOCALES_COM_VIDEOS.includes(locale);
  // VideoObject (dados de video do Google: miniatura, data, duracao, endereco do player)
  const videoSchemas = mostrarVideos ? VIDEOS.map((v) => ({
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: t(`video${v.chave}Titulo`),
    description: t(`video${v.chave}Texto`),
    thumbnailUrl: `https://bipfix.com${v.miniatura}`,
    uploadDate: '2026-10-23T12:00:00+03:00',
    duration: v.duracao,
    embedUrl: `https://www.youtube-nocookie.com/embed/${v.id}`,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    inLanguage: 'et',
    publisher: { '@id': 'https://bipfix.com/#organization' },
  })) : [];

  return (
    <div>
      <StructuredData data={faqSchema} />
      {videoSchemas.map((v, i) => <StructuredData key={i} data={v} />)}
      <StructuredData data={softwareSchema} />

      {/* Hero: no celular o titulo, os selos (0 €, sem cartao, sem mensalidade*) e o botao
          cabem na primeira tela (Clarity 24/10: 80 % nao rolavam e o aviso de cookies cobria o botao). */}
      <section className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16 lg:py-24 lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center">
          <div>
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight">{t('heroTitulo')}</h1>
            <ul className="mt-5 flex flex-wrap gap-2">
              {(t.raw('heroSelos') as string[]).map((selo) => (
                <li key={selo} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 ring-1 ring-white/25 px-3 py-1.5 text-sm sm:text-base font-semibold">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#86efac" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  {selo}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Link
                href={rota('/cadastro', undefined, { tipo: 'oficina' })}
                className="bg-white text-primary-700 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary-50 transition-colors text-center"
              >
                {t('ctaFundador')}
              </Link>
              {temOficinas && (
                <Link
                  href="/oficinas"
                  className="border-2 border-white text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white/10 transition-colors text-center"
                >
                  {t('ctaVerOficinas')}
                </Link>
              )}
            </div>
            <p className="mt-3 text-xs sm:text-sm text-white/85 leading-relaxed">{t('heroAsterisco')}</p>
            <p className="mt-6 text-base sm:text-xl text-white leading-relaxed">{t('heroTexto')}</p>
          </div>
          {mostrarVideos && (
            <div className="mt-8 lg:mt-0">
              <VideoYouTube id={VIDEOS[0].id} titulo={t('videoResponderTitulo')} miniatura={VIDEOS[0].miniatura} rotuloPlay={t('videoPlay')} />
            </div>
          )}
        </div>
      </section>

      {/* Ordem (24/10, pedido do dono): primeiro como a oficina ganha clientes e visibilidade, depois a gestao */}
      {/* Como funciona para conseguir clientes */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">{t('comoTitulo')}</h2>
          <div className="grid md:grid-cols-4 gap-8">
            {steps.map((s, i) => (
              <StepCard key={i} number={i + 1} title={s.title} description={s.description} />
            ))}
          </div>
        </div>
      </section>

      {/* Videos: como e facil (canal youtube.com/@BipFix) */}
      {mostrarVideos && (
        <section id="videod" className="py-20 bg-primary-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-center text-gray-900">{t('videosTitulo')}</h2>
            <p className="mt-3 text-center text-gray-600 max-w-2xl mx-auto">{t('videosSub')}{t('videosIdioma') ? ` ${t('videosIdioma')}` : ''}</p>
            <div className="mt-10 grid md:grid-cols-2 gap-8">
              {VIDEOS.map((v) => (
                <article key={v.id}>
                  <VideoYouTube id={v.id} titulo={t(`video${v.chave}Titulo`)} miniatura={v.miniatura} rotuloPlay={t('videoPlay')} />
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">{t(`video${v.chave}Titulo`)}</h3>
                  <p className="mt-1 text-gray-600 text-sm leading-relaxed">{t(`video${v.chave}Texto`)}</p>
                  <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-medium text-primary-600 hover:underline">{t('videoYoutube')} ↗</a>
                </article>
              ))}
            </div>
            <p className="mt-8 text-center"><a href="https://www.youtube.com/@BipFix" target="_blank" rel="noopener noreferrer me" className="text-sm font-medium text-gray-500 hover:text-primary-600">{t('videosCanal')} ↗</a></p>
          </div>
        </section>
      )}

      {/* Resumo sintetico de todas as funcionalidades */}
      <section className="py-20 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">{t('funcTitulo')}</h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">{t('funcSubtitulo')}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {funcCategorias.map((cat, i) => (
              <FuncCategoriaCard key={i} titulo={cat.titulo} itens={cat.itens} />
            ))}
          </div>
        </div>
      </section>

      {/* Dores -> Solucao */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">{t('doresTitulo')}</h2>
          <p className="text-gray-600 text-center mb-16 max-w-2xl mx-auto">{t('doresSubtitulo')}</p>
          <div className="grid md:grid-cols-3 gap-8">
            {dores.map((d, i) => (
              <DorSolucaoCard key={i} dor={d.dor} solucao={d.solucao} />
            ))}
          </div>
        </div>
      </section>

      {/* Comissao / transparencia */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('transparenciaTitulo')}</h2>
          <p className="text-gray-600 text-lg leading-relaxed">
            {t('transparenciaTexto')}{' '}
            <Link href="/termos" className="text-primary-600 hover:underline font-medium">
              {t('transparenciaTermosLink')}
            </Link>
            .
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">{t('faqTitulo')}</h2>
          <div className="space-y-4">
            {faqItems.map((faq, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="font-semibold text-gray-900 mb-2">{faq.pergunta}</h3>
                <p className="text-gray-600 leading-relaxed text-sm">{faq.resposta}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-16 bg-primary-700 text-white text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t('ctaFinalTitulo')}</h2>
          <Link
            href={rota('/cadastro', undefined, { tipo: 'oficina' })}
            className="inline-block mt-4 bg-white text-primary-700 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary-50 transition-colors"
          >
            {t('ctaFundador')}
          </Link>
        </div>
      </section>
    </div>
  );
}

function FuncCategoriaCard({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div className="border border-gray-200 rounded-xl p-6">
      <h3 className="font-semibold text-gray-900 mb-4">{titulo}</h3>
      <ul className="space-y-2.5">
        {itens.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
            <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DorSolucaoCard({ dor, solucao }: { dor: string; solucao: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
      <p className="text-sm text-red-600 font-medium mb-2">✕ {dor}</p>
      <p className="text-sm text-gray-800 font-medium">✓ {solucao}</p>
    </div>
  );
}

function StepCard({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="text-center">
      <div className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 font-bold">
        {number}
      </div>
      <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}
