import type { Metadata } from 'next';
import Image from 'next/image';
import { Link, rota } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import StructuredData from '@/components/seo/StructuredData';
import { OG_LOCALE, type Locale } from '@/i18n/routing';
import { generateFAQSchema, hreflangAlternates, imagemCompartilhamento } from '@/lib/seo-utils';

// Pagina para motoristas que chegam dos anuncios (pedido do dono 06/11: "uma
// pagina generica para os motoristas dizendo que e um servico free e demora
// 2 min para se registrar e enviar a solicitacao"). Mesma cara do anuncio:
// foto do painel no topo e as telas do celular do video "Mis see maksab?"
// (dados de exemplo, com o selo do video). Um botao so: cadastro de cliente.
// Italia/Portugal/Brasil: noindex automatico (lib/mercados.ts).

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'paraMotoristas' });
  const alternates = hreflangAlternates(locale, '/para-motoristas');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates,
    openGraph: {
      images: imagemCompartilhamento(locale),
      type: 'website',
      locale: OG_LOCALE[locale as Locale] || 'et_EE',
      siteName: 'BipFix',
      title: t('metaTitle'),
      description: t('metaDescription'),
      url: alternates.canonical,
    },
  };
}

type Passo = { titulo: string; texto: string };
type Faq = { pergunta: string; resposta: string };

export default async function ParaMotoristasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'paraMotoristas' });
  const passos = t.raw('passos') as Passo[];
  const motivos = t.raw('motivos') as Passo[];
  const faq = t.raw('faq') as Faq[];
  // telas do video: russo para o russo, estoniano para os outros
  const telas = locale === 'ru' ? 'ru' : 'et';
  const cadastro = rota('/cadastro', undefined, { tipo: 'cliente' });

  const Botao = ({ grande }: { grande?: boolean }) => (
    <Link href={cadastro} data-testid="cta-motorista"
      className={`inline-block rounded-lg bg-green-600 text-white font-semibold text-center hover:bg-green-700 transition-colors ${grande ? 'px-8 py-4 text-lg' : 'px-6 py-3 text-base sm:text-lg'}`}>
      {t('cta')}
      <span className="block text-xs font-medium text-green-100">{t('ctaSub')}</span>
    </Link>
  );

  return (
    <div>
      <StructuredData data={generateFAQSchema(faq)} />

      {/* Topo: titulo + vantagens + botao na primeira tela do celular */}
      <section className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-14 lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center">
          <div>
            <p className="text-[11px] sm:text-sm font-semibold uppercase tracking-wider text-primary-100">{t('heroEyebrow')}</p>
            <h1 className="mt-1.5 text-[1.6rem] leading-tight sm:text-5xl font-bold">{t('heroTitulo')}</h1>
            <p className="mt-3 text-base sm:text-xl text-white/95 leading-relaxed">{t('heroTexto')}</p>
            <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl bg-white/10 ring-1 ring-white/25 px-3 py-3 sm:p-4">
              {(t.raw('vantagens') as string[]).map((v) => (
                <li key={v} className="flex items-start gap-1.5 text-[13px] leading-snug sm:text-base font-semibold">
                  <svg className="mt-0.5 flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#86efac" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  {v}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
              <Botao />
              <Link href="/login" className="text-center text-sm text-white/90 underline hover:text-white">{t('jaTenhoConta')}</Link>
            </div>
          </div>
          <div className="mt-8 lg:mt-0">
            <Image src="/images/motoristas/foto-painel.webp" alt={t('fotoAlt')} width={900} height={1125} priority
              className="w-full max-w-md mx-auto rounded-2xl shadow-2xl ring-1 ring-white/20" />
          </div>
        </div>
      </section>

      {/* Como funciona: 3 passos com a tela real do celular */}
      <section className="py-14 sm:py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900">{t('comoTitulo')}</h2>
          <p className="mt-2 text-center text-gray-600">{t('comoSub')}</p>
          <ol className="mt-10 grid md:grid-cols-3 gap-10">
            {passos.map((p, i) => (
              <li key={p.titulo} className="text-center">
                <Image src={`/images/motoristas/tela-${i + 1}-${telas}.webp`} alt={p.titulo} width={420} height={810}
                  className="mx-auto w-52 sm:w-60 rounded-3xl shadow-lg" />
                <div className="mt-5 w-9 h-9 bg-primary-600 text-white rounded-full flex items-center justify-center mx-auto font-bold">{i + 1}</div>
                <h3 className="mt-3 font-semibold text-gray-900 text-lg">{p.titulo}</h3>
                <p className="mt-1 text-gray-600 text-sm leading-relaxed max-w-xs mx-auto">{p.texto}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-center text-xs text-gray-500">{t('telasAviso')}</p>
          <div className="mt-8 text-center"><Botao /></div>
        </div>
      </section>

      {/* Por que BipFix */}
      <section className="py-14 sm:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900">{t('motivosTitulo')}</h2>
          <div className="mt-10 grid md:grid-cols-3 gap-6">
            {motivos.map((m) => (
              <div key={m.titulo} className="rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900">{m.titulo}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{m.texto}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-gray-600">{t('servicos')}</p>
        </div>
      </section>

      {/* Perguntas */}
      <section className="py-14 sm:py-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-8">{t('faqTitulo')}</h2>
          <div className="space-y-3">
            {faq.map((f) => (
              <div key={f.pergunta} className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="font-semibold text-gray-900 mb-1.5">{f.pergunta}</h3>
                <p className="text-gray-600 leading-relaxed text-sm">{f.resposta}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Chamada final */}
      <section className="py-14 bg-primary-700 text-white text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">{t('ctaFinalTitulo')}</h2>
          <Botao grande />
        </div>
      </section>
    </div>
  );
}
