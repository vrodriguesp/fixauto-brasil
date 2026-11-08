'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { textoErroApi } from '@/lib/erro-api';
import { fusoDoPais } from '@/lib/fuso';
import { INTL_LOCALE } from '@/lib/utils';

// Orcamento aceito, carro ainda nao chegou: a oficina propoe uma nova data de
// entrega com justificativa (dono 07/11; /api/orcamento-revisao/data). O cliente
// aceita (a agenda muda) ou mantem a data atual. Some depois do check-in.
export default function ProporNovaData({ orcamentoId, solicitacaoId, oficinaId, pais, aoEnviar }: {
  orcamentoId: string; solicitacaoId: string; oficinaId: string; pais: string | null | undefined; aoEnviar?: (d: { data: string; turno: 'manha' | 'tarde' }) => void;
}) {
  const t = useTranslations('agendaMudanca');
  const tErr = useTranslations('erros');
  const locale = useLocale();
  const [atual, setAtual] = useState<string | null>(null);
  const [data, setData] = useState('');
  const [turno, setTurno] = useState<'manha' | 'tarde'>('manha');
  const [previsao, setPrevisao] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(false);

  useEffect(() => {
    supabase.from('agenda').select('data_inicio').eq('solicitacao_id', solicitacaoId).eq('oficina_id', oficinaId).eq('status', 'agendado').maybeSingle()
      .then(({ data: ag }) => setAtual((ag as any)?.data_inicio || null));
  }, [solicitacaoId, oficinaId]);

  if (!atual) return null;
  if (feito) return <p role="status" className="card mb-6 bg-green-50 text-green-800" data-testid="nova-data-enviada">{t('propostaEnviada')}</p>;

  // "hoje" no fuso da oficina (de madrugada em Tallinn o UTC ainda e ontem)
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: fusoDoPais(pais) });
  const quando = new Date(atual).toLocaleString(INTL_LOCALE[locale] || 'en-GB', { timeZone: fusoDoPais(pais), weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  const enviar = async () => {
    setErro('');
    if (motivo.trim().length < 5) { setErro(t('motivoCurto')); return; }
    setEnviando(true);
    const r = await fetch('/api/orcamento-revisao/data', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orcamentoId, data, turno, previsao: previsao || null, motivo }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setEnviando(false);
    if (!r?.ok) { setErro(textoErroApi(tErr, r?.status || 500, d)); return; }
    setFeito(true);
    aoEnviar?.({ data, turno });
  };

  return (
    <section className="card mb-6 border border-blue-200 bg-blue-50/50" data-testid="propor-nova-data" aria-labelledby="nova-data-titulo">
      <h2 id="nova-data-titulo" className="text-lg font-semibold text-gray-900">📅 {t('propostaTitulo')}</h2>
      <p className="mt-1 text-sm text-gray-700">{t('propostaTexto')}</p>
      <p className="mt-2 text-sm font-medium text-gray-900">{t('dataAtual', { quando })}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="nd-data" className="block text-sm font-medium text-gray-700 mb-1">{t('novaData')}</label>
          <input id="nd-data" type="date" min={hoje} className="input-field" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div>
          <label htmlFor="nd-turno" className="block text-sm font-medium text-gray-700 mb-1">{t('turno')}</label>
          <select id="nd-turno" className="input-field" value={turno} onChange={(e) => setTurno(e.target.value as 'manha' | 'tarde')}>
            <option value="manha">{t('manha')}</option>
            <option value="tarde">{t('tarde')}</option>
          </select>
        </div>
        <div>
          <label htmlFor="nd-previsao" className="block text-sm font-medium text-gray-700 mb-1">{t('previsao')}</label>
          <input id="nd-previsao" type="date" min={data || hoje} className="input-field" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
        </div>
      </div>
      <label htmlFor="nd-motivo" className="mt-3 block text-sm font-medium text-gray-700 mb-1">{t('motivo')}</label>
      <textarea id="nd-motivo" rows={2} maxLength={1000} className="input-field" placeholder={t('motivoPlaceholder')} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      {erro && <p role="alert" className="mt-2 text-sm text-red-700">{erro}</p>}
      <button type="button" disabled={enviando || !data} onClick={enviar} className="btn-primary mt-3 w-full sm:w-auto disabled:opacity-50">{t('enviarProposta')}</button>
    </section>
  );
}
