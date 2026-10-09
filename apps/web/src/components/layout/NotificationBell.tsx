'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useNotificacoes } from '@/hooks/use-notificacoes';
import { useAuth } from '@/lib/auth-context';
import { linkDaNotificacao } from '@/lib/link-notificacao';
import type { Notificacao } from '@fixauto/shared';

function timeAgo(iso: string, t: (key: string, values?: Record<string, string | number | Date>) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return t('timeJustNow');
  if (min < 60) return t('timeMinutes', { min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('timeHours', { h });
  return t('timeDays', { d: Math.floor(h / 24) });
}

export default function NotificationBell() {
  const t = useTranslations('notificationBell');
  const { user } = useAuth();
  const { notificacoes, unreadCount, markAsRead, markAllRead } = useNotificacoes();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClickNotificacao = async (n: Notificacao) => {
    if (!n.lida) await markAsRead(n.id);
    const link = linkDaNotificacao(n, user?.tipo);
    setOpen(false);
    if (link) router.push(link);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label={t('ariaLabel')}
      >
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* celular: largura da tela com margem (ancorado no sino, saia pela lateral) */}
      {open && (
        <div className="fixed inset-x-3 top-[4.5rem] max-h-[70dvh] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:max-h-96 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">{t('title')}</span>
            {unreadCount > 0 && (
              <button onClick={() => markAllRead()} className="text-xs text-primary-600 hover:underline">
                {t('markAllRead')}
              </button>
            )}
          </div>
          <div className="overflow-y-auto">
            {notificacoes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">{t('empty')}</p>
            ) : (
              notificacoes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClickNotificacao(n)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors ${!n.lida ? 'bg-primary-50/50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${!n.lida ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{n.titulo}</p>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(n.created_at, t)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.mensagem}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
