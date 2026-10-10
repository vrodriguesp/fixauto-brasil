'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { INTL_LOCALE } from '@/lib/utils';
import { instanteNaOficina, minutoNaOficina } from '@/lib/fuso';
import { COR, somaDias, type Barra, type Box, type Ocupacao } from './quadro-util';

// Visao "Hora" do Quadro (pedido do dono 09/10): um dia, hora a hora, uma
// linha por posto (elevador, posto no chao, vaga de espera). Mostra quando o
// carro REALMENTE esteve em cada posto (do clique "colocar" ao "tirar") e as
// RESERVAS de intervalo, para o mecanico combinar o uso do elevador. Tudo no
// fuso da oficina; o passado nao se edita (e o registro do que aconteceu).

export type OcupacaoVista = Ocupacao & { rotulo: string; estado: Barra['estado']; minha: boolean };
type Resposta = { ok: boolean; status: number; dados: any };

interface Props {
  pais: string | null | undefined;
  horario: Record<string, { aberto: boolean; inicio: string; fim: string }> | null | undefined;
  hoje: string;
  agora: number;
  boxes: Box[]; // so os ativos, na ordem
  barras: Barra[]; // carros que o usuario ve
  ocupacoes: OcupacaoVista[]; // de toda a oficina (o mecanico precisa ver o que esta livre)
  podeMexer: (ev: any) => boolean;
  ehDono: boolean;
  onAbrirCarro: (ev: any) => void;
  enviar: (corpo: Record<string, unknown>) => Promise<Resposta>;
  onGerenciar: () => void;
  /** "Reservar um posto por hora" no detalhe do carro: abre a reserva ja com este carro (n muda a cada clique) */
  reservarPara?: { evId: string; n: number } | null;
}

