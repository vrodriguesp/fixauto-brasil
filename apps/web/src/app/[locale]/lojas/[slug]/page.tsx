import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link, rota } from '@/i18n/navigation';
import { OG_LOCALE, hrefNoIdioma, type Locale } from '@/i18n/routing';
import StructuredData from '@/components/seo/StructuredData';
import { imagemCompartilhamento } from '@/lib/seo-utils';
import { INTL_LOCALE } from '@/lib/utils';
import { carregarLojaPublica } from '@/lib/loja-publica';
import { DIAS_LOJA, CATEGORIAS_LOJA, ehLocaleLoja, numeroDoSegmento } from '@/lib/loja-publica-regras';
import { alternatesLoja, schemaLoja } from '../loja-seo';

// Pagina publica da loja de pecas (lote 4, 18/11). Renderizada no servidor; dados de lib/loja-publica.ts
// (so campos publicos, sem contato). 404 fora da Estonia, sem a pagina ligada, sem o interruptor (exceto
// conta de teste, sempre noindex). Nome antigo/errado com o numero certo -> 308 para o endereco atual.
// sem cache: ligar/desligar a pagina (loja ou interruptor) vale na hora; pouco trafego
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ locale: string; slug: string }> };

async function carregar(locale: string, slug: string) {
  if (!ehLocaleLoja(locale)) return null;
  const numero = numeroDoSegmento(decodeURIComponent(slug));
  return numero ? carregarLojaPublica(numero) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params;
  const loja = await carregar(locale, slug);
  if (!loja) return { robots: { index: false, follow: false } };
  const t = await getTranslations({ locale, namespace: 'lojaPublica' });
  const categorias = CATEGORIAS_LOJA.filter((c) => loja.categorias.includes(c)).slice(0, 4).map((c) => t(`categoria.${c}`)).join(', ');
  const title = t('metaTitle', { nome: loja.nome_fantasia, cidade: loja.cidade });
  const description = (categorias ? t('metaDescription', { nome: loja.nome_fantasia, cidade: loja.cidade, categorias }) : t('metaDescriptionSemCategorias', { nome: loja.nome_fantasia, cidade: loja.cidade })).slice(0, 160);
  const alternates = alternatesLoja(locale, `/lojas/${loja.segmento}`);
  return {
    title: { absolute: title },
    description,
    alternates,
    ...(loja.indexavel ? {} : { robots: { index: false, follow: true } }),
    openGraph: { images: imagemCompartilhamento(locale), type: 'website', locale: OG_LOCALE[locale as Locale], siteName: 'BipFix', title, description, url: alternates.canonical },
    twitter: { card: 'summary', title, description },
  };
}

