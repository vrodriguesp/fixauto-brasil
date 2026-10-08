'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

interface Pendente { solicitacaoId: string; oficina: string }

// Servico entregue sem avaliacao (como no Uber): aviso fixo no painel ate o
// cliente avaliar. Com `bloqueio`, toma o lugar do formulario de pedido novo
// (o banco tambem recusa - tem_avaliacao_pendente); o acidente nao e bloqueado.
export function useAvaliacaoPendente(versao = 0) {
  const { user } = useAuth();
  const [pendente, setPendente] = useState<Pendente | null | undefined>(undefined);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase.from('solicitacoes')
        .select('id, created_at, orcamentos(status, oficina:oficinas(nome_fantasia)), avaliacoes(id)')
        .eq('cliente_id', user.id).eq('status', 'concluida').order('created_at', { ascending: false });
      if (error) { setPendente(null); return; }
      const s = ((data || []) as any[]).find((x) => !(x.avaliacoes || []).length && (x.orcamentos || []).some((o: any) => o.status === 'aceito'));
      setPendente(s ? { solicitacaoId: s.id, oficina: s.orcamentos.find((o: any) => o.status === 'aceito')?.oficina?.nome_fantasia || '' } : null);
    })();
  }, [user, versao]);
  return pendente;
}

export default function AvaliacaoPendente({ bloqueio = false, pendente }: { bloqueio?: boolean; pendente?: Pendente | null }) {
  const t = useTranslations('avaliacaoPendente');
  const proprio = useAvaliacaoPendente();
  const p = pendente !== undefined ? pendente : proprio;
  if (!p) return null;
  const link = `/cliente/orcamentos/${p.solicitacaoId}#avaliar`;
  if (bloqueio) {
    return (
      <div className="card text-center py-10 border-l-4 border-l-amber-500">
        <p className="text-4xl mb-3">⭐</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">{t('bloqueioTitulo')}</h2>
        <p className="text-gray-600 mb-6 max-w-md mx-auto">{t('bloqueio')}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href={link} className="btn-primary">{t('avaliarAgora')} · {p.oficina}</Link>
          <Link href="/emergencia" className="btn-secondary text-red-700">{t('acidente')}</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="card mb-8 border-l-4 border-l-amber-500 bg-amber-50 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <p className="font-semibold text-amber-900">⭐ {t('titulo', { oficina: p.oficina })}</p>
        <p className="text-sm text-amber-800">{t('texto')}</p>
      </div>
      <Link href={link} className="btn-primary text-center">{t('avaliarAgora')}</Link>
    </div>
  );
}
