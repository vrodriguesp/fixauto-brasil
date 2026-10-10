'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { diaNaOficina, fusoDoPais, minutoNaOficina } from '@/lib/fuso';
import { INTL_LOCALE } from '@/lib/utils';
import { nomeFuncionario } from '@/lib/funcionario';
import QuadroHora, { type OcupacaoVista } from './QuadroHora';
import { COR, NA_OFICINA, ORDEM_LEGENDA, diasEntre, duracao, montarBarra, somaDias, temposDoCarro, type Barra, type Box, type Ocupacao } from './quadro-util';

export type { Box } from './quadro-util';

// "Quadro" da oficina (projeto docs/PROJETO_QUADRO_OFICINA_2026-10-09.md):
// - 14 dias, uma linha por MECANICO ou por POSTO (elevador, posto no chao,
//   vaga de espera); cada carro e desenhado no tempo em que REALMENTE esteve
//   na oficina (clique de check-in -> entrega). O combinado (previsto) aparece
//   como linha tracejada fina so quando difere do real.
// - visao HORA: um dia hora a hora por posto, com reservas de intervalo.
// - Monitoramento (liga/desliga no Perfil): tempos do carro, tirados dos
//   carimbos que ja sao gravados (nada a mais para digitar).
// Usa OS MESMOS agendamentos do calendario (useAgenda, com tempo real).
// A DATA nunca muda por arrasto: mudar a data de carro de cliente e
// reagendamento com ele.

type Por = 'mecanico' | 'elevador' | 'hora';
type Resposta = { ok: boolean; status: number; dados: any };

const DIAS = 14;
const LARG_DIA = 52;
const ALT_LINHA = 34;
const CHAVE_POR = 'bipfix_quadro_por';
const CHAVE_PREVISTO = 'bipfix_quadro_previsto';
const PARADO_MIN = 120; // carro na oficina sem ninguem mexer (monitoramento)

export interface QuadroProps {
  eventos: any[]; // carros que o usuario ve (mecanico: so os dele)
  todosEventos?: any[]; // toda a oficina: ocupacao dos postos na visao Hora
  funcionarios: any[];
  boxes: Box[];
  oficina: { id: string; pais?: string | null; horario_funcionamento?: any; capacidade_total?: number | null; monitoramento_ativo?: boolean | null };
  ehDono: boolean;
  meuFuncionarioId?: string | null;
  onAbrirDia: (ymd: string, ev: any) => void;
  onAlterado: () => void;
}

