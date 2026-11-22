'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

// Pagina "parar lembretes" (115; bipfix.com/r/<n>?s=<token> -> /<idioma>/lembretes#k=<token>&n=<n>). Sem login.
// Abrir so mostra o pedido ('ver' nao grava): leitores de e-mail e antivirus abrem links antes da pessoa.
// O toque em "Parar lembretes" grava; da para ligar de novo. O link para o pedido (/r/<n>) nunca morre:
// mesmo com o token invalido a pessoa chega ao pedido (pede login).
type Estado = 'carregando' | 'pergunta' | 'pausado' | 'ligado' | 'invalido';

export default function PausarLembretes() {
  const t = useTranslations('lembretesCliente');
  const [estado, setEstado] = useState<Estado>('carregando');
  const [token, setToken] = useState('');
  const [numero, setNumero] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(false);
  const iniciado = useRef(false);

  const chamar = (acao: 'ver' | 'pausar' | 'retomar', k: string, n: string) => fetch('/api/lembretes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k, acao, n }),
  }).then(async (r) => ({ r, d: await r.json().catch(() => ({})) }), () => ({ r: null as Response | null, d: {} as any }));

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    const w = window as unknown as { __lembreteK?: string; __lembreteN?: string };
    const k = w.__lembreteK || (window.location.hash.match(/[#&]k=([A-Za-z0-9_-]+)/) || [])[1] || '';
    const n = w.__lembreteN || (window.location.hash.match(/[#&]n=(\d+)/) || [])[1] || '';
    setToken(k); setNumero(n);
    // o token nao fica no historico nem vai junto se a pessoa compartilhar a pagina
    window.history.replaceState(null, '', window.location.pathname);
    if (!k) { setEstado('invalido'); return; }
    chamar('ver', k, n).then(({ r, d }) => {
      if (!r?.ok) { setEstado('invalido'); return; }
      if (d.numero) setNumero(String(d.numero));
      setEstado(d.pausado ? 'pausado' : 'pergunta');
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const agir = async (acao: 'pausar' | 'retomar') => {
    if (enviando) return;
    setEnviando(true); setErro(false);
    const { r, d } = await chamar(acao, token, numero);
    setEnviando(false);
    if (r?.ok) { setEstado(d.pausado ? 'pausado' : 'ligado'); return; }
    if (d?.codigo === 'LINK_INVALIDO') setEstado('invalido');
    else setErro(true);
  };

  const verPedido = (
    <a href={numero ? `/r/${numero}` : '/'} className="btn-secondary w-full min-h-[44px] inline-flex items-center justify-center" data-testid="lembretes-ver-pedido">
      {numero ? t('verPedido') : t('inicio')}
    </a>
  );

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="card">
        <h1 className="text-xl font-bold text-gray-900 mb-3 break-words">{numero ? t('titulo', { numero }) : t('tituloSemNumero')}</h1>
        {estado === 'carregando' && <div className="animate-pulse h-16 bg-gray-200 rounded-lg" aria-busy="true" />}
        {estado === 'pergunta' && (
          <div className="space-y-3">
            <p className="text-gray-700" data-testid="lembretes-pergunta">{t('pergunta')}</p>
            <p className="text-sm text-gray-500">{t('explica')}</p>
            <button type="button" onClick={() => agir('pausar')} disabled={enviando} aria-busy={enviando} className="btn-primary w-full min-h-[44px] disabled:opacity-50" data-testid="lembretes-pausar">
              {t('pausar')}
            </button>
            {verPedido}
          </div>
        )}
        {(estado === 'pausado' || estado === 'ligado') && (
          <div className="space-y-3">
            <p className="text-gray-700" role="status" data-testid={estado === 'pausado' ? 'lembretes-pausado' : 'lembretes-ligado'}>
              {estado === 'pausado' ? t('pausado') : t('ligado')}
            </p>
            {estado === 'pausado' ? (
              <button type="button" onClick={() => agir('retomar')} disabled={enviando} aria-busy={enviando} className="btn-secondary w-full min-h-[44px] disabled:opacity-50" data-testid="lembretes-retomar">
                {t('retomar')}
              </button>
            ) : (
              <button type="button" onClick={() => agir('pausar')} disabled={enviando} aria-busy={enviando} className="btn-secondary w-full min-h-[44px] disabled:opacity-50" data-testid="lembretes-pausar">
                {t('pausar')}
              </button>
            )}
            {verPedido}
          </div>
        )}
        {estado === 'invalido' && (
          <div className="space-y-3">
            <p className="text-gray-700" role="status" data-testid="lembretes-invalido">{t('invalido')}</p>
            {verPedido}
          </div>
        )}
        {erro && <p role="alert" className="mt-3 text-sm text-red-700">{t('erro')}</p>}
      </div>
    </div>
  );
}
