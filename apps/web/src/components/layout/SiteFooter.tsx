'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, rota } from '@/i18n/navigation';
import { HREFLANG, MERCADOS, caminhoNoIdioma, rotuloVersao, type Locale } from '@/i18n/routing';
import { lembrarIdioma } from '@/lib/idioma-escolhido';
import { useParams } from 'next/navigation';

// Versoes = pais + idioma ("Eesti · Русский", "Italia · Italiano")

// Paineis logados: o rodape publico so atrapalha ali.
const AREAS_PRIVADAS = ['/cliente', '/oficina', '/loja', '/definir-senha'];

// Rodape de todas as paginas publicas. Alem de navegacao para pessoas, e o
// principal caminho de links internos para buscadores e IAs: toda pagina
// publica aponta para as paginas-chave e para as versoes nos outros idiomas
// (links <a hreflang> reais, nao botoes).
export default function SiteFooter({ temOficinas = false }: { temOficinas?: boolean }) {
  const t = useTranslations('home');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const params = useParams() as Record<string, string>;

  if (AREAS_PRIVADAS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null;

  return (
    <footer className="bg-gray-900 text-gray-400 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <Link href="/" className="flex items-center gap-2 mb-4">
              <span className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">BF</span>
              <span className="text-xl font-bold text-white">
                Bip<span className="text-primary-400">Fix</span>
              </span>
            </Link>
            <p className="text-sm">{t('footerTagline')}</p>
          </div>
          <nav aria-label={t('footerMotoristas')}>
            <h2 className="text-white font-semibold mb-3 text-base">{t('footerMotoristas')}</h2>
            <ul className="space-y-2 text-sm">
              <li><Link href={rota('/cadastro', undefined, { tipo: 'cliente' })} className="inline-block py-1.5 hover:text-white">{t('footerCriarConta')}</Link></li>
              <li><Link href="/emergencia" className="inline-block py-1.5 hover:text-white">{t('footerAcabeiDeBater')}</Link></li>
              {temOficinas && <li><Link href="/oficinas" className="inline-block py-1.5 hover:text-white">{t('footerVerOficinas')}</Link></li>}
              <li><Link href="/docs/cliente" className="inline-block py-1.5 hover:text-white">{t('footerComoFunciona')}</Link></li>
              <li><Link href="/guias" className="inline-block py-1.5 hover:text-white">{t('footerGuias')}</Link></li>
              <li><Link href="/sobre" className="inline-block py-1.5 hover:text-white">{t('footerSobre')}</Link></li>
            </ul>
          </nav>
          <nav aria-label={t('footerOficinas')}>
            <h2 className="text-white font-semibold mb-3 text-base">{t('footerOficinas')}</h2>
            <ul className="space-y-2 text-sm">
              <li><Link href="/para-oficinas" className="inline-block py-1.5 hover:text-white">{t('footerSistemaGestao')}</Link></li>
              <li><Link href="/seja-parceiro" className="inline-block py-1.5 hover:text-white">{t('footerSejaParceiro')}</Link></li>
              <li><Link href="/docs/oficina" className="inline-block py-1.5 hover:text-white">{t('footerGuiaOficina')}</Link></li>
              <li><Link href="/docs" className="inline-block py-1.5 hover:text-white">{t('footerCentralAjuda')}</Link></li>
            </ul>
          </nav>
          <div>
            <h2 className="text-white font-semibold mb-3 text-base">{t('footerContato')}</h2>
            <ul className="space-y-2 text-sm">
              <li><a href="mailto:support@bipfix.com" className="inline-block py-1.5 hover:text-white">support@bipfix.com</a></li>
            </ul>
            {/* perfis oficiais (os mesmos do sameAs da Organization em [locale]/layout.tsx) */}
            <div className="flex gap-3 mt-3">
              <a href="https://www.youtube.com/@BipFix" target="_blank" rel="noopener noreferrer me" aria-label="YouTube" className="p-2 -ml-2 hover:text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" /></svg>
              </a>
              <a href="https://www.facebook.com/people/BipFix/61595614083933/" target="_blank" rel="noopener noreferrer me" aria-label="Facebook" className="p-2 hover:text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z" /></svg>
              </a>
              <a href="https://www.instagram.com/bipfix.official/" target="_blank" rel="noopener noreferrer me" aria-label="Instagram" className="p-2 hover:text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.6" cy="6.4" r="1" fill="currentColor" stroke="none" /></svg>
              </a>
            </div>
          </div>
        </div>

        <nav aria-label="Language" className="border-t border-gray-800 mt-8 pt-6">
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
            {MERCADOS.flatMap((m) => m.locales).map((l) => (
              <li key={l}>
                <a
                  href={caminhoNoIdioma(l, pathname, params)}
                  onClick={() => lembrarIdioma(l)}
                  hrefLang={HREFLANG[l]}
                  lang={HREFLANG[l]}
                  aria-current={l === locale ? 'true' : undefined}
                  className={l === locale ? 'text-white' : 'hover:text-white'}
                >
                  {rotuloVersao(l)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-gray-800 mt-6 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center text-sm">
          <p>{t('footerDireitos')}</p>
          <div className="flex gap-4">
            <Link href="/termos" className="inline-block py-1.5 hover:text-white">{t('footerTermos')}</Link>
            <Link href="/privacidade" className="inline-block py-1.5 hover:text-white">{t('footerPrivacidade')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
