'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { dataLocalDe } from '@/lib/turnos';
import { INTL_LOCALE } from '@/lib/utils';
import { nomeFuncionario } from '@/lib/funcionario';

// "Quadro" da oficina: uma linha por MECANICO ou por ELEVADOR/BOX, os dias
// nas colunas e cada carro como uma barra da entrada ate a entrega prevista
// (formato dos "workshop planners" e dos mapas de reserva de hotel).
// Usa OS MESMOS agendamentos do calendario (hook useAgenda, com tempo real):
// mudar aqui muda la e vice-versa. Um carro no elevador ocupa dois recursos
// ao mesmo tempo - o mecanico e o elevador -, por isso as duas visoes mostram
// o mesmo carro. Arrastar troca o mecanico ou o elevador (/api/servico, fica
// no historico); a DATA nunca muda por arrasto: mudar a data de um carro de
// cliente e reagendamento com ele.

type Estado = 'agendado' | 'checkinAtrasado' | 'naOficina' | 'aguardandoPecas' | 'pronto' | 'atrasado' | 'falta' | 'entregue' | 'interno';
type Por = 'mecanico' | 'elevador';
export type Box = { id: string; nome: string; tipo: 'elevador' | 'box' | 'vaga'; ativo: boolean; ordem: number };

const COR: Record<Estado, string> = {
  agendado: 'bg-blue-600 text-white',
  checkinAtrasado: 'bg-red-600 text-white',
  naOficina: 'bg-green-600 text-white',
  aguardandoPecas: 'bg-amber-500 text-white',
  pronto: 'bg-purple-600 text-white',
  atrasado: 'bg-red-600 text-white',
  falta: 'bg-orange-400 text-white',
  entregue: 'bg-gray-300 text-gray-700',
  interno: 'bg-slate-500 text-white',
};
const ORDEM_LEGENDA: Estado[] = ['agendado', 'naOficina', 'aguardandoPecas', 'pronto', 'atrasado', 'checkinAtrasado', 'falta', 'entregue', 'interno'];
// estados em que o carro esta (ou estara) ocupando lugar na oficina
const OCUPA: Estado[] = ['agendado', 'checkinAtrasado', 'naOficina', 'aguardandoPecas', 'pronto', 'atrasado', 'interno'];

const DIAS = 14;
const LARG_DIA = 52; // px por dia
const ALT_LINHA = 34; // px por faixa de barras
const CHAVE_POR = 'bipfix_quadro_por';

const somaDias = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface QuadroProps {
  eventos: any[];
  funcionarios: any[];
  boxes: Box[];
  oficinaId: string;
  ehDono: boolean;
  meuFuncionarioId?: string | null; // mecanico logado (escolhe o elevador dos carros dele)
  onAbrirDia: (ymd: string, ev: any) => void;
  onAlterado: () => void; // recarregar agenda/elevadores
}

