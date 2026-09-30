import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { OG_LOCALE, type Locale } from '@/i18n/routing';
import { hreflangAlternates, imagemCompartilhamento } from '@/lib/seo-utils';

// Quem somos (Google: E-E-A-T - quem esta por tras do site; IAs usam esta
// pagina para descrever a entidade). Sem nome pessoal do fundador, por
// decisao do dono; dados da OU entram quando o registro sair.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'sobre' });
  const alternates = hreflangAlternates(locale, '/sobre');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates,
    openGraph: {
      images: imagemCompartilhamento(locale),
      type: 'website',
      locale: OG_LOCALE[locale as Locale],
      siteName: 'BipFix',
      title: t('metaTitle'),
      description: t('metaDescription'),
      url: alternates.canonical,
    },
  };
}

export default async function SobrePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'sobre' });
  const principios = [t('principio1'), t('principio2'), t('principio3'), t('principio4')];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900">{t('titulo')}</h1>
      <p className="mt-4 text-lg text-gray-700 leading-relaxed">{t('intro')}</p>

      <h2 className="mt-10 text-xl font-bold text-gray-900">{t('estagioTitulo')}</h2>
      <p className="mt-3 text-gray-700 leading-relaxed">{t('estagioTexto')}</p>

      <h2 className="mt-10 text-xl font-bold text-gray-900">{t('empresaTitulo')}</h2>
      <p className="mt-3 text-gray-700 leading-relaxed">{t('empresaTexto')}</p>

      <h2 className="mt-10 text-xl font-bold text-gray-900">{t('principiosTitulo')}</h2>
      <ul className="mt-3 space-y-2">
        {principios.map((p, i) => (
          <li key={i} className="flex gap-2 text-gray-700">
            <span className="text-primary-600 font-bold" aria-hidden="true">✓</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-bold text-gray-900">{t('contatoTitulo')}</h2>
      <p className="mt-3 text-gray-700 leading-relaxed">{t('contatoTexto')}</p>
    </div>
  );
}