export default async function LojaPublicaPage({ params }: Params) {
  const { locale, slug } = await params;
  const loja = await carregar(locale, slug);
  if (!loja) notFound();
  if (decodeURIComponent(slug) !== loja.segmento) permanentRedirect(hrefNoIdioma(locale, `/lojas/${loja.segmento}`));

  const t = await getTranslations({ locale, namespace: 'lojaPublica' });
  const intl = INTL_LOCALE[locale] || 'en-GB';
  const desde = new Date(loja.created_at).toLocaleDateString(intl, { month: '2-digit', year: 'numeric' });
  const h = loja.horario_funcionamento || {};
  const temHorario = DIAS_LOJA.some((d) => h[d]?.aberto);
  const categorias = CATEGORIAS_LOJA.filter((c) => loja.categorias.includes(c));
  const mapa = loja.latitude != null && loja.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${loja.latitude},${loja.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${loja.endereco}, ${loja.cidade}`)}`;
  const decimal = (n: number) => new Intl.NumberFormat(intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  const [schema, migalhas] = schemaLoja(loja, locale, t('listaTitulo'), t('inicio'));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8" data-testid="loja-publica" data-indexavel={loja.indexavel ? '1' : '0'}>
      <StructuredData data={schema} />
      <StructuredData data={migalhas} />
      <nav className="mb-6 text-sm">
        <Link href="/lojas" className="text-primary-700 hover:underline" data-testid="loja-publica-voltar">← {t('voltarLista')}</Link>
      </nav>

      <div className="card mb-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0" aria-hidden="true">
            <span className="text-primary-700 font-bold text-xl">{loja.nome_fantasia.charAt(0)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900 break-words" data-testid="loja-publica-nome">{loja.nome_fantasia}</h1>
            <p className="text-gray-600 mt-1">{loja.cidade}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {loja.entrega && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800" data-testid="loja-publica-entrega">🚚 {t('entrega')}</span>}
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">{t('parceiraDesde', { data: desde })}</span>
              {loja.resumo && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-900" data-testid="loja-publica-nota">
                  ★ {t('avaliacoesResumo', { media: decimal(loja.resumo.media), total: loja.resumo.total })}
                </span>
              )}
            </div>
          </div>
        </div>
        {loja.descricao && (
          <div className="mt-5">
            <h2 className="font-semibold text-gray-900 mb-1">{t('sobre')}</h2>
            <p className="text-gray-700 whitespace-pre-line break-words" data-testid="loja-publica-descricao">{loja.descricao}</p>
          </div>
        )}
      </div>

      {(categorias.length > 0 || loja.marcas.length > 0) && (
        <div className="card mb-6 space-y-4">
          {categorias.length > 0 && (
            <div>
              <h2 className="font-semibold text-gray-900 mb-2">{t('categoriasTitulo')}</h2>
              <ul className="flex flex-wrap gap-2" data-testid="loja-publica-categorias">
                {categorias.map((c) => <li key={c} className="px-3 py-1 rounded-full bg-primary-50 text-primary-800 text-sm">{t(`categoria.${c}`)}</li>)}
              </ul>
            </div>
          )}
          {loja.marcas.length > 0 && (
            <div>
              <h2 className="font-semibold text-gray-900 mb-2">{t('marcasTitulo')}</h2>
              <p className="text-gray-700 break-words" data-testid="loja-publica-marcas">{loja.marcas.join(', ')}</p>
            </div>
          )}
        </div>
      )}

      <div className="card mb-6 grid gap-6 sm:grid-cols-2">
        {temHorario && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-2">{t('horarioTitulo')}</h2>
            <dl className="text-sm space-y-1" data-testid="loja-publica-horario">
              {DIAS_LOJA.map((d) => (
                <div key={d} className="flex justify-between gap-4">
                  <dt className="text-gray-600">{t(`dia.${d}`)}</dt>
                  <dd className="text-gray-900">{h[d]?.aberto && h[d]?.inicio && h[d]?.fim ? `${h[d]!.inicio}–${h[d]!.fim}` : t('fechado')}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <div>
          <h2 className="font-semibold text-gray-900 mb-2">{t('enderecoTitulo')}</h2>
          <p className="text-gray-700 break-words" data-testid="loja-publica-endereco">{loja.endereco}, {loja.cidade}</p>
          <a href={mapa} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-primary-700 hover:underline text-sm">{t('verNoMapa')} ↗</a>
        </div>
      </div>

      {loja.resumo && (
        <section className="card mb-6" data-testid="loja-publica-avaliacoes" aria-labelledby="loja-av-titulo">
          <h2 id="loja-av-titulo" className="font-semibold text-gray-900">{t('avaliacoesTitulo')}</h2>
          <p className="text-lg font-bold text-gray-900 mt-1">★ {t('avaliacoesResumo', { media: decimal(loja.resumo.media), total: loja.resumo.total })}</p>
          {loja.resumo.pctNoPrazo !== null && <p className="text-sm text-gray-600" data-testid="loja-publica-no-prazo">{t('noPrazo', { pct: loja.resumo.pctNoPrazo })}</p>}
          <p className="text-xs text-gray-500 mt-1">{t('avaliacoesNota')}</p>
          <ul className="mt-4 divide-y divide-gray-100">
            {loja.avaliacoes.map((a) => (
              <li key={a.id} className="py-3" data-testid="loja-publica-avaliacao">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-yellow-600 font-semibold" aria-label={`${a.nota}/5`}>{'★'.repeat(a.nota)}<span className="text-gray-300">{'★'.repeat(5 - a.nota)}</span></span>
                  <time className="text-xs text-gray-500" dateTime={a.criado_em}>{new Date(a.criado_em).toLocaleDateString(intl)}</time>
                </div>
                {a.comentario && <p className="text-gray-800 mt-1 break-words">{a.comentario}</p>}
                {a.resposta && (
                  <div className="mt-2 ml-3 pl-3 border-l-2 border-gray-200">
                    <p className="text-xs font-semibold text-gray-600">{t('respostaDaLoja')}</p>
                    <p className="text-sm text-gray-700 break-words">{a.resposta}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="card bg-primary-50 border-primary-100">
        <h2 className="font-semibold text-gray-900">{t('ctaTitulo')}</h2>
        <p className="text-gray-700 mt-1">{t('ctaTexto')}</p>
        <Link href={rota('/cadastro', undefined, { tipo: 'oficina' })} className="btn-primary inline-flex mt-3 min-h-[44px] items-center" data-testid="loja-publica-cta">{t('ctaBotao')}</Link>
      </div>
    </div>
  );
}
