import { supabase } from '@/lib/supabase';
import { diaNaOficina } from '@/lib/fuso';

// Numeros da pagina Desempenho (auditoria do painel 10/10, secao E): tudo sai
// das tabelas que ja existem, lido com a sessao da oficina (RLS) e agrupado no
// fuso da oficina. Volume por oficina e pequeno (centenas de linhas).

export type Periodo = '4s' | '3m' | '12m';
export interface Faixa { inicio: string; fim: string; rotulo: string } // dias 'YYYY-MM-DD' [inicio, fim)
export interface Desempenho {
  faixas: Faixa[];
  recebidos: number[]; respondidos: number[]; ganhos: number[];
  totais: { recebidos: number; respondidos: number; ganhos: number; recebidosAntes: number; ganhosAntes: number };
  respostaMedianaMin: number | null; respostaPorFaixa: (number | null)[];
  receita: number[]; receitaTotal: number; receitaEntregue: number;
  nota: number | null; totalAvaliacoes: number; ultimasAvaliacoes: { nota: number; comentario: string | null; created_at: string }[];
  entregues: number; noPrazo: number;
  porEtapa: { status: string; horas: number }[];
  naoVieram: number;
  temDados: boolean;
}

const somaDias = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mediana = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function montarFaixas(periodo: Periodo, hoje: string, intl: string): Faixa[] {
  const fmtDia = new Intl.DateTimeFormat(intl, { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  const fmtMes = new Intl.DateTimeFormat(intl, { month: 'short', timeZone: 'UTC' });
  if (periodo === '12m') {
    const [y, m] = hoje.split('-').map(Number);
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1 - (11 - i), 1)); const e = new Date(Date.UTC(y, m - (11 - i), 1));
      return { inicio: d.toISOString().slice(0, 10), fim: e.toISOString().slice(0, 10), rotulo: fmtMes.format(d).replace('.', '') };
    });
  }
  const n = periodo === '4s' ? 4 : 13;
  const fimUltima = somaDias(hoje, 1);
  return Array.from({ length: n }, (_, i) => {
    const fim = somaDias(fimUltima, -7 * (n - 1 - i)); const inicio = somaDias(fim, -7);
    return { inicio, fim, rotulo: fmtDia.format(new Date(`${inicio}T12:00:00Z`)) };
  });
}

