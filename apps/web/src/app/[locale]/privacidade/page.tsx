import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { hreflangAlternates } from '@/lib/seo-utils';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'privacidade' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: hreflangAlternates(locale, '/privacidade'),
    robots: { index: true, follow: true },
  };
}

// Duas politicas diferentes, uma por jurisdicao: o site em portugues atende
// o Brasil (LGPD - PrivacidadeLgpd, abaixo) e as versoes en/et/it atendem a
// Europa (GDPR - PrivacidadeGdpr). O namespace de mensagens e o mesmo
// ("privacidade"), mas o conteudo de en/et/it e uma lista de secoes.
export default async function PrivacidadePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return locale === 'pt' ? <PrivacidadeLgpd locale={locale} /> : <PrivacidadeGdpr locale={locale} />;
}

interface SecaoGdpr {
  titulo: string;
  subsecao?: boolean;
  paragrafos?: string[];
  itens?: string[];
  depois?: string[];
}

// O texto vem dos nossos proprios arquivos de mensagens (messages/*.misc.json,
// versionados no repositorio) e so usa <strong> e <a> - nao e conteudo de
// usuario, por isso pode ir como HTML.
const html = (s: string) => ({ __html: s });

async function PrivacidadeGdpr({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'privacidade' });
  const secoes = t.raw('secoes') as SecaoGdpr[];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('pageTitle')}</h1>
      <p className="text-sm text-gray-500 mb-10">{t('lastUpdatedLabel')} {t('updatedDate')}</p>

      <div className="text-gray-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-3 [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3 [&_a]:text-primary-600 [&_a:hover]:underline">
        {secoes.map((s) => (
          <section key={s.titulo}>
            {s.subsecao ? <h3>{s.titulo}</h3> : <h2>{s.titulo}</h2>}
            {s.paragrafos?.map((p, i) => <p key={i} dangerouslySetInnerHTML={html(p)} />)}
            {s.itens && (
              <ul>
                {s.itens.map((item, i) => <li key={i} dangerouslySetInnerHTML={html(item)} />)}
              </ul>
            )}
            {s.depois?.map((p, i) => <p key={i} dangerouslySetInnerHTML={html(p)} />)}
          </section>
        ))}
      </div>
    </div>
  );
}

async function PrivacidadeLgpd({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'privacidade' });

  const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;
  const mailLink = (chunks: React.ReactNode) => (
    <a href="mailto:privacy@bipfix.com" className="text-primary-600 hover:underline">{chunks}</a>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('pageTitle')}</h1>
      <p className="text-sm text-gray-500 mb-10">{t('lastUpdatedLabel')} {t('updatedDate')}</p>

      <div className="space-y-8 text-gray-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-3 [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-6">

        <section>
          <h2>{t('title1')}</h2>
          <p>{t('body1')}</p>
        </section>

        <section>
          <h2>{t('title2')}</h2>
          <ul>
            <li>{t.rich('list2_1', { strong })}</li>
            <li>{t.rich('list2_2', { strong })}</li>
            <li>{t.rich('list2_3', { strong })}</li>
            <li>{t.rich('list2_4', { strong })}</li>
            <li>{t.rich('list2_5', { strong })}</li>
            <li>{t.rich('list2_6', { strong })}</li>
            <li>{t.rich('list2_7', { strong })}</li>
          </ul>
        </section>

        <section>
          <h2>{t('title3')}</h2>
          <ul>
            <li>{t.rich('list3_1', { strong })}</li>
            <li>{t.rich('list3_2', { strong })}</li>
            <li>{t.rich('list3_3', { strong })}</li>
            <li>{t.rich('list3_4', { strong })}</li>
          </ul>
        </section>

        <section>
          <h2>{t('title4')}</h2>
          <p>{t('intro4')}</p>
          <ul>
            <li>{t('list4_1')}</li>
            <li>{t('list4_2')}</li>
            <li>{t('list4_3')}</li>
          </ul>
          <p>{t('body4')}</p>
        </section>

        <section>
          <h2>{t('title5')}</h2>
          <p>{t('body5')}</p>
        </section>

        <section>
          <h2>{t('title6')}</h2>
          <p>{t('intro6')}</p>
          <ul>
            <li>{t('list6_1')}</li>
            <li>{t('list6_2')}</li>
            <li>{t('list6_3')}</li>
            <li>{t('list6_4')}</li>
            <li>{t('list6_5')}</li>
            <li>{t('list6_6')}</li>
            <li>{t('list6_7')}</li>
          </ul>
          <p>{t.rich('body6', { mailLink })}</p>
        </section>

        <section>
          <h2>{t('title7')}</h2>
          <p>{t('body7')}</p>
        </section>

        <section>
          <h2>{t('title8')}</h2>
          <p>{t('body8')}</p>
        </section>

        <section>
          <h2>{t('title9')}</h2>
          <p>{t('body9')}</p>
        </section>

        <section>
          <h2>{t('title10')}</h2>
          <p>{t.rich('body10', { mailLink })}</p>
        </section>

        <p className="text-xs text-gray-400 border-t pt-6 mt-10">
          {t('footerDisclaimer')}
        </p>
      </div>
    </div>
  );
}
