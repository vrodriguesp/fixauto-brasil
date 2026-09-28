'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
const CONSENT_KEY = 'bipfix_cookie_consent';

type Consent = 'accepted' | 'rejected' | null;

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    clarity?: (...args: any[]) => void;
  }
}

function aplicarConsentimento(valor: 'accepted' | 'rejected') {
  const storage = valor === 'accepted' ? 'granted' : 'denied';
  window.gtag?.('consent', 'update', {
    analytics_storage: storage,
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  // Clarity ConsentV2 - obrigatorio pra EEA/UK/Suica desde 31/10/2025 (inclui
  // Estonia, onde e o piloto): https://learn.microsoft.com/clarity/setup-and-installation/clarity-consent-api-v2
  // Sem consentimento, o Clarity ja opera em modo "no-consent" (sem cookie,
  // ID novo por pageview) por padrao - so precisamos avisar quando for "granted".
  window.clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: storage });
}

// Google Consent Mode (avancado): https://developers.google.com/tag-platform/security/guides/consent
// O gtag.js sempre carrega (por isso o Google consegue modelar dados
// mesmo sem consentimento, via sinais anonimos sem cookie), mas comeca
// com tudo "denied" - o comando 'consent','default' PRECISA vir antes do
// script do gtag.js. So depois que o visitante aceita e que
// analytics_storage vira "granted" via 'consent','update', e o GA4
// realmente passa a gravar cookie. O Clarity (heatmap/gravacao de sessao)
// segue o mesmo padrao: carrega sempre, mas so grava cookie/sessao
// vinculada apos o consentimento via ConsentV2.
export default function Analytics() {
  const t = useTranslations('cookieBanner');
  const [consent, setConsent] = useState<Consent>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let stored: Consent = null;
    try {
      stored = localStorage.getItem(CONSENT_KEY) as Consent;
    } catch {
      // localStorage indisponivel (modo privado etc.) - trata como sem consentimento
    }
    setConsent(stored);
    setMounted(true);
    if (stored) aplicarConsentimento(stored);
  }, []);

  const responder = (valor: 'accepted' | 'rejected') => {
    try {
      localStorage.setItem(CONSENT_KEY, valor);
    } catch {}
    setConsent(valor);
    aplicarConsentimento(valor);
    // Avisa o VisitTracker (mesma aba - o evento "storage" do navegador so
    // dispara em OUTRAS abas) pra comecar a registrar a visita ja nesta pagina.
    window.dispatchEvent(new Event('bipfix-consentimento'));
  };

  if (!GA_MEASUREMENT_ID && !CLARITY_PROJECT_ID) return null;

  return (
    <>
      {GA_MEASUREMENT_ID && (
        <>
          <Script id="consent-default" strategy="beforeInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('consent', 'default', {
                analytics_storage: 'denied',
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
              });
            `}
          </Script>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}');
            `}
          </Script>
        </>
      )}

      {CLARITY_PROJECT_ID && (
        <Script id="clarity-init" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");
          `}
        </Script>
      )}

      {mounted && consent === null && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg">
          <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center gap-4">
            <p className="text-sm text-gray-600 flex-1">
              {t('texto')}{' '}
              <Link href="/privacidade" className="text-primary-600 hover:underline">{t('linkPrivacidade')}</Link>.
            </p>
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => responder('rejected')} className="btn-secondary !py-2 !px-4 text-sm">
                {t('rejeitar')}
              </button>
              <button onClick={() => responder('accepted')} className="btn-primary !py-2 !px-4 text-sm">
                {t('aceitar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
