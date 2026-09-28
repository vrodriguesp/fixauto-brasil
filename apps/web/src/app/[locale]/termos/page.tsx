import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { hreflangAlternates } from '@/lib/seo-utils';
import DocumentoLegalSecoes from '@/components/legal/DocumentoLegalSecoes';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'termos' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: hreflangAlternates(locale, '/termos'),
    robots: { index: true, follow: true },
  };
}

// Dois textos, um por jurisdicao: o site em portugues atende o Brasil (lei
// brasileira, CDC - TermosBrasil, abaixo) e as versoes en/et/it atendem a
// Europa (direito da UE e da Estonia - DocumentoLegalSecoes).
export default async function TermosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return locale === 'pt' ? <TermosBrasil locale={locale} /> : <DocumentoLegalSecoes locale={locale} namespace="termos" />;
}

async function TermosBrasil({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'termos' });

  const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;
  const privacyLink = (chunks: React.ReactNode) => (
    <Link href="/privacidade" className="text-primary-600 hover:underline">{chunks}</Link>
  );
  const mailLink = (chunks: React.ReactNode) => (
    <a href="mailto:support@bipfix.com" className="text-primary-600 hover:underline">{chunks}</a>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('pageTitle')}</h1>
      <p className="text-sm text-gray-500 mb-10">{t('lastUpdatedLabel')} {t('updatedDate')}</p>

      <div className="prose-legal space-y-8 text-gray-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-3 [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6">

        <section>
          <h2>{t('title1')}</h2>
          <p>{t.rich('body1a', { strong, privacyLink })}</p>
          <p>{t.rich('body1b', { strong, privacyLink })}</p>
        </section>

        <section>
          <h2>{t('title2')}</h2>
          <p>{t('body2')}</p>
        </section>

        <section>
          <h2>{t('title3')}</h2>
          <p>{t('body3')}</p>
        </section>

        <section>
          <h2>{t('title4')}</h2>
          <p>{t.rich('body4a', { strong })}</p>
          <p>{t.rich('body4b', { strong })}</p>
        </section>

        <section>
          <h2>{t('title5')}</h2>
          <p>{t('intro5')}</p>
          <ul>
            <li>{t.rich('list5_1', { strong })}</li>
            <li>{t.rich('list5_2', { strong })}</li>
            <li>{t.rich('list5_3', { strong })}</li>
            <li>{t.rich('list5_4', { strong })}</li>
            <li>{t.rich('list5_5', { strong })}</li>
            <li>{t.rich('list5_6', { strong })}</li>
          </ul>
        </section>

        <section>
          <h2>{t('title6')}</h2>
          <p>{t('intro6')}</p>
          <h3>{t('sub6_1Title')}</h3>
          <p>{t('body6_1')}</p>
          <h3>{t('sub6_2Title')}</h3>
          <p>{t.rich('body6_2', { strong })}</p>
          <ul>
            <li>{t.rich('list6_2_1', { strong })}</li>
            <li>{t.rich('list6_2_2', { strong })}</li>
            <li>{t.rich('list6_2_3', { strong })}</li>
            <li>{t.rich('list6_2_4', { strong })}</li>
          </ul>
          <p>{t('body6_2b')}</p>
        </section>

        <section>
          <h2>{t('title7')}</h2>
          <p>{t('body7')}</p>
        </section>

        <section>
          <h2>{t('title8')}</h2>
          <p>{t('intro8')}</p>
          <ul>
            <li>{t.rich('list8_1', { strong })}</li>
            <li>{t.rich('list8_2', { strong })}</li>
            <li>{t.rich('list8_3', { strong })}</li>
            <li>{t.rich('list8_4', { strong })}</li>
            <li>{t.rich('list8_5', { strong })}</li>
          </ul>
        </section>

        <section>
          <h2>{t('title9')}</h2>
          <p>{t.rich('body9', { privacyLink })}</p>
        </section>

        <section>
          <h2>{t('title10')}</h2>
          <p>{t('body10')}</p>
        </section>

        <section>
          <h2>{t('title11')}</h2>
          <p>{t('body11')}</p>
        </section>

        <section>
          <h2>{t('title12')}</h2>
          <p>{t('body12')}</p>
        </section>

        <section>
          <h2>{t('title13')}</h2>
          <p>{t('body13')}</p>
        </section>

        <section>
          <h2>{t('title14')}</h2>
          <p>{t.rich('body14', { mailLink })}</p>
        </section>

        <p className="text-xs text-gray-400 border-t pt-6 mt-10">
          {t('footerDisclaimer')}
        </p>
      </div>
    </div>
  );
}
