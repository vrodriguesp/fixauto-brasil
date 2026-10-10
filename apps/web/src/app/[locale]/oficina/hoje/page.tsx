'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAgenda } from '@/hooks/use-agenda';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Link } from '@/i18n/navigation';
import { INTL_LOCALE, cleanDescricao, rotuloTipoPedido } from '@/lib/utils';
import { diaNaOficina, fusoDoPais } from '@/lib/fuso';
import { nomeFuncionario } from '@/lib/funcionario';
import NotasInternas from '@/components/veiculo/NotasInternas';
import { duracao, etapasOrdenadas, montarBarra, somaDias, temposDoCarro, type Box } from '@/components/oficina/quadro-util';

// "Hoje": operacao da oficina numa tela (auditoria do painel 10/10, secao D).
// Junta o que estava em "Veiculos em servico", Agenda > Dia e a tabela do
// antigo dashboard: blocos por urgencia e UM botao por cartao. O Quadro da
// Agenda continua sendo a ferramenta de planejamento. Tudo no fuso da oficina.

type Bloco = 'atrasados' | 'prontos' | 'chegam' | 'chegaram' | 'naOficina' | 'saem' | 'proximos' | 'entregues' | 'naoVieram';
// filtro: tudo, "para fazer agora" (atrasados + prontos + chegam) ou um bloco
type Filtro = 'tudo' | 'agora' | Bloco;
const AGORA: Bloco[] = ['atrasados', 'prontos', 'chegam'];
// etapas em palavras simples (6 botoes grandes no lugar do select de 10 opcoes)
const ETAPAS_RAPIDAS = [
  { status: 'diagnostico', icone: '🔍' },
  { status: 'em_execucao', icone: '🔧' },
  { status: 'aguardando_pecas', icone: '📦' },
  { status: 'pausa_cliente', icone: '📞' },
  { status: 'pausa_geral', icone: '⏸' },
  { status: 'concluido', icone: '✅' },
] as const;
const ETAPAS_MAIS = ['recebido', 'teste_final', 'pausa_pecas'] as const;

