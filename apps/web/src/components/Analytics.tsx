'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const CONSENT_KEY = 'bipfix_cookie_consent';

type Consent = 'accepted' | 'rejected' | null;

// Le o consentimento salvo e so carrega o GA4 depois de "Aceitar" - sem
// isso o rastreamento comecava antes de qualquer consentimento, o que a
// LGPD nao permite pra cookies nao essenciais.
export default function Analytics() {
  const [consent, setConsent] = useState<Consent>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      setConsent(localStorage.getItem(CONSENT_KEY) as Consent);
    } catch {
      // localStorage indisponivel (modo privado etc.) - trata como sem consentimento
    }
    setMounted(true);
  }, []);

  const responder = (valor: 'accepted' | 'rejected') => {
    try {
      localStorage.setItem(CONSENT_KEY, valor);
    } catch {}
    setConsent(valor);
  };

  return (
    <>
      {GA_MEASUREMENT_ID && consent === 'accepted' && (
        <>
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
