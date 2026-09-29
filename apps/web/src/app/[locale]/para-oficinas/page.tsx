import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import StructuredData from '@/components/seo/StructuredData';
import { OG_LOCALE, isBrasil, type Locale } from '@/i18n/routing';
import { generateFAQSchema, hreflangAlternates, localizedUrl } from '@/lib/seo-utils';


export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'paraOficinas' });
  const alternates = hreflangAlternates(locale, '/para-oficinas');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    keywords: t.raw('metaKeywords') as string[],
    alternates,
    openGraph: {
      type: 'website',
      locale: OG_LOCALE[locale as Locale] || 'pt_BR',
      siteName: 'BipFix',
      title: `${t('ogTitle')} | BipFix`,
      description: t('ogDescription'),
      url: alternates.canonical,
    },
  };
}

type FuncCategoria = { titulo: string; itens: string[] };
type DorSolucao = { dor: string; solucao: string };
type Step = { title: string; description: string };
type Faq = { pergunta: string; resposta: string };

export default async function ParaOficinasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'paraOficinas' });

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

  return (
    <div>
      <StructuredData data={faqSchema} />
      <StructuredData data={softwareSchema} />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight">{t('heroTitulo')}</h1>
            <p className="mt-6 text-lg sm:text-xl text-primary-100 leading-relaxed">{t('heroTexto')}</p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link
                href="/seja-parceiro"
                className="bg-white text-primary-700 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary-50 transition-colors text-center"
              >
                {t('ctaFundador')}
              </Link>
              <Link
                href="/oficinas"
                className="border-2 border-white text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white/10 transition-colors text-center"
              >
                {t('ctaVerOficinas')}
              </Link>
            </div>
            <p className="mt-4 text-sm text-primary-200">{t('heroFootnote')}</p>
          </div>
        </div>
      </section>

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
            href="/seja-parceiro"
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
