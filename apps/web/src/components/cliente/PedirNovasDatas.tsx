'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { textoErroApi } from '@/lib/erro-api';
import { hojeLocal, turnoDisponivel, type Turno } from '@/lib/turnos';
import { INTL_LOCALE } from '@/lib/utils';

// "Tenho interesse, peca novas datas" (migracao 079): todas as datas do orcamento ja passaram.
// O motorista pode sugerir ate 3 datas (dia + manha/tarde) dos proximos 14 dias a partir de amanha - sem domingo e
// sem os dias em que a oficina esta fechada pelo horario do perfil - e mandar uma mensagem curta.
// Com pedido pendente mostra "Pedido enviado em ..., aguardando a oficina".
const DIAS = 14;
const MAX = 3;
const MSG_MAX = 300;
const CHAVE_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
type Sug = { data: string; turno: Turno };
type Pedido = { id: string; created_at: string; sugestoes: Sug[] };

const somar = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default function PedirNovasDatas({ orcamentoId, pais, horario }: { orcamentoId: string; pais?: string | null; horario?: Record<string, { aberto?: boolean }> | null }) {
  const t = useTranslations('novasDatas');
  const tErr = useTranslations('erros');
  const locale = useLocale();
  const intl = INTL_LOCALE[locale] || locale;
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [carregou, setCarregou] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [escolhidas, setEscolhidas] = useState<Sug[]>([]);
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('orcamento_pedido_datas').select('id, created_at, sugestoes').eq('orcamento_id', orcamentoId).eq('status', 'pendente').maybeSingle();
    setPedido((data as Pedido) || null);
    setCarregou(true);
  }, [orcamentoId]);
  useEffect(() => { carregar(); }, [carregar]);

  const fmtDia = useMemo(() => new Intl.DateTimeFormat(intl, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }), [intl]);
  const diaTxt = (ymd: string) => fmtDia.format(new Date(`${ymd}T12:00:00Z`));
  const turnoTxt = (tu: Turno) => `${t(tu)} ${tu === 'manha' ? '08–12' : '13–17'}`;

  // proximos 14 dias no fuso da oficina; so dias abertos e turnos que ainda nao acabaram
  const dias = useMemo(() => {
    const hoje = hojeLocal(new Date(), pais ?? null);
    const out: { data: string; turnos: Turno[] }[] = [];
    for (let i = 1; i <= DIAS; i++) {
      const d = somar(hoje, i);
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (dow === 0) continue;
      const h = horario?.[CHAVE_DIA[dow]];
      if (h && h.aberto === false) continue;
      const turnos = (['manha', 'tarde'] as Turno[]).filter((tu) => turnoDisponivel(d, tu, new Date(), pais ?? null));
      if (turnos.length) out.push({ data: d, turnos });
    }
    return out;
  }, [pais, horario]);

  const marcada = (s: Sug) => escolhidas.some((x) => x.data === s.data && x.turno === s.turno);
  const alternar = (s: Sug) => setEscolhidas((l) => (marcada(s) ? l.filter((x) => !(x.data === s.data && x.turno === s.turno)) : l.length >= MAX ? l : [...l, s]));

  const enviar = async () => {
    if (enviando) return;
    setEnviando(true); setErro('');
    try {
      const r = await fetch(`/api/orcamento/${orcamentoId}/pedir-datas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sugestoes: escolhidas, mensagem: mensagem.trim() || undefined }) });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(textoErroApi(tErr, r.status, corpo)); if (corpo?.codigo === 'PEDIDO_DATAS_PENDENTE') carregar(); return; }
      setAberto(false); setEscolhidas([]); setMensagem('');
      await carregar();
    } catch {
      setErro(tErr('GENERICO'));
    } finally {
      setEnviando(false);
    }
  };

  if (!carregou) return null;

  if (pedido) {
    const sugs = (pedido.sugestoes || []) as Sug[];
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm" role="status" data-testid="novas-datas-pendente">
        <p className="font-medium text-blue-900">⏳ {t('pendente', { data: new Date(pedido.created_at).toLocaleString(intl, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</p>
        {sugs.length > 0 && <p className="mt-1 text-blue-800 break-words">{t('suasDatas', { datas: sugs.map((s) => `${diaTxt(s.data)} ${turnoTxt(s.turno)}`).join('; ') })}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4" data-testid="pedir-novas-datas">
      <p className="font-semibold text-amber-900">📅 {t('titulo')}</p>
      <p className="mt-1 text-sm text-amber-900">{t('texto')}</p>
      {!aberto ? (
        <button type="button" onClick={() => setAberto(true)} className="btn-primary mt-3 w-full sm:w-auto min-h-[44px]" data-testid="abrir-pedir-datas">{t('botao')}</button>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">{t('sugerirTitulo')}</p>
            <ul className="space-y-1.5" data-testid="grade-datas">
              {dias.map((d) => (
                <li key={d.data} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-sm text-gray-700">{diaTxt(d.data)}</span>
                  <div className="grid flex-1 grid-cols-2 gap-1.5 min-w-0">
                    {(['manha', 'tarde'] as Turno[]).map((tu) => {
                      const s = { data: d.data, turno: tu };
                      const pode = d.turnos.includes(tu);
                      const on = marcada(s);
                      return pode ? (
                        <button key={tu} type="button" aria-pressed={on} onClick={() => alternar(s)} disabled={!on && escolhidas.length >= MAX}
                          className={`min-h-[40px] rounded-full border px-2 text-xs font-medium truncate disabled:opacity-40 ${on ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white text-gray-700'}`}
                          data-testid={`chip-${d.data}-${tu}`}>
                          {turnoTxt(tu)}
                        </button>
                      ) : <span key={tu} />;
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-gray-800">{t('mensagemLabel')}</span>
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value.slice(0, MSG_MAX))} maxLength={MSG_MAX} rows={2}
              placeholder={t('mensagemPlaceholder')} className="input-field mt-1 w-full" data-testid="mensagem-datas" />
            <span className="block text-right text-xs text-gray-500">{t('caracteres', { n: mensagem.length })}</span>
          </label>
          <p className="text-xs text-gray-700">{t('avisoConfirmar')}</p>
          {erro && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-2">{erro}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setAberto(false); setErro(''); }} className="btn-secondary flex-1">{t('cancelar')}</button>
            <button type="button" onClick={enviar} disabled={enviando} aria-busy={enviando} className="btn-primary flex-1 disabled:opacity-60" data-testid="enviar-pedir-datas">
              {enviando ? t('enviando') : t('enviar')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
