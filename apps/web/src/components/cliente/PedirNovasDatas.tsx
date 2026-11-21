'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { textoErroApi } from '@/lib/erro-api';
import { hojeLocal, faixasDoDia, janelaAindaVale, formatarJanela, janelaDaSugestao, turnoDaJanela, type Turno, type Janela, type ContextoOficina } from '@/lib/turnos';
import SemQuebra from '@/components/ui/SemQuebra';
import { INTL_LOCALE } from '@/lib/utils';

// "Preciso de outra data" (migracao 114, dono 21/11; antes 079 so com as datas vencidas):
//  - botao SEMPRE visivel no orcamento aberto; abre uma folha com 2 modos:
//      A) dias da semana (seg-sab) x parte do dia (manha / tarde / tanto faz)
//      B) data certa: dia dos proximos 14 (so dias em que a oficina abre) + janela de 2 h, ate 3 escolhas
//    + recado curto (ate 300). A proposta original continua aceitavel enquanto a oficina responde.
//  - estados depois: pendente ("Pedido enviado a oficina"), oficina respondeu "nao posso", oficina nao
//    respondeu em 72 h - sempre com o caminho de volta (aceitar a data original / pedir de novo).
//  - `sempre`: true = as datas ainda valem (botao secundario); false = todas passaram (cartao 079).
const DIAS = 14;
const MAX = 3;
const MSG_MAX = 300;
const CHAVE_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
type Sug = { data: string; turno: Turno; janela?: Janela };
type Padrao = { dias: number[]; partes: string[] };
type Pedido = { id: string; created_at: string; status: string; resposta: string | null; resposta_texto: string | null; sugestoes: Sug[]; padrao: Padrao | null; cancelado_motivo: string | null; motivo: string | null };

const somar = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// 2026-11-02 e segunda: nomes curtos dos dias 1..6 na lingua da tela
export const nomeDiaSemana = (d: number, intl: string, forma: 'short' | 'long' = 'short') =>
  new Date(Date.UTC(2026, 10, 1 + d, 12)).toLocaleDateString(intl, { timeZone: 'UTC', weekday: forma }).replace(/\.$/, '');

