'use client';

import { useTranslations } from 'next-intl';

// Perguntas da mudanca de data (migracao 077), iguais no orcamento e na agenda:
//  - a data marcada ainda serve? (se nao, o cliente nao tera "manter a data")
//  - ja combinei com o cliente? (muda na hora; sem marcar, o cliente precisa aceitar)
// Mudanca no MESMO dia so com "ja combinei".
export default function OpcoesMudancaData({ id, serve, setServe, combinado, setCombinado, mesmoDia }: {
  id: string; serve: boolean | null; setServe: (v: boolean) => void; combinado: boolean; setCombinado: (v: boolean) => void; mesmoDia: boolean;
}) {
  const t = useTranslations('agendaMudanca');
  return (
    <div className="space-y-3" data-testid="opcoes-mudanca">
      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-1">{t('dataAtualServe')}</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          <label className="flex min-h-[40px] items-center gap-2 text-sm text-gray-800">
            <input type="radio" id={`${id}-serve-sim`} name={`${id}-serve`} checked={serve === true} onChange={() => setServe(true)} className="h-4 w-4" data-testid="serve-sim" />
            {t('simServe')}
          </label>
          <label className="flex min-h-[40px] items-center gap-2 text-sm text-gray-800">
            <input type="radio" id={`${id}-serve-nao`} name={`${id}-serve`} checked={serve === false} onChange={() => setServe(false)} className="h-4 w-4" data-testid="serve-nao" />
            {t('naoServe')}
          </label>
        </div>
      </fieldset>
      <label className="flex items-start gap-2 text-sm text-gray-800">
        <input type="checkbox" id={`${id}-combinei`} checked={combinado} onChange={(e) => setCombinado(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0" data-testid="ja-combinei" />
        <span>
          <span className="font-medium">{t('combinado')}</span>
          <span className="block text-xs text-gray-600">{combinado ? t('combinadoAjuda') : t('pedirAjuda')}</span>
        </span>
      </label>
      {mesmoDia && !combinado && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900" data-testid="aviso-mesmo-dia">{t('mesmoDia')}</p>}
    </div>
  );
}