export default function QuadroOficina({ eventos, funcionarios, boxes, oficinaId, ehDono, meuFuncionarioId, onAbrirDia, onAlterado }: QuadroProps) {
  const t = useTranslations('oficinaAgenda');
  const tc = useTranslations('constants');
  const locale = useLocale();
  const hoje = dataLocalDe(new Date().toISOString());
  const [inicio, setInicio] = useState(() => somaDias(hoje, -2));
  const [por, setPor] = useState<Por>(() => { try { return (localStorage.getItem(CHAVE_POR) as Por) || 'mecanico'; } catch { return 'mecanico'; } });
  const [aberto, setAberto] = useState<any | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [gerenciar, setGerenciar] = useState(false);
  const [novoBox, setNovoBox] = useState({ nome: '', tipo: 'elevador' as Box['tipo'] });

  const mudarPor = (p: Por) => { setPor(p); try { localStorage.setItem(CHAVE_POR, p); } catch {} };
  const boxesAtivos = useMemo(() => boxes.filter((b) => b.ativo).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)), [boxes]);
  const nomeBox = (id: string | null | undefined) => boxes.find((b) => b.id === id)?.nome || '';

  const dias = useMemo(() => Array.from({ length: DIAS }, (_, i) => somaDias(inicio, i)), [inicio]);
  const fimJanela = dias[dias.length - 1];
  const fmtDia = useMemo(() => new Intl.DateTimeFormat(INTL_LOCALE[locale] || locale, { weekday: 'short' }), [locale]);
  const fmtData = useMemo(() => new Intl.DateTimeFormat(INTL_LOCALE[locale] || locale, { day: '2-digit', month: '2-digit' }), [locale]);

  // estado, inicio e fim de cada carro
  const barras = useMemo(() => eventos.map((ev) => {
    const etapas = [...(ev.etapas || [])].sort((a: any, b: any) => (a.created_at < b.created_at ? -1 : 1));
    const ultima = etapas[etapas.length - 1]?.status;
    const ini = dataLocalDe(ev.data_inicio);
    const previsto = dataLocalDe(ev.data_fim_prevista || ev.data_fim);
    let fim = dataLocalDe(ev.data_fim);
    let estado: Estado;
    if (ev.no_show) estado = 'falta';
    else if (ev.status === 'concluido') estado = 'entregue';
    else if (ev.status === 'agendado') { estado = ini < hoje ? 'checkinAtrasado' : 'agendado'; if (ini < hoje && fim < hoje) fim = hoje; }
    else if (ultima === 'concluido') { estado = 'pronto'; if (fim < hoje) fim = hoje; }
    else if (previsto < hoje) { estado = 'atrasado'; fim = hoje; }
    else if (ultima === 'aguardando_pecas' || ultima === 'pausa_pecas') estado = 'aguardandoPecas';
    else estado = 'naOficina';
    if (ev.tipo === 'externo' && (estado === 'agendado' || estado === 'naOficina')) estado = 'interno';
    if (fim < ini) fim = ini;
    const v = ev.solicitacao?.veiculo;
    const rotulo = [v?.placa, v ? `${v.fipe_marca || ''} ${v.fipe_modelo || ''}`.trim() : ev.titulo].filter(Boolean).join(' · ') || ev.titulo || t('evento');
    return { ev, ini, fim, previsto, estado, rotulo };
  }), [eventos, hoje, t]);

  const linhaDe = (ev: any) => (por === 'mecanico' ? ev.funcionario_id : ev.box_id) || 'sem';
  const podeMover = (ev: any) => (por === 'mecanico' ? ehDono : ehDono || (!!meuFuncionarioId && ev.funcionario_id === meuFuncionarioId));

  // carros que ocupam o mesmo elevador nos mesmos dias (um elevador = um carro)
  const conflitos = useMemo(() => {
    const ids = new Set<string>();
    const ocupando = barras.filter((b) => b.ev.box_id && OCUPA.includes(b.estado));
    for (let i = 0; i < ocupando.length; i++) for (let j = i + 1; j < ocupando.length; j++) {
      const a = ocupando[i], b = ocupando[j];
      if (a.ev.box_id === b.ev.box_id && a.ini <= b.fim && b.ini <= a.fim) { ids.add(a.ev.id); ids.add(b.ev.id); }
    }
    return ids;
  }, [barras]);

  const linhas = useMemo(() => {
    const ls: { id: string; nome: string; limite: number | null; sub?: string }[] = [];
    if (por === 'mecanico') {
      for (const f of funcionarios) ls.push({ id: f.id, nome: nomeFuncionario(f) || t('mecanicoSemNome'), limite: f.capacidade_maxima ?? null });
      for (const b of barras) { const id = b.ev.funcionario_id; if (id && !ls.some((l) => l.id === id)) ls.push({ id, nome: nomeFuncionario(b.ev.funcionario) || t('mecanicoSemNome'), limite: null }); }
      if (ehDono || barras.some((b) => !b.ev.funcionario_id)) ls.push({ id: 'sem', nome: t('quadroSemMecanico'), limite: null });
    } else {
      for (const b of boxesAtivos) ls.push({ id: b.id, nome: b.nome, limite: 1, sub: t(`quadroTipoBox.${b.tipo}`) });
      for (const b of barras) { const id = b.ev.box_id; if (id && !ls.some((l) => l.id === id)) ls.push({ id, nome: nomeBox(id) || '—', limite: 1 }); }
      ls.push({ id: 'sem', nome: t('quadroSemElevador'), limite: null });
    }
    return ls;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [por, funcionarios, boxesAtivos, barras, ehDono, t]);

  const naJanela = barras.filter((b) => b.fim >= inicio && b.ini <= fimJanela);
  const naOficinaHoje = (b: typeof barras[0]) => ['naOficina', 'aguardandoPecas', 'pronto', 'atrasado', 'interno'].includes(b.estado) && b.ini <= hoje && b.fim >= hoje;
  const cargaLinha = (id: string) => barras.filter((b) => linhaDe(b.ev) === id && naOficinaHoje(b)).length;

  // faixas: barras que se sobrepoem na mesma linha vao uma embaixo da outra
  const faixas = useMemo(() => {
    const porLinha: Record<string, { b: typeof barras[0]; faixa: number }[]> = {};
    for (const l of linhas) {
      const minhas = naJanela.filter((b) => linhaDe(b.ev) === l.id).sort((a, b) => (a.ini < b.ini ? -1 : 1));
      const fins: string[] = [];
      porLinha[l.id] = minhas.map((b) => {
        let f = fins.findIndex((fim) => fim < b.ini);
        if (f === -1) { f = fins.length; fins.push(b.fim); } else fins[f] = b.fim;
        return { b, faixa: f };
      });
    }
    return porLinha;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, naJanela, por]);

  // linha de disponibilidade: por elevador = elevadores livres no dia; por
  // mecanico = carros na oficina no dia (cor pela capacidade dos mecanicos)
  const ocupadosNoDia = (d: string, soComElevador: boolean) => barras.filter((b) => OCUPA.includes(b.estado) && b.ini <= d && b.fim >= d && (!soComElevador || b.ev.box_id)).length;
  const capMec = Math.max(1, funcionarios.reduce((s, f) => s + (f.capacidade_maxima || 2), 0));
  const celulaDisp = (d: string) => {
    if (por === 'elevador' && boxesAtivos.length > 0) {
      const ocupados = new Set(barras.filter((b) => b.ev.box_id && OCUPA.includes(b.estado) && b.ini <= d && b.fim >= d).map((b) => b.ev.box_id)).size;
      const livres = boxesAtivos.length - ocupados;
      return { txt: `${Math.max(0, livres)}`, cor: livres <= 0 ? 'bg-orange-400 text-white' : livres / boxesAtivos.length < 0.5 ? 'bg-yellow-200 text-yellow-900' : 'bg-green-200 text-green-900' };
    }
    const n = ocupadosNoDia(d, false);
    return { txt: `${n}`, cor: n === 0 ? 'bg-gray-50 text-gray-400' : n / capMec <= 0.5 ? 'bg-green-200 text-green-900' : n / capMec <= 1 ? 'bg-yellow-200 text-yellow-900' : 'bg-orange-400 text-white' };
  };

  const mecanicosNoLimite = funcionarios.filter((f) => f.capacidade_maxima != null && barras.filter((b) => b.ev.funcionario_id === f.id && naOficinaHoje(b)).length > f.capacidade_maxima).length;
  const alertas = [
    { n: barras.filter((b) => b.estado === 'pronto').length, txt: t('quadroAlertaProntos') },
    { n: barras.filter((b) => b.estado === 'agendado' && b.ini === hoje).length, txt: t('quadroAlertaCheckinHoje') },
    { n: barras.filter((b) => b.estado === 'checkinAtrasado').length, txt: t('quadroAlertaCheckinAtrasado') },
    { n: barras.filter((b) => b.estado === 'atrasado').length, txt: t('quadroAlertaPrazo') },
    { n: new Set(barras.filter((b) => conflitos.has(b.ev.id)).map((b) => b.ev.box_id)).size, txt: t('quadroAlertaElevadorDuplo') },
    { n: mecanicosNoLimite, txt: t('quadroAlertaMecanicoLimite') },
  ].filter((a) => a.n > 0);

  const enviar = async (corpo: Record<string, unknown>) => {
    setSalvando(true); setErro('');
    const res = await fetch('/api/servico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).catch(() => null);
    setSalvando(false);
    if (!res?.ok) { setErro(t('quadroErroSalvar')); return false; }
    onAlterado();
    return true;
  };
  const trocarMecanico = async (ev: any, funcId: string) => {
    if ((ev.funcionario_id || 'sem') === funcId) return;
    if (await enviar({ acao: 'atribuir', eventoId: ev.id, ...(funcId !== 'sem' ? { funcionarioId: funcId } : {}) }))
      setAberto((a: any) => (a && a.id === ev.id ? { ...a, funcionario_id: funcId === 'sem' ? null : funcId } : a));
  };
  const trocarElevador = async (ev: any, boxId: string) => {
    if ((ev.box_id || 'sem') === boxId) return;
    if (await enviar({ acao: 'elevador', eventoId: ev.id, ...(boxId !== 'sem' ? { boxId } : {}) }))
      setAberto((a: any) => (a && a.id === ev.id ? { ...a, box_id: boxId === 'sem' ? null : boxId } : a));
  };
  const soltar = (linhaId: string) => {
    const ev = eventos.find((x) => x.id === arrastando);
    setArrastando(null); setAlvo(null);
    if (!ev || !podeMover(ev)) return;
    if (por === 'mecanico') trocarMecanico(ev, linhaId); else trocarElevador(ev, linhaId);
  };

  // cadastro de elevadores/boxes (so o dono; apagar = desativar, o historico fica)
  const addBox = async () => {
    const nome = novoBox.nome.trim();
    if (!nome) return;
    setSalvando(true); setErro('');
    const { error } = await supabase.from('oficina_boxes').insert({ oficina_id: oficinaId, nome: nome.slice(0, 40), tipo: novoBox.tipo, ordem: boxes.length });
    setSalvando(false);
    if (error) { setErro(t('quadroErroSalvar')); return; }
    setNovoBox({ nome: '', tipo: novoBox.tipo });
    onAlterado();
  };
  const desativarBox = async (b: Box) => {
    setSalvando(true);
    await supabase.from('oficina_boxes').update({ ativo: false }).eq('id', b.id);
    // carros ainda marcados nele saem do elevador (sem perder o resto)
    for (const ev of eventos.filter((e) => e.box_id === b.id && !['concluido', 'cancelado'].includes(e.status))) await fetch('/api/servico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'elevador', eventoId: ev.id }) }).catch(() => null);
    setSalvando(false);
    onAlterado();
  };

  const largura = DIAS * LARG_DIA;

  return (
    <div className="card !p-0 overflow-hidden">
      {alertas.length > 0 && (
        <div role="status" className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 bg-purple-50 border-b border-purple-100 text-sm text-purple-900">
          {alertas.map((a, i) => <span key={i} className="font-medium">⏱ {a.txt}: {a.n}</span>)}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setInicio(somaDias(inicio, -7))} aria-label={t('quadroSemanaAnterior')} className="p-2 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button type="button" onClick={() => setInicio(somaDias(hoje, -2))} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">{t('quadroHoje')}</button>
          <button type="button" onClick={() => setInicio(somaDias(inicio, 7))} aria-label={t('quadroProximaSemana')} className="p-2 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">{t('quadroVerPor')}</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden" role="group" aria-label={t('quadroVerPor')}>
            {(['mecanico', 'elevador'] as const).map((p) => (
              <button key={p} type="button" onClick={() => mudarPor(p)} aria-pressed={por === p}
                className={`px-3 py-1.5 text-sm ${por === p ? 'bg-primary-600 text-white' : 'bg-white text-gray-600'}`}>
                {p === 'mecanico' ? t('quadroPorMecanico') : t('quadroPorElevador')}
              </button>
            ))}
          </div>
          {ehDono && por === 'elevador' && (
            <button type="button" onClick={() => setGerenciar(true)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">{t('quadroGerenciarElevadores')}</button>
          )}
        </div>
      </div>
      {(ehDono || meuFuncionarioId) && <p className="px-4 pt-2 text-xs text-gray-500">{por === 'mecanico' ? (ehDono ? t('quadroDicaMecanico') : t('quadroDicaToque')) : t('quadroDicaElevador')}</p>}
      {por === 'elevador' && boxesAtivos.length === 0 && (
        <p className="mx-4 mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{ehDono ? t('quadroSemElevadoresDono') : t('quadroSemElevadores')}</p>
      )}

      <div className="overflow-x-auto mt-2">
        <div style={{ width: largura + 132 }} className="text-sm">
          {/* cabecalho dos dias */}
          <div className="flex border-y border-gray-200 bg-gray-50">
            <div className="sticky left-0 z-20 w-[132px] shrink-0 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase text-gray-500">{por === 'mecanico' ? t('quadroMecanico') : t('quadroElevador')}</div>
            {dias.map((d) => {
              const dt = new Date(`${d}T12:00:00`);
              return (
                <div key={d} style={{ width: LARG_DIA }} className={`shrink-0 text-center py-1.5 leading-tight ${d === hoje ? 'bg-primary-600 text-white' : 'text-gray-600'}`}>
                  <div className="text-[11px] capitalize">{fmtDia.format(dt).replace('.', '')}</div>
                  <div className="font-semibold">{dt.getDate()}</div>
                </div>
              );
            })}
          </div>
          {/* disponibilidade */}
          <div className="flex border-b border-gray-200">
            <div className="sticky left-0 z-20 w-[132px] shrink-0 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
              {por === 'elevador' && boxesAtivos.length > 0 ? t('quadroElevadoresLivres', { total: boxesAtivos.length }) : t('quadroOcupacao')}
            </div>
            {dias.map((d) => { const c = celulaDisp(d); return <div key={d} style={{ width: LARG_DIA }} className={`shrink-0 text-center py-1.5 font-semibold border-l border-white ${c.cor}`}>{c.txt}</div>; })}
          </div>
          {/* uma linha por mecanico ou elevador */}
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
                <div className="sticky left-0 z-20 w-[132px] shrink-0 bg-white px-3 py-2 border-r border-gray-100">
                  <p className="font-medium text-gray-900 truncate" title={l.nome}>{l.nome}</p>
                  {l.sub && <p className="text-[11px] text-gray-400">{l.sub}</p>}
                  {l.id !== 'sem' && por === 'mecanico' && (
                    <p className={`text-xs ${excedeu ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {t('quadroCarga', { atual: carga })}{l.limite != null ? ` / ${l.limite}` : ''}
                    </p>
                  )}
                </div>
                <div className="relative shrink-0" style={{ width: largura, height: nFaixas * ALT_LINHA + 8 }}>
                  {dias.includes(hoje) && <div className="absolute top-0 bottom-0 w-px bg-primary-300" style={{ left: dias.indexOf(hoje) * LARG_DIA + LARG_DIA / 2 }} aria-hidden="true" />}
                  {minhas.map(({ b, faixa }) => {
                    const ini = b.ini < inicio ? inicio : b.ini;
                    const fim = b.fim > fimJanela ? fimJanela : b.fim;
                    const left = dias.indexOf(ini) * LARG_DIA + 2;
                    const width = (dias.indexOf(fim) - dias.indexOf(ini) + 1) * LARG_DIA - 4;
                    const conflito = conflitos.has(b.ev.id);
                    const outro = por === 'mecanico' ? nomeBox(b.ev.box_id) : nomeFuncionario(b.ev.funcionario);
                    return (
                      <button key={b.ev.id} type="button"
                        draggable={podeMover(b.ev)}
                        onDragStart={(e) => { setArrastando(b.ev.id); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                        onClick={() => { setErro(''); setAberto(b.ev); }}
                        title={`${b.rotulo} — ${t(`quadroEstado.${b.estado}`)}${outro ? ` — ${outro}` : ''}${conflito ? ` — ${t('quadroConflito')}` : ''}`}
                        className={`absolute rounded-md px-2 text-left text-xs font-medium truncate shadow-sm hover:ring-2 hover:ring-primary-300 ${COR[b.estado]} ${conflito ? 'ring-2 ring-red-600 ring-offset-1' : ''} ${arrastando === b.ev.id ? 'opacity-50' : ''}`}
                        style={{ left, width, top: faixa * ALT_LINHA + 4, height: ALT_LINHA - 6 }}>
                        {b.estado === 'atrasado' || b.estado === 'checkinAtrasado' || conflito ? '⚠ ' : ''}{b.rotulo}{outro ? ` · ${outro}` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {naJanela.length === 0 && <p className="px-4 py-6 text-center text-gray-500">{t('quadroVazio')}</p>}
        </div>
      </div>

      {/* legenda */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 py-3 border-t border-gray-100 text-xs text-gray-600">
        {ORDEM_LEGENDA.map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5"><span className={`inline-block w-3 h-3 rounded-sm ${COR[e].split(' ')[0]}`} aria-hidden="true" />{t(`quadroEstado.${e}`)}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm ring-2 ring-red-600" aria-hidden="true" />{t('quadroConflito')}</span>
      </div>

      {/* detalhe do carro (folha no celular, janela no computador) */}
      {aberto && (() => {
        const b = barras.find((x) => x.ev.id === aberto.id);
        const v = aberto.solicitacao?.veiculo; const c = aberto.solicitacao?.cliente;
        const podeElevador = ehDono || (!!meuFuncionarioId && aberto.funcionario_id === meuFuncionarioId);
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={() => setAberto(null)}>
            <div role="dialog" aria-modal="true" aria-labelledby="quadro-det-titulo" className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl p-5 space-y-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 id="quadro-det-titulo" className="font-semibold text-gray-900 break-words">{b?.rotulo}</h3>
                  {c?.nome && <p className="text-sm text-gray-600">{c.nome}</p>}
                  {aberto.solicitacao?.tipo && tc.has(`tiposServico.${aberto.solicitacao.tipo}`) && <p className="text-xs text-gray-500">{tc(`tiposServico.${aberto.solicitacao.tipo}`)}</p>}
                </div>
                <button type="button" onClick={() => setAberto(null)} aria-label={t('quadroFechar')} className="min-w-[44px] min-h-[44px] -m-2 text-xl text-gray-500">✕</button>
              </div>
              {b && <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${COR[b.estado]}`}>{t(`quadroEstado.${b.estado}`)}</span>}
              {conflitos.has(aberto.id) && <p role="alert" className="text-sm text-red-700">⚠ {t('quadroConflitoDetalhe')}</p>}
              <p className="text-sm text-gray-700">
                {t('quadroEntrada', { data: fmtData.format(new Date(aberto.data_inicio)) })}
                {' · '}
                {t('quadroPrevisao', { data: fmtData.format(new Date(aberto.data_fim_prevista || aberto.data_fim)) })}
              </p>
              {v && <p className="text-sm text-gray-600">{v.fipe_marca} {v.fipe_modelo} {v.fipe_ano || ''}</p>}
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">{t('quadroTrocarMecanico')}</span>
                <select className="input-field" value={aberto.funcionario_id || 'sem'} disabled={!ehDono || salvando}
                  onChange={(e) => trocarMecanico(aberto, e.target.value)}>
                  {funcionarios.map((f) => <option key={f.id} value={f.id}>{nomeFuncionario(f) || t('mecanicoSemNome')}</option>)}
                  {aberto.funcionario_id && !funcionarios.some((f) => f.id === aberto.funcionario_id) && <option value={aberto.funcionario_id}>{nomeFuncionario(aberto.funcionario) || t('mecanicoSemNome')}</option>}
                  <option value="sem">{t('quadroSemMecanico')}</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">{t('quadroTrocarElevador')}</span>
                <select className="input-field" value={aberto.box_id || 'sem'} disabled={!podeElevador || salvando || boxesAtivos.length === 0}
                  onChange={(e) => trocarElevador(aberto, e.target.value)}>
                  {boxesAtivos.map((bx) => <option key={bx.id} value={bx.id}>{bx.nome}</option>)}
                  <option value="sem">{t('quadroSemElevador')}</option>
                </select>
              </label>
              {salvando && <p className="text-sm text-gray-500">{t('quadroSalvando')}</p>}
              {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
              <button type="button" className="btn-primary w-full" onClick={() => { const ev = aberto; setAberto(null); onAbrirDia(dataLocalDe(ev.data_inicio), ev); }}>
                {t('quadroAbrirDia')}
              </button>
            </div>
          </div>
        );
      })()}

      {/* cadastro de elevadores/boxes */}
      {gerenciar && ehDono && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={() => setGerenciar(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="quadro-box-titulo" className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl p-5 space-y-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h3 id="quadro-box-titulo" className="font-semibold text-gray-900">{t('quadroGerenciarElevadores')}</h3>
              <button type="button" onClick={() => setGerenciar(false)} aria-label={t('quadroFechar')} className="min-w-[44px] min-h-[44px] -m-2 text-xl text-gray-500">✕</button>
            </div>
            <p className="text-sm text-gray-600">{t('quadroElevadoresExplica')}</p>
            <ul className="divide-y divide-gray-100">
              {boxesAtivos.map((bx) => (
                <li key={bx.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate"><span className="font-medium text-gray-900">{bx.nome}</span> <span className="text-xs text-gray-500">{t(`quadroTipoBox.${bx.tipo}`)}</span></span>
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
            <button type="button" disabled={salvando || !novoBox.nome.trim()} onClick={addBox} className="btn-primary w-full disabled:opacity-50">{t('quadroAdicionarElevador')}</button>
            {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
