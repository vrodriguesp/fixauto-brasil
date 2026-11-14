'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { useValorQueVolta } from '@/hooks/use-estado-que-volta';
import { textoErroApi } from '@/lib/erro-api';
import { hojeLocal, janelaAindaVale, conflitoHorario, localParaIso, janelaDaSugestao, formatarJanela, turnoDaJanela, type Turno, type HorarioSemana, type ContextoOficina } from '@/lib/turnos';
import SeletorCheckin, { type LinhaCheckin } from '@/components/oficina/SeletorCheckin';
import { INTL_LOCALE } from '@/lib/utils';
import { Link } from '@/i18n/navigation';

// O cliente pediu novas datas (migracao 079): a oficina confirma uma sugestao dele (o orcamento
// fica aceito e o carro agendado) ou manda de 1 a 3 datas novas (mesmo orcamento, sem revisao).
// So aparece com pedido PENDENTE do cliente (dono 11/11: a oficina nao propoe datas sem pedido).
type Sug = { data: string; turno: Turno };
type Pedido = { id: string; created_at: string; sugestoes: Sug[]; mensagem: string | null };
const MAX = 3;
// confirmar a sugestao (aceite automatico) so com o turno comecando daqui a 2 h ou mais (igual ao servidor)
const ANTECEDENCIA_MS = 2 * 3600e3;
const somar = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Datas x horario de funcionamento (dono 14/11, igual ao formulario do orcamento): sugestao no proximo dia
// em que a oficina abre (nunca hoje), dia fechado bloqueia (o servidor tambem recusa: DIA_FECHADO),
// periodo fora do horario so avisa; link para corrigir o horario no perfil (aba nova).
// Check-in v2: "outras datas" usam o MESMO seletor do orcamento (dia no mini calendario + faixa; vazio no
// inicio, ate 3); cada linha manda hora_inicio/hora_fim. A sugestao do motorista (dia + manha/tarde) vira a
// 1a faixa do perfil nesse turno (regra 2.13) - o rotulo ja mostra essa faixa.
// vencido (validade passou): o pedido do motorista continua visivel, mas so para ler - o servidor recusa
// confirmar/mandar datas (ORCAMENTO_VENCIDO); o que a oficina pode fazer e revisar o orcamento (QA D5)
export default function NovasDatasPedidas({ orcamentoId, prazoDias, pais, horario: horarioProp, ctx: ctxProp, oficinaId, aoMudar, vencido = false, solicitacaoId }: { orcamentoId: string; prazoDias: number; pais?: string | null; horario?: HorarioSemana; ctx?: ContextoOficina | null; oficinaId?: string; aoMudar?: () => void; vencido?: boolean; solicitacaoId?: string }) {
  const t = useTranslations('oficinaNovasDatas');
  // a oficina corrige o perfil (aba nova pelo link do erro): ao voltar para esta aba relemos horario,
  // recepcao e almoco, sem perder as linhas preenchidas (igual ao formulario do orcamento; auditoria Fable R4)
  const [ctxRelido, setCtxRelido] = useState<ContextoOficina | null>(null);
  const ctx: ContextoOficina = ctxRelido ?? { ...(ctxProp || {}), horario: ctxProp?.horario ?? horarioProp };
  const horario = ctx.horario;
  useEffect(() => {
    if (!oficinaId) return;
    const reler = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.from('oficinas').select('horario_funcionamento, recepcao_inicio, recepcao_fim, almoco_inicio, almoco_fim').eq('id', oficinaId).maybeSingle()
        .then(({ data }) => { if (data) setCtxRelido({ horario: data.horario_funcionamento as HorarioSemana, recepcao_inicio: data.recepcao_inicio, recepcao_fim: data.recepcao_fim, almoco_inicio: data.almoco_inicio, almoco_fim: data.almoco_fim }); });
    };
    document.addEventListener('visibilitychange', reler);
    return () => document.removeEventListener('visibilitychange', reler);
  }, [oficinaId]);
  const tErr = useTranslations('erros');
  const locale = useLocale();
  const intl = INTL_LOCALE[locale] || locale;
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [feito, setFeito] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  // linhas vazias no inicio (check-in v2, decisao 1): a oficina escolhe dia + faixa
  const [linhas, setLinhas] = useValorQueVolta<LinhaCheckin[]>(`nd-checkin:${orcamentoId}`, []);
  const [semLinha, setSemLinha] = useState(false);

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
      // 409 (respondido, cancelado, orcamento mudou/vencido, sugestao vencida): rele o cartao e a pagina
      if (!r.ok) { setErro(textoErroApi(tErr, r.status, b)); if (r.status === 409) { carregar(); aoMudar?.(); } return; }
      // enviado: as linhas guardadas para a troca de lingua saem (auditoria Fable R-02)
      setFeito(msgOk); setPedido(null); setLinhas([]);
      aoMudar?.();
    } catch {
      setErro(tErr('GENERICO'));
    } finally {
      setEnviando(null);
    }
  };

  if (feito) return <p role="status" className="card border-2 border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-800" data-testid="novas-datas-feito">✔ {feito}</p>;
  if (!pedido) return null;

  const mudarPrevisao = (i: number, v: string) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, previsao: v } : l)));
  const linhasOk = linhas.length > 0 && linhas.every((l) => janelaAindaVale(l.data, { inicio: l.hora_inicio, fim: l.hora_fim }, undefined, pais ?? null) && (!l.previsao || l.previsao >= l.data) && conflitoHorario(l.data, 'manha', horario) !== 'fechado');
  const sugs = (pedido.sugestoes || []) as Sug[];

  if (vencido) {
    return (
      <div className="card border-2 border-amber-300 bg-amber-50/60" data-testid="novas-datas-pedidas-vencido">
        <h2 className="font-semibold text-gray-900">📅 {t('titulo')}</h2>
        <p className="text-xs text-gray-500">{t('pedidoEm', { data: new Date(pedido.created_at).toLocaleString(intl, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</p>
        {pedido.mensagem && (
          <p className="mt-2 rounded-lg bg-white p-2 text-sm text-gray-800 break-words"><span className="font-medium">{t('mensagemCliente')}:</span> {pedido.mensagem}</p>
        )}
        {sugs.length > 0 && (
          <>
            <h3 className="mt-3 text-sm font-semibold text-gray-900">{t('sugestoesTitulo')}</h3>
            <ul className="mt-1 list-disc pl-5 text-sm text-gray-800">
              {sugs.map((s) => <li key={`${s.data}-${s.turno}`}>{fmtDia.format(new Date(`${s.data}T12:00:00Z`))} · <span className="whitespace-nowrap">{formatarJanela(janelaDaSugestao(s.data, s.turno, ctx))}</span></li>)}
            </ul>
          </>
        )}
        <p role="status" className="mt-3 rounded-lg border border-red-200 bg-white p-2 text-sm text-red-800" data-testid="novas-datas-vencido-texto">{t('vencidoTexto')}</p>
        {solicitacaoId && <Link href={`/oficina/orcamento/${solicitacaoId}`} className="btn-primary mt-3 inline-flex min-h-[44px] w-full items-center justify-center sm:w-auto" data-testid="novas-datas-revisar">{t('vencidoRevisar')}</Link>}
      </div>
    );
  }

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
            // a janela que vale ao confirmar = 1a faixa do perfil nesse turno (igual ao servidor)
            const js = janelaDaSugestao(s.data, s.turno, ctx);
            const vale = Date.parse(localParaIso(s.data, js.inicio, pais ?? null)) - Date.now() >= ANTECEDENCIA_MS;
            return (
              <li key={`${s.data}-${s.turno}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white p-2">
                <span className="text-sm font-medium text-gray-900" data-testid={`sugestao-${i}-texto`}>{fmtDia.format(new Date(`${s.data}T12:00:00Z`))} · <span className="whitespace-nowrap">{formatarJanela(js)}</span></span>
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
        <SeletorCheckin linhas={linhas} aoMudar={(ls) => { setLinhas(ls); if (ls.length) setSemLinha(false); }} ctx={ctx} pais={pais ?? null} prazoDias={prazoDias || 0} max={MAX} erro={semLinha} testid="nd" mostrarPrevisao={false}
          extraLinha={(l, i) => (
            <label className="mt-2 block text-xs text-gray-600">{t('previsao')}
              <input type="date" min={l.data || hoje} value={l.previsao || ''} onChange={(e) => mudarPrevisao(i, e.target.value)} className="input-field mt-0.5 w-full sm:w-48" data-testid={`nd-previsao-${i}`} />
            </label>
          )} />
        {semLinha && <p role="alert" className="text-sm font-medium text-red-700" data-testid="nd-erro-sem-data">⛔ {t('erroSemData')}</p>}
        <p className="text-xs text-gray-600">{t('semMudarPreco')}</p>
        {erro && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-2">{erro}</p>}
        <button type="button" disabled={!!enviando || (linhas.length > 0 && !linhasOk)}
          onClick={() => { if (!linhas.length) { setSemLinha(true); return; } enviar({ horarios: linhas.map((l) => ({ data: l.data, turno: turnoDaJanela({ inicio: l.hora_inicio, fim: l.hora_fim }), hora_inicio: l.hora_inicio, hora_fim: l.hora_fim, previsao: l.previsao || undefined })) }, 'h', t('feitoEnviadas')); }}
          className="btn-primary w-full sm:w-auto min-h-[44px] disabled:opacity-60" data-testid="nd-enviar">
          {enviando === 'h' ? t('enviando') : t('enviar')}
        </button>
      </div>
    </div>
  );
}
