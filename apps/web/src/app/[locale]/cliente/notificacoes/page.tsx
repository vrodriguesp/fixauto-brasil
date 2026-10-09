'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useNotificacoes } from '@/hooks/use-notificacoes';
import { linkDaNotificacao } from '@/lib/link-notificacao';
import { timeAgo } from '@fixauto/shared';

// Todos os avisos do cliente (o painel mostra so os 3 ultimos; antes o link
// "Ver todos" levava a uma pagina inexistente - auditoria M8).
export default function NotificacoesClientePage() {
  const t = useTranslations('notificationBell');
  const locale = useLocale();
  const router = useRouter();
  const { notificacoes, markAsRead, markAllRead } = useNotificacoes();
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        {notificacoes.some((n) => !n.lida) && (
          <button type="button" onClick={() => markAllRead()} className="text-sm text-primary-600 hover:underline">{t('markAllRead')}</button>
        )}
      </div>
      {notificacoes.length === 0 ? <p className="text-gray-500 text-center py-12">{t('empty')}</p> : (
        <ul className="space-y-2">
          {notificacoes.map((n) => {
            const link = linkDaNotificacao(n, 'cliente');
            return (
              <li key={n.id}>
                <button type="button" onClick={() => { markAsRead(n.id); if (link) router.push(link as any); }}
                  className={`w-full text-left card !p-4 hover:shadow-md transition-shadow ${n.lida ? '' : 'border-l-4 border-l-primary-500'}`}>
                  <p className={`text-sm ${n.lida ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>{n.titulo}</p>
                  {n.mensagem ? <p className="text-sm text-gray-600 mt-0.5 break-words">{n.mensagem}</p> : null}
                  <p className="text-xs text-gray-400 mt-1">{timeAgo(n.created_at, locale)}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
