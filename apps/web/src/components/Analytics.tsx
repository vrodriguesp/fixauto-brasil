'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const CONSENT_KEY = 'bipfix_cookie_consent';

type Consent = 'accepted' | 'rejected' | null;

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

function aplicarConsentimento(valor: 'accepted' | 'rejected') {
  window.gtag?.('consent', 'update', {
    analytics_storage: valor === 'accepted' ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
}

// Google Consent Mode (avancado): https://developers.google.com/tag-platform/security/guides/consent
// O gtag.js sempre carrega (por isso o Google consegue modelar dados
// mesmo sem consentimento, via sinais anonimos sem cookie), mas comeca
// com tudo "denied" - o comando 'consent','default' PRECISA vir antes do
// script do gtag.js. So depois que o visitante aceita e que
// analytics_storage vira "granted" via 'consent','update', e o GA4
// realmente passa a gravar cookie.
export default function Analytics() {
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
  };

  if (!GA_MEASUREMENT_ID) return null;

  return (
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

      {mounted && consent === null && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg">
          <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center gap-4">
            <p className="text-sm text-gray-600 flex-1">
              Usamos cookies para entender como você usa o site e melhorar sua experiência. Ao aceitar, você concorda com nossa{' '}
              <Link href="/privacidade" className="text-primary-600 hover:underline">Política de Privacidade</Link>.
            </p>
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => responder('rejected')} className="btn-secondary !py-2 !px-4 text-sm">
                Rejeitar
              </button>
              <button onClick={() => responder('accepted')} className="btn-primary !py-2 !px-4 text-sm">
                Aceitar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
