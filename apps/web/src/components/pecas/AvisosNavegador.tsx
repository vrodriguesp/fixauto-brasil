'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { pushSuportado, iosSemPwa, inscricaoAtual, ligarAvisos, desligarAvisos } from '@/lib/push-navegador-cliente';

// Lote 3c de pecas (N-2, D-8): "Avisos no navegador" no perfil da loja e da oficina, so com a tela nova.
// A permissao so e pedida no clique (o Safari exige o gesto). Recusada -> como reativar. iPhone/iPad so
// recebe com o app instalado na tela de inicio (iOS 16.4+). O e-mail continua sendo o canal garantido.
type Estado = 'carregando' | 'ligado' | 'desligado' | 'negado' | 'sem_suporte';

export default function AvisosNavegador() {
  const t = useTranslations('pecas');
  const [estado, setEstado] = useState<Estado>('carregando');
  const [publicKey, setPublicKey] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(false);
  const ios = typeof window !== 'undefined' && iosSemPwa();

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await fetch('/api/push/navegador', { cache: 'no-store' }).catch(() => null);
      const j = r?.ok ? await r.json().catch(() => null) : null;
      if (!vivo) return;
      setPublicKey(j?.publicKey || '');
      if (!pushSuportado() || !j?.publicKey) { setEstado('sem_suporte'); return; }
      if (Notification.permission === 'denied') { setEstado('negado'); return; }
      const sub = await inscricaoAtual();
      if (vivo) setEstado(sub && j?.ativo ? 'ligado' : 'desligado');
    })();
    return () => { vivo = false; };
  }, []);

  const ligar = async () => {
    setOcupado(true); setErro(false);
    const r = await ligarAvisos(publicKey);
    setOcupado(false);
    if (r === 'ok') setEstado('ligado');
    else if (r === 'negado') setEstado('negado');
    else setErro(true);
  };
  const desligar = async () => {
    setOcupado(true); setErro(false);
    await desligarAvisos();
    setOcupado(false);
    setEstado('desligado');
  };

  return (
    <div className="card mt-6 space-y-2">
      <h2 className="font-semibold text-gray-900">{t('push.titulo')}</h2>
      <p data-testid="push-estado" className="text-sm text-gray-700">
        {estado === 'ligado' ? t('push.ligado') : estado === 'negado' ? t('push.negado') : estado === 'sem_suporte' ? t('push.semSuporte') : t('push.desligado')}
      </p>
      {ios && <p data-testid="push-ios-dica" className="text-xs text-gray-500">{t('push.iosDica')}</p>}
      {estado === 'desligado' && <button type="button" data-testid="push-ligar" disabled={ocupado} onClick={ligar} className="btn-primary !py-1.5 !px-3 text-sm disabled:opacity-50">{t('push.ligar')}</button>}
      {estado === 'ligado' && <button type="button" data-testid="push-desligar" disabled={ocupado} onClick={desligar} className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">{t('push.desligar')}</button>}
      {erro && <p role="alert" className="text-sm text-red-700">{t('erroAcao')}</p>}
      <p className="text-xs text-gray-500">{t('push.ajuda')}</p>
    </div>
  );
}