export async function carregarDesempenho(opts: { oficinaId: string; donoProfileId: string; pais: string | null; periodo: Periodo; hoje: string; intl: string }): Promise<Desempenho> {
  const { oficinaId, donoProfileId, pais, periodo, hoje, intl } = opts;
  const faixas = montarFaixas(periodo, hoje, intl);
  const desdeYmd = faixas[0].inicio;
  const duracaoDias = Math.round((Date.parse(`${faixas[faixas.length - 1].fim}T00:00:00Z`) - Date.parse(`${desdeYmd}T00:00:00Z`)) / 86400e3);
  const antesYmd = somaDias(desdeYmd, -duracaoDias); // periodo anterior, para comparar
  const desdeIso = new Date(Date.parse(`${antesYmd}T00:00:00Z`) - 86400e3).toISOString();
  const dia = (iso: string) => diaNaOficina(iso, pais);
  const faixaDe = (ymd: string) => faixas.findIndex((f) => ymd >= f.inicio && ymd < f.fim);
  const zeros = () => faixas.map(() => 0);

  const [notifs, orcs, ags, avs, revs] = await Promise.all([
    supabase.from('notificacoes').select('created_at, dados').eq('profile_id', donoProfileId).in('tipo', ['nova_solicitacao', 'emergencia']).gte('created_at', desdeIso),
    supabase.from('orcamentos').select('id, created_at, status, valor_total, solicitacao_id, solicitacao:solicitacoes(created_at, status)').eq('oficina_id', oficinaId).gte('created_at', desdeIso),
    supabase.from('agenda').select('id, created_at, tipo, status, solicitacao_id, data_fim, data_fim_prevista, entregue_em, etapas:manutencao_etapas(status, created_at)').eq('oficina_id', oficinaId).gte('created_at', desdeIso),
    supabase.from('avaliacoes').select('nota, comentario, created_at').eq('oficina_id', oficinaId).order('created_at', { ascending: false }),
    supabase.from('orcamento_revisoes').select('valor_anterior, valor_novo, decidido_em, status').eq('oficina_id', oficinaId).eq('status', 'aprovada').gte('decidido_em', desdeIso),
  ]);

  const recebidos = zeros(), respondidos = zeros(), ganhos = zeros(), receita = zeros();
  const respPorFaixa: number[][] = faixas.map(() => []);
  let recebidosAntes = 0, ganhosAntes = 0;
  // pedido recebido = aviso de pedido novo (um por pedido)
  const vistosPedido = new Set<string>();
  for (const n of (notifs.data || []) as any[]) {
    const chave = n.dados?.solicitacao_id || n.dados?.emergencia_id || n.created_at;
    if (vistosPedido.has(chave)) continue; vistosPedido.add(chave);
    const d = dia(n.created_at); const i = faixaDe(d);
    if (i >= 0) recebidos[i]++; else if (d >= antesYmd && d < desdeYmd) recebidosAntes++;
  }
  const orcPorSol = new Map<string, any>();
  const tempos: number[] = [];
  for (const o of (orcs.data || []) as any[]) {
    orcPorSol.set(o.solicitacao_id, o);
    const i = faixaDe(dia(o.created_at));
    if (i < 0) continue;
    respondidos[i]++;
    if (o.solicitacao?.created_at) { const min = (Date.parse(o.created_at) - Date.parse(o.solicitacao.created_at)) / 60e3; if (min >= 0) { tempos.push(min); respPorFaixa[i].push(min); } }
  }
  // todo pedido orcado foi recebido (pedidos antigos nao tinham o aviso gravado)
  for (let i = 0; i < faixas.length; i++) recebidos[i] = Math.max(recebidos[i], respondidos[i]);
  // ganho = orcamento aceito; a data do aceite e a criacao do agendamento da plataforma
  let receitaEntregue = 0, entregues = 0, noPrazo = 0;
  const duracoes: Record<string, number[]> = {};
  for (const a of (ags.data || []) as any[]) {
    if (a.tipo === 'plataforma' && a.solicitacao_id) {
      const o = orcPorSol.get(a.solicitacao_id);
      const d = dia(a.created_at); const i = faixaDe(d);
      if (o?.status === 'aceito') {
        if (i >= 0) { ganhos[i]++; receita[i] += Number(o.valor_total) || 0; if (a.status === 'concluido') receitaEntregue += Number(o.valor_total) || 0; }
        else if (d >= antesYmd && d < desdeYmd) ganhosAntes++;
      }
    }
    const fimReal = a.entregue_em || (a.status === 'concluido' ? a.data_fim : null);
    if (a.status === 'concluido' && fimReal && faixaDe(dia(fimReal)) >= 0) {
      entregues++;
      const prev = a.data_fim_prevista || a.data_fim;
      // no prazo = entregue ate o fim do dia combinado (no fuso da oficina)
      if (!prev || dia(fimReal) <= dia(prev)) noPrazo++;
    }
    const et = [...(a.etapas || [])].sort((x: any, y: any) => (x.created_at < y.created_at ? -1 : 1));
    for (let k = 0; k < et.length - 1; k++) {
      const st = et[k].status === 'pausa_pecas' ? 'aguardando_pecas' : et[k].status;
      if (['entregue', 'concluido', 'recebido'].includes(st)) continue;
      (duracoes[st] ||= []).push((Date.parse(et[k + 1].created_at) - Date.parse(et[k].created_at)) / 3600e3);
    }
  }
  for (const r of (revs.data || []) as any[]) {
    const i = r.decidido_em ? faixaDe(dia(r.decidido_em)) : -1;
    if (i >= 0) receita[i] += (Number(r.valor_novo) || 0) - (Number(r.valor_anterior) || 0);
  }
  const ordemEtapas = ['diagnostico', 'em_execucao', 'aguardando_pecas', 'pausa_cliente', 'pausa_geral', 'teste_final'];
  const porEtapa = ordemEtapas.filter((s) => duracoes[s]?.length).map((s) => ({ status: s, horas: duracoes[s].reduce((x, y) => x + y, 0) / duracoes[s].length }));
  const avaliacoes = (avs.data || []) as any[];
  const naoVieram = ((orcs.data || []) as any[]).filter((o) => o.solicitacao?.status === 'no_show' && faixaDe(dia(o.created_at)) >= 0).length;
  const soma = (xs: number[]) => xs.reduce((x, y) => x + y, 0);
  return {
    faixas, recebidos, respondidos, ganhos,
    totais: { recebidos: soma(recebidos), respondidos: soma(respondidos), ganhos: soma(ganhos), recebidosAntes, ganhosAntes },
    respostaMedianaMin: mediana(tempos), respostaPorFaixa: respPorFaixa.map((xs) => mediana(xs)),
    receita, receitaTotal: soma(receita), receitaEntregue,
    nota: avaliacoes.length ? avaliacoes.reduce((s, a) => s + Number(a.nota), 0) / avaliacoes.length : null,
    totalAvaliacoes: avaliacoes.length, ultimasAvaliacoes: avaliacoes.slice(0, 3),
    entregues, noPrazo, porEtapa, naoVieram,
    temDados: soma(respondidos) > 0 || soma(recebidos) > 0 || avaliacoes.length > 0 || entregues > 0,
  };
}
