'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { fusoDoPais } from '@/lib/fuso';
import { INTL_LOCALE } from '@/lib/utils';

// Resumo do agendamento na tela do pedido da oficina: quando o cliente aceitou, quando o
// carro chega e a previsao de entrega, lidos da AGENDA (a data pode ter mudado depois do
// aceite - proposta aceita ou "Mudar data"), e se ha nova data esperando o cliente.
// Antes a oficina so via o orcamento, sem a confirmacao nem a data atual (dono 08/11).
type Ag = { id: string; data_inicio: string; data_fim: string | null; data_fim_prevista: string | null; status: string; created_at: string; checkin_em: string | null; entregue_em: string | null };

export default function ResumoAgendamento({ solicitacaoId, oficinaId, pais }: { solicitacaoId: string; oficinaId: string; pais: string | null | undefined }) {
  const t = useTranslations('oficinaSolicitacaoDetalhe.resumoAgenda');
  const locale = useLocale();
  const [ag, setAg] = useState<Ag | null>(null);
  const [mudanca, setMudanca] = useState<{ acao: string; created_at: string } | null>(null);
  const [pendente, setPendente] = useState<{ nova_data_checkin: string; novo_turno: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: a } = await supabase.from('agenda')
        .select('id, data_inicio, data_fim, data_fim_prevista, status, created_at, checkin_em, entregue_em')
        .eq('solicitacao_id', solicitacaoId).eq('oficina_id', oficinaId).neq('status', 'cancelado')
        .order('created_at', { ascending: false }).limit(1);
      const linha = (a?.[0] as Ag) || null;
      if (!vivo) return;
      setAg(linha);
      if (!linha) return;
      const [{ data: h }, { data: r }] = await Promise.all([
        supabase.from('agenda_historico').select('acao, created_at').eq('agenda_id', linha.id)
          .in('acao', ['data_proposta_aceita', 'data_mudada']).order('created_at', { ascending: false }).limit(1),
        supabase.from('orcamento_revisoes').select('nova_data_checkin, novo_turno')
          .eq('solicitacao_id', solicitacaoId).eq('oficina_id', oficinaId).eq('tipo', 'data').eq('status', 'pendente').limit(1),
      ]);
      if (!vivo) return;
      setMudanca((h?.[0] as any) || null);
      setPendente((r?.[0] as any) || null);
    })();
    return () => { vivo = false; };
  }, [solicitacaoId, oficinaId]);

  if (!ag) return null;
  const fuso = fusoDoPais(pais);
  const loc = INTL_LOCALE[locale] || 'en-GB';
  const diaHora = (iso: string) => new Date(iso).toLocaleString(loc, { timeZone: fuso, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const dia = (iso: string) => new Date(iso).toLocaleDateString(loc, { timeZone: fuso, weekday: 'short', day: 'numeric', month: 'short' });
  const prev = ag.data_fim_prevista || ag.data_fim;

  return (
    <div className="card border-2 border-emerald-200 bg-emerald-50/40" data-testid="resumo-agendamento">
      <h2 className="font-semibold text-gray-900 mb-1">✔ {t('titulo')}</h2>
      <p className="text-sm text-gray-600 mb-3">{t('aceitoEm', { quando: diaHora(ag.created_at) })}</p>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-gray-600">{ag.checkin_em ? t('chegou') : t('chegada')}</dt>
          <dd className="font-semibold text-gray-900 text-right" data-testid="resumo-chegada">{diaHora(ag.checkin_em || ag.data_inicio)}</dd>
        </div>
        {prev && (
          <div className="flex justify-between gap-3">
            <dt className="text-gray-600">{ag.entregue_em ? t('entregue') : t('previsao')}</dt>
            <dd className="font-medium text-gray-900 text-right">{dia(ag.entregue_em || prev)}</dd>
          </div>
        )}
      </dl>
      {mudanca && (
        <p className="mt-3 text-sm text-gray-700" data-testid="resumo-mudanca">
          {t(mudanca.acao === 'data_proposta_aceita' ? 'mudancaAceita' : 'mudancaOficina', { quando: diaHora(mudanca.created_at) })}
        </p>
      )}
      {pendente && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900" role="status" data-testid="resumo-pendente">
          {t('propostaPendente', { quando: dia(`${pendente.nova_data_checkin}T12:00:00Z`) })}
        </p>
      )}
    </div>
  );
}
