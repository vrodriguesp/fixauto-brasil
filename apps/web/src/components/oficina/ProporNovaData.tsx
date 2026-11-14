'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { textoErroApi } from '@/lib/erro-api';
import { fusoDoPais } from '@/lib/fuso';
import { horaLocalDe, textoDaAgenda, turnoDaJanela, type ContextoOficina } from '@/lib/turnos';
import { INTL_LOCALE } from '@/lib/utils';
import OpcoesMudancaData from './OpcoesMudancaData';
import SeletorCheckin, { type LinhaCheckin } from './SeletorCheckin';

// Orcamento aceito, carro ainda nao chegou: a oficina propoe uma nova data de
// entrega com justificativa (dono 07/11; /api/orcamento-revisao/data). O cliente
// aceita (a agenda muda) ou mantem a data atual. Some depois do check-in.
// Check-in v2: dia + faixa no MESMO seletor do orcamento (mini calendario, dias fechados desativados);
// a janela escolhida vira data_inicio + checkin_ate da agenda (e o e-mail/.ics com inicio e fim).
export default function ProporNovaData({ orcamentoId, solicitacaoId, oficinaId, pais, aoEnviar }: {
  orcamentoId: string; solicitacaoId: string; oficinaId: string; pais: string | null | undefined;
  aoEnviar?: (d: { data: string; turno: 'manha' | 'tarde'; hora_inicio: string; hora_fim: string }) => void;
}) {
  const t = useTranslations('agendaMudanca');
  const tErr = useTranslations('erros');
  const locale = useLocale();
  const [atual, setAtual] = useState<string | null>(null);
  const [atualAte, setAtualAte] = useState<string | null>(null);
  const [ctx, setCtx] = useState<ContextoOficina | null>(null);
  const [linhas, setLinhas] = useState<LinhaCheckin[]>([]);
  const [semData, setSemData] = useState(false);
  const data = linhas[0]?.data || '';
  const [previsao, setPrevisao] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<'' | 'pedido' | 'combinado'>('');
  const [serve, setServe] = useState<boolean | null>(null);
  const [combinado, setCombinado] = useState(false);

  useEffect(() => {
    supabase.from('agenda').select('data_inicio, checkin_ate').eq('solicitacao_id', solicitacaoId).eq('oficina_id', oficinaId).eq('status', 'agendado').maybeSingle()
      .then(({ data: ag }) => { setAtual((ag as any)?.data_inicio || null); setAtualAte((ag as any)?.checkin_ate || null); });
    supabase.from('oficinas').select('horario_funcionamento, recepcao_inicio, recepcao_fim, almoco_inicio, almoco_fim').eq('id', oficinaId).maybeSingle()
      .then(({ data: o }) => setCtx(o ? { horario: (o as any).horario_funcionamento, recepcao_inicio: (o as any).recepcao_inicio, recepcao_fim: (o as any).recepcao_fim, almoco_inicio: (o as any).almoco_inicio, almoco_fim: (o as any).almoco_fim } : {}));
  }, [solicitacaoId, oficinaId]);

  if (!atual) return null;
  if (feito) return <p role="status" className="card mb-6 bg-green-50 text-green-800" data-testid="nova-data-enviada">{t(feito === 'combinado' ? 'feitoCombinado' : 'feitoPedido')}</p>;

  // "hoje" no fuso da oficina (de madrugada em Tallinn o UTC ainda e ontem)
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: fusoDoPais(pais) });
  const quando = textoDaAgenda(atual, atualAte, pais ?? null, INTL_LOCALE[locale] || 'en-GB', { weekday: 'short', day: 'numeric', month: 'long' }, ', ');
  const linha = linhas[0];

  const diaAtual = new Date(atual).toLocaleDateString('sv-SE', { timeZone: fusoDoPais(pais) });
  const mesmoDia = !!data && data === diaAtual;
  const enviar = async () => {
    setErro('');
    // sem dia + faixa: a caixa fica vermelha (mesma regra do orcamento)
    if (!linha) { setSemData(true); return; }
    if (serve === null) { setErro(t('escolhaServe')); return; }
    // confere aqui e diz exatamente o que corrigir (antes so "confira os dados" - dono 08/11)
    if (data === diaAtual && linha.hora_inicio === horaLocalDe(atual, pais) && (!atualAte || linha.hora_fim === horaLocalDe(atualAte, pais))) { setErro(tErr('DATA_IGUAL_ATUAL')); return; }
    if (previsao && previsao < data) { setErro(tErr('PREVISAO_ANTES_DA_DATA')); return; }
    if (mesmoDia && !combinado) { setErro(t('mesmoDia')); return; }
    if (motivo.trim().length < 5) { setErro(t('motivoCurto')); return; }
    setEnviando(true);
    const r = await fetch('/api/orcamento-revisao/data', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orcamentoId, data, hora_inicio: linha.hora_inicio, hora_fim: linha.hora_fim, previsao: previsao || null, motivo, dataAtualServe: serve, combinado }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setEnviando(false);
    if (!r?.ok) { setErro(textoErroApi(tErr, r?.status || 500, d)); return; }
    setFeito(d?.aplicada ? 'combinado' : 'pedido');
    // combinado ja vale: a pagina nao deve passar a "esperando o cliente"
    if (!d?.aplicada) aoEnviar?.({ data, turno: turnoDaJanela({ inicio: linha.hora_inicio, fim: linha.hora_fim }), hora_inicio: linha.hora_inicio, hora_fim: linha.hora_fim });
  };

  return (
    <section className="card mb-6 border border-blue-200 bg-blue-50/50" data-testid="propor-nova-data" aria-labelledby="nova-data-titulo">
      <h2 id="nova-data-titulo" className="text-lg font-semibold text-gray-900">📅 {t('propostaTitulo')}</h2>
      <p className="mt-1 text-sm text-gray-700">{t('propostaTexto')}</p>
      <p className="mt-2 text-sm font-medium text-gray-900">{t('dataAtual', { quando })}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2" data-testid="pnd-nova-janela">
          <p className="block text-sm font-medium text-gray-700 mb-1">{t('novaData')} <span className="text-red-600" aria-hidden="true">*</span></p>
          <SeletorCheckin linhas={linhas} aoMudar={(ls) => { setLinhas(ls); setSemData(false); setErro(''); }} ctx={ctx} pais={pais ?? null} max={1} erro={semData} testid="pnd" mostrarPrevisao={false} />
          {semData && <p role="alert" className="mt-1 text-sm text-red-700" data-testid="pnd-erro-sem-data">⛔ {t('erroSemNovaData')}</p>}
        </div>
        <div>
          <label htmlFor="nd-previsao" className="block text-sm font-medium text-gray-700 mb-1">{t('previsao')}</label>
          {/* opcional: no iPhone o seletor de data nao deixa esvaziar - botao "Limpar" (dono 08/11) */}
          <div className="flex items-center gap-2">
            <input id="nd-previsao" type="date" min={data || hoje} className="input-field" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
            {previsao && <button type="button" onClick={() => setPrevisao('')} className="shrink-0 rounded-lg px-2 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100" data-testid="limpar-previsao">{t('limparData')}</button>}
          </div>
        </div>
      </div>
      <label htmlFor="nd-motivo" className="mt-3 block text-sm font-medium text-gray-700 mb-1">{t('motivo')}</label>
      <textarea id="nd-motivo" rows={2} maxLength={1000} className="input-field" placeholder={t('motivoPlaceholder')} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <div className="mt-3"><OpcoesMudancaData id="nd" serve={serve} setServe={setServe} combinado={combinado} setCombinado={setCombinado} mesmoDia={mesmoDia} /></div>
      {erro && <p role="alert" className="mt-2 text-sm text-red-700">{erro}</p>}
      <button type="button" disabled={enviando} onClick={enviar} className="btn-primary mt-3 w-full sm:w-auto disabled:opacity-50" data-testid="pnd-enviar">{t(combinado ? 'enviarCombinado' : 'enviarProposta')}</button>
    </section>
  );
}
