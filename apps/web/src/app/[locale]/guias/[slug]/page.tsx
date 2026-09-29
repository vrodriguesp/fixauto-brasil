import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import StructuredData from '@/components/seo/StructuredData';
import { OG_LOCALE, HREFLANG, type Locale } from '@/i18n/routing';
import { localizedUrl } from '@/lib/seo-utils';
import { alternatesDoGuia, guiaPorSlug } from '@/lib/guias';
import { formatDate } from '@/lib/utils';

type Params = { params: Promise<{ locale: string; slug: string }> };

// Conteudo lido de arquivos do repositorio; muda so com deploy.
export const dynamicParams = true;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params;
  const guia = guiaPorSlug(slug);
  const v = guia?.versoes[locale as Locale];
  if (!guia || !v) return {};
  const alternates = alternatesDoGuia(guia, locale);
  return {
    title: v.tituloSeo || v.titulo,
    description: v.descricao,
    alternates,
    openGraph: {
      type: 'article',
      locale: OG_LOCALE[locale as Locale],
      siteName: 'BipFix',
      title: v.tituloSeo || v.titulo,
      description: v.descricao,
      url: alternates.canonical,
      publishedTime: guia.publicado,
      modifiedTime: guia.atualizado,
    },
    twitter: { card: 'summary', title: v.tituloSeo || v.titulo, description: v.descricao },
  };
}

// Os textos dos guias sao arquivos nossos, versionados no repositorio, e so
// usam <strong> e <a> - por isso podem ir como HTML.
const html = (s: string) => ({ __html: s });

export default async function GuiaPage({ params }: Params) {
  const { locale, slug } = await params;
  const guia = guiaPorSlug(slug);
  const v = guia?.versoes[locale as Locale];
  if (!guia || !v) notFound();

  const t = await getTranslations({ locale, namespace: 'guias' });
  const url = localizedUrl(locale, `/guias/${guia.slug}`);
  const texto = (s: string) => s.replace(/<[^>]+>/g, '');

  const artigo = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: v.titulo,
    description: v.descricao,
    inLanguage: HREFLANG[locale as Locale],
    datePublished: guia.publicado,
    dateModified: guia.atualizado,
    mainEntityOfPage: url,
    author: { '@type': 'Organization', name: 'BipFix', url: 'https://bipfix.com' },
    publisher: {
      '@type': 'Organization',
      name: 'BipFix',
      logo: { '@type': 'ImageObject', url: 'https://bipfix.com/apple-touch-icon.png' },
    },
    ...(guia.pais ? { about: { '@type': 'Country', name: guia.pais } } : {}),
  };
  const faq = v.faq?.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        inLanguage: HREFLANG[locale as Locale],
        mainEntity: v.faq.map((q) => ({
          '@type': 'Question',
          name: q.pergunta,
          acceptedAnswer: { '@type': 'Answer', text: texto(q.resposta) },
        })),
      }
    : null;
  const trilha = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'BipFix', item: localizedUrl(locale, '') || 'https://bipfix.com' },
      { '@type': 'ListItem', position: 2, name: t('indexTitulo'), item: localizedUrl(locale, '/guias') },
      { '@type': 'ListItem', position: 3, name: v.titulo, item: url },
    ],
  };

  const cta = v.cta || 'pedido';
  const ctaHref = cta === 'emergencia' ? '/emergencia' : cta === 'parceiro' ? '/seja-parceiro' : '/cadastro?tipo=cliente';

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <StructuredData data={artigo} />
      <StructuredData data={faq} />
      <StructuredData data={trilha} />

      <nav aria-label="breadcrumb" className="text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:underline">BipFix</Link>
        <span className="mx-2">/</span>
        <Link href="/guias" className="hover:underline">{t('indexTitulo')}</Link>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">{v.titulo}</h1>
      <p className="text-sm text-gray-500 mt-3">
        {t('atualizadoEm', { data: formatDate(guia.atualizado, locale) })}
      </p>
      <p className="text-lg text-gray-700 leading-relaxed mt-6" dangerouslySetInnerHTML={html(v.resumo)} />

      <div className="mt-8 text-gray-700 leading-relaxed [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-10 [&_h2]:mb-3 [&_p]:mb-3 [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_a]:text-primary-600 [&_a:hover]:underline">
        {v.secoes.map((s) => (
          <section key={s.titulo}>
            <h2>{s.titulo}</h2>
            {s.paragrafos?.map((p, i) => <p key={i} dangerouslySetInnerHTML={html(p)} />)}
            {s.itens && (
              <ul>
                {s.itens.map((item, i) => <li key={i} dangerouslySetInnerHTML={html(item)} />)}
              </ul>
            )}
          </section>
        ))}

        {v.faq?.length ? (
          <section>
            <h2>{t('faqTitulo')}</h2>
            {v.faq.map((q) => (
              <div key={q.pergunta} className="mb-5">
                <h3 className="font-semibold text-gray-900 mb-1">{q.pergunta}</h3>
                <p dangerouslySetInnerHTML={html(q.resposta)} />
              </div>
            ))}
          </section>
        ) : null}
      </div>

      <aside className="mt-10 rounded-xl bg-primary-50 border border-primary-100 p-6">
        <p className="font-semibold text-gray-900">{t(`cta.${cta}.titulo`)}</p>
        <p className="text-gray-700 mt-1">{t(`cta.${cta}.texto`)}</p>
        <Link href={ctaHref} className="btn-primary inline-block mt-4">{t(`cta.${cta}.botao`)}</Link>
      </aside>

      {v.fontes?.length ? (
        <section className="mt-10 border-t pt-6">
          <h2 className="text-base font-semibold text-gray-900 mb-2">{t('fontesTitulo')}</h2>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            {v.fontes.map((f) => (
              <li key={f.url}>
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">{f.nome}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
