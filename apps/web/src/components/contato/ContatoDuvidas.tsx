'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

// "Ainda tem duvidas?" (aprovado em 25/10). Formulario em vez de link mailto:
// no navegador de dentro do Facebook/Instagram (de onde vem o trafego dos
// anuncios) o mailto muitas vezes nao abre nada. Messenger e Instagram abrem a
// conversa direto no app que a pessoa ja esta usando.
const MESSENGER = 'https://m.me/61595614083933';
const INSTAGRAM = 'https://ig.me/m/bipfix.official';

export default function ContatoDuvidas() {
  const t = useTranslations('contatoDuvidas');
  const locale = useLocale();
  const [estado, setEstado] = useState<'livre' | 'enviando' | 'ok' | 'erro' | 'campos'>('livre');

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    const nome = String(dados.get('nome') || '').trim();
    const contato = String(dados.get('contato') || '').trim();
    const pergunta = String(dados.get('pergunta') || '').trim();
    if (!nome || !contato || pergunta.length < 3) { setEstado('campos'); return; }
    setEstado('enviando');
    try {
      const res = await fetch('/api/contato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, contato, pergunta, locale, site: dados.get('site') || '', pagina: window.location.pathname }),
      });
      setEstado(res.ok ? 'ok' : 'erro');
    } catch {
      setEstado('erro');
    }
  }

  const campo = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200';

  return (
    <section id="duvidas" className="py-16 bg-white scroll-mt-20">
      <div className="max-w-xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">{t('titulo')}</h2>
        <p className="mt-3 text-gray-600 text-center">{t('texto')}</p>

        {estado === 'ok' ? (
          <p role="status" className="mt-8 rounded-lg bg-green-50 border border-green-200 p-4 text-center font-medium text-green-800">{t('sucesso')}</p>
        ) : (
          <form onSubmit={enviar} className="mt-8 space-y-3" noValidate>
            <label className="block">
              <span className="sr-only">{t('nome')}</span>
              <input id="duvida-nome" name="nome" autoComplete="name" maxLength={100} placeholder={t('nome')} className={campo} />
            </label>
            <label className="block">
              <span className="sr-only">{t('contato')}</span>
              <input id="duvida-contato" name="contato" autoComplete="email" maxLength={254} placeholder={t('contato')} className={campo} />
            </label>
            <label className="block">
              <span className="sr-only">{t('pergunta')}</span>
              <textarea id="duvida-pergunta" name="pergunta" rows={4} maxLength={2000} placeholder={t('pergunta')} className={campo} />
            </label>
            {/* campo isca contra robos: pessoas nao veem nem preenchem */}
            <input type="text" name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
            {(estado === 'erro' || estado === 'campos') && (
              <p role="alert" className="text-sm text-red-600">{estado === 'campos' ? t('erroCampos') : t('erro')}</p>
            )}
            <button type="submit" disabled={estado === 'enviando'} className="btn-primary w-full py-3 text-base disabled:opacity-60">
              {estado === 'enviando' ? t('enviando') : t('enviar')}
            </button>
            <p className="text-xs text-gray-500 text-center">
              {t('privacidade')} <Link href="/privacidade" className="underline">{t('privacidadeLink')}</Link>
            </p>
          </form>
        )}

        <div className="mt-8 flex items-center gap-3 text-sm text-gray-500">
          <span className="h-px flex-1 bg-gray-200" />{t('redes')}<span className="h-px flex-1 bg-gray-200" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <a href={MESSENGER} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 py-3 font-semibold text-gray-800 hover:bg-gray-50">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#0866FF" aria-hidden="true"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.14.26.35.27.57l.05 1.78a.8.8 0 0 0 1.12.71l1.99-.88a.8.8 0 0 1 .53-.04c.91.25 1.88.39 2.9.39 5.64 0 10-4.13 10-9.7S17.64 2 12 2Zm6 7.46-2.94 4.66a1.5 1.5 0 0 1-2.17.4l-2.34-1.75a.6.6 0 0 0-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63l2.94-4.66a1.5 1.5 0 0 1 2.17-.4l2.34 1.75a.6.6 0 0 0 .72 0l3.16-2.4c.42-.32.97.18.69.63Z" /></svg>
            Messenger
          </a>
          <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 py-3 font-semibold text-gray-800 hover:bg-gray-50">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E1306C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.6" cy="6.4" r="1" fill="#E1306C" stroke="none" /></svg>
            Instagram
          </a>
        </div>
        <p className="mt-4 text-center text-sm text-gray-500">support@bipfix.com</p>
      </div>
    </section>
  );
}
