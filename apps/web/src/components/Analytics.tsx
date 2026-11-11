'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
// Pixel da Meta (Facebook/Instagram): sem o ID no .env nao carrega nada (dono decide ligar)
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const CONSENT_KEY = 'bipfix_cookie_consent';
// Google Ads (conta 590-930-3617), conversao "Cadastro oficina (BipFix)".
// Identificadores publicos (aparecem no HTML de qualquer forma).
const GOOGLE_ADS_ID = 'AW-18533679702';
const CONVERSAO_CADASTRO = `${GOOGLE_ADS_ID}/C_ZmCI2j8asdENaExoVF`;

type Consent = 'accepted' | 'rejected' | null;

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    clarity?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
  }
}

// Cadastro de oficina/loja aceito pelo servidor. Sem consentimento o gtag
// manda so o sinal anonimo (sem cookie), que o Google usa para estimar.
export function registrarConversaoCadastro() {
  window.gtag?.('event', 'conversion', { send_to: CONVERSAO_CADASTRO });
  window.gtag?.('event', 'sign_up', { method: 'email' });
}

// Areas logadas: o endereco tem numero de pedido/oficina - nao vai para a Meta
const AREA_PRIVADA = /^\/(cliente|oficina|admin|loja)(\/|$)/;

// Anuncios da Meta so na Estonia: o Pixel so nas versoes et/ru/en (/ee/...)
const MERCADO_META = new Set(['et', 'ru', 'en']);

// Pedido enviado (Lead) e cadastro de oficina (CompleteRegistration) para a Meta
// medir e otimizar os anuncios. So existe fbq depois do "Nõustun"; sem dados da pessoa.
export function registrarEventoMeta(evento: 'Lead' | 'CompleteRegistration') {
  window.fbq?.('track', evento);
}

function aplicarConsentimento(valor: 'accepted' | 'rejected') {
  const storage = valor === 'accepted' ? 'granted' : 'denied';
  window.gtag?.('consent', 'update', {
    analytics_storage: storage,
    // aceitar libera tambem a medicao de conversoes do Google Ads (se o
    // clique no anuncio terminou em cadastro), nunca a personalizacao
    ad_storage: storage,
    ad_user_data: storage,
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
  const pathname = usePathname();
  const locale = useLocale();
  const [consent, setConsent] = useState<Consent>(null);
  const [mounted, setMounted] = useState(false);
  const avisoRef = useRef<HTMLDivElement>(null);

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

  // Altura do aviso de cookies em --altura-cookies: o botao do chat de suporte
  // sobe acima dele enquanto a pessoa nao responde (dono 04/11: o aviso tampava o botao).
  const mostrandoAviso = mounted && consent === null && !pathname.startsWith('/emergencia');
  useLayoutEffect(() => { // antes da pintura: o botao do chat nao pisca atras do aviso
    const el = avisoRef.current;
    const raiz = document.documentElement;
    if (!mostrandoAviso || !el) return;
    // do pe da tela ate o topo do aviso (no celular da oficina ele fica acima da barra de baixo)
    const medir = () => raiz.style.setProperty('--altura-cookies', `${Math.max(0, window.innerHeight - el.getBoundingClientRect().top)}px`);
    medir();
    document.body.classList.add('com-aviso-cookies');
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    window.addEventListener('resize', medir);
    // a barra de baixo (classe no body) pode aparecer depois e empurrar o aviso para cima
    const mo = new MutationObserver(() => requestAnimationFrame(medir));
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => { ro.disconnect(); mo.disconnect(); window.removeEventListener('resize', medir); document.body.classList.remove('com-aviso-cookies'); raiz.style.removeProperty('--altura-cookies'); };
  }, [mostrandoAviso]);

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

  if (!GA_MEASUREMENT_ID && !CLARITY_PROJECT_ID && !META_PIXEL_ID) return null;

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
              gtag('config', '${GOOGLE_ADS_ID}', { allow_ad_personalization_signals: false });
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

      {/* Pixel da Meta: diferente do gtag/Clarity, NEM carrega sem o "Nõustun"
          (o aviso de cookies cita "medir nossos anuncios"). autoConfig desligado: a
          Meta nao coleta cliques/textos dos botoes sozinha, so os 3 eventos nossos. */}
      {META_PIXEL_ID && consent === 'accepted' && MERCADO_META.has(locale) && !AREA_PRIVADA.test(pathname) && <MetaPixel id={META_PIXEL_ID} pathname={pathname} />}

      {/* Aviso compacto (Google: banner de cookies "de tamanho razoavel";
          EDPB 05/2020: recusar tao facil quanto aceitar) e ausente no fluxo
          de acidente, onde cobria o formulario e nao ha o que medir. */}
      {mostrandoAviso && (
        <div ref={avisoRef} data-testid="aviso-cookies" className="aviso-cookies fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-4 flex items-center gap-3 sm:gap-4">
            <p className="text-xs sm:text-sm text-gray-700 flex-1 leading-snug">
              {/* celular: uma linha curta (o texto longo cobria metade da tela) */}
              <span className="sm:hidden">{t('textoCurto')}{' '}<Link href="/privacidade" className="text-primary-700 underline">{t('linkCurto')}</Link></span>
              <span className="hidden sm:inline">{t('texto')}{' '}<Link href="/privacidade" className="text-primary-700 underline">{t('linkPrivacidade')}</Link>.</span>
            </p>
            <div className="flex gap-2 sm:gap-3 flex-shrink-0">
              <button onClick={() => responder('rejected')} className="btn-secondary !py-2 !px-3 sm:!px-4 text-sm min-h-[40px]">
                {t('rejeitar')}
              </button>
              <button onClick={() => responder('accepted')} className="btn-primary !py-2 !px-3 sm:!px-4 text-sm min-h-[40px]">
                {t('aceitar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// PageView a cada pagina publica (o site troca de pagina sem recarregar)
function MetaPixel({ id, pathname }: { id: string; pathname: string }) {
  const ultima = useRef(pathname); // a primeira pagina vai no init
  useEffect(() => {
    if (ultima.current === pathname) return; // efeito repetido sem trocar de pagina
    ultima.current = pathname;
    window.fbq?.('track', 'PageView');
  }, [pathname]);
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
        document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('set', 'autoConfig', false, '${id}');
        fbq('init', '${id}');
        fbq('track', 'PageView');
      `}
    </Script>
  );
}
