'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

interface SlotOption {
  id: string;
  data_checkin: string;
  turno: 'manha' | 'tarde';
  data_previsao_entrega: string;
}

export default function ReagendarPage() {
  const t = useTranslations('clienteReagendar');
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const agendaId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [agenda, setAgenda] = useState<any>(null);
  const [disponibilidade, setDisponibilidade] = useState<SlotOption[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  useEffect(() => {
    if (!agendaId) return;

    async function fetchData() {
      setLoading(true);

      // Fetch agenda with solicitacao and veiculo
      const { data: agendaData } = await supabase
        .from('agenda')
        .select('*, solicitacao:solicitacoes(*, veiculo:veiculos(*), orcamentos(*, disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(*)))')
        .eq('id', agendaId)
        .single();

      if (!agendaData) {
        setError(t('appointmentNotFound'));
        setLoading(false);
        return;
      }

      setAgenda(agendaData);

      // Get disponibilidade from the accepted orcamento
      const orcamento = agendaData.solicitacao?.orcamentos?.find(
        (o: any) => o.status === 'aceito'
      );

      if (orcamento?.disponibilidade) {
        // Filter out past dates and the current appointment date
        const now = new Date();
        const currentDate = agendaData.data_inicio?.slice(0, 10);
        const futureSlots = orcamento.disponibilidade.filter((s: SlotOption) => {
          const slotDate = new Date(s.data_checkin);
          return slotDate > now && s.data_checkin !== currentDate;
        });
        setDisponibilidade(futureSlots);
      }

      setLoading(false);
    }

    fetchData();
  }, [agendaId]);

  const handleReagendar = async () => {
    if (!selectedSlot || !agenda) return;

    setSubmitting(true);
    setError('');

    const slot = disponibilidade.find((s) => s.id === selectedSlot);
    if (!slot) {
      setError(t('selectValidTime'));
      setSubmitting(false);
      return;
    }

    const horaInicio = slot.turno === 'manha' ? '08:00' : '13:00';
    const horaFim = slot.turno === 'manha' ? '12:00' : '18:00';

    // Update agenda with new dates, reset no_show
    const { error: updateError } = await supabase
      .from('agenda')
      .update({
        data_inicio: `${slot.data_checkin}T${horaInicio}:00Z`,
        data_fim: `${slot.data_previsao_entrega}T${horaFim}:00Z`,
        no_show: false,
        no_show_registrado_em: null,
      })
      .eq('id', agendaId);

    if (updateError) {
      setError(t('errorRescheduling'));
      setSubmitting(false);
      return;
    }

    // Update no_show_historico to mark as reagendado
    await supabase
      .from('no_show_historico')
      .update({ reagendado: true, reagendado_em: new Date().toISOString() })
      .eq('agenda_id', agendaId)
      .eq('reagendado', false);

    setSuccess(true);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">{t('loading')}</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="card p-8">
          <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t('rescheduleConfirmedTitle')}</h2>
          <p className="text-gray-600 mb-6">{t('newTimeRegistered')}</p>
          <Link href="/cliente/dashboard" className="btn-primary">
            {t('backToPanel')}
          </Link>
        </div>
      </div>
    );
  }

  const sol = agenda?.solicitacao;
  const v = sol?.veiculo;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/cliente/dashboard" className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('back')}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('pageTitle')}</h1>
      <p className="text-gray-600 mb-6">{t('pageSubtitle')}</p>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 mb-6">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Current appointment info */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">{t('currentAppointmentTitle')}</h2>
        {v && (
          <p className="text-sm text-gray-700 mb-1">
            {v.fipe_marca} {v.fipe_modelo}{v.placa ? ` - ${v.placa}` : ''}
          </p>
        )}
        <p className="text-sm text-gray-600">
          {t('originalDate', { date: new Date(agenda.data_inicio).toLocaleDateString(locale) })}
        </p>
        {agenda.no_show && (
          <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
            </svg>
            {t('noShowRegistered')}
          </div>
        )}
      </div>

      {/* Slot selection */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">{t('chooseNewDateTitle')}</h2>
        {disponibilidade.length === 0 ? (
          <p className="text-sm text-gray-500">
            {t('noDatesAvailable')}
          </p>
        ) : (
          <div className="space-y-2">
            {disponibilidade.map((slot) => (
              <label
                key={slot.id}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedSlot === slot.id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="slot"
                    value={slot.id}
                    checked={selectedSlot === slot.id}
                    onChange={() => setSelectedSlot(slot.id)}
                    className="text-primary-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(slot.data_checkin + 'T12:00:00').toLocaleDateString(locale, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t('shiftLabel', { shift: slot.turno === 'manha' ? t('morningShift') : t('afternoonShift') })}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  {t('deliveryForecastInline', { date: new Date(slot.data_previsao_entrega + 'T12:00:00').toLocaleDateString(locale) })}
                </p>
              </label>
            ))}
          </div>
        )}
      </div>

      {disponibilidade.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleReagendar}
            disabled={!selectedSlot || submitting}
            className="btn-primary disabled:opacity-50"
          >
            {submitting ? t('rescheduling') : t('confirmReschedule')}
          </button>
        </div>
      )}
    </div>
  );
}
