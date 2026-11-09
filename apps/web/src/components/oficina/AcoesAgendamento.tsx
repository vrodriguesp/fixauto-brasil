'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { textoErroApi } from '@/lib/erro-api';
import { dataLocalDe, horaLocalDe } from '@/lib/turnos';
import { fusoDoPais } from '@/lib/fuso';
import { useEstadoQueVolta } from '@/hooks/use-estado-que-volta';
import OpcoesMudancaData from './OpcoesMudancaData';

// Agenda da oficina, carro de pedido que ainda nao chegou (dono 07/11):
// "Mudar data" e "Cancelar agendamento", sempre com justificativa curta. O
// servidor avisa o cliente (e-mail com o calendario, aviso e linha no chat).
export default function AcoesAgendamento({ agendaId, dataInicio, pais, aoMudar }: {
  agendaId: string; dataInicio: string; pais: string | null; aoMudar: (aviso: string) => void;
}) {
  const t = useTranslations('agendaMudanca');
  const tErr = useTranslations('erros');
  // formulario aberto volta depois de trocar a lingua (dono 08/11)
  const [modo, setModo] = useEstadoQueVolta<'data' | 'cancelar'>(`agenda-modo:${agendaId}`, null);
  const [data, setData] = useState(dataLocalDe(dataInicio, pais));
  const [hora, setHora] = useState(horaLocalDe(dataInicio, pais) || '08:00');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState('');
  const [serve, setServe] = useState<boolean | null>(null);
  const [combinado, setCombinado] = useState(false);
  const mesmoDia = data === dataLocalDe(dataInicio, pais);

  const enviar = async () => {
    setErro('');
    if (modo === 'data' && serve === null) { setErro(t('escolhaServe')); return; }
    if (modo === 'data' && mesmoDia && hora === horaLocalDe(dataInicio, pais)) { setErro(tErr('DATA_IGUAL_ATUAL')); return; }
    if (modo === 'data' && mesmoDia && !combinado) { setErro(t('mesmoDia')); return; }
    if (motivo.trim().length < 5) { setErro(t('motivoCurto')); return; }
    setEnviando(true);
    const r = await fetch(`/api/agenda/${agendaId}/${modo === 'data' ? 'mudar-data' : 'cancelar'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modo === 'data' ? { data, hora, motivo, dataAtualServe: serve, combinado } : { motivo }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setEnviando(false);
    if (!r?.ok) { setErro(textoErroApi(tErr, r?.status || 500, d)); return; }
    // a agenda recarrega (o cartao pode sumir/mudar de dia): a confirmacao vai para o topo da pagina
    const aviso = t(modo === 'data' ? (d?.aplicada ? 'feitoCombinado' : 'feitoPedido') : 'feitoCancelado');
    setFeito(aviso);
    setModo(null); setMotivo('');
    aoMudar(aviso);
  };

  if (feito) return <p role="status" className="mt-2 rounded-lg bg-green-50 p-2 text-xs text-green-800" data-testid="acao-agenda-feita">{feito}</p>;
  if (!modo) {
    return (
      <div className="flex flex-wrap gap-3 pt-1" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setModo('data')} className="text-xs font-medium text-blue-600 hover:text-blue-700" data-testid="mudar-data">{t('mudarData')}</button>
        <button type="button" onClick={() => setModo('cancelar')} className="text-xs font-medium text-red-600 hover:text-red-700" data-testid="cancelar-agendamento">{t('cancelarAgendamento')}</button>
      </div>
    );
  }
  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2" onClick={(e) => e.stopPropagation()} data-testid={modo === 'data' ? 'form-mudar-data' : 'form-cancelar'}>
      <p className="text-xs text-gray-700">{t(modo === 'data' ? 'mudarDataTexto' : 'cancelarTexto')}</p>
      {modo === 'data' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`md-data-${agendaId}`} className="block text-xs font-medium text-gray-700 mb-1">{t('data')}</label>
            <input id={`md-data-${agendaId}`} type="date" min={new Date().toLocaleDateString('sv-SE', { timeZone: fusoDoPais(pais) })} className="input-field !py-1.5 text-sm" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`md-hora-${agendaId}`} className="block text-xs font-medium text-gray-700 mb-1">{t('hora')}</label>
            <input id={`md-hora-${agendaId}`} type="time" className="input-field !py-1.5 text-sm" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>
      )}
      <div>
        <label htmlFor={`md-motivo-${agendaId}`} className="block text-xs font-medium text-gray-700 mb-1">{t('motivo')}</label>
        <textarea id={`md-motivo-${agendaId}`} rows={2} maxLength={500} className="input-field text-sm" placeholder={t('motivoPlaceholder')} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      {modo === 'data' && <OpcoesMudancaData id={`md-${agendaId}`} serve={serve} setServe={setServe} combinado={combinado} setCombinado={setCombinado} mesmoDia={mesmoDia} />}
      {erro && <p role="alert" className="text-xs text-red-700">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={enviando} onClick={enviar}
          className={`${modo === 'data' ? 'btn-primary' : 'rounded-lg bg-red-600 px-4 text-white font-medium hover:bg-red-700'} !py-1.5 text-sm disabled:opacity-50`}>
          {t(modo === 'data' ? (combinado ? 'enviarCombinado' : 'enviarProposta') : 'cancelarAgendamento')}
        </button>
        <button type="button" onClick={() => { setModo(null); setErro(''); }} className="btn-secondary !py-1.5 text-sm">{t('voltar')}</button>
      </div>
    </div>
  );
}