const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const DURACOES = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];
const ORDEM_TIPO: Record<Box['tipo'], number> = { elevador: 0, box: 1, vaga: 2 };
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const minDe = (txt: string) => { const [h, m] = (txt || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : NaN; };

export default function QuadroHora({ pais, horario, hoje, agora, boxes, barras, ocupacoes, podeMexer, ehDono, onAbrirCarro, enviar, onGerenciar, reservarPara }: Props) {
  const t = useTranslations('oficinaAgenda');
  const locale = useLocale();
  const [dia, setDia] = useState(hoje);
  const [px, setPx] = useState(96);
  const [folha, setFolha] = useState<null | { modo: 'nova' | 'editar'; ocup?: OcupacaoVista; evId: string; boxId: string; inicio: string; dur: number; obs: string }>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState<null | { tipo: 'reserva'; ocup: OcupacaoVista; pega: number } | { tipo: 'carro'; ev: any }>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);

  useEffect(() => { const ajustar = () => setPx(window.innerWidth < 640 ? 64 : 96); ajustar(); window.addEventListener('resize', ajustar); return () => window.removeEventListener('resize', ajustar); }, []);

  const postos = useMemo(() => [...boxes].sort((a, b) => ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo] || a.ordem - b.ordem || a.nome.localeCompare(b.nome)), [boxes]);

  // inicio do dia no fuso da oficina; a janela vai do horario de abertura - 1 h
  // ao fechamento + 1 h, aumentando se houver ocupacao fora disso
  const inicioDia = useMemo(() => instanteNaOficina(dia, 0, pais).getTime(), [dia, pais]);
  const fimDia = useMemo(() => instanteNaOficina(somaDias(dia, 1), 0, pais).getTime(), [dia, pais]);
  const doDia = useMemo(() => ocupacoes.filter((o) => {
    const ini = Date.parse(o.inicio); const fim = o.fim ? Date.parse(o.fim) : Math.max(agora, ini + 60e3);
    return ini < fimDia && fim > inicioDia;
  }), [ocupacoes, inicioDia, fimDia, agora]);
  const [janIni, janFim] = useMemo(() => {
    const h = horario?.[DIA_SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]];
    let a = h?.aberto && minDe(h.inicio) >= 0 ? minDe(h.inicio) : 8 * 60;
    let b = h?.aberto && minDe(h.fim) > a ? minDe(h.fim) : 18 * 60;
    a = Math.max(0, Math.floor(a / 60) * 60 - 60); b = Math.min(24 * 60, Math.ceil(b / 60) * 60 + 60);
    for (const o of doDia) {
      // so horarios que caem dentro do dia (carro no elevador desde ontem nao
      // puxa a grade para 00:00 - achado com a oficina demo, 10/10)
      const ini = Date.parse(o.inicio); const fim = o.fim ? Date.parse(o.fim) : agora;
      if (ini >= inicioDia && ini < fimDia) a = Math.min(a, Math.floor(((ini - inicioDia) / 60e3) / 60) * 60);
      if (fim > inicioDia && fim <= fimDia) b = Math.max(b, Math.ceil(((fim - inicioDia) / 60e3) / 60) * 60);
    }
    if (dia === hoje) { const m = (agora - inicioDia) / 60e3; a = Math.min(a, Math.floor(m / 60) * 60); b = Math.max(b, Math.min(24 * 60, Math.ceil(m / 60) * 60 + 60)); }
    return [Math.max(0, a), Math.min(Math.round((fimDia - inicioDia) / 60e3), b)];
  }, [horario, dia, doDia, inicioDia, fimDia, agora, hoje]);
  const horas = Math.max(1, Math.round((janFim - janIni) / 60));
  const largura = horas * px;
  const x = (ms: number) => ((ms - inicioDia) / 60e3 - janIni) / 60 * px;
  const msDeX = (px_: number) => inicioDia + (janIni + (px_ / px) * 60) * 60e3;
  const horaTxt = (ms: number) => hhmm(minutoNaOficina(new Date(ms), pais));
  const passado = dia < hoje;

  // faixas: ocupacoes que se cruzam no mesmo posto vao uma embaixo da outra
  const porPosto = useMemo(() => {
    const m: Record<string, { o: OcupacaoVista; faixa: number; ini: number; fim: number }[]> = {};
    for (const p of postos) {
      const minhas = doDia.filter((o) => o.box_id === p.id)
        .map((o) => ({ o, ini: Math.max(Date.parse(o.inicio), inicioDia), fim: Math.min(o.fim ? Date.parse(o.fim) : Math.max(agora, Date.parse(o.inicio) + 60e3), fimDia) }))
        .sort((a, b) => a.ini - b.ini);
      const fins: number[] = [];
      m[p.id] = minhas.map((it) => {
        let f = fins.findIndex((fim) => fim <= it.ini);
        if (f === -1) { f = fins.length; fins.push(it.fim); } else fins[f] = it.fim;
        return { ...it, faixa: f };
      });
    }
    return m;
  }, [postos, doDia, inicioDia, fimDia, agora]);

  // carros na oficina agora, sem posto (so faz sentido no dia de hoje)
  const semPosto = useMemo(() => (dia !== hoje ? [] : barras.filter((b) => b.ev.status === 'em_andamento' && !(b.ev.ocupacoes || []).some((o: Ocupacao) => o.real && !o.fim))), [barras, dia, hoje]);

  const statusAgora = (p: Box) => {
    if (dia !== hoje) return null;
    const ocup = ocupacoes.filter((o) => o.box_id === p.id);
    const dentro = ocup.filter((o) => o.real && !o.fim);
    if ((p.capacidade || 1) > 1) return { txt: t('horaVagaOcupacao', { n: dentro.length, total: p.capacidade || 1 }), cor: dentro.length >= (p.capacidade || 1) ? 'text-red-700' : 'text-green-700' };
    if (dentro.length && (p.capacidade || 1) <= dentro.length) return { txt: t('horaOcupadoDesde', { carro: dentro[0].rotulo, hora: horaTxt(Date.parse(dentro[0].inicio)) }), cor: 'text-red-700' };
    const prox = ocup.filter((o) => !o.real && Date.parse(o.inicio) > agora).sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))[0];
    const agoraRes = ocup.find((o) => !o.real && Date.parse(o.inicio) <= agora && Date.parse(o.fim || '') > agora);
    if (agoraRes) return { txt: t('horaReservadoAte', { hora: horaTxt(Date.parse(agoraRes.fim!)) }), cor: 'text-blue-700' };
    if (prox && Date.parse(prox.inicio) < fimDia) return { txt: t('horaLivreAte', { hora: horaTxt(Date.parse(prox.inicio)) }), cor: 'text-green-700' };
    return { txt: t('horaLivre'), cor: 'text-green-700' };
  };

  // elevadores e postos no chao livres em cada hora (vaga de espera nao conta)
  const trabalho = postos.filter((p) => p.tipo !== 'vaga');
  const livresNaHora = (k: number) => {
    const a = inicioDia + (janIni + k * 60) * 60e3, b = a + 3600e3;
    return trabalho.filter((p) => !doDia.some((o) => o.box_id === p.id && Date.parse(o.inicio) < b && (o.fim ? Date.parse(o.fim) : agora) > a)).length;
  };

  const carrosParaReservar = useMemo(() => barras.filter((b) => podeMexer(b.ev) && (b.ev.id === reservarPara?.evId || b.ev.status === 'em_andamento' || (b.ev.status === 'agendado' && b.prevIni <= dia && b.prevFim >= dia))), [barras, podeMexer, dia, reservarPara]);

  const abrirNova = (boxId: string, ms: number) => {
    // antes o clique nao fazia nada nesses casos (teste do dono 10/10): agora explica
    if (passado) { setErro(t('horaDicaPassado')); return; }
    if (!carrosParaReservar.length) { setErro(t('horaSemCarros')); return; }
    let ini = Math.round(ms / (15 * 60e3)) * 15 * 60e3;
    if (ini < agora) ini = Math.ceil(agora / (15 * 60e3)) * 15 * 60e3;
    setErro('');
    setFolha({ modo: 'nova', evId: carrosParaReservar[0].ev.id, boxId, inicio: horaTxt(ini), dur: 60, obs: '' });
  };
  // vindo do detalhe do carro: dia do carro (hoje, ou o dia marcado se for depois),
  // primeiro elevador/posto livre na proxima hora cheia de 15 min, este carro escolhido
  useEffect(() => {
    if (!reservarPara) return;
    const b = barras.find((x) => x.ev.id === reservarPara.evId);
    if (!b || !postos.length) return;
    const d = b.ev.status === 'agendado' && b.prevIni > hoje ? b.prevIni : hoje;
    setDia(d);
    const h = horario?.[DIA_SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]];
    const abre = instanteNaOficina(d, h?.aberto && minDe(h.inicio) >= 0 ? minDe(h.inicio) : 8 * 60, pais).getTime();
    const ini = Math.max(abre, Math.ceil(agora / (15 * 60e3)) * 15 * 60e3);
    const livre = (p: Box) => !ocupacoes.some((o) => o.box_id === p.id && Date.parse(o.inicio) < ini + 3600e3 && (o.fim ? Date.parse(o.fim) : agora + 15 * 60e3) > ini);
    const posto = postos.find((p) => p.tipo !== 'vaga' && livre(p)) || postos.find((p) => p.tipo !== 'vaga') || postos[0];
    setErro('');
    setFolha({ modo: 'nova', evId: b.ev.id, boxId: posto.id, inicio: horaTxt(ini), dur: 60, obs: '' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservarPara?.n]);

  const abrirEditar = (o: OcupacaoVista) => {
    setErro('');
    const ini = Date.parse(o.inicio), fim = Date.parse(o.fim || o.inicio);
    setFolha({ modo: 'editar', ocup: o, evId: o.agenda_id, boxId: o.box_id, inicio: horaTxt(ini), dur: Math.max(15, Math.round((fim - ini) / 60e3)), obs: o.observacao || '' });
  };

  const tratar = (r: Resposta) => {
    if (r.ok) return true;
    if (r.dados?.codigo === 'CONFLITO_POSTO') {
      const quem = (r.dados.ocupadoPor || []).map((o: any) => `${o.titulo || '—'} ${horaTxt(Date.parse(o.inicio))}–${o.fim ? horaTxt(Date.parse(o.fim)) : '…'}`).join(', ');
      setErro(t('horaErroConflito', { quem }));
    } else if (r.dados?.codigo === 'HORARIO_INVALIDO') setErro(t('horaErroHorario'));
    else setErro(t('quadroErroSalvar'));
    return false;
  };
  const salvarFolha = async () => {
    if (!folha) return;
    const m = minDe(folha.inicio);
    if (!Number.isFinite(m)) { setErro(t('horaErroHorario')); return; }
    const ini = instanteNaOficina(dia, m, pais).getTime();
    const corpo = folha.modo === 'nova'
      ? { acao: 'posto_reservar', eventoId: folha.evId, boxId: folha.boxId, inicio: new Date(ini).toISOString(), fim: new Date(ini + folha.dur * 60e3).toISOString(), observacao: folha.obs }
      : { acao: 'posto_mover', ocupacaoId: folha.ocup!.id, boxId: folha.boxId, inicio: new Date(ini).toISOString(), fim: new Date(ini + folha.dur * 60e3).toISOString(), observacao: folha.obs };
    setSalvando(true); const r = await enviar(corpo); setSalvando(false);
    if (tratar(r)) setFolha(null);
  };
  const acaoFolha = async (corpo: Record<string, unknown>) => {
    setSalvando(true); const r = await enviar(corpo); setSalvando(false);
    if (tratar(r)) setFolha(null);
  };

  const soltar = async (boxId: string, clientX: number, el: HTMLElement) => {
    const a = arrastando; setArrastando(null); setAlvo(null);
    if (!a || passado) return;
    if (a.tipo === 'carro') { setErro(''); tratar(await enviar({ acao: 'posto_entrar', eventoId: a.ev.id, boxId })); return; }
    const dur = Date.parse(a.ocup.fim!) - Date.parse(a.ocup.inicio);
    const xRel = clientX - el.getBoundingClientRect().left;
    let ini = Math.round((msDeX(xRel) - a.pega) / (15 * 60e3)) * 15 * 60e3;
    if (ini + dur <= agora) ini = Math.ceil(agora / (15 * 60e3)) * 15 * 60e3;
    setErro('');
    tratar(await enviar({ acao: 'posto_mover', ocupacaoId: a.ocup.id, boxId, inicio: new Date(ini).toISOString(), fim: new Date(ini + dur).toISOString() }));
  };

  // ao abrir (ou mudar de dia) a grade rola ate a hora atual / inicio do expediente
  useEffect(() => {
    const el = rolagem.current; if (!el) return;
    const alvoX = dia === hoje ? x(agora) - 2 * px : 0;
    el.scrollLeft = Math.max(0, alvoX);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia, janIni, px]);

  const fmtDiaLongo = new Intl.DateTimeFormat(INTL_LOCALE[locale] || locale, { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  const ALT = 30;

  const linhaSemPosto = semPosto.length > 0 && (
    <div className="flex border-b border-gray-200 bg-amber-50/40">
      <div className="sticky left-0 z-20 w-[150px] shrink-0 bg-amber-50 px-3 py-2 border-r border-gray-100">
        <p className="font-medium text-gray-900 text-sm">{t('horaSemPosto')}</p>
        <p className="text-[11px] text-gray-500">{t('horaSemPostoDica')}</p>
      </div>
      <div className="relative shrink-0" style={{ width: largura, height: semPosto.length * ALT + 8 }}>
        {semPosto.map((b, i) => {
          const ini = Math.max(Date.parse(b.ev.checkin_em || b.ev.data_inicio), inicioDia + janIni * 60e3);
          const left = Math.max(0, x(ini)); const width = Math.max(24, x(agora) - left);
          return (
            <button key={b.ev.id} type="button" draggable={podeMexer(b.ev)}
              onDragStart={(e) => { setArrastando({ tipo: 'carro', ev: b.ev }); e.dataTransfer.effectAllowed = 'move'; }}
              onDragEnd={() => { setArrastando(null); setAlvo(null); }}
              onClick={() => onAbrirCarro(b.ev)}
              title={`${b.rotulo} — ${t(`quadroEstado.${b.estado}`)}`}
              className={`absolute rounded-md px-2 text-left text-xs font-medium truncate opacity-80 hover:opacity-100 ${COR[b.estado]}`}
              style={{ left, width, top: i * ALT + 4, height: ALT - 6 }}>
              {b.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDia(somaDias(dia, -1))} aria-label={t('horaDiaAnterior')} className="p-2 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button type="button" onClick={() => setDia(hoje)} className={`px-3 py-1.5 text-sm rounded-lg border ${dia === hoje ? 'border-primary-600 text-primary-700' : 'border-gray-200'} hover:bg-gray-50`}>{t('quadroHoje')}</button>
          <button type="button" onClick={() => setDia(somaDias(dia, 1))} aria-label={t('horaProximoDia')} className="p-2 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <span className="ml-2 text-sm font-medium text-gray-800 capitalize" data-testid="hora-dia">{fmtDiaLongo.format(new Date(`${dia}T12:00:00Z`))}</span>
        </div>
        {ehDono && <button type="button" onClick={onGerenciar} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">{t('quadroGerenciarElevadores')}</button>}
      </div>
      <p className="px-4 pt-2 text-xs text-gray-500">{passado ? t('horaDicaPassado') : t('horaDica')}</p>
      {postos.length === 0 && <p className="mx-4 mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{ehDono ? t('quadroSemElevadoresDono') : t('quadroSemElevadores')}</p>}
      {erro && !folha && <p role="alert" className="mx-4 mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">{erro}</p>}

      <div className="overflow-x-auto mt-2" ref={rolagem}>
        <div style={{ width: largura + 150 }} className="text-sm">
          {/* horas */}
          <div className="flex border-y border-gray-200 bg-gray-50">
            <div className="sticky left-0 z-20 w-[150px] shrink-0 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase text-gray-500">{t('quadroPostos')}</div>
            {Array.from({ length: horas }, (_, k) => (
              <div key={k} style={{ width: px }} className="shrink-0 border-l border-gray-200 px-1 py-1.5 text-[11px] text-gray-600">{horaTxt(inicioDia + (janIni + k * 60) * 60e3)}</div>
            ))}
          </div>
          {/* elevadores/postos livres por hora */}
          {trabalho.length > 0 && (
            <div className="flex border-b border-gray-200">
              <div className="sticky left-0 z-20 w-[150px] shrink-0 bg-white px-3 py-1 text-xs font-medium text-gray-700">{t('quadroElevadoresLivres', { total: trabalho.length })}</div>
              {Array.from({ length: horas }, (_, k) => {
                const n = livresNaHora(k);
                return <div key={k} style={{ width: px }} className={`shrink-0 text-center py-1 text-xs font-semibold border-l border-white ${n === 0 ? 'bg-orange-400 text-white' : n / trabalho.length < 0.5 ? 'bg-yellow-200 text-yellow-900' : 'bg-green-100 text-green-900'}`}>{n}</div>;
              })}
            </div>
          )}
          {/* no celular, os carros sem posto vem primeiro (e o que mais se procura) */}
          <div className="sm:hidden">{linhaSemPosto}</div>
          {postos.map((p) => {
            const itens = porPosto[p.id] || [];
            const nF = Math.max(1, ...itens.map((i) => i.faixa + 1));
            const st = statusAgora(p);
            return (
              <div key={p.id} className={`flex border-b border-gray-100 ${alvo === p.id ? 'bg-primary-50' : ''}`}
                onDragOver={(e) => { if (arrastando) { e.preventDefault(); setAlvo(p.id); } }}
                onDragLeave={() => setAlvo((a) => (a === p.id ? null : a))}
                onDrop={(e) => { e.preventDefault(); soltar(p.id, e.clientX, e.currentTarget.lastElementChild as HTMLElement); }}>
                <div className="sticky left-0 z-20 w-[150px] shrink-0 bg-white px-3 py-2 border-r border-gray-100" title={t(`quadroTipoBoxExplica.${p.tipo}`)}>
                  <p className="font-medium text-gray-900 truncate">{p.nome}</p>
                  <p className="text-[11px] text-gray-400">{t(`quadroTipoBox.${p.tipo}`)}{p.tipo === 'vaga' && (p.capacidade || 1) > 1 ? ` · ${t('horaCapacidade', { n: p.capacidade || 1 })}` : ''}</p>
                  {st && <p className={`text-[11px] font-medium ${st.cor}`} data-testid={`status-${p.nome}`}>{st.txt}</p>}
                </div>
                <div className="relative shrink-0 cursor-cell" style={{ width: largura, height: nF * ALT + 8 }}
                  onClick={(e) => { if (e.target === e.currentTarget) abrirNova(p.id, msDeX(e.clientX - e.currentTarget.getBoundingClientRect().left)); }}>
                  {Array.from({ length: horas }, (_, k) => <div key={k} className="absolute top-0 bottom-0 border-l border-gray-100 pointer-events-none" style={{ left: k * px }} aria-hidden="true" />)}
                  {itens.map(({ o, faixa, ini, fim }) => {
                    const left = Math.max(0, x(ini)); const width = Math.max(18, x(fim) - left);
                    const naoUsada = !o.real && Date.parse(o.fim!) < agora;
                    const conflito = (p.capacidade || 1) === 1 && itens.some((y) => y.o.id !== o.id && y.o.agenda_id !== o.agenda_id && Math.min(y.fim, fim) - Math.max(y.ini, ini) > 60e3);
                    const cls = o.real
                      ? `${o.minha ? COR[o.estado] : 'bg-gray-500 text-white'} ${!o.fim ? 'border-r-4 border-white/70' : ''}`
                      : naoUsada ? 'bg-orange-50 text-orange-800 border-2 border-dashed border-orange-400' : 'bg-white text-blue-800 border-2 border-dashed border-blue-500';
                    const titulo = `${o.rotulo} · ${horaTxt(Date.parse(o.inicio))}–${o.fim ? horaTxt(Date.parse(o.fim)) : t('horaAgora')}${o.real ? '' : ` · ${naoUsada ? t('horaReservaNaoUsada') : t('horaReserva')}`}${o.observacao ? ` · ${o.observacao}` : ''}`;
                    return (
                      <button key={o.id} type="button" title={titulo}
                        draggable={!o.real && !naoUsada && o.minha}
                        onDragStart={(e) => { const r = e.currentTarget.getBoundingClientRect(); setArrastando({ tipo: 'reserva', ocup: o, pega: ((e.clientX - r.left) / px) * 3600e3 }); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                        onClick={() => { const b = barras.find((y) => y.ev.id === o.agenda_id); if (!o.real && o.minha && !naoUsada) abrirEditar(o); else if (b) onAbrirCarro(b.ev); }}
                        className={`absolute rounded-md px-1.5 text-left text-[11px] font-medium truncate shadow-sm ${cls} ${conflito ? 'ring-2 ring-red-600 ring-offset-1' : ''}`}
                        style={{ left, width, top: faixa * ALT + 4, height: ALT - 6 }}>
                        {naoUsada ? '⚠ ' : !o.real ? '◷ ' : ''}{o.minha ? o.rotulo : t('horaOcupado')}
                      </button>
                    );
                  })}
                  {dia === hoje && x(agora) >= 0 && x(agora) <= largura && <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none" style={{ left: x(agora) }} aria-hidden="true" />}
                </div>
              </div>
            );
          })}
          <div className="hidden sm:block">{linhaSemPosto}</div>
        </div>
      </div>

      {folha && (() => {
        const carro = barras.find((b) => b.ev.id === folha.evId);
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={() => setFolha(null)}>
            <div role="dialog" aria-modal="true" aria-labelledby="hora-folha-titulo" className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl p-5 space-y-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <h3 id="hora-folha-titulo" className="font-semibold text-gray-900">{folha.modo === 'nova' ? t('horaReservar') : t('horaEditarReserva')}</h3>
                <button type="button" onClick={() => setFolha(null)} aria-label={t('quadroFechar')} className="min-w-[44px] min-h-[44px] -m-2 text-xl text-gray-500">✕</button>
              </div>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">{t('horaCarro')}</span>
                {folha.modo === 'nova' ? (
                  <select className="input-field" value={folha.evId} onChange={(e) => setFolha({ ...folha, evId: e.target.value })}>
                    {carrosParaReservar.map((b) => <option key={b.ev.id} value={b.ev.id}>{b.rotulo} — {t(`quadroEstado.${b.estado}`)}</option>)}
                  </select>
                ) : <p className="text-sm text-gray-900">{carro?.rotulo || folha.ocup?.rotulo}</p>}
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">{t('horaPosto')}</span>
                <select className="input-field" value={folha.boxId} onChange={(e) => setFolha({ ...folha, boxId: e.target.value })}>
                  {postos.map((p) => <option key={p.id} value={p.id}>{p.nome} — {t(`quadroTipoBox.${p.tipo}`)}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-sm font-medium text-gray-700 mb-1">{t('horaInicio')}</span>
                  <input type="time" step={900} className="input-field" value={folha.inicio} onChange={(e) => setFolha({ ...folha, inicio: e.target.value })} />
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-gray-700 mb-1">{t('horaDuracao')}</span>
                  <select className="input-field" value={folha.dur} onChange={(e) => setFolha({ ...folha, dur: Number(e.target.value) })}>
                    {Array.from(new Set([...DURACOES, folha.dur])).sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : `${hhmm(d)} h`}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">{t('horaObservacao')}</span>
                <input className="input-field" maxLength={200} value={folha.obs} onChange={(e) => setFolha({ ...folha, obs: e.target.value })} placeholder={t('horaObservacaoExemplo')} />
              </label>
              <p className="text-xs text-gray-500">{t('horaFusoAviso')}</p>
              {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
              <button type="button" disabled={salvando} onClick={salvarFolha} className="btn-primary w-full disabled:opacity-50">{salvando ? t('quadroSalvando') : folha.modo === 'nova' ? t('horaReservar') : t('horaSalvar')}</button>
              {folha.modo === 'editar' && folha.ocup && (
                <div className="grid gap-2">
                  {carro?.ev.status === 'em_andamento' && dia === hoje && (
                    <button type="button" disabled={salvando} onClick={() => acaoFolha({ acao: 'posto_entrar', eventoId: folha.evId, boxId: folha.boxId })} className="btn-secondary w-full">{t('horaColocarAgora')}</button>
                  )}
                  <button type="button" disabled={salvando} onClick={() => acaoFolha({ acao: 'posto_cancelar', ocupacaoId: folha.ocup!.id })} className="w-full rounded-lg border border-red-200 py-2 text-sm font-medium text-red-700 hover:bg-red-50">{t('horaCancelarReserva')}</button>
                  {carro?.ev.solicitacao_id && <Link href={`/oficina/pedidos/${carro.ev.solicitacao_id}`} className="btn-secondary flex w-full items-center justify-center">📄 {t('quadroVerPedido')}</Link>}
                  {carro && <button type="button" onClick={() => { setFolha(null); onAbrirCarro(carro.ev); }} className="text-sm text-primary-700 hover:underline">{t('horaVerCarro')}</button>}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
