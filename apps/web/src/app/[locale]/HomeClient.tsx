'use client';

import { useEffect, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import StructuredData from '@/components/seo/StructuredData';
import { generateFAQSchema } from '@/lib/seo-utils';

export default function HomeClient() {
  const { isLoggedIn, user, funcionario, authUser, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations('home');

  // Auto-redirect logged-in users to their dashboard - exceto admin, que
  // precisa conseguir ver a home publica normalmente mesmo logado (pra
  // checar SEO/marketing sem precisar deslogar).
  useEffect(() => {
    if (!loading && isLoggedIn && user && user.tipo !== 'admin') {
      // First login (funcionario ou conta auto-criada) → forca troca de senha
      if (funcionario?.primeiro_login || authUser?.user_metadata?.primeiro_login) {
        router.replace('/definir-senha');
        return;
      }
      const isMecanico = funcionario?.cargo === 'mecanico';
      const dashPath = user.tipo === 'oficina'
        ? (isMecanico ? '/oficina/veiculos-em-servico' : '/oficina/dashboard')
        : user.tipo === 'loja_pecas'
          ? '/loja/dashboard'
          : '/cliente/dashboard';
      router.replace(dashPath);
    }
  }, [loading, isLoggedIn, user, funcionario, authUser, router]);

  // So esconde o conteudo quando JA se sabe que e um usuario logado (que vai
  // ser redirecionado ao painel). Antes, o "loading" inicial da autenticacao
  // tambem escondia - e esse estado e o que o servidor renderiza: Google,
  // Bing e IAs recebiam so "Carregando..." na pagina inicial, em todos os
  // idiomas, e tratavam /it, /et, /en como copias vazias umas das outras.
  if (!loading && isLoggedIn && user && user.tipo !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="animate-pulse text-gray-400">{t('carregando')}</div>
      </div>
    );
  }

  const faqItems = t.raw('faqItems') as { pergunta: string; resposta: string }[];
  const faqSchema = generateFAQSchema(faqItems);

  return (
    <div>
      <StructuredData data={faqSchema} />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
              {t('heroTitulo')}{' '}
              <span className="text-primary-200">{t('heroTituloDestaque')}</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-primary-100 leading-relaxed">{t('heroTexto')}</p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link
                href="/cadastro?tipo=cliente"
                className="bg-white text-primary-700 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary-50 transition-colors text-center"
              >
                {t('ctaCliente')}
              </Link>
              <Link
                href="/seja-parceiro"
                className="border-2 border-white text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white/10 transition-colors text-center"
              >
                {t('ctaOficina')}
              </Link>
            </div>
          </div>
        </div>

        {/* Emergency button */}
        <div className="absolute bottom-0 left-0 right-0 translate-y-1/2">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Link
              href="/emergencia"
              className="block bg-red-600 hover:bg-red-700 text-white rounded-2xl p-6 shadow-xl transition-all hover:shadow-2xl border-2 border-red-500"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xl font-bold">{t('emergenciaTitulo')}</p>
                  <p className="text-red-100 text-sm mt-1">{t('emergenciaTexto')}</p>
                </div>
                <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="pt-28 pb-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">{t('comoFuncionaTitulo')}</h2>
          <p className="text-gray-600 text-center mb-16 max-w-2xl mx-auto">{t('comoFuncionaSubtitulo')}</p>

          <div className="grid md:grid-cols-4 gap-8">
            <Step
              number={1}
              title={t('step1Titulo')}
              description={t('step1Texto')}
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
            <Step
              number={2}
              title={t('step2Titulo')}
              description={t('step2Texto')}
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              }
            />
            <Step
              number={3}
              title={t('step3Titulo')}
              description={t('step3Texto')}
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              }
            />
            <Step
              number={4}
              title={t('step4Titulo')}
              description={t('step4Texto')}
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </div>
        </div>
      </section>

      {/* For workshops */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block bg-primary-100 text-primary-700 text-xs font-semibold px-3 py-1 rounded-full mb-4 tracking-wide">
                {t('oficinasBadge')}
              </span>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('oficinasTitulo')}</h2>
              <p className="text-gray-600 text-lg mb-8">{t('oficinasTexto')}</p>
              <ul className="space-y-4">
                <Feature text={t('feature1')} />
                <Feature text={t('feature2')} />
                <Feature text={t('feature3')} />
                <Feature text={t('feature4')} />
              </ul>
              <div className="flex flex-wrap gap-4 mt-8">
                <Link href="/seja-parceiro" className="btn-primary inline-block">
                  {t('ctaFundador')}
                </Link>
                <Link href="/para-oficinas" className="inline-block text-primary-600 font-medium hover:underline self-center">
                  {t('saibaMais')} →
                </Link>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{t('mock1Titulo')}</p>
                    <p className="text-sm text-gray-500">{t('mock1Texto')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{t('mock2Titulo')}</p>
                    <p className="text-sm text-gray-500">{t('mock2Texto')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg">
                  <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{t('mock3Titulo')}</p>
                    <p className="text-sm text-gray-500">{t('mock3Texto')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Por que agora */}
      <section className="py-16 bg-primary-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block bg-white/15 text-white text-xs font-semibold px-3 py-1 rounded-full mb-5 tracking-wide">
            {t('porQueBadge')}
          </span>
          <h2 className="text-3xl font-bold mb-6">{t('porQueTitulo')}</h2>
          <p className="text-lg text-primary-100 leading-relaxed">{t('porQueTexto1')}</p>
          <p className="text-lg text-primary-100 leading-relaxed mt-4">{t('porQueTexto2')}</p>
        </div>
      </section>

      {/* Chamada para parceiros */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">{t('parceiroTitulo')}</h2>
          <p className="text-gray-600 text-lg mb-8 max-w-2xl mx-auto">{t('parceiroTexto')}</p>
          <Link href="/seja-parceiro" className="btn-primary inline-block">
            {t('ctaFundador')}
          </Link>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">{t('faqTitulo')}</h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">{t('faqSubtitulo')}</p>
          <div className="space-y-4">
            {faqItems.map((faq, index) => (
              <FAQItem key={index} pergunta={faq.pergunta} resposta={faq.resposta} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
    </div>
  );
}

function Step({ number, title, description, icon }: { number: number; title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary-600">
        {icon}
      </div>
      <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 text-sm font-bold">
        {number}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <svg className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-gray-700">{text}</span>
    </li>
  );
}


function FAQItem({ pergunta, resposta }: { pergunta: string; resposta: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-900 pr-4">{pergunta}</span>
        <svg
          className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 text-gray-600 leading-relaxed">
          {resposta}
        </div>
      )}
    </div>
  );
}
