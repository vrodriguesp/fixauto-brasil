'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { textoErroApi } from '@/lib/erro-api';

export default function SejaParceiroPage() {
  const t = useTranslations('sejaParceiro');
  const tErros = useTranslations('erros');
  const [tipo, setTipo] = useState<'oficina' | 'loja_pecas'>('oficina');
  const [nomeResponsavel, setNomeResponsavel] = useState('');
  const [nomeNegocio, setNomeNegocio] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeResponsavel || !nomeNegocio || !cidade || !estado || !whatsapp) {
      setErro(t('erroObrigatorio'));
      return;
    }
    setErro('');
    setEnviando(true);
    const res = await fetch('/api/leads-parceiros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, nomeResponsavel, nomeNegocio, cidade, estado, whatsapp, email, observacao }),
    });
    setEnviando(false);
    if (res.ok) {
      setEnviado(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setErro(textoErroApi(tErros, res.status, data));
    }
  };

  if (enviado) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{t('sucessoTitulo')}</h1>
          <p className="text-gray-600 leading-relaxed">{t('sucessoTexto')}</p>
          <Link href="/" className="inline-block mt-8 text-primary-600 font-medium hover:underline">
            {t('voltarInicio')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <span className="inline-block bg-white/15 text-white text-xs font-semibold px-3 py-1 rounded-full mb-5 tracking-wide">
            {t('heroTag')}
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{t('heroTitulo')}</h1>
          <p className="mt-5 text-lg text-white leading-relaxed max-w-2xl mx-auto">{t('heroTexto')}</p>
        </div>
      </section>

      {/* Por que agora */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">{t('beneficiosTitulo')}</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <Benefit title={t('beneficio1Titulo')} text={t('beneficio1Texto')} />
            <Benefit title={t('beneficio2Titulo')} text={t('beneficio2Texto')} />
            <Benefit title={t('beneficio3Titulo')} text={t('beneficio3Texto')} />
          </div>
        </div>
      </section>

      {/* O que acontece depois + quem esta por tras (auditoria 30/09, 8.3) */}
      <section className="pb-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{t('depoisTitulo')}</h2>
            <ol className="space-y-3">
              {[t('depois1'), t('depois2'), t('depois3')].map((passo, i) => (
                <li key={i} className="flex gap-3 text-gray-700">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-600 text-white text-sm font-bold flex items-center justify-center">{i + 1}</span>
                  <span>{passo}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{t('quemSomosTitulo')}</h2>
            <p className="text-gray-700 leading-relaxed">{t('quemSomosTexto')}</p>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-1">{t('formTitulo')}</h2>
            <p className="text-sm text-gray-500 mb-6">{t('formSubtitulo')}</p>

            {erro && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-800">{erro}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipo('oficina')}
                  className={`py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${tipo === 'oficina' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600'}`}
                >
                  {t('souOficina')}
                </button>
                <button
                  type="button"
                  onClick={() => setTipo('loja_pecas')}
                  className={`py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${tipo === 'loja_pecas' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600'}`}
                >
                  {t('souLoja')}
                </button>
              </div>

              <div>
                <label htmlFor="c931f-1" className="block text-sm font-medium text-gray-700 mb-1">{t('campoResponsavel')} *</label>
                <input id="c931f-1" type="text" className="input-field" value={nomeResponsavel} onChange={(e) => setNomeResponsavel(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="c931f-2" className="block text-sm font-medium text-gray-700 mb-1">{t('campoNegocio')} *</label>
                <input id="c931f-2" type="text" className="input-field" placeholder={tipo === 'oficina' ? t('placeholderNegocioOficina') : t('placeholderNegocioLoja')} value={nomeNegocio} onChange={(e) => setNomeNegocio(e.target.value)} required />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label htmlFor="c931f-3" className="block text-sm font-medium text-gray-700 mb-1">{t('campoCidade')} *</label>
                  <input id="c931f-3" type="text" className="input-field" placeholder={t('placeholderCidade')} value={cidade} onChange={(e) => setCidade(e.target.value)} required />
                </div>
                <div>
                  <label htmlFor="c931f-4" className="block text-sm font-medium text-gray-700 mb-1">{t('campoRegiao')} *</label>
                  <input id="c931f-4" type="text" className="input-field" placeholder={t('placeholderRegiao')} value={estado} onChange={(e) => setEstado(e.target.value)} required />
                </div>
              </div>
              <div>
                <label htmlFor="c931f-5" className="block text-sm font-medium text-gray-700 mb-1">{t('campoWhatsapp')} *</label>
                <input id="c931f-5" type="tel" className="input-field" placeholder={t('placeholderWhatsapp')} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="c931f-6" className="block text-sm font-medium text-gray-700 mb-1">{t('campoEmail')}</label>
                <input id="c931f-6" type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label htmlFor="c931f-7" className="block text-sm font-medium text-gray-700 mb-1">{t('campoObservacao')}</label>
                <textarea id="c931f-7" className="input-field" rows={2} placeholder={t('placeholderObservacao')} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
              </div>

              <button type="submit" disabled={enviando} className="btn-primary w-full disabled:opacity-50">
                {enviando ? t('enviando') : t('enviar')}
              </button>
              <p className="text-xs text-gray-600 text-center">
                {t('concordaTermos')}{' '}
                <Link href="/termos" target="_blank" className="underline">{t('termosDeUso')}</Link>.
              </p>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}

function Benefit({ title, text }: { title: string; text: string }) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center mx-auto mb-3 text-primary-600">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h3 className="font-semibold text-gray-900 mb-1.5">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{text}</p>
    </div>
  );
}
