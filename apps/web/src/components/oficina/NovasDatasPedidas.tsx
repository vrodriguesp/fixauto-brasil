'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { textoErroApi } from '@/lib/erro-api';
import { hojeLocal, turnoDisponivel, primeiroTurnoLivre, localParaIso, type Turno } from '@/lib/turnos';
import { INTL_LOCALE } from '@/lib/utils';

// O cliente pediu novas datas (migracao 079): a oficina confirma uma sugestao dele (o orcamento
// fica aceito e o carro agendado) ou manda de 1 a 3 datas novas (mesmo orcamento, sem revisao).
// So aparece com pedido PENDENTE do cliente (dono 11/11: a oficina nao propoe datas sem pedido).
type Sug = { data: string; turno: Turno };
type Pedido = { id: string; created_at: string; sugestoes: Sug[]; mensagem: string | null };
type Linha = { data: string; turno: Turno; previsao: string; previsaoMexida: boolean };
const MAX = 3;
// confirmar a sugestao (aceite automatico) so com o turno comecando daqui a 2 h ou mais (igual ao servidor)
const ANTECEDENCIA_MS = 2 * 3600e3;
const somar = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default function NovasDatasPedidas({ orcamentoId, prazoDias, pais, aoMudar }: { orcamentoId: string; prazoDias: number; pais?: string | null; aoMudar?: () => void }) {
  const t = useTranslations('oficinaNovasDatas');
  const tErr = useTranslations('erros');
  const locale = useLocale();
  const intl = INTL_LOCALE[locale] || locale;
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [feito, setFeito] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const novaLinha = useCallback((): Linha => { const p = primeiroTurnoLivre(undefined, pais ?? null); return { data: p.data, turno: p.turno, previsao: somar(p.data, prazoDias || 0), previsaoMexida: false }; }, [pais, prazoDias]);
  const [linhas, setLinhas] = useState<Linha[]>(() => [novaLinha()]);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('orcamento_pedido_datas').select('id, created_at, sugestoes, mensagem').eq('orcamento_id', orcamentoId).eq('status', 'pendente').maybeSingle();
    setPedido((data as Pedido) || null);
  }, [orcamentoId]);
  useEffect(() => { carregar(); }, [carregar]);

  const fmtDia = useMemo(() => new Intl.DateTimeFormat(intl, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long' }), [intl]);
  const hoje = hojeLocal(new Date(), pais ?? null);

  const enviar = async (corpo: Record<string, unknown>, chave: string, msgOk: string) => {
    if (enviando) return;
    setEnviando(chave); setErro('');
    try {
      const r = await fetch(`/api/orcamento/${orcamentoId}/novas-datas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(textoErroApi(tErr, r.status, b)); if (b?.codigo === 'PEDIDO_DATAS_RESPONDIDO') carregar(); return; }
      setFeito(msgOk); setPedido(null);
      aoMudar?.();
    } catch {
      setErro(tErr('GENERICO'));
    } finally {
      setEnviando(null);
    }
  };

  if (feito) return <p role="status" className="card border-2 border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-800" data-testid="novas-datas-feito">✔ {feito}</p>;
  if (!pedido) return null;

  const mudar = (i: number, campo: 'data' | 'turno' | 'previsao', v: string) => setLinhas((ls) => ls.map((l, j) => {
    if (j !== i) return l;
    const n = { ...l, [campo]: v } as Linha;
    if (campo === 'previsao') n.previsaoMexida = true;
    if (campo === 'data') {
      if (!turnoDisponivel(n.data, n.turno, undefined, pais ?? null) && turnoDisponivel(n.data, 'tarde', undefined, pais ?? null)) n.turno = 'tarde';
      if (!l.previsaoMexida && n.data) n.previsao = somar(n.data, prazoDias || 0);
    }
    return n;
  }));
  const linhasOk = linhas.every((l) => l.data && turnoDisponivel(l.data, l.turno, undefined, pais ?? null) && (!l.previsao || l.previsao >= l.data));
  const sugs = (pedido.sugestoes || []) as Sug[];

  return (
    <div className="card border-2 border-amber-300 bg-amber-50/60" data-testid="novas-datas-pedidas">
      <h2 className="font-semibold text-gray-900">📅 {t('titulo')}</h2>
      <p className="text-xs text-gray-500">{t('pedidoEm', { data: new Date(pedido.created_at).toLocaleString(intl, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</p>
      <p className="mt-2 text-sm text-gray-700">{t('texto')}</p>
      {pedido.mensagem && (
        <p className="mt-2 rounded-lg bg-white p-2 text-sm text-gray-800 break-words"><span className="font-medium">{t('mensagemCliente')}:</span> {pedido.mensagem}</p>
      )}

      <h3 className="mt-4 text-sm font-semibold text-gray-900">{t('sugestoesTitulo')}</h3>
      {sugs.length === 0 ? <p className="text-sm text-gray-600">{t('semSugestoes')}</p> : (
        <ul className="mt-2 space-y-2">
          {sugs.map((s, i) => {
            const vale = Date.parse(localParaIso(s.data, s.turno === 'tarde' ? '13:00' : '08:00', pais ?? null)) - Date.now() >= ANTECEDENCIA_MS;
            return (
              <li key={`${s.data}-${s.turno}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white p-2">
                <span className="text-sm font-medium text-gray-900">{fmtDia.format(new Date(`${s.data}T12:00:00Z`))} · {s.turno === 'manha' ? '08:00–12:00' : '13:00–17:00'}</span>
                {vale ? (
                  <button type="button" onClick={() => enviar({ confirmar: i }, `c${i}`, t('feitoConfirmado'))} disabled={!!enviando}
                    className="btn-success !py-2 !px-3 text-sm min-h-[44px] w-full sm:w-auto disabled:opacity-60" data-testid={`confirmar-sugestao-${i}`}>
                    {enviando === `c${i}` ? t('confirmando') : t('confirmar')}
                  </button>
                ) : <span className="text-xs text-gray-500">{t('jaPassou')}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {sugs.length > 0 && <p className="mt-2 text-xs text-gray-600">{t('confirmarAviso')}</p>}

      <h3 className="mt-5 text-sm font-semibold text-gray-900">{t('outrasTitulo')}</h3>
      <div className="mt-2 space-y-3" data-testid="editor-novas-datas">
        {linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-white p-2 sm:grid-cols-3">
            <label className="text-xs text-gray-600 min-w-0">{t('data')}
              <input type="date" min={hoje} value={l.data} onChange={(e) => mudar(i, 'data', e.target.value)} className="input-field mt-0.5 w-full" data-testid={`nd-data-${i}`} />
            </label>
            <label className="text-xs text-gray-600 min-w-0">{t('turno')}
              <select value={l.turno} onChange={(e) => mudar(i, 'turno', e.target.value)} className="input-field mt-0.5 w-full" data-testid={`nd-turno-${i}`}>
                <option value="manha" disabled={!turnoDisponivel(l.data, 'manha', undefined, pais ?? null)}>{t('manha')}</option>
                <option value="tarde" disabled={!turnoDisponivel(l.data, 'tarde', undefined, pais ?? null)}>{t('tarde')}</option>
              </select>
            </label>
            <label className="text-xs text-gray-600 min-w-0">{t('previsao')}
              <input type="date" min={l.data || hoje} value={l.previsao} onChange={(e) => mudar(i, 'previsao', e.target.value)} className="input-field mt-0.5 w-full" data-testid={`nd-previsao-${i}`} />
            </label>
            {linhas.length > 1 && (
              <button type="button" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} className="justify-self-start text-xs text-red-600 underline sm:col-span-3">{t('remover')}</button>
            )}
          </div>
        ))}
        {linhas.length < MAX && (
          <button type="button" onClick={() => setLinhas((ls) => [...ls, novaLinha()])} className="text-sm font-medium text-primary-700" data-testid="nd-adicionar">{t('adicionar')}</button>
        )}
        <p className="text-xs text-gray-600">{t('semMudarPreco')}</p>
        {erro && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-2">{erro}</p>}
        <button type="button" disabled={!linhasOk || !!enviando}
          onClick={() => enviar({ horarios: linhas.map((l) => ({ data: l.data, turno: l.turno, previsao: l.previsao || undefined })) }, 'h', t('feitoEnviadas'))}
          className="btn-primary w-full sm:w-auto min-h-[44px] disabled:opacity-60" data-testid="nd-enviar">
          {enviando === 'h' ? t('enviando') : t('enviar')}
        </button>
      </div>
    </div>
  );
}
