'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { paisDoAparelho } from '@/lib/seguro-reparo';

// Termos/privacidade valem pelo PAIS de quem usa (Brasil: LGPD/CDC; Europa:
// GDPR), nao pelo idioma. A pagina mostra a versao do mercado do idioma; se o
// aparelho esta no outro lado, oferece a versao certa (sem redirecionar).
export default function AvisoJurisdicao({ versao, caminho }: { versao: 'br' | 'eu'; caminho: string }) {
  const t = useTranslations('avisoJurisdicao');
  const [outra, setOutra] = useState<'br' | 'eu' | null>(null);
  useEffect(() => {
    const p = paisDoAparelho();
    if (!p) return;
    if (versao === 'br' && p !== 'BR') setOutra('eu');
    if (versao === 'eu' && p === 'BR') setOutra('br');
  }, [versao]);
  return (
    <div className="mb-6 space-y-2">
      <p className="text-xs text-gray-500">{t(versao === 'br' ? 'versaoBrasil' : 'versaoEuropa')} · <a href={`${caminho}?regiao=${versao === 'br' ? 'eu' : 'br'}`} className="underline">{t(versao === 'br' ? 'verEuropa' : 'verBrasil')}</a></p>
      {outra && (
        <p role="note" className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3">
          {t(outra === 'eu' ? 'avisoEuropa' : 'avisoBrasil')} <a href={`${caminho}?regiao=${outra}`} className="font-medium underline">{t(outra === 'eu' ? 'verEuropa' : 'verBrasil')}</a>
        </p>
      )}
    </div>
  );
}