export default function HojePage() {
  const t = useTranslations('oficinaHoje');
  const tc = useTranslations('constants');
  const locale = useLocale();
  const intl = INTL_LOCALE[locale] || locale;
  const { oficina, funcionario } = useAuth();
  const pais = (oficina as any)?.pais ?? null;
  const fuso = fusoDoPais(pais);
  const { eventos, refresh } = useAgenda();
  const { solicitacoes } = useSolicitacoes({ nearby: true });
  const ehMecanico = funcionario?.cargo === 'mecanico';
  const ehDono = !!oficina && !ehMecanico;

  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setAgora(Date.now()), 60e3); return () => clearInterval(i); }, []);
  const hoje = diaNaOficina(new Date(agora), pais);
  const [dia, setDiaState] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [filtro, setFiltroState] = useState<Filtro>('tudo');
  const [evPedido, setEvPedido] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const d = p.get('dia'); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDiaState(d);
    const ev = p.get('ev'); if (ev) { setAberto(ev); if (!d) setEvPedido(ev); }
    const fl = p.get('filtro') as Filtro | null; if (fl) setFiltroState(fl);
  }, []);
  const setFiltro = (fl: Filtro) => {
    setFiltroState(fl);
    try { const u = new URL(window.location.href); if (fl === 'tudo') u.searchParams.delete('filtro'); else u.searchParams.set('filtro', fl); window.history.replaceState(window.history.state, '', u.toString()); } catch { /* */ }
  };
  const diaVisto = dia || hoje;
  const ehHoje = diaVisto === hoje;
  const setDia = (d: string) => {
    setFiltroState('tudo');
    setDiaState(d === hoje ? null : d);
    try { const u = new URL(window.location.href); if (d === hoje) u.searchParams.delete('dia'); else u.searchParams.set('dia', d); window.history.replaceState(window.history.state, '', u.toString()); } catch { /* */ }
  };

  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  useEffect(() => {
    if (!oficina) return;
    supabase.from('funcionarios').select('*, profile:profiles(nome)').eq('oficina_id', oficina.id).eq('ativo', true).then(({ data }) => setFuncionarios(data || []));
    supabase.from('oficina_boxes').select('id, nome, tipo, ativo, ordem, capacidade').eq('oficina_id', oficina.id).eq('ativo', true).then(({ data }) => setBoxes((data as Box[]) || []));
  }, [oficina]);

  // mesmos carros da agenda: sem cancelados, um evento por pedido, mecanico ve so os dele
  const carros = useMemo(() => {
    const relevantes = eventos.filter((ev: any) => ev.status !== 'cancelado' && !(ev.status === 'agendado' && ev.tipo === 'plataforma' && ['concluida', 'cancelada'].includes(ev.solicitacao?.status)));
    const porPedido = new Map<string, any>(); const outros: any[] = [];
    const prio: Record<string, number> = { concluido: 3, em_andamento: 2, agendado: 1 };
    for (const ev of relevantes as any[]) {
      if (ev.tipo === 'plataforma' && ev.solicitacao_id) {
        const x = porPedido.get(ev.solicitacao_id);
        if (!x || (prio[ev.status] || 0) > (prio[x.status] || 0)) porPedido.set(ev.solicitacao_id, ev);
      } else outros.push(ev);
    }
    const todos = [...outros, ...Array.from(porPedido.values())];
    return ehMecanico && funcionario ? todos.filter((e) => e.funcionario_id === funcionario.id) : todos;
  }, [eventos, ehMecanico, funcionario]);

  const dDe = (iso?: string | null) => (iso ? diaNaOficina(iso, pais) : '');
  const ultimaEtapa = (ev: any) => etapasOrdenadas(ev).slice(-1)[0]?.status as string | undefined;
  const blocos = useMemo(() => {
    const b: Record<Bloco, any[]> = { atrasados: [], prontos: [], chegam: [], chegaram: [], naOficina: [], saem: [], proximos: [], entregues: [], naoVieram: [] };
    for (const ev of carros) {
      const prevFim = ev.data_fim_prevista || ev.data_fim;
      const pronto = ev.status === 'em_andamento' && ultimaEtapa(ev) === 'concluido';
      if (ehHoje) {
        if (ev.status === 'agendado' && !ev.no_show && dDe(ev.data_inicio) < hoje) { b.atrasados.push({ ev, motivo: 'naoChegou' }); continue; }
        if (ev.status === 'em_andamento' && !pronto && prevFim && Date.parse(prevFim) < agora) { b.atrasados.push({ ev, motivo: 'passouPrazo' }); continue; }
        if (pronto) { b.prontos.push({ ev }); continue; }
        if (ev.status === 'em_andamento') { (dDe(prevFim) === hoje ? b.saem : b.naOficina).push({ ev }); continue; }
      } else {
        if (ev.status === 'em_andamento' && dDe(prevFim) === diaVisto) { b.saem.push({ ev }); continue; }
      }
      if (ev.status === 'agendado' && !ev.no_show && dDe(ev.data_inicio) === diaVisto) { b.chegam.push({ ev }); continue; }
      if (ev.status === 'agendado' && !ev.no_show && dDe(ev.data_inicio) > diaVisto && dDe(ev.data_inicio) <= somaDias(diaVisto, 7)) { b.proximos.push({ ev }); continue; }
      if (ev.status === 'concluido' && dDe(ev.entregue_em || ev.data_fim) === diaVisto) b.entregues.push({ ev });
    }
    // chegaram neste dia (check-in de verdade): lista propria para o filtro do calendario mensal
    for (const ev of carros) if ((ev.status === 'em_andamento' || ev.status === 'concluido') && dDe(ev.checkin_em || ev.data_inicio) === diaVisto) b.chegaram.push({ ev });
    b.proximos.sort((x, y) => Date.parse(x.ev.data_inicio) - Date.parse(y.ev.data_inicio));
    b.chegam.sort((x, y) => Date.parse(x.ev.data_inicio) - Date.parse(y.ev.data_inicio));
    if (ehDono && ehHoje) {
      const limite = agora - 30 * 86400e3;
      for (const s of solicitacoes as any[]) {
        if (s.status !== 'no_show' || Date.parse(s.created_at) < limite) continue;
        const meu = (s.orcamentos || []).find((o: any) => o.oficina_id === oficina!.id && o.status !== 'recusado');
        if (meu) b.naoVieram.push({ sol: s, meu });
      }
    }
    return b;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carros, solicitacoes, hoje, diaVisto, ehHoje, agora, ehDono, oficina]);

  useEffect(() => {
    if (!evPedido || !carros.length) return;
    const ev = carros.find((e: any) => e.id === evPedido);
    if (!ev) return;
    setEvPedido(null);
    const d = ev.status === 'em_andamento' ? hoje : ev.status === 'concluido' ? dDe(ev.entregue_em || ev.data_fim) : dDe(ev.data_inicio);
    if (d !== hoje) setDiaState(d);
    setTimeout(() => document.getElementById(`carro-${ev.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evPedido, carros, hoje]);

  // ---------- acoes (mesmas rotas do servidor de antes) ----------
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<{ id: string; txt: string } | null>(null);
  const [folha, setFolha] = useState<null | { tipo: 'chegou' | 'etapa' | 'entregar' | 'naoVeio'; ev: any; func: string; box: string; status?: string; obs: string; antecipar?: string; confirmar?: boolean }>(null);
  const servico = async (corpo: Record<string, unknown>) => {
    const res = await fetch('/api/servico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).catch(() => null);
    return { ok: !!res?.ok, status: res?.status || 0, dados: res ? await res.json().catch(() => ({})) : {} };
  };
  const fechar = () => { setFolha(null); setErro(null); };
  // check-in; a folha so aparece se houver o que perguntar (ou se o carro chegou antes do dia)
  const fazerChegou = async (base: NonNullable<typeof folha>, antecipar = false) => {
    setOcupado(base.ev.id); setErro(null);
    const r = await servico({ acao: 'checkin', eventoId: base.ev.id, antecipar, ...(base.func ? { funcionarioId: base.func } : {}), ...(base.box ? { boxId: base.box } : {}) });
    setOcupado(null);
    if (r.status === 409 && r.dados.codigo === 'CHECKIN_FUTURO') { setFolha({ ...base, antecipar: r.dados.dataAgendada }); return; }
    if (r.status === 409 && r.dados.codigo === 'CONFLITO_POSTO') { setFolha(base); setErro({ id: base.ev.id, txt: t('postoOcupado') }); return; }
    if (!r.ok) { setErro({ id: base.ev.id, txt: t('erroSalvar') }); return; }
    fechar(); refresh();
  };
  const confirmarChegou = async (antecipar = false) => { if (folha) await fazerChegou(folha, antecipar); };
  const gravarEtapa = async (status: string) => {
    if (!folha) return;
    if (status === 'concluido' && !folha.confirmar) { setFolha({ ...folha, status, confirmar: true }); return; }
    setOcupado(folha.ev.id); setErro(null);
    const r = await servico({ acao: 'etapa', eventoId: folha.ev.id, status, observacao: folha.obs });
    setOcupado(null);
    if (!r.ok) { setErro({ id: folha.ev.id, txt: t('erroSalvar') }); return; }
    fechar(); refresh();
  };
  const entregar = async () => {
    if (!folha) return;
    setOcupado(folha.ev.id); setErro(null);
    const res = await fetch('/api/confirmar-entrega', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventoId: folha.ev.id }) }).catch(() => null);
    setOcupado(null);
    if (!res?.ok) { setErro({ id: folha.ev.id, txt: t('erroSalvar') }); return; }
    fechar(); refresh();
  };
  const naoVeio = async () => {
    if (!folha) return;
    setOcupado(folha.ev.id);
    await fetch('/api/registrar-no-show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agendaId: folha.ev.id, solicitacaoId: folha.ev.solicitacao_id }) }).catch(() => null);
    setOcupado(null); fechar(); refresh();
  };
  const abrirChegou = (ev: any) => {
    const temPergunta = (funcionarios.length > 0 && !ehMecanico) || boxes.length > 0;
    const func = ev.funcionario_id || (ehMecanico ? funcionario?.id || '' : funcionarios.length === 1 ? funcionarios[0].id : '');
    // sem mecanico nem posto cadastrado: nada a perguntar, o check-in e direto
    if (!temPergunta) { fazerChegou({ tipo: 'chegou', ev, func, box: '', obs: '' }); return; }
    setFolha({ tipo: 'chegou', ev, func, box: ev.box_id || '', obs: '' });
  };

  // ---------- apresentacao ----------
  const fmtDiaLongo = useMemo(() => new Intl.DateTimeFormat(intl, { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' }), [intl]);
  const fmtDiaCurto = useMemo(() => new Intl.DateTimeFormat(intl, { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: fuso }), [intl, fuso]);
  const fmtHora = useMemo(() => new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit', timeZone: fuso }), [intl, fuso]);
  const carroDe = (ev: any) => { const v = ev.solicitacao?.veiculo; return v ? `${v.fipe_marca || ''} ${v.fipe_modelo || ''}`.trim() : ev.titulo; };
  const placaDe = (ev: any) => ev.solicitacao?.veiculo?.placa || '';
  const servicoDe = (ev: any) => (ev.solicitacao?.tipo ? rotuloTipoPedido(tc, ev.solicitacao.tipo, ev.solicitacao.descricao) : t('carroSemPedidoRotulo'));
  const etapaTexto = (st?: string) => (st ? t(`etapa_${st}`) : t('etapa_recebido'));
  const telefoneDe = (ev: any) => ev.solicitacao?.cliente?.telefone || null;

  const BLOCOS: { id: Bloco; icone: string; cor: string }[] = [
    { id: 'atrasados', icone: '⚠', cor: 'border-l-red-500' },
    { id: 'prontos', icone: '✔', cor: 'border-l-emerald-500' },
    { id: 'chegam', icone: '📥', cor: 'border-l-blue-500' },
    { id: 'chegaram', icone: '✔', cor: 'border-l-blue-300' },
    { id: 'naOficina', icone: '🔧', cor: 'border-l-amber-400' },
    { id: 'saem', icone: '📤', cor: 'border-l-slate-500' },
    { id: 'proximos', icone: '📅', cor: 'border-l-violet-500' },
    { id: 'entregues', icone: '✔', cor: 'border-l-gray-300' },
    { id: 'naoVieram', icone: '🚫', cor: 'border-l-orange-400' },
  ];
  const paraAgora = blocos.atrasados.length + blocos.prontos.length + blocos.chegam.length;
  // "Chegaram" repete carros de outros blocos: so aparece quando filtrado
  const visivel = (id: Bloco) => (filtro === 'tudo' && id !== 'chegaram') || filtro === id || (filtro === 'agora' && AGORA.includes(id)) || (filtro === 'naOficina' && id === 'saem');
  // titulo do bloco: em outro dia "neste dia" (antes dizia "hoje" num dia que nao era hoje)
  const tituloBloco = (id: Bloco) => (!ehHoje && ['chegam', 'saem', 'entregues'].includes(id) ? t(`bloco_${id}Dia`) : t(`bloco_${id}`));

  const botaoPrincipal = (bloco: Bloco, item: any) => {
    const { ev } = item;
    const cls = 'btn-primary flex min-h-[48px] w-full items-center justify-center sm:w-auto sm:px-6';
    if (bloco === 'chegam' || (bloco === 'atrasados' && item.motivo === 'naoChegou') || bloco === 'proximos') {
      if (bloco === 'proximos') return <Link href={ev.solicitacao_id ? `/oficina/pedidos/${ev.solicitacao_id}` : '/oficina/agenda'} className="btn-secondary flex min-h-[44px] w-full items-center justify-center sm:w-auto sm:px-5">{t('verPedido')}</Link>;
      return <button type="button" onClick={() => abrirChegou(ev)} className={cls} data-testid="btn-chegou">📥 {t('chegou')}</button>;
    }
    if (bloco === 'prontos') return ehMecanico ? null : <button type="button" onClick={() => setFolha({ tipo: 'entregar', ev, func: '', box: '', obs: '' })} className={cls} data-testid="btn-entregar">✔ {t('entregar')}</button>;
    if (bloco === 'atrasados' && item.motivo === 'passouPrazo' && telefoneDe(ev)) return <a href={`tel:${telefoneDe(ev)}`} className={cls}>📞 {t('ligar')} <span className="font-normal">{telefoneDe(ev)}</span></a>;
    if (bloco === 'entregues' || ev.status === 'concluido') return null;
    return <button type="button" onClick={() => setFolha({ tipo: 'etapa', ev, func: '', box: '', obs: '' })} className={cls} data-testid="btn-etapa">🔧 {t('etapa')}</button>;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDia(somaDias(diaVisto, -1))} aria-label={t('diaAnterior')} className="min-h-[44px] min-w-[44px] rounded-lg hover:bg-gray-100 text-xl">‹</button>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">{ehHoje ? t('titulo') : fmtDiaLongo.format(new Date(`${diaVisto}T12:00:00Z`))}</h1>
            {ehHoje && <p className="text-sm text-gray-500 capitalize">{fmtDiaLongo.format(new Date(`${hoje}T12:00:00Z`))}</p>}
          </div>
          <button type="button" onClick={() => setDia(somaDias(diaVisto, 1))} aria-label={t('proximoDia')} className="min-h-[44px] min-w-[44px] rounded-lg hover:bg-gray-100 text-xl">›</button>
          {!ehHoje && <button type="button" onClick={() => setDia(hoje)} className="ml-1 rounded-lg border border-gray-300 px-3 py-2 text-sm">{t('voltarHoje')}</button>}
        </div>
        {ehDono && <Link href="/oficina/checkin" className="btn-secondary !py-2 text-sm">{t('carroSemPedido')}</Link>}
      </div>

      {ehHoje && (
        <div className="grid grid-cols-3 gap-2 mb-6">
          {([{ n: paraAgora, txt: t('resumoAgora'), alvo: 'agora' }, { n: blocos.naOficina.length + blocos.saem.length, txt: t('resumoNaOficina'), alvo: 'naOficina' }, { n: blocos.proximos.length, txt: t('resumoProximos'), alvo: 'proximos' }] as { n: number; txt: string; alvo: Filtro }[]).map((r) => (
            <button key={r.txt} type="button" onClick={() => setFiltro(filtro === r.alvo ? 'tudo' : r.alvo)} aria-pressed={filtro === r.alvo} data-testid={`resumo-${r.alvo}`}
              className={`rounded-xl border p-3 text-center ${filtro === r.alvo ? 'border-primary-600 bg-primary-50 ring-2 ring-primary-200' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
              <span className="block text-3xl font-bold text-gray-900">{r.n}</span>
              <span className="block text-sm leading-tight text-gray-600">{r.txt}</span>
            </button>
          ))}
        </div>
      )}

      {BLOCOS.some((bl) => blocos[bl.id].length > 0) && (
        <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label={t('filtrar')}>
          <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
            {(['tudo', ...BLOCOS.filter((bl) => blocos[bl.id].length > 0).map((bl) => bl.id)] as Filtro[]).map((fl) => (
              <button key={fl} type="button" onClick={() => setFiltro(fl)} aria-pressed={filtro === fl} data-testid={`filtro-${fl}`}
                className={`min-h-[40px] whitespace-nowrap rounded-full border px-3 text-sm font-medium ${filtro === fl ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white text-gray-700'}`}>
                {fl === 'tudo' ? t('filtroTudo') : `${tituloBloco(fl as Bloco)} (${blocos[fl as Bloco].length})`}
              </button>
            ))}
          </div>
        </div>
      )}

      {BLOCOS.every((bl) => blocos[bl.id].length === 0) && (
        <div className="card text-center py-10">
          <p className="text-4xl mb-3" aria-hidden="true">☕</p>
          <p className="text-gray-700 mb-4">{ehHoje ? t('vazioHoje') : t('vazioDia')}</p>
          {ehDono && <Link href="/oficina/pedidos" className="btn-secondary">{t('verPedidos')}</Link>}
        </div>
      )}

      {BLOCOS.filter((bl) => blocos[bl.id].length > 0 && visivel(bl.id)).map((bl) => (
        <section key={bl.id} id={`bloco-${bl.id}`} className="mb-6 scroll-mt-24" data-testid={`bloco-${bl.id}`}>
          <h2 className="mb-2 text-lg font-semibold text-gray-900"><span aria-hidden="true">{bl.icone} </span>{tituloBloco(bl.id)} <span className="text-gray-500 font-normal">({blocos[bl.id].length})</span></h2>
          <ul className="space-y-3">
            {bl.id === 'naoVieram' ? blocos.naoVieram.map(({ sol }) => (
              <li key={sol.id} className={`card !p-4 border-l-4 ${bl.cor}`}>
                <p className="font-semibold text-gray-900">{[sol.veiculo?.fipe_marca, sol.veiculo?.fipe_modelo].filter(Boolean).join(' ')} {sol.veiculo?.placa ? `· ${sol.veiculo.placa}` : ''}</p>
                <p className="text-sm text-gray-600">{sol.cliente?.nome}</p>
                <Link href={`/oficina/orcamento/${sol.id}`} className="btn-primary mt-3 flex min-h-[48px] w-full items-center justify-center sm:w-auto sm:px-6">{t('mandarNovasDatas')}</Link>
              </li>
            )) : blocos[bl.id].map((item) => {
              const { ev } = item;
              const b = montarBarra(ev, hoje, pais, ev.titulo);
              const tm = temposDoCarro(ev, agora);
              const ult = ultimaEtapa(ev);
              const exp = aberto === ev.id;
              const mec = ev.funcionario ? nomeFuncionario(ev.funcionario) : null;
              const desdeEtapa = etapasOrdenadas(ev).slice(-1)[0]?.created_at;
              return (
                <li key={ev.id} id={`carro-${ev.id}`} className={`card !p-4 border-l-4 ${bl.cor} ${aberto === ev.id ? 'ring-2 ring-primary-300' : ''}`} data-testid="hoje-cartao">
                  <button type="button" onClick={() => setAberto(exp ? null : ev.id)} aria-expanded={exp} className="block w-full text-left">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-gray-900 text-base">{carroDe(ev)}{placaDe(ev) && <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-sm font-mono">{placaDe(ev)}</span>}</p>
                      {bl.id === 'atrasados' && <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-sm font-semibold text-red-800">⚠ {item.motivo === 'naoChegou' ? t('naoChegouDesde', { dia: fmtDiaCurto.format(new Date(ev.data_inicio)) }) : t('prazoEra', { dia: fmtDiaCurto.format(new Date(ev.data_fim_prevista || ev.data_fim)) })}</span>}
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600">{[ev.solicitacao?.cliente?.nome, servicoDe(ev), mec ? t('mecanicoNome', { nome: mec }) : null].filter(Boolean).join(' · ')}</p>
                    <p className="mt-1 text-sm text-gray-800">
                      {ev.status === 'em_andamento' ? `${etapaTexto(ult)}${desdeEtapa ? ` · ${t('ha', { tempo: duracao((agora - Date.parse(desdeEtapa)) / 60e3) })}` : ''}`
                        : ev.status === 'agendado' ? t('chegaAs', { dia: fmtDiaCurto.format(new Date(ev.data_inicio)), hora: fmtHora.format(new Date(ev.data_inicio)) })
                        : t('entregueAs', { hora: fmtHora.format(new Date(ev.entregue_em || ev.data_fim)) })}
                    </p>
                  </button>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {botaoPrincipal(bl.id, item)}
                    {ev.solicitacao_id && <Link href={`/oficina/mensagens/${ev.solicitacao_id}`} className="text-sm font-medium text-primary-700 hover:underline">💬 {t('mensagem')}</Link>}
                    {ev.solicitacao_id && bl.id !== 'proximos' && <Link href={`/oficina/pedidos/${ev.solicitacao_id}`} className="text-sm font-medium text-primary-700 hover:underline">📄 {t('verPedido')}</Link>}
                    {bl.id === 'atrasados' && item.motivo === 'naoChegou' && ehDono && ev.tipo === 'plataforma' && <button type="button" onClick={() => setFolha({ tipo: 'naoVeio', ev, func: '', box: '', obs: '' })} className="text-sm text-gray-600 underline">{t('naoVeio')}</button>}
                  </div>
                  {erro?.id === ev.id && !folha && <p role="alert" className="mt-2 text-sm text-red-700">{erro?.txt}</p>}
                  {exp && (
                    <div className="mt-4 space-y-3 border-t border-gray-100 pt-3 text-sm">
                      {ev.solicitacao?.descricao && <p className="text-gray-700">{cleanDescricao(ev.solicitacao.descricao)}</p>}
                      {b.realIni && <p className="text-gray-600">{t('naOficinaHa', { tempo: duracao(tm.naOficinaMin) })}</p>}
                      {etapasOrdenadas(ev).length > 0 && (
                        <ol className="space-y-1">
                          {etapasOrdenadas(ev).map((e: any, i: number) => <li key={i} className="flex justify-between gap-3"><span>{etapaTexto(e.status)}</span><span className="text-gray-500">{fmtDiaCurto.format(new Date(e.created_at))} {fmtHora.format(new Date(e.created_at))}</span></li>)}
                        </ol>
                      )}
                      {ev.status === 'em_andamento' && (
                        <details>
                          <summary className="cursor-pointer text-primary-700">{t('maisOpcoes')}</summary>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {ETAPAS_MAIS.map((st) => <button key={st} type="button" onClick={() => { setFolha({ tipo: 'etapa', ev, func: '', box: '', obs: '' }); setTimeout(() => gravarEtapaDireto(ev, st), 0); }} className="rounded-lg border border-gray-300 px-3 py-2">{etapaTexto(st)}</button>)}
                          </div>
                        </details>
                      )}
                      {oficina && <NotasInternas agendaId={ev.id} oficinaId={oficina.id} funcionarioResponsavelProfileId={ev.funcionario?.profile_id} veiculoLabel={carroDe(ev)} />}
                      <Link href={`/oficina/agenda?vista=quadro&ev=${ev.id}`} className="inline-block text-primary-700 hover:underline" data-testid="ver-no-quadro">{t('verNoQuadro')} ›</Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {folha && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={fechar}>
          <div role="dialog" aria-modal="true" aria-labelledby="hoje-folha-titulo" className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl p-5 space-y-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="hoje-folha-titulo" className="text-lg font-semibold text-gray-900">{t(`folha_${folha.tipo}`)}</h3>
                <p className="text-sm text-gray-600">{carroDe(folha.ev)} {placaDe(folha.ev)}</p>
              </div>
              <button type="button" onClick={fechar} aria-label={t('fechar')} className="min-w-[44px] min-h-[44px] -m-2 text-xl text-gray-500">✕</button>
            </div>

            {folha.tipo === 'chegou' && (
              <>
                {folha.antecipar ? (
                  <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="mb-3">{t('chegouAntes', { dia: fmtDiaCurto.format(new Date(folha.antecipar)) })}</p>
                    <button type="button" disabled={!!ocupado} onClick={() => confirmarChegou(true)} className="btn-primary w-full min-h-[48px]">{t('simChegouHoje')}</button>
                  </div>
                ) : (
                  <>
                    {funcionarios.length > 0 && !ehMecanico && (
                      <fieldset>
                        <legend className="mb-2 text-sm font-medium text-gray-700">{t('quemVaiFazer')}</legend>
                        <div className="grid grid-cols-2 gap-2">
                          {[{ id: '', nome: t('ninguemAinda') }, ...funcionarios.map((f) => ({ id: f.id, nome: nomeFuncionario(f) || '—' }))].map((f) => (
                            <button key={f.id || 'sem'} type="button" aria-pressed={folha.func === f.id} onClick={() => setFolha({ ...folha, func: f.id })}
                              className={`min-h-[48px] rounded-lg border px-3 text-sm ${folha.func === f.id ? 'border-primary-600 bg-primary-50 font-semibold text-primary-800' : 'border-gray-300 text-gray-800'}`}>{f.nome}</button>
                          ))}
                        </div>
                      </fieldset>
                    )}
                    {boxes.length > 0 && (
                      <fieldset>
                        <legend className="mb-2 text-sm font-medium text-gray-700">{t('ondeVaiFicar')}</legend>
                        <div className="grid grid-cols-2 gap-2">
                          {[{ id: '', nome: t('semLugar') }, ...boxes.map((x) => ({ id: x.id, nome: x.nome }))].map((x) => (
                            <button key={x.id || 'sem'} type="button" aria-pressed={folha.box === x.id} onClick={() => setFolha({ ...folha, box: x.id })}
                              className={`min-h-[48px] rounded-lg border px-3 text-sm ${folha.box === x.id ? 'border-primary-600 bg-primary-50 font-semibold text-primary-800' : 'border-gray-300 text-gray-800'}`}>{x.nome}</button>
                          ))}
                        </div>
                      </fieldset>
                    )}
                    <button type="button" disabled={!!ocupado} onClick={() => confirmarChegou(false)} className="btn-primary w-full min-h-[48px]" data-testid="confirmar-chegou">{ocupado ? t('salvando') : t('confirmarChegou')}</button>
                  </>
                )}
              </>
            )}

            {folha.tipo === 'etapa' && (
              folha.confirmar ? (
                <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                  <p className="mb-3">{t('confirmarPronto')}</p>
                  <button type="button" disabled={!!ocupado} onClick={() => gravarEtapa('concluido')} className="btn-primary w-full min-h-[48px]" data-testid="confirmar-pronto">{t('simEstaPronto')}</button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {ETAPAS_RAPIDAS.map((e) => (
                      <button key={e.status} type="button" disabled={!!ocupado} onClick={() => gravarEtapa(e.status)} data-testid={`etapa-${e.status}`}
                        className={`min-h-[64px] rounded-xl border px-3 py-2 text-left text-sm font-medium ${ultimaEtapa(folha.ev) === e.status ? 'border-primary-600 bg-primary-50' : 'border-gray-300'} hover:bg-gray-50`}>
                        <span className="block text-xl" aria-hidden="true">{e.icone}</span>{etapaTexto(e.status)}
                      </button>
                    ))}
                  </div>
                  <label className="block">
                    <span className="block text-sm text-gray-700 mb-1">{t('observacaoOpcional')}</span>
                    <input className="input-field" value={folha.obs} onChange={(e) => setFolha({ ...folha, obs: e.target.value })} maxLength={500} />
                  </label>
                </>
              )
            )}

            {folha.tipo === 'entregar' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">{t('confirmarEntrega')}</p>
                <button type="button" disabled={!!ocupado} onClick={entregar} className="btn-primary w-full min-h-[48px]" data-testid="confirmar-entrega">{ocupado ? t('salvando') : t('simEntregar')}</button>
              </div>
            )}

            {folha.tipo === 'naoVeio' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">{t('confirmarNaoVeio')}</p>
                <button type="button" disabled={!!ocupado} onClick={naoVeio} className="w-full min-h-[48px] rounded-lg bg-orange-600 font-semibold text-white">{t('simNaoVeio')}</button>
              </div>
            )}

            {erro && <p role="alert" className="text-sm text-red-700">{erro.txt}</p>}
          </div>
        </div>
      )}
    </div>
  );

  // etapa escolhida em "Mais opcoes" (testando, recebido, peca em falta): grava direto
  async function gravarEtapaDireto(ev: any, status: string) {
    setOcupado(ev.id);
    const r = await servico({ acao: 'etapa', eventoId: ev.id, status, observacao: '' });
    setOcupado(null);
    if (!r.ok) setErro({ id: ev.id, txt: t('erroSalvar') }); else { setFolha(null); refresh(); }
  }
}
