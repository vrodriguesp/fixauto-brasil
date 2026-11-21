'use client';

import { useLocale, useTranslations } from 'next-intl';
import { INTL_LOCALE } from '@/lib/utils';
import { ehPreferencia, type PreferenciaHorario } from '@/lib/preferencia-horario';
import { textoPreferencia } from '@/components/cliente/PreferenciaHorario';

// 114: "Motorista prefere: ter, qui · a tarde" - no pedido da oficina e ao lado do seletor de datas do orcamento.
// Sem preferencia gravada nao mostra nada (a pergunta ao motorista e opcional).
export default function PreferenciaMotorista({ preferencia, compacto = false, className = '' }: { preferencia: unknown; compacto?: boolean; className?: string }) {
  const t = useTranslations('preferencia');
  const locale = useLocale();
  const intl = INTL_LOCALE[locale] || locale;
  if (!ehPreferencia(preferencia)) return null;
  const texto = textoPreferencia(preferencia as PreferenciaHorario, t, intl);
  if (!texto) return null;
  return (
    <p className={`${compacto ? 'inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900' : 'rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900'} ${className}`} data-testid="preferencia-motorista">
      <span aria-hidden="true">🕒</span> {t('motoristaPrefere', { texto })}
    </p>
  );
}