export default function QuadroOficina({ eventos, todosEventos, funcionarios, boxes, oficina, ehDono, meuFuncionarioId, onAbrirDia, onAlterado }: QuadroProps) {
  const t = useTranslations('oficinaAgenda');
  const tc = useTranslations('constants');
  const locale = useLocale();
  const pais = oficina.pais;
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setAgora(Date.now()), 60e3); return () => clearInterval(i); }, []);
  const hoje = diaNaOficina(new Date(agora), pais);
  const [inicio, setInicio] = useState(() => somaDias(diaNaOficina(new Date(), pais), -2));
  const [por, setPor] = useState<Por>(() => { try { const v = localStorage.getItem(CHAVE_POR) as Por; return ['mecanico', 'elevador', 'hora'].includes(v) ? v : 'mecanico'; } catch { return 'mecanico'; } });
  const [mostrarPrevisto, setMostrarPrevisto] = useState(() => { try { return localStorage.getItem(CHAVE_PREVISTO) !== '0'; } catch { return true; } });
  const [aberto, setAberto] = useState<any | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [gerenciar, setGerenciar] = useState(false);
  const [novoBox, setNovoBox] = useState({ nome: '', tipo: 'elevador' as Box['tipo'], capacidade: 20 });

  const mudarPor = (p: Por) => { setPor(p); try { localStorage.setItem(CHAVE_POR, p); } catch {} };
  const mudarPrevisto = (v: boolean) => { setMostrarPrevisto(v); try { localStorage.setItem(CHAVE_PREVISTO, v ? '1' : '0'); } catch {} };
  const boxesAtivos = useMemo(() => boxes.filter((b) => b.ativo).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)), [boxes]);
  const nomeBox = (id: string | null | undefined) => boxes.find((b) => b.id === id)?.nome || '';
  const monitorando = !!oficina.monitoramento_ativo;

  const dias = useMemo(() => Array.from({ length: DIAS }, (_, i) => somaDias(inicio, i)), [inicio]);
  const fimJanela = dias[dias.length - 1];
  const intl = INTL_LOCALE[locale] || locale;
  const fuso = fusoDoPais(pais);
  const fmtDia = useMemo(() => new Intl.DateTimeFormat(intl, { weekday: 'short', timeZone: 'UTC' }), [intl]);
  const fmtData = useMemo(() => new Intl.DateTimeFormat(intl, { day: '2-digit', month: '2-digit', timeZone: fuso }), [intl, fuso]);
  const fmtDataHora = useMemo(() => new Intl.DateTimeFormat(intl, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: fuso }), [intl, fuso]);
  const fmtHora = useMemo(() => new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit', timeZone: fuso }), [intl, fuso]);

  const barras = useMemo(() => eventos.map((ev) => montarBarra(ev, hoje, pais, t('evento'))), [eventos, hoje, pais, t]);
  const podeMover = (ev: any) => (por === 'mecanico' ? ehDono : ehDono || (!!meuFuncionarioId && ev.funcionario_id === meuFuncionarioId));
  const podePosto = (ev: any) => ehDono || (!!meuFuncionarioId && ev.funcionario_id === meuFuncionarioId);
  const abertaDe = (ev: any): Ocupacao | undefined => (ev.ocupacoes || []).find((o: Ocupacao) => o.real && !o.fim);

  // ocupacoes de toda a oficina (o mecanico ve que o elevador esta ocupado,
  // sem os detalhes dos carros que nao sao dele)
  const ocupacoesVistas: OcupacaoVista[] = useMemo(() => {
    const meus = new Set(eventos.map((e) => e.id));
    return (todosEventos || eventos).flatMap((ev) => {
      if (ev.status === 'cancelado') return [];
      const b = montarBarra(ev, hoje, pais, t('evento'));
      return (ev.ocupacoes || []).map((o: Ocupacao) => ({ ...o, rotulo: b.rotulo, estado: b.estado, minha: meus.has(ev.id) }));
    });
  }, [todosEventos, eventos, hoje, pais, t]);

  // ---------- itens desenhados em cada linha (14 dias) ----------
  type Item = { key: string; b: Barra; ini: string; fim: string; tipo: 'carro' | 'real' | 'reserva' | 'planejado'; ghost?: [string, string] };
  const itensPorLinha = useMemo(() => {
    const m: Record<string, Item[]> = {};
    const add = (linha: string, it: Item) => { (m[linha] ||= []).push(it); };
    const ghost = (b: Barra): [string, string] | undefined => (mostrarPrevisto && b.difereDoPrevisto ? [b.prevIni, b.prevFim] : undefined);
    if (por === 'mecanico') {
      for (const b of barras) add(b.ev.funcionario_id || 'sem', { key: b.ev.id, b, ini: b.ini, fim: b.fim, tipo: 'carro', ghost: ghost(b) });
    } else {
      for (const b of barras) {
        const ocup: Ocupacao[] = b.ev.ocupacoes || [];
        for (const o of ocup) {
          const ini = diaNaOficina(o.inicio, pais);
          const fim = o.fim ? diaNaOficina(o.fim, pais) : hoje;
          add(o.box_id, { key: o.id, b, ini, fim: fim < ini ? ini : fim, tipo: o.real ? 'real' : 'reserva' });
        }
        if (b.ev.status === 'agendado' && b.ev.box_id && !ocup.length) add(b.ev.box_id, { key: `${b.ev.id}-p`, b, ini: b.ini, fim: b.fim, tipo: 'planejado' });
        const semPosto = (b.ev.status === 'agendado' && !b.ev.box_id) || (b.ev.status === 'em_andamento' && !abertaDe(b.ev)) || (b.ev.status === 'concluido' && !ocup.some((o) => o.real));
        if (semPosto) add('sem', { key: `${b.ev.id}-s`, b, ini: b.ini, fim: b.fim, tipo: 'carro', ghost: ghost(b) });
      }
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barras, por, mostrarPrevisto, hoje, pais]);

  const linhas = useMemo(() => {
    const ls: { id: string; nome: string; limite: number | null; sub?: string; dica?: string }[] = [];
    if (por === 'mecanico') {
      for (const f of funcionarios) ls.push({ id: f.id, nome: nomeFuncionario(f) || t('mecanicoSemNome'), limite: f.capacidade_maxima ?? null });
      for (const b of barras) { const id = b.ev.funcionario_id; if (id && !ls.some((l) => l.id === id)) ls.push({ id, nome: nomeFuncionario(b.ev.funcionario) || t('mecanicoSemNome'), limite: null }); }
      if (ehDono || barras.some((b) => !b.ev.funcionario_id)) ls.push({ id: 'sem', nome: t('quadroSemMecanico'), limite: null });
    } else {
      for (const b of boxesAtivos) ls.push({ id: b.id, nome: b.nome, limite: b.capacidade || 1, sub: t(`quadroTipoBox.${b.tipo}`), dica: t(`quadroTipoBoxExplica.${b.tipo}`) });
      for (const id of Object.keys(itensPorLinha)) if (id !== 'sem' && !ls.some((l) => l.id === id)) ls.push({ id, nome: nomeBox(id) || '—', limite: 1 });
      ls.push({ id: 'sem', nome: t('quadroSemElevador'), limite: null });
    }
    return ls;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [por, funcionarios, boxesAtivos, barras, itensPorLinha, ehDono, t]);

  const noDia = (it: { ini: string; fim: string }, d: string) => it.ini <= d && it.fim >= d;
  const naOficinaHoje = (b: Barra) => NA_OFICINA.includes(b.estado) && b.ini <= hoje && b.fim >= hoje;
  const cargaLinha = (id: string) => barras.filter((b) => (b.ev.funcionario_id || 'sem') === id && naOficinaHoje(b)).length;

  // faixas: itens que se sobrepoem (contando a linha do previsto) vao um embaixo do outro
  const faixas = useMemo(() => {
    const porLinha: Record<string, (Item & { faixa: number })[]> = {};
    for (const l of linhas) {
      const minhas = (itensPorLinha[l.id] || [])
        .map((it) => ({ ...it, a: it.ghost && it.ghost[0] < it.ini ? it.ghost[0] : it.ini, z: it.ghost && it.ghost[1] > it.fim ? it.ghost[1] : it.fim }))
        .filter((it) => it.z >= inicio && it.a <= fimJanela)
        .sort((x, y) => (x.a < y.a ? -1 : 1));
      const fins: string[] = [];
      porLinha[l.id] = minhas.map((it) => {
        let f = fins.findIndex((fim) => fim < it.a);
        if (f === -1) { f = fins.length; fins.push(it.z); } else fins[f] = it.z;
        return { ...it, faixa: f };
      });
    }
    return porLinha;
  }, [linhas, itensPorLinha, inicio, fimJanela]);
  const visiveis = Object.values(faixas).reduce((s, l) => s + l.length, 0);

  // ---------- capacidade e disponibilidade ----------
  const capTotal = oficina.capacidade_total || null;
  const capMec = capTotal || Math.max(1, funcionarios.reduce((s, f) => s + (f.capacidade_maxima || 2), 0));
  const carrosNoDia = (d: string) => barras.filter((b) => ['agendado', 'checkinAtrasado', ...NA_OFICINA].includes(b.estado) && noDia(b, d)).length;
  const trabalho = boxesAtivos.filter((b) => b.tipo !== 'vaga');
  const celulaDisp = (d: string) => {
    if (por === 'elevador' && trabalho.length > 0) {
      const ocupados = new Set(trabalho.filter((p) => (itensPorLinha[p.id] || []).some((it) => noDia(it, d))).map((p) => p.id)).size;
      const livres = trabalho.length - ocupados;
      return { txt: `${Math.max(0, livres)}`, cor: livres <= 0 ? 'bg-orange-400 text-white' : livres / trabalho.length < 0.5 ? 'bg-yellow-200 text-yellow-900' : 'bg-green-200 text-green-900' };
    }
    const n = carrosNoDia(d);
    return { txt: capTotal ? `${n}/${capTotal}` : `${n}`, cor: n === 0 ? 'bg-gray-50 text-gray-400' : n / capMec <= 0.5 ? 'bg-green-200 text-green-900' : n / capMec < 1 ? 'bg-yellow-200 text-yellow-900' : n / capMec === 1 ? 'bg-orange-400 text-white' : 'bg-red-600 text-white' };
  };

  // ---------- alertas ----------
  const tempos = useMemo(() => new Map(barras.map((b) => [b.ev.id, temposDoCarro(b.ev, agora)])), [barras, agora]);
  const parados = monitorando ? barras.filter((b) => { const p = tempos.get(b.ev.id)?.paradoDesde; return p && agora - Date.parse(p) > PARADO_MIN * 60e3; }) : [];
  const presos = monitorando ? barras.filter((b) => {
    const o = abertaDe(b.ev); if (!o) return false;
    const tipo = boxes.find((x) => x.id === o.box_id)?.tipo;
    const ult = [...(b.ev.etapas || [])].sort((x: any, y: any) => (x.created_at < y.created_at ? -1 : 1)).slice(-1)[0];
    return tipo === 'elevador' && ['aguardandoPecas', 'aguardandoCliente', 'pausado', 'pronto'].includes(b.estado) && ult && agora - Date.parse(ult.created_at) > 30 * 60e3;
  }) : [];
  const mecanicosNoLimite = funcionarios.filter((f) => f.capacidade_maxima != null && barras.filter((b) => b.ev.funcionario_id === f.id && naOficinaHoje(b)).length > f.capacidade_maxima).length;
  const hojeNaOficina = carrosNoDia(hoje);
  const alertas = [
    { n: capTotal && hojeNaOficina > capTotal ? hojeNaOficina : 0, txt: t('quadroAlertaAcimaLimite', { total: capTotal || 0 }) },
    { n: barras.filter((b) => b.estado === 'pronto').length, txt: t('quadroAlertaProntos') },
    { n: barras.filter((b) => b.estado === 'agendado' && b.ini === hoje).length, txt: t('quadroAlertaCheckinHoje') },
    { n: barras.filter((b) => b.estado === 'checkinAtrasado').length, txt: t('quadroAlertaCheckinAtrasado') },
    { n: barras.filter((b) => b.atrasoDesde).length, txt: t('quadroAlertaPrazo') },
    { n: mecanicosNoLimite, txt: t('quadroAlertaMecanicoLimite') },
    { n: parados.length, txt: t('quadroAlertaParados', { horas: PARADO_MIN / 60 }) },
    { n: presos.length, txt: t('quadroAlertaElevadorPreso') },
  ].filter((a) => a.n > 0);

  // ---------- acoes ----------
  const enviar = async (corpo: Record<string, unknown>): Promise<Resposta> => {
    setSalvando(true); setErro('');
    const res = await fetch('/api/servico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).catch(() => null);
    const dados = res ? await res.json().catch(() => ({})) : {};
    setSalvando(false);
    if (res?.ok) onAlterado();
    return { ok: !!res?.ok, status: res?.status || 0, dados };
  };
  const erroDe = (r: Resposta) => {
    if (r.dados?.codigo === 'CONFLITO_POSTO') {
      const quem = (r.dados.ocupadoPor || []).map((o: any) => `${o.titulo || '—'} ${fmtHora.format(new Date(o.inicio))}–${o.fim ? fmtHora.format(new Date(o.fim)) : '…'}`).join(', ');
      return t('horaErroConflito', { quem });
    }
    return t('quadroErroSalvar');
  };
  const trocarMecanico = async (ev: any, funcId: string) => {
    if ((ev.funcionario_id || 'sem') === funcId) return;
    const r = await enviar({ acao: 'atribuir', eventoId: ev.id, ...(funcId !== 'sem' ? { funcionarioId: funcId } : {}) });
    if (r.ok) setAberto((a: any) => (a && a.id === ev.id ? { ...a, funcionario_id: funcId === 'sem' ? null : funcId } : a)); else setErro(erroDe(r));
  };
  // agendado: posto planejado; na oficina: coloca/tira agora (ocupacao real)
  const trocarPosto = async (ev: any, boxId: string) => {
    const atual = ev.status === 'em_andamento' ? abertaDe(ev)?.box_id : ev.box_id;
    if ((atual || 'sem') === boxId) return;
    const r = await enviar({ acao: 'elevador', eventoId: ev.id, ...(boxId !== 'sem' ? { boxId } : {}) });
    if (r.ok) setAberto((a: any) => (a && a.id === ev.id ? { ...a, box_id: boxId === 'sem' ? null : boxId, ocupacoes: ev.status === 'em_andamento' ? [...(a.ocupacoes || []).map((o: Ocupacao) => (o.real && !o.fim ? { ...o, fim: new Date().toISOString() } : o)), ...(boxId !== 'sem' ? [{ id: 'novo', box_id: boxId, agenda_id: ev.id, inicio: new Date().toISOString(), fim: null, real: true }] : [])] : a.ocupacoes } : a));
    else setErro(erroDe(r));
  };
  const soltar = (linhaId: string) => {
    const ev = eventos.find((x) => x.id === arrastando);
    setArrastando(null); setAlvo(null);
    if (!ev || !podeMover(ev)) return;
    if (por === 'mecanico') trocarMecanico(ev, linhaId); else trocarPosto(ev, linhaId);
  };

  // cadastro de postos (so o dono; remover = desativar, o historico fica)
  const addBox = async () => {
    const nome = novoBox.nome.trim();
    if (!nome) return;
    setSalvando(true); setErro('');
    const { error } = await supabase.from('oficina_boxes').insert({ oficina_id: oficina.id, nome: nome.slice(0, 40), tipo: novoBox.tipo, ordem: boxes.length, capacidade: novoBox.tipo === 'vaga' ? Math.min(50, Math.max(1, novoBox.capacidade || 1)) : 1 });
    setSalvando(false);
    if (error) { setErro(t('quadroErroSalvar')); return; }
    setNovoBox({ ...novoBox, nome: '' });
    onAlterado();
  };
  const desativarBox = async (b: Box) => {
    setSalvando(true);
    // carros nele saem do posto e as reservas futuras dele sao canceladas
    const doPosto = ocupacoesVistas.filter((o) => o.box_id === b.id);
    for (const o of doPosto.filter((o) => o.real && !o.fim)) await fetch('/api/servico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'posto_sair', eventoId: o.agenda_id }) }).catch(() => null);
    for (const o of doPosto.filter((o) => !o.real && o.fim && Date.parse(o.fim) > Date.now())) await fetch('/api/servico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'posto_cancelar', ocupacaoId: o.id }) }).catch(() => null);
    for (const ev of eventos.filter((e) => e.status === 'agendado' && e.box_id === b.id)) await fetch('/api/servico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'elevador', eventoId: ev.id }) }).catch(() => null);
    await supabase.from('oficina_boxes').update({ ativo: false }).eq('id', b.id);
    setSalvando(false);
    onAlterado();
  };

  const largura = DIAS * LARG_DIA;
  const posX = (d: string) => dias.indexOf(d < inicio ? inicio : d > fimJanela ? fimJanela : d);
  const xAgora = dias.includes(hoje) ? dias.indexOf(hoje) * LARG_DIA + (minutoNaOficina(new Date(agora), pais) / 1440) * LARG_DIA : null;

  return (
    <div className="card !p-0 overflow-hidden">
      {alertas.length > 0 && (
        <div role="status" className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 bg-purple-50 border-b border-purple-100 text-sm text-purple-900">
          {alertas.map((a, i) => <span key={i} className="font-medium">⏱ {a.txt}: {a.n}</span>)}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        {por !== 'hora' ? (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setInicio(somaDias(inicio, -7))} aria-label={t('quadroSemanaAnterior')} className="p-2 rounded-lg hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button type="button" onClick={() => setInicio(somaDias(hoje, -2))} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">{t('quadroHoje')}</button>
            <button type="button" onClick={() => setInicio(somaDias(inicio, 7))} aria-label={t('quadroProximaSemana')} className="p-2 rounded-lg hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        ) : <span />}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">{t('quadroVerPor')}</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden" role="group" aria-label={t('quadroVerPor')}>
            {(['mecanico', 'elevador', 'hora'] as const).map((p) => (
              <button key={p} type="button" onClick={() => mudarPor(p)} aria-pressed={por === p}
                className={`px-3 py-1.5 text-sm ${por === p ? 'bg-primary-600 text-white' : 'bg-white text-gray-600'}`}>
                {p === 'mecanico' ? t('quadroPorMecanico') : p === 'elevador' ? t('quadroPorElevador') : t('quadroPorHora')}
              </button>
            ))}
          </div>
          {por !== 'hora' && (
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={mostrarPrevisto} onChange={(e) => mudarPrevisto(e.target.checked)} />{t('quadroMostrarPrevisto')}
            </label>
          )}
          {ehDono && por === 'elevador' && (
            <button type="button" onClick={() => setGerenciar(true)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">{t('quadroGerenciarElevadores')}</button>
          )}
        </div>
      </div>

      {por === 'hora' ? (
        <QuadroHora pais={pais} horario={oficina.horario_funcionamento} hoje={hoje} agora={agora} boxes={boxesAtivos} barras={barras}
          ocupacoes={ocupacoesVistas} podeMexer={podePosto} ehDono={ehDono} enviar={enviar}
          onAbrirCarro={(ev) => { setErro(''); setAberto(ev); }} onGerenciar={() => setGerenciar(true)} />
      ) : (
        <>
          {(ehDono || meuFuncionarioId) && <p className="px-4 pt-2 text-xs text-gray-500">{por === 'mecanico' ? (ehDono ? t('quadroDicaMecanico') : t('quadroDicaToque')) : t('quadroDicaElevador')}</p>}
          {por === 'elevador' && boxesAtivos.length === 0 && (
            <p className="mx-4 mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{ehDono ? t('quadroSemElevadoresDono') : t('quadroSemElevadores')}</p>
          )}
          {erro && !aberto && <p role="alert" className="mx-4 mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">{erro}</p>}

          <div className="overflow-x-auto mt-2">
            <div style={{ width: largura + 132 }} className="text-sm">
              <div className="flex border-y border-gray-200 bg-gray-50">
                <div className="sticky left-0 z-20 w-[132px] shrink-0 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase text-gray-500">{por === 'mecanico' ? t('quadroMecanico') : t('quadroElevador')}</div>
                {dias.map((d) => {
                  const dt = new Date(`${d}T12:00:00Z`);
                  return (
                    <div key={d} style={{ width: LARG_DIA }} className={`shrink-0 text-center py-1.5 leading-tight ${d === hoje ? 'bg-primary-600 text-white' : d < hoje ? 'text-gray-400' : 'text-gray-600'}`}>
                      <div className="text-[11px] capitalize">{fmtDia.format(dt).replace('.', '')}</div>
                      <div className="font-semibold">{dt.getUTCDate()}</div>
                    </div>
                  );
                })}
              </div>
              <div className="flex border-b border-gray-200">
                <div className="sticky left-0 z-20 w-[132px] shrink-0 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
                  {por === 'elevador' && trabalho.length > 0 ? t('quadroElevadoresLivres', { total: trabalho.length }) : capTotal ? t('quadroOcupacaoLimite') : t('quadroOcupacao')}
                </div>
                {dias.map((d) => { const c = celulaDisp(d); return <div key={d} style={{ width: LARG_DIA }} className={`shrink-0 text-center py-1.5 font-semibold border-l border-white ${c.cor}`}>{c.txt}</div>; })}
              </div>
              {linhas.map((l) => {
                const minhas = faixas[l.id] || [];
                const nFaixas = Math.max(1, ...minhas.map((x) => x.faixa + 1));
                const carga = cargaLinha(l.id);
                const excedeu = l.id !== 'sem' && l.limite != null && carga > l.limite;
                return (
                  <div key={l.id}
                    onDragOver={(e) => { if (arrastando) { e.preventDefault(); setAlvo(l.id); } }}
                    onDragLeave={() => setAlvo((a) => (a === l.id ? null : a))}
                    onDrop={(e) => { e.preventDefault(); soltar(l.id); }}
                    className={`flex border-b border-gray-100 ${alvo === l.id ? 'bg-primary-50' : ''}`}>
                    <div className="sticky left-0 z-20 w-[132px] shrink-0 bg-white px-3 py-2 border-r border-gray-100" title={l.dica}>
                      <p className="font-medium text-gray-900 truncate" title={l.nome}>{l.nome}</p>
                      {l.sub && <p className="text-[11px] text-gray-400">{l.sub}</p>}
                      {l.id !== 'sem' && por === 'mecanico' && (
                        <p className={`text-xs ${excedeu ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {t('quadroCarga', { atual: carga })}{l.limite != null ? ` / ${l.limite}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="relative shrink-0" style={{ width: largura, height: nFaixas * ALT_LINHA + 8 }}>
                      {dias.map((d, i) => d < hoje && <div key={d} className="absolute top-0 bottom-0 bg-gray-50" style={{ left: i * LARG_DIA, width: LARG_DIA }} aria-hidden="true" />)}
                      {xAgora != null && <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none" style={{ left: xAgora }} aria-hidden="true" />}
                      {minhas.map((it) => {
                        const { b } = it;
                        const left = posX(it.ini) * LARG_DIA + 2;
                        const width = (posX(it.fim) - posX(it.ini) + 1) * LARG_DIA - 4;
                        const outro = por === 'mecanico' ? nomeBox(abertaDe(b.ev)?.box_id || (b.ev.status === 'agendado' ? b.ev.box_id : null)) : nomeFuncionario(b.ev.funcionario);
                        const atrasoX = b.atrasoDesde && it.tipo !== 'reserva' && it.tipo !== 'planejado' && b.atrasoDesde <= it.fim ? (posX(b.atrasoDesde) - posX(it.ini)) * LARG_DIA : null;
                        const estilo = it.tipo === 'reserva' ? 'bg-white text-blue-800 border-2 border-dashed border-blue-500'
                          : it.tipo === 'planejado' ? `${COR[b.estado]} opacity-60 border-2 border-dashed border-white`
                          : COR[b.estado];
                        const real = b.realIni ? `${fmtDataHora.format(new Date(b.ev.checkin_em || b.ev.data_inicio))} → ${b.ev.status === 'concluido' ? fmtDataHora.format(new Date(b.ev.entregue_em || b.ev.data_fim)) : t('horaAgora')}` : '';
                        const titulo = [b.rotulo, t(`quadroEstado.${b.estado}`), outro, t('quadroPrevistoTitulo', { ini: fmtData.format(new Date(`${b.prevIni}T12:00:00Z`)), fim: fmtData.format(new Date(`${b.prevFim}T12:00:00Z`)) }), real && t('quadroRealTitulo', { real }), it.tipo === 'reserva' ? t('horaReserva') : it.tipo === 'planejado' ? t('quadroPostoPlanejado') : '']
                          .filter(Boolean).join(' — ');
                        return (
                          <div key={it.key}>
                            {it.ghost && (
                              <div className="absolute hidden sm:block border-t-2 border-dashed border-gray-400 pointer-events-none" aria-hidden="true"
                                style={{ left: posX(it.ghost[0]) * LARG_DIA + 2, width: (posX(it.ghost[1]) - posX(it.ghost[0]) + 1) * LARG_DIA - 4, top: it.faixa * ALT_LINHA + ALT_LINHA - 1 }} />
                            )}
                            <button type="button"
                              draggable={podeMover(b.ev) && it.tipo !== 'reserva' && it.tipo !== 'real'}
                              onDragStart={(e) => { setArrastando(b.ev.id); e.dataTransfer.effectAllowed = 'move'; }}
                              onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                              onClick={() => { setErro(''); setAberto(b.ev); }}
                              title={titulo}
                              className={`absolute overflow-hidden rounded-md px-2 text-left text-xs font-medium truncate shadow-sm hover:ring-2 hover:ring-primary-300 ${estilo} ${b.interno ? 'outline outline-2 outline-dashed outline-gray-800/60 -outline-offset-2' : ''} ${arrastando === b.ev.id ? 'opacity-50' : ''}`}
                              style={{ left, width, top: it.faixa * ALT_LINHA + 4, height: ALT_LINHA - 9 }}>
                              {atrasoX != null && <span className="absolute inset-y-0 right-0 bg-red-600" style={{ left: Math.max(0, atrasoX) }} aria-hidden="true" />}
                              <span className="relative">
                                {b.atrasoDesde || b.estado === 'checkinAtrasado' ? '⚠ ' : abertaDe(b.ev) && it.tipo !== 'reserva' ? '🛗 ' : ['aguardandoPecas', 'aguardandoCliente', 'pausado'].includes(b.estado) ? '⏸ ' : b.estado === 'pronto' ? '✓ ' : it.tipo === 'reserva' ? '◷ ' : ''}
                                {b.rotulo}{outro ? ` · ${outro}` : ''}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {visiveis === 0 && <p className="px-4 py-6 text-center text-gray-500">{t('quadroVazio')}</p>}
            </div>
          </div>
        </>
      )}

      {/* legenda */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 py-3 border-t border-gray-100 text-xs text-gray-600">
        {ORDEM_LEGENDA.map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5"><span className={`inline-block w-3 h-3 rounded-sm ${COR[e].split(' ')[0]}`} aria-hidden="true" />{t(`quadroEstado.${e}`)}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-gradient-to-r from-green-600 from-50% to-red-600 to-50%" aria-hidden="true" />{t('quadroLegendaAtraso')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed border-gray-400" aria-hidden="true" />{t('quadroLegendaPrevisto')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm border-2 border-dashed border-blue-500" aria-hidden="true" />{t('quadroLegendaReserva')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm outline outline-2 outline-dashed outline-gray-800/60" aria-hidden="true" />{t('quadroEstado.interno')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-0.5 h-3 bg-red-500" aria-hidden="true" />{t('quadroLegendaAgora')}</span>
      </div>

      {/* detalhe do carro */}
      {aberto && (() => {
        const ev = eventos.find((x) => x.id === aberto.id) || aberto;
        const b = barras.find((x) => x.ev.id === ev.id) || montarBarra(ev, hoje, pais, t('evento'));
        const v = ev.solicitacao?.veiculo; const c = ev.solicitacao?.cliente;
        const pode = podePosto(ev);
        const aberta = abertaDe(ev);
        const reservas: Ocupacao[] = (ev.ocupacoes || []).filter((o: Ocupacao) => !o.real && o.fim && Date.parse(o.fim) > agora).sort((x: Ocupacao, y: Ocupacao) => (x.inicio < y.inicio ? -1 : 1));
        const tm = tempos.get(ev.id) || temposDoCarro(ev, agora);
        const postoAtual = ev.status === 'em_andamento' ? aberta?.box_id : ev.box_id;
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={() => setAberto(null)}>
            <div role="dialog" aria-modal="true" aria-labelledby="quadro-det-titulo" className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl p-5 space-y-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 id="quadro-det-titulo" className="font-semibold text-gray-900 break-words">{b.rotulo}</h3>
                  {c?.nome && <p className="text-sm text-gray-600">{c.nome}</p>}
                  {ev.solicitacao?.tipo && tc.has(`tiposServico.${ev.solicitacao.tipo}`) && <p className="text-xs text-gray-500">{tc(`tiposServico.${ev.solicitacao.tipo}`)}</p>}
                </div>
                <button type="button" onClick={() => setAberto(null)} aria-label={t('quadroFechar')} className="min-w-[44px] min-h-[44px] -m-2 text-xl text-gray-500">✕</button>
              </div>
              <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${COR[b.estado]}`}>{t(`quadroEstado.${b.estado}`)}</span>
              {v && <p className="text-sm text-gray-600">{v.fipe_marca} {v.fipe_modelo} {v.fipe_ano || ''}</p>}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm" data-testid="quadro-datas">
                <dt className="text-gray-500">{t('quadroPrevisto')}</dt>
                <dd className="text-gray-800">{fmtData.format(new Date(ev.data_inicio_prevista || ev.data_inicio))} → {fmtData.format(new Date(ev.data_fim_prevista || ev.data_fim))}</dd>
                <dt className="text-gray-500">{t('quadroReal')}</dt>
                <dd className="text-gray-800">{b.realIni ? `${fmtDataHora.format(new Date(ev.checkin_em || ev.data_inicio))} → ${ev.status === 'concluido' ? fmtDataHora.format(new Date(ev.entregue_em || ev.data_fim)) : t('quadroNaOficinaAgora')}` : t('quadroAindaNaoChegou')}</dd>
              </dl>
              {b.atrasoDesde && <p role="alert" className="text-sm text-red-700">⚠ {t('quadroPassouPrevisto', { dias: diasEntre(b.prevFim, hoje) })}</p>}

              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">{t('quadroTrocarMecanico')}</span>
                <select className="input-field" value={ev.funcionario_id || 'sem'} disabled={!ehDono || salvando}
                  onChange={(e) => trocarMecanico(ev, e.target.value)}>
                  {funcionarios.map((f) => <option key={f.id} value={f.id}>{nomeFuncionario(f) || t('mecanicoSemNome')}</option>)}
                  {ev.funcionario_id && !funcionarios.some((f) => f.id === ev.funcionario_id) && <option value={ev.funcionario_id}>{nomeFuncionario(ev.funcionario) || t('mecanicoSemNome')}</option>}
                  <option value="sem">{t('quadroSemMecanico')}</option>
                </select>
              </label>
              {['agendado', 'em_andamento'].includes(ev.status) && (
                <label className="block">
                  <span className="block text-sm font-medium text-gray-700 mb-1">{ev.status === 'agendado' ? t('quadroPostoPlanejado') : t('quadroPostoAtual')}</span>
                  <select className="input-field" value={postoAtual || 'sem'} disabled={!pode || salvando || boxesAtivos.length === 0}
                    onChange={(e) => trocarPosto(ev, e.target.value)}>
                    {boxesAtivos.map((bx) => <option key={bx.id} value={bx.id}>{bx.nome} — {t(`quadroTipoBox.${bx.tipo}`)}</option>)}
                    <option value="sem">{t('quadroSemElevador')}</option>
                  </select>
                  {aberta && <span className="block mt-1 text-xs text-gray-500">{t('quadroNoPostoDesde', { hora: fmtDataHora.format(new Date(aberta.inicio)) })}</span>}
                </label>
              )}
              {reservas.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">{t('quadroReservasDoCarro')}</p>
                  <ul className="space-y-1">
                    {reservas.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>◷ {nomeBox(o.box_id)} · {fmtDataHora.format(new Date(o.inicio))}–{fmtHora.format(new Date(o.fim!))}</span>
                        {pode && <button type="button" disabled={salvando} onClick={async () => { const r = await enviar({ acao: 'posto_cancelar', ocupacaoId: o.id }); if (!r.ok) setErro(erroDe(r)); }} className="text-xs text-red-700 hover:underline">{t('horaCancelarReserva')}</button>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {pode && ['agendado', 'em_andamento'].includes(ev.status) && boxesAtivos.length > 0 && (
                <button type="button" onClick={() => { setAberto(null); mudarPor('hora'); }} className="text-sm text-primary-700 hover:underline">{t('quadroReservarPosto')} ›</button>
              )}

              {monitorando && b.realIni && (
                <div className="rounded-lg bg-gray-50 p-3 text-sm" data-testid="quadro-monitoramento">
                  <p className="font-medium text-gray-900 mb-1">{t('monTitulo')}</p>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                    <dt className="text-gray-600">{t('monNaOficina')}</dt><dd className="text-right font-medium">{duracao(tm.naOficinaMin)}</dd>
                    <dt className="text-gray-600">{t('monEmPosto')}</dt><dd className="text-right font-medium">{duracao(tm.emPostoMin)}</dd>
                    <dt className="text-gray-600">{t('monEsperandoPecas')}</dt><dd className="text-right font-medium">{duracao(tm.esperandoPecasMin)}</dd>
                    <dt className="text-gray-600">{t('monEsperandoCliente')}</dt><dd className="text-right font-medium">{duracao(tm.esperandoClienteMin)}</dd>
                    {tm.atrasoEntregaMin != null && (<><dt className="text-gray-600">{t('monEntrega')}</dt><dd className={`text-right font-medium ${tm.atrasoEntregaMin > 60 ? 'text-red-700' : 'text-green-700'}`}>{tm.atrasoEntregaMin > 60 ? t('monAtrasou', { tempo: duracao(tm.atrasoEntregaMin) }) : t('monNoPrazo')}</dd></>)}
                    {tm.paradoDesde && agora - Date.parse(tm.paradoDesde) > PARADO_MIN * 60e3 && (<><dt className="text-red-700">{t('monParado')}</dt><dd className="text-right font-medium text-red-700">{duracao((agora - Date.parse(tm.paradoDesde)) / 60e3)}</dd></>)}
                  </dl>
                  {tm.porEtapa.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-gray-700">{t('monPorEtapa')}</summary>
                      <ul className="mt-1 space-y-0.5">
                        {tm.porEtapa.map((e, i) => <li key={i} className="flex justify-between gap-2"><span className="text-gray-600">{tc.has(`statusManutencao.${e.status}`) ? tc(`statusManutencao.${e.status}`) : e.status}</span><span>{duracao(e.min)}</span></li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
              {!monitorando && ehDono && b.realIni && <p className="text-xs text-gray-500">{t('monDica')}</p>}

              {salvando && <p className="text-sm text-gray-500">{t('quadroSalvando')}</p>}
              {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
              <button type="button" className="btn-primary w-full" onClick={() => { setAberto(null); onAbrirDia(diaNaOficina(ev.status === 'agendado' ? ev.data_inicio : (ev.checkin_em || ev.data_inicio), pais), ev); }}>
                {t('quadroAbrirDia')}
              </button>
            </div>
          </div>
        );
      })()}

      {/* cadastro de postos */}
      {gerenciar && ehDono && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={() => setGerenciar(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="quadro-box-titulo" className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl p-5 space-y-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h3 id="quadro-box-titulo" className="font-semibold text-gray-900">{t('quadroGerenciarElevadores')}</h3>
              <button type="button" onClick={() => setGerenciar(false)} aria-label={t('quadroFechar')} className="min-w-[44px] min-h-[44px] -m-2 text-xl text-gray-500">✕</button>
            </div>
            <p className="text-sm text-gray-600">{t('quadroElevadoresExplica')}</p>
            <ul className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
              {(['elevador', 'box', 'vaga'] as const).map((tp) => <li key={tp}><span className="font-medium text-gray-900">{t(`quadroTipoBox.${tp}`)}</span> — <span className="text-gray-600">{t(`quadroTipoBoxExplica.${tp}`)}</span></li>)}
            </ul>
            <ul className="divide-y divide-gray-100">
              {boxesAtivos.map((bx) => (
                <li key={bx.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate"><span className="font-medium text-gray-900">{bx.nome}</span> <span className="text-xs text-gray-500">{t(`quadroTipoBox.${bx.tipo}`)}{bx.tipo === 'vaga' ? ` · ${t('horaCapacidade', { n: bx.capacidade || 1 })}` : ''}</span></span>
                  <button type="button" disabled={salvando} onClick={() => desativarBox(bx)} className="text-sm text-red-700 hover:underline disabled:opacity-50">{t('quadroRemoverElevador')}</button>
                </li>
              ))}
              {boxesAtivos.length === 0 && <li className="py-2 text-sm text-gray-500">{t('quadroNenhumElevador')}</li>}
            </ul>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label className="sr-only" htmlFor="quadro-box-nome">{t('quadroNomeElevador')}</label>
              <input id="quadro-box-nome" className="input-field" maxLength={40} placeholder={t('quadroNomeElevadorExemplo')} value={novoBox.nome}
                onChange={(e) => setNovoBox({ ...novoBox, nome: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') addBox(); }} />
              <label className="sr-only" htmlFor="quadro-box-tipo">{t('quadroTipoElevador')}</label>
              <select id="quadro-box-tipo" className="input-field" value={novoBox.tipo} onChange={(e) => setNovoBox({ ...novoBox, tipo: e.target.value as Box['tipo'] })}>
                {(['elevador', 'box', 'vaga'] as const).map((tp) => <option key={tp} value={tp}>{t(`quadroTipoBox.${tp}`)}</option>)}
              </select>
            </div>
            {novoBox.tipo === 'vaga' && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                {t('quadroCapacidadeVaga')}
                <input type="number" min={1} max={50} className="input-field !w-20 !py-1" value={novoBox.capacidade} onChange={(e) => setNovoBox({ ...novoBox, capacidade: Number(e.target.value) || 1 })} />
              </label>
            )}
            <p className="text-xs text-gray-500">{t(`quadroTipoBoxExplica.${novoBox.tipo}`)}</p>
            <button type="button" disabled={salvando || !novoBox.nome.trim()} onClick={addBox} className="btn-primary w-full disabled:opacity-50">{t('quadroAdicionarElevador')}</button>
            {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
