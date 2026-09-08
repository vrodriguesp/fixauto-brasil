'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotificacoes } from '@/hooks/use-notificacoes';
import { useAuth } from '@/lib/auth-context';
import type { Notificacao } from '@fixauto/shared';

/** Pra onde levar ao clicar numa notificacao, dependendo do tipo e do papel de quem esta vendo. */
function linkDaNotificacao(n: Notificacao, tipoUsuario?: string): string | null {
  const d = (n.dados || {}) as Record<string, any>;
  const base = tipoUsuario === 'oficina' ? '/oficina' : tipoUsuario === 'loja_pecas' ? '/loja' : '/cliente';

  if (n.tipo === 'nota_interna_veiculo') return '/oficina/veiculos-em-servico';
  if (d.solicitacao_id && tipoUsuario === 'oficina') return `/oficina/solicitacoes/${d.solicitacao_id}`;
  if (d.solicitacao_id) return `${base}/orcamentos/${d.solicitacao_id}`;
  if (d.cotacao_id && tipoUsuario === 'loja_pecas') return '/loja/cotacoes';
  if (d.cotacao_id) return '/oficina/pecas';
  if (d.emergencia_id) return `/emergencia/acidente/${d.emergencia_id}`;
  return null;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function NotificationBell() {
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
        aria-label="Notificações"
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

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notificações</span>
            {unreadCount > 0 && (
              <button onClick={() => markAllRead()} className="text-xs text-primary-600 hover:underline">
                Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="overflow-y-auto">
            {notificacoes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhuma notificação ainda</p>
            ) : (
              notificacoes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClickNotificacao(n)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors ${!n.lida ? 'bg-primary-50/50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${!n.lida ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{n.titulo}</p>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(n.created_at)}</span>
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
