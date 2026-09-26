'use client';

import { useTranslations } from 'next-intl';
import { getStatusColor } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const t = useTranslations('constants');
  const sizeClasses = size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  const statusSolicitacao = t.raw('statusSolicitacao') as Record<string, string>;
  const statusOrcamento = t.raw('statusOrcamento') as Record<string, string>;
  const noShow = t.raw('noShow') as Record<string, string>;
  const label = statusSolicitacao[status] || statusOrcamento[status] || noShow[status] || status;

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${getStatusColor(status)} ${sizeClasses}`}>
      {label}
    </span>
  );
}
