'use client';

import { useTranslations } from 'next-intl';
import { usaSeguro } from '@/lib/seguro-reparo';

// Na tela da oficina: quem paga o reparo e o que isso muda no orcamento.
export default function SeguroDoPedido({ sol }: { sol: { pagamento_reparo?: string | null; seguradora?: string | null; sinistro_numero?: string | null; franquia?: number | null } }) {
  const t = useTranslations('seguroReparo');
  const p = sol.pagamento_reparo;
  if (!p) return null;
  const seguro = usaSeguro(p);
  return (
    <div className={`rounded-lg border p-4 mb-6 ${seguro ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
      <h3 className="font-semibold text-gray-900 text-sm mb-2">{seguro ? '🛡️ ' : ''}{t('oficinaTitulo')}</h3>
      <dl className="text-sm space-y-1">
        <div><dt className="inline text-gray-500">{t('labelPagamento')}: </dt><dd className="inline font-medium text-gray-900">{t(`opcao_${p}`)}</dd></div>
        {seguro && sol.seguradora && <div><dt className="inline text-gray-500">{t('labelSeguradora')}: </dt><dd className="inline text-gray-900">{sol.seguradora}</dd></div>}
        {seguro && <div><dt className="inline text-gray-500">{t('labelSinistro')}: </dt><dd className="inline text-gray-900 break-all">{sol.sinistro_numero || t('aindaSemNumero')}</dd></div>}
        {p === 'seguro_proprio' && sol.franquia != null && <div><dt className="inline text-gray-500">{t('labelFranquiaCliente')}: </dt><dd className="inline text-gray-900">{sol.franquia}</dd></div>}
      </dl>
      <p className="text-xs text-gray-700 mt-3">{t(seguro ? 'oficinaDica_seguro' : `oficinaDica_${p}`)}</p>
    </div>
  );
}
