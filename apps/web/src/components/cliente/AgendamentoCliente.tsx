'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { supabase } from '@/lib/supabase';
import { fusoDoPais } from '@/lib/fuso';
import { INTL_LOCALE } from '@/lib/utils';

// Data de entrega do carro na tela do pedido do cliente, lida da AGENDA (pode ter
// mudado depois do aceite: a oficina mudou a data ou o cliente aceitou uma nova
// data - migracao 076). Antes mostrava o horario escolhido no orcamento, que
// ficava velho. Com a observacao de como remarcar ou cancelar (dono 07/11).
export default function AgendamentoCliente({ solicitacaoId, oficinaId, pais, rotuloEntrega, rotuloPrevisao, children }: {
  solicitacaoId: string; oficinaId: string; pais: string | null | undefined;
  rotuloEntrega: string; rotuloPrevisao: string; children?: React.ReactNode;
}) {
  const t = useTranslations('agendaMudanca');
  const locale = useLocale();
  const [ag, setAg] = useState<{ data_inicio: string; data_fim: string | null; data_fim_prevista: string | null; status: string; checkin_em: string | null; entregue_em: string | null } | null | undefined>(undefined);

  useEffect(() => {
    // agendado, em andamento ou concluido: no concluido mostra quando o carro chegou e foi entregue
    supabase.from('agenda').select('data_inicio, data_fim, data_fim_prevista, status, checkin_em, entregue_em').eq('solicitacao_id', solicitacaoId).eq('oficina_id', oficinaId).neq('status', 'cancelado').order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => setAg(((data as any) || [])[0] || null));
  }, [solicitacaoId, oficinaId]);

  if (ag === undefined) return <>{children}</>;
  const fuso = fusoDoPais(pais);
  const loc = INTL_LOCALE[locale] || 'en-GB';
  const prev = ag?.entregue_em || ag?.data_fim_prevista || ag?.data_fim;
  const chegada = ag?.checkin_em || ag?.data_inicio;
  return (
    <>
      {ag ? (
        <div className="mt-3 pt-3 border-t border-green-200 space-y-1 text-sm" data-testid="agendamento-atual">
          <div className="flex justify-between gap-3">
            <span className="text-green-700">{rotuloEntrega}</span>
            <span className="font-medium text-green-900 text-right">{new Date(chegada!).toLocaleString(loc, { timeZone: fuso, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          {prev && (
            <div className="flex justify-between gap-3">
              <span className="text-green-700">{rotuloPrevisao}</span>
              <span className="font-medium text-green-900 text-right">{new Date(prev).toLocaleDateString(loc, { timeZone: fuso, weekday: 'short', day: 'numeric', month: 'short' })}</span>
            </div>
          )}
        </div>
      ) : children}
      {ag?.status === 'agendado' && (
        <div className="mt-3 pt-3 border-t border-green-200" data-testid="nota-remarcar">
          <p className="text-xs text-green-900">{t('notaRemarcar')}</p>
          <Link href={`/cliente/mensagens/${solicitacaoId}?oficina=${oficinaId}`} className="mt-2 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-primary-700 border border-primary-200 hover:bg-primary-50">
            💬 {t('conversar')}
          </Link>
        </div>
      )}
    </>
  );
}