export default function PedirNovasDatas({ orcamentoId, pais, horario, ctx: ctxProp, sempre = false, aoMudar, abrir: abrirDeFora }: { orcamentoId: string; pais?: string | null; horario?: Record<string, { aberto?: boolean }> | null; ctx?: ContextoOficina | null; sempre?: boolean; aoMudar?: () => void; abrir?: number }) {
  const ctx: ContextoOficina = ctxProp ?? { horario: horario as ContextoOficina['horario'] };
  const t = useTranslations('novasDatas');
  const tErr = useTranslations('erros');
  const locale = useLocale();
  const intl = INTL_LOCALE[locale] || locale;
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [carregou, setCarregou] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<'dias' | 'data'>('dias');
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [parte, setParte] = useState<'manha' | 'tarde' | ''>('');
  const [diaEscolhido, setDiaEscolhido] = useState('');
  const [escolhidas, setEscolhidas] = useState<Sug[]>([]);
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [falta, setFalta] = useState(false);
  const [dispensado, setDispensado] = useState<string | null>(null);
  const botaoAbrir = useRef<HTMLButtonElement>(null);
  const folha = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('orcamento_pedido_datas').select('id, created_at, status, resposta, resposta_texto, sugestoes, padrao, cancelado_motivo, motivo')
      .eq('orcamento_id', orcamentoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setPedido((data as Pedido) || null);
    setCarregou(true);
  }, [orcamentoId]);
  useEffect(() => { carregar(); }, [carregar]);

  const fmtDia = useMemo(() => new Intl.DateTimeFormat(intl, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }), [intl]);
  const diaTxt = (ymd: string) => fmtDia.format(new Date(`${ymd}T12:00:00Z`));
  const janelaTxt = (s: Sug) => formatarJanela(s.janela || janelaDaSugestao(s.data, s.turno, ctx));
  const textoPadrao = (p: Padrao) => [p.dias.map((d) => nomeDiaSemana(d, intl)).join(', '), p.partes.length === 1 ? t(p.partes[0] as 'manha' | 'tarde') : t('qualquerParte')].filter(Boolean).join(' · ');

  // modo B: proximos 14 dias no fuso da oficina, so dias abertos, janelas de 2 h (grade da abertura, pulando o
  // almoco; a recepcao do perfil nao entra - o motorista escolhe a faixa de chegada e a oficina confirma)
  const dias = useMemo(() => {
    const hoje = hojeLocal(new Date(), pais ?? null);
    const ctxGrade: ContextoOficina = { horario: ctx.horario, almoco_inicio: ctx.almoco_inicio, almoco_fim: ctx.almoco_fim };
    const out: { data: string; janelas: Janela[] }[] = [];
    for (let i = 1; i <= DIAS; i++) {
      const d = somar(hoje, i);
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (dow === 0) continue;
      const h = (ctx.horario as any)?.[CHAVE_DIA[dow]];
      if (h && h.aberto === false) continue;
      const janelas = faixasDoDia(d, ctxGrade).filter((j) => janelaAindaVale(d, j, new Date(), pais ?? null));
      if (janelas.length) out.push({ data: d, janelas });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx vem do orcamento (estavel por render)
  }, [pais, horario, ctxProp?.almoco_inicio, ctxProp?.almoco_fim]);

  const chaveSug = (s: Sug) => `${s.data}|${s.janela?.inicio || s.turno}`;
  const marcada = (s: Sug) => escolhidas.some((x) => chaveSug(x) === chaveSug(s));
  const alternar = (s: Sug) => { setFalta(false); setEscolhidas((l) => (marcada(s) ? l.filter((x) => chaveSug(x) !== chaveSug(s)) : l.length >= MAX ? l : [...l, s].sort((a, b) => chaveSug(a).localeCompare(chaveSug(b))))); };
  const alternarDia = (d: number) => { setFalta(false); setDiasSemana((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d].sort())); };

  const abrir = () => { setErro(''); setFalta(false); setAberto(true); };
  // aberto de fora (folha da recusa: 'a data nao serve' -> pedir outra data)
  useEffect(() => { if (abrirDeFora) { setErro(''); setFalta(false); setAberto(true); } }, [abrirDeFora]);
  const fechar = () => { setAberto(false); setErro(''); setTimeout(() => botaoAbrir.current?.focus(), 0); };
  // folha aberta: Esc fecha, foco no primeiro controle, rolagem da pagina presa (celular) - igual ao SeletorCheckin
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => folha.current?.querySelector<HTMLElement>('[data-foco-inicial]')?.focus(), 0);
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = antes; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so ao abrir/fechar
  }, [aberto]);

  const enviar = async () => {
    if (enviando) return;
    const corpo: Record<string, unknown> = { mensagem: mensagem.trim() || undefined };
    if (modo === 'dias') {
      if (!diasSemana.length) { setFalta(true); return; }
      corpo.padrao = { dias: diasSemana, partes: parte ? [parte] : [] };
    } else {
      if (!escolhidas.length) { setFalta(true); return; }
      corpo.sugestoes = escolhidas;
    }
    setEnviando(true); setErro('');
    try {
      const r = await fetch(`/api/orcamento/${orcamentoId}/pedir-datas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(textoErroApi(tErr, r.status, c)); if (c?.codigo === 'PEDIDO_DATAS_PENDENTE') { carregar(); setAberto(false); } return; }
      setAberto(false); setEscolhidas([]); setDiasSemana([]); setParte(''); setMensagem(''); setDispensado(null);
      await carregar();
      aoMudar?.();
    } catch {
      setErro(tErr('GENERICO'));
    } finally {
      setEnviando(false);
    }
  };

  if (!carregou) return null;

  const oQuePediu = (p: Pedido) => p.padrao ? textoPadrao(p.padrao) : (p.sugestoes || []).map((s) => `${diaTxt(s.data)} ${janelaTxt(s)}`).join('; ');

  // 1) pendente: "pedido enviado a oficina" - a data original continua valendo
  if (pedido?.status === 'pendente') {
    const texto = oQuePediu(pedido);
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm" role="status" data-testid="novas-datas-pendente">
        <p className="font-semibold text-blue-900">✅ {t('enviadoTitulo')}</p>
        <p className="mt-1 text-blue-900">{t('pendente', { data: new Date(pedido.created_at).toLocaleString(intl, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</p>
        {texto && <p className="mt-1 text-blue-800 break-words"><SemQuebra>{t('suasDatas', { datas: texto })}</SemQuebra></p>}
        {sempre && <p className="mt-1 text-xs text-blue-800">{t('originalContinua')}</p>}
      </div>
    );
  }

  // 2) a oficina respondeu "nao posso" / nao respondeu em 72 h: aviso com o caminho de volta (ate a pessoa fechar)
  const avisoNaoPode = pedido?.status === 'atendido' && pedido.resposta === 'nao_pode' && dispensado !== pedido.id;
  const avisoSemResposta = pedido?.status === 'cancelado' && pedido.cancelado_motivo === 'sem_resposta_72h' && dispensado !== pedido.id;

  const botao = (
    <button ref={botaoAbrir} type="button" onClick={abrir} data-testid="abrir-pedir-datas"
      className={`${sempre ? 'btn-secondary border-primary-300 text-primary-800' : 'btn-primary'} w-full min-h-[48px] text-base`}>
      📅 {sempre ? t('botaoSempre') : t('botao')}
    </button>
  );

  const semana = [1, 2, 3, 4, 5, 6];
  const folhaEl = aberto && (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={fechar} data-testid="folha-outra-data">
      <div ref={folha} role="dialog" aria-modal="true" aria-labelledby="outra-data-titulo" onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <h3 id="outra-data-titulo" className="text-lg font-bold text-gray-900">{t('folhaTitulo')}</h3>
        <p className="mt-1 text-sm text-gray-600">{t('folhaTexto')}</p>

        {/* um modo por vez: dias da semana OU data certa */}
        <div className="mt-3 grid grid-cols-2 gap-2" role="tablist" aria-label={t('folhaTitulo')}>
          {(['dias', 'data'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => { setModo(m); setFalta(false); }} data-testid={`modo-${m}`} {...(m === 'dias' ? { 'data-foco-inicial': true } : {})}
              className={`min-h-[48px] rounded-xl border-2 px-3 text-sm font-semibold ${modo === m ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white text-gray-800'}`}>
              {m === 'dias' ? t('modoDias') : t('modoData')}
            </button>
          ))}
        </div>

        {modo === 'dias' ? (
          <div className="mt-4 space-y-4" role="tabpanel">
            <div>
              <p className="text-sm font-medium text-gray-800">{t('diasTitulo')}</p>
              <div className="mt-2 grid grid-cols-6 gap-1.5" data-testid="dias-semana">
                {semana.map((d) => {
                  const on = diasSemana.includes(d);
                  return (
                    <button key={d} type="button" aria-pressed={on} onClick={() => alternarDia(d)} data-testid={`dia-semana-${d}`} aria-label={nomeDiaSemana(d, intl, 'long')}
                      className={`min-h-[48px] rounded-xl border-2 text-sm font-semibold capitalize ${on ? 'border-primary-600 bg-primary-50 text-primary-900' : 'border-gray-300 bg-white text-gray-800'}`}>
                      {nomeDiaSemana(d, intl)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">{t('partesTitulo')}</p>
              <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t('partesTitulo')}>
                {([['manha', t('manha')], ['tarde', t('tarde')], ['', t('qualquerParte')]] as const).map(([v, rotulo]) => (
                  <button key={v || 'q'} type="button" role="radio" aria-checked={parte === v} onClick={() => setParte(v)} data-testid={`parte-${v || 'qualquer'}`}
                    className={`min-h-[48px] rounded-xl border-2 px-2 text-sm font-semibold ${parte === v ? 'border-primary-600 bg-primary-50 text-primary-900' : 'border-gray-300 bg-white text-gray-800'}`}>
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4" role="tabpanel">
            <div>
              <p className="text-sm font-medium text-gray-800">{t('dataTitulo')}</p>
              {/* grelha que quebra linha (nada escondido atras de rolagem lateral - muita gente nao a descobre) */}
              <div className="mt-2 grid grid-cols-3 gap-1.5" data-testid="grade-datas">
                {dias.map((d) => {
                  const on = diaEscolhido === d.data;
                  const n = escolhidas.filter((s) => s.data === d.data).length;
                  return (
                    <button key={d.data} type="button" aria-pressed={on} onClick={() => setDiaEscolhido(d.data)} data-testid={`dia-${d.data}`}
                      className={`relative min-h-[48px] rounded-xl border-2 px-1 text-sm font-semibold capitalize leading-tight ${on ? 'border-primary-600 bg-primary-600 text-white' : n ? 'border-primary-400 bg-primary-50 text-primary-900' : 'border-gray-300 bg-white text-gray-800'}`}>
                      {diaTxt(d.data)}{n > 0 && <span className="ml-1 rounded-full bg-white/90 px-1.5 text-[11px] text-primary-800">{n}</span>}
                    </button>
                  );
                })}
              </div>
              {dias.length === 0 && <p className="mt-2 text-sm text-gray-600">{t('semDias')}</p>}
            </div>
            {diaEscolhido && (
              <div>
                <p className="text-sm font-medium text-gray-800">{t('janelasTitulo')}</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5" data-testid="janelas">
                  {(dias.find((d) => d.data === diaEscolhido)?.janelas || []).map((j) => {
                    const s: Sug = { data: diaEscolhido, turno: turnoDaJanela(j), janela: j };
                    const on = marcada(s);
                    return (
                      <button key={j.inicio} type="button" aria-pressed={on} onClick={() => alternar(s)} disabled={!on && escolhidas.length >= MAX} data-testid={`chip-${diaEscolhido}-${j.inicio.replace(':', '')}`}
                        className={`min-h-[48px] rounded-xl border-2 text-sm font-semibold tabular-nums disabled:opacity-40 ${on ? 'border-primary-600 bg-primary-50 text-primary-900' : 'border-gray-300 bg-white text-gray-800'}`}>
                        {formatarJanela(j)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {escolhidas.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={t('escolhidas', { n: escolhidas.length })} data-testid="escolhidas">
                {escolhidas.map((s) => (
                  <li key={chaveSug(s)}>
                    <button type="button" onClick={() => alternar(s)} aria-label={`${t('remover')}: ${diaTxt(s.data)} ${janelaTxt(s)}`}
                      className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-primary-100 px-3 text-sm font-medium text-primary-900">
                      {diaTxt(s.data)} · {janelaTxt(s)} <span aria-hidden="true">✕</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-600">{t('ate3')}</p>
          </div>
        )}

        <label className="mt-4 block text-sm">
          <span className="font-medium text-gray-800">{t('mensagemLabel')}</span>
          <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value.slice(0, MSG_MAX))} maxLength={MSG_MAX} rows={2}
            placeholder={t('mensagemPlaceholder')} className="input-field mt-1 w-full" data-testid="mensagem-datas" />
          <span className="block text-right text-xs text-gray-500">{t('caracteres', { n: mensagem.length })}</span>
        </label>
        <p className="mt-2 text-xs text-gray-700">{sempre ? t('enquantoResponde') : t('avisoConfirmar')}</p>
        {falta && <p role="alert" className="mt-2 text-sm font-medium text-red-700" data-testid="outra-data-falta">⛔ {modo === 'dias' ? t('faltaDia') : t('faltaJanela')}</p>}
        {erro && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{erro}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" onClick={enviar} disabled={enviando} aria-busy={enviando} className="btn-primary min-h-[48px] w-full text-base disabled:opacity-60" data-testid="enviar-pedir-datas">
            {enviando ? t('enviando') : sempre ? t('enviarSempre') : t('enviar')}
          </button>
          <button type="button" onClick={fechar} className="btn-secondary min-h-[48px] w-full">{t('cancelar')}</button>
        </div>
      </div>
    </div>
  );

  if (sempre) {
    return (
      <div className="w-full space-y-2" data-testid="pedir-outra-data">
        {avisoNaoPode && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm" role="status" data-testid="novas-datas-nao-pode">
            <p className="font-semibold text-amber-900">{t('naoPodeTitulo')}</p>
            {pedido?.resposta_texto && <p className="mt-1 text-amber-900 break-words">{t('respostaOficina', { texto: pedido.resposta_texto })}</p>}
            <p className="mt-1 text-amber-900">{t('naoPodeTexto')}</p>
            <button type="button" onClick={() => setDispensado(pedido!.id)} className="mt-1 min-h-[40px] text-sm font-medium text-amber-900 underline">{t('entendi')}</button>
          </div>
        )}
        {avisoSemResposta && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm" role="status" data-testid="novas-datas-sem-resposta">
            <p className="font-semibold text-amber-900">{t('semRespostaTitulo')}</p>
            <p className="mt-1 text-amber-900">{t('semRespostaTexto')}</p>
            <button type="button" onClick={() => setDispensado(pedido!.id)} className="mt-1 min-h-[40px] text-sm font-medium text-amber-900 underline">{t('entendi')}</button>
          </div>
        )}
        {botao}
        {folhaEl}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4" data-testid="pedir-novas-datas">
      <p className="font-semibold text-amber-900">📅 {t('titulo')}</p>
      <p className="mt-1 text-sm text-amber-900">{t('texto')}</p>
      {avisoNaoPode && <p role="status" className="mt-2 text-sm text-amber-900" data-testid="novas-datas-nao-pode">{t('naoPodeTitulo')}. {t('naoPodeTexto')}</p>}
      {avisoSemResposta && <p role="status" className="mt-2 text-sm text-amber-900" data-testid="novas-datas-sem-resposta">{t('semRespostaTitulo')}. {t('semRespostaTexto')}</p>}
      <div className="mt-3">{botao}</div>
      {folhaEl}
    </div>
  );
}
