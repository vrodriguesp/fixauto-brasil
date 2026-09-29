'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatCurrency, formatDateTime, cleanDescricao } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { STATUS_SOLICITACAO, STATUS_ORCAMENTO } from '@fixauto/shared';

const STATUS_BADGE: Record<string, string> = {
  aberta: 'bg-blue-500/20 text-blue-400',
  em_orcamento: 'bg-yellow-500/20 text-yellow-400',
  aceita: 'bg-emerald-500/20 text-emerald-400',
  em_andamento: 'bg-purple-500/20 text-purple-400',
  concluida: 'bg-slate-500/20 text-slate-300',
  cancelada: 'bg-red-500/20 text-red-400',
  enviado: 'bg-blue-500/20 text-blue-400',
  visualizado: 'bg-yellow-500/20 text-yellow-400',
  aceito: 'bg-emerald-500/20 text-emerald-400',
  recusado: 'bg-red-500/20 text-red-400',
  expirado: 'bg-slate-500/20 text-slate-300',
  agendado: 'bg-blue-500/20 text-blue-400',
  concluido: 'bg-slate-500/20 text-slate-300',
  cancelado: 'bg-red-500/20 text-red-400',
};

const STATUS_AGENDA_LABEL: Record<string, string> = {
  agendado: 'Agendado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const ETAPA_LABEL: Record<string, string> = {
  recebido: 'Veículo recebido',
  diagnostico: 'Diagnóstico',
  aguardando_pecas: 'Aguardando peças',
  em_execucao: 'Em execução',
  pausa_cliente: 'Pausa (cliente)',
  pausa_pecas: 'Pausa (peças)',
  pausa_geral: 'Pausa',
  teste_final: 'Teste final',
  concluido: 'Concluído',
  entregue: 'Entregue ao cliente',
};

const ACAO_LABEL: Record<string, string> = {
  corrigir_status: 'Status corrigido',
  corrigir_agendamento: 'Agendamento corrigido',
  cancelar_agendamento: 'Agendamento cancelado',
  adicionar_etapa: 'Etapa adicionada',
  remover_etapa: 'Etapa removida',
};

// <input type="datetime-local"> trabalha no horario local, sem fuso
function paraInputLocal(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function resumo(v: any): string {
  if (!v || typeof v !== 'object') return '—';
  return Object.entries(v)
    .filter(([k]) => !['id', 'agenda_id', 'funcionario_id', 'created_at'].includes(k))
    .map(([k, val]) => `${k}: ${typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val) ? formatDateTime(val) : String(val ?? '—')}`)
    .join(' · ');
}

export default function AdminSolicitacaoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cobrando, setCobrando] = useState(false);
  const [cobrancaResultado, setCobrancaResultado] = useState<string | null>(null);
  const [novoStatus, setNovoStatus] = useState('');
  const [salvandoStatus, setSalvandoStatus] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [cancelandoAgendaId, setCancelandoAgendaId] = useState<string | null>(null);
  // Modo correcao: toda correcao exige motivo e fica no historico
  const [corrigindo, setCorrigindo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [corrMsg, setCorrMsg] = useState<string | null>(null);
  const [enviandoCorr, setEnviandoCorr] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);
  const [orcStatus, setOrcStatus] = useState<Record<string, string>>({});
  const [agendaEdit, setAgendaEdit] = useState<Record<string, { status: string; inicio: string; fim: string }>>({});
  const [novaEtapa, setNovaEtapa] = useState<Record<string, { status: string; observacao: string }>>({});

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/solicitacoes/${id}`);
    const json = res.ok ? await res.json() : null;
    setData(json);
    if (json) {
      setNovoStatus(json.solicitacao.status);
      setOrcStatus(Object.fromEntries(json.orcamentos.map((o: any) => [o.id, o.status])));
      setAgendaEdit(Object.fromEntries((json.agenda || []).map((a: any) => [a.id, { status: a.status, inicio: paraInputLocal(a.data_inicio), fim: paraInputLocal(a.data_fim) }])));
    }
    const h = await fetch(`/api/admin/auditoria?solicitacao_id=${id}`);
    setHistorico(h.ok ? await h.json() : []);
    setLoading(false);
  };

  const corrigir = async (body: Record<string, unknown>, ok: string) => {
    if (motivo.trim().length < 3) {
      setCorrMsg('Escreva o motivo da correção antes (fica no histórico).');
      return;
    }
    setEnviandoCorr(true);
    setCorrMsg(null);
    const res = await fetch('/api/admin/corrigir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, motivo }),
    });
    const r = await res.json().catch(() => ({}));
    setEnviandoCorr(false);
    if (!res.ok) {
      setCorrMsg(r.error || 'Erro ao corrigir.');
      return;
    }
    setCorrMsg(ok);
    await fetchData();
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleCobrar = async () => {
    setCobrando(true);
    setCobrancaResultado(null);
    const res = await fetch(`/api/admin/solicitacoes/${id}/cobrar`, { method: 'POST' });
    const result = await res.json();
    setCobrancaResultado(
      res.ok
        ? `${result.oficinasNotificadas} oficina(s) próxima(s) notificada(s).`
        : result.error || 'Erro ao cobrar oficinas.'
    );
    setCobrando(false);
  };

  const handleSalvarStatus = async () => {
    if (motivo.trim().length < 3) {
      setStatusMsg('Escreva o motivo da correção (campo abaixo) antes de salvar.');
      setCorrigindo(true);
      return;
    }
    setSalvandoStatus(true);
    setStatusMsg(null);
    const res = await fetch(`/api/admin/solicitacoes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novoStatus, motivo }),
    });
    const result = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatusMsg('Status atualizado. Cliente e oficina foram avisados.');
      await fetchData();
    } else {
      setStatusMsg(result.error || 'Erro ao atualizar status.');
    }
    setSalvandoStatus(false);
  };

  const handleCancelarAgenda = async (agendaId: string) => {
    if (!confirm('Cancelar este agendamento? O cliente e a oficina serão notificados.')) return;
    setCancelandoAgendaId(agendaId);
    const res = await fetch(`/api/admin/agenda/${agendaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancelar', motivo }),
    });
    const result = await res.json().catch(() => ({}));
    if (res.ok) {
      await fetchData();
    } else {
      alert(result.error || 'Erro ao cancelar agendamento.');
    }
    setCancelandoAgendaId(null);
  };

  if (loading) return <div className="text-slate-400">Carregando...</div>;
  if (!data) return <div className="text-slate-400">Solicitação não encontrada.</div>;

  const { solicitacao, fotos, orcamentos, mensagens, avaliacao, analiseDano, emergencia, agenda, etapas, notasInternas } = data;

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/admin/solicitacoes" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">← Voltar</Link>
          <h1 className="text-2xl font-bold text-white">{cleanDescricao(solicitacao.descricao)}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[solicitacao.status]}`}>
              {STATUS_SOLICITACAO[solicitacao.status as keyof typeof STATUS_SOLICITACAO]?.label}
            </span>
            {emergencia && <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">⚡ Acidente</span>}
            <span className="text-slate-500 text-xs">Criada em {formatDateTime(solicitacao.created_at)}</span>
          </div>
        </div>
        <div className="text-right space-y-3">
          <div className="flex items-center gap-2 justify-end">
            <select
              value={novoStatus}
              onChange={(e) => setNovoStatus(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2"
            >
              {Object.entries(STATUS_SOLICITACAO).map(([key, s]) => (
                <option key={key} value={key}>{s.label}</option>
              ))}
            </select>
            <button
              onClick={handleSalvarStatus}
              disabled={salvandoStatus || novoStatus === solicitacao.status}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {salvandoStatus ? 'Salvando...' : 'Salvar status'}
            </button>
          </div>
          {statusMsg && <p className="text-xs text-slate-400 max-w-[280px]">{statusMsg}</p>}
          {(solicitacao.status === 'aberta' || solicitacao.status === 'em_orcamento') && (
            <div>
              <button onClick={handleCobrar} disabled={cobrando} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                {cobrando ? 'Notificando...' : 'Cobrar oficinas próximas'}
              </button>
              {cobrancaResultado && <p className="text-xs text-slate-400 mt-2 max-w-[220px]">{cobrancaResultado}</p>}
            </div>
          )}
        </div>
      </div>

      <div className={`rounded-xl border p-4 mb-8 ${corrigindo ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-800 border-slate-700'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-white font-medium text-sm">✏️ Corrigir dados deste serviço</p>
            <p className="text-slate-400 text-xs">Status, orçamentos, agendamentos e etapas. Cliente e oficina são avisados; nada de automático é disparado (comissão, avisos a oficinas etc.).</p>
          </div>
          <button
            onClick={() => setCorrigindo(!corrigindo)}
            className={`text-sm font-medium px-4 py-2 rounded-lg ${corrigindo ? 'bg-slate-700 text-white' : 'bg-amber-600 hover:bg-amber-500 text-white'}`}
          >
            {corrigindo ? 'Sair do modo correção' : 'Corrigir dados'}
          </button>
        </div>
        {corrigindo && (
          <div className="mt-4">
            <label className="block text-xs text-amber-200 mb-1">Motivo da correção (obrigatório, fica no histórico)</label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: oficina marcou a etapa errada por engano"
              className="w-full bg-slate-900 border border-slate-600 text-white text-sm rounded-lg px-3 py-2"
            />
            {corrMsg && <p className="text-sm text-amber-100 mt-2">{corrMsg}</p>}
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Cliente</p>
          <p className="text-white font-medium">{solicitacao.cliente?.nome}</p>
          <p className="text-slate-400 text-sm">{solicitacao.cliente?.email}</p>
          <p className="text-slate-400 text-sm">{solicitacao.cliente?.telefone}</p>
          <Link href={`/admin/solicitacoes?cliente_id=${solicitacao.cliente?.id}`} className="text-blue-400 hover:underline text-xs mt-2 inline-block">
            Ver outras solicitações deste cliente →
          </Link>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Veículo</p>
          <p className="text-white font-medium">{solicitacao.veiculo?.fipe_marca} {solicitacao.veiculo?.fipe_modelo} {solicitacao.veiculo?.fipe_ano}</p>
          <p className="text-slate-400 text-sm">{solicitacao.veiculo?.placa || 'Sem placa cadastrada'}</p>
          <p className="text-slate-400 text-sm">{solicitacao.endereco}</p>
          {solicitacao.veiculo && (
            <Link href={`/admin/veiculos/${solicitacao.veiculo.id}`} className="text-blue-400 hover:underline text-xs mt-2 inline-block">
              Ver histórico completo do veículo →
            </Link>
          )}
        </div>
      </div>

      {analiseDano && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-8">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Análise de dano por IA</p>
          <p className="text-white text-sm">{analiseDano.resumo}</p>
          <p className="text-slate-400 text-xs mt-1">Severidade: {analiseDano.severidade} · Confiança: {analiseDano.confianca ? `${Math.round(analiseDano.confianca * 100)}%` : '—'}</p>
        </div>
      )}

      {fotos.length > 0 && (
        <div className="mb-8">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Fotos ({fotos.length})</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {fotos.map((f: any) => (
              <a key={f.id} href={f.foto_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                <img src={f.foto_url} alt="Foto" className="w-32 h-32 object-cover rounded-lg border border-slate-700" />
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mb-8">
        <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Orçamentos ({orcamentos.length})</p>
        {orcamentos.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhum orçamento recebido ainda.</p>
        ) : (
          <div className="space-y-3">
            {orcamentos.map((o: any) => (
              <div key={o.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{o.oficina?.nome_fantasia}</p>
                    <p className="text-slate-400 text-sm">{o.oficina?.cidade}, {o.oficina?.estado}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-semibold">{formatCurrency(o.valor_total, currencyForCountry(o.oficina?.pais))}</p>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${STATUS_BADGE[o.status]}`}>
                      {STATUS_ORCAMENTO[o.status as keyof typeof STATUS_ORCAMENTO]?.label}
                    </span>
                  </div>
                </div>
                {o.observacoes && <p className="text-slate-400 text-sm mt-2">{cleanDescricao(o.observacoes)}</p>}
                {o.itens?.length > 0 && (
                  <div className="mt-3 border-t border-slate-700 pt-3 space-y-1">
                    {o.itens.map((it: any) => (
                      <div key={it.id} className="flex justify-between text-xs text-slate-400">
                        <span>{it.descricao} × {it.quantidade}</span>
                        <span>{formatCurrency(it.valor_total, currencyForCountry(o.oficina?.pais))}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-slate-500 text-xs mt-2">Enviado em {formatDateTime(o.created_at)} · Prazo {o.prazo_dias} dia(s)</p>
                {corrigindo && (
                  <div className="flex items-center gap-2 mt-3">
                    <select
                      value={orcStatus[o.id] || o.status}
                      onChange={(e) => setOrcStatus({ ...orcStatus, [o.id]: e.target.value })}
                      className="bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5"
                    >
                      {Object.entries(STATUS_ORCAMENTO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button
                      disabled={enviandoCorr || (orcStatus[o.id] || o.status) === o.status}
                      onClick={() => corrigir({ entidade: 'orcamento', id: o.id, alteracoes: { status: orcStatus[o.id] } }, 'Status do orçamento corrigido.')}
                      className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                    >
                      Corrigir status
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {agenda?.length > 0 && (
        <div className="mb-8">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Agendamentos ({agenda.length})</p>
          <div className="space-y-2">
            {agenda.map((a: any) => (
              <div key={a.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">{a.titulo}</p>
                  <p className="text-slate-400 text-sm">
                    {formatDateTime(a.data_inicio)} — {formatDateTime(a.data_fim)}
                    {a.funcionario?.profile?.nome && ` · ${a.funcionario.profile.nome}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[a.status]}`}>
                    {STATUS_AGENDA_LABEL[a.status] || a.status}
                  </span>
                  {a.status !== 'cancelado' && a.status !== 'concluido' && (
                    <button
                      onClick={() => handleCancelarAgenda(a.id)}
                      disabled={cancelandoAgendaId === a.id}
                      className="text-red-400 hover:text-red-300 disabled:opacity-40 text-xs font-medium"
                    >
                      {cancelandoAgendaId === a.id ? 'Cancelando...' : 'Cancelar'}
                    </button>
                  )}
                </div>
              </div>
              {corrigindo && agendaEdit[a.id] && (
                <div className="mt-3 pt-3 border-t border-slate-700 space-y-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs text-slate-400">
                      Status
                      <select
                        value={agendaEdit[a.id].status}
                        onChange={(e) => setAgendaEdit({ ...agendaEdit, [a.id]: { ...agendaEdit[a.id], status: e.target.value } })}
                        className="block mt-1 bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5"
                      >
                        {Object.entries(STATUS_AGENDA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-slate-400">
                      Início
                      <input
                        type="datetime-local"
                        value={agendaEdit[a.id].inicio}
                        onChange={(e) => setAgendaEdit({ ...agendaEdit, [a.id]: { ...agendaEdit[a.id], inicio: e.target.value } })}
                        className="block mt-1 bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5"
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      Fim
                      <input
                        type="datetime-local"
                        value={agendaEdit[a.id].fim}
                        onChange={(e) => setAgendaEdit({ ...agendaEdit, [a.id]: { ...agendaEdit[a.id], fim: e.target.value } })}
                        className="block mt-1 bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5"
                      />
                    </label>
                    <button
                      disabled={enviandoCorr}
                      onClick={() => {
                        const ed = agendaEdit[a.id];
                        const alteracoes: Record<string, string> = {};
                        if (ed.status !== a.status) alteracoes.status = ed.status;
                        if (ed.inicio !== paraInputLocal(a.data_inicio)) alteracoes.data_inicio = new Date(ed.inicio).toISOString();
                        if (ed.fim !== paraInputLocal(a.data_fim)) alteracoes.data_fim = new Date(ed.fim).toISOString();
                        if (Object.keys(alteracoes).length === 0) return setCorrMsg('Nada mudou neste agendamento.');
                        corrigir({ entidade: 'agenda', id: a.id, alteracoes }, 'Agendamento corrigido.');
                      }}
                      className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                    >
                      Salvar agendamento
                    </button>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs text-slate-400">
                      Acrescentar etapa do conserto
                      <select
                        value={novaEtapa[a.id]?.status || 'recebido'}
                        onChange={(e) => setNovaEtapa({ ...novaEtapa, [a.id]: { status: e.target.value, observacao: novaEtapa[a.id]?.observacao || '' } })}
                        className="block mt-1 bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5"
                      >
                        {Object.entries(ETAPA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <input
                      value={novaEtapa[a.id]?.observacao || ''}
                      onChange={(e) => setNovaEtapa({ ...novaEtapa, [a.id]: { status: novaEtapa[a.id]?.status || 'recebido', observacao: e.target.value } })}
                      placeholder="Observação visível no acompanhamento (opcional)"
                      className="flex-1 min-w-[200px] bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5"
                    />
                    <button
                      disabled={enviandoCorr}
                      onClick={() => corrigir(
                        { entidade: 'etapa_add', id: a.id, alteracoes: { status: novaEtapa[a.id]?.status || 'recebido', observacao: novaEtapa[a.id]?.observacao || '' } },
                        'Etapa acrescentada.'
                      )}
                      className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                    >
                      Acrescentar etapa
                    </button>
                  </div>
                </div>
              )}
              </div>
            ))}
          </div>
        </div>
      )}

      {etapas?.length > 0 && (
        <div className="mb-8">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Acompanhamento de manutenção</p>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2">
            {etapas.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <span className="text-white">{ETAPA_LABEL[e.status] || e.status}{e.observacao ? ` — ${e.observacao}` : ''}</span>
                <span className="text-slate-500 text-xs flex items-center gap-3">
                  {e.funcionario?.profile?.nome || 'Oficina'} · {formatDateTime(e.created_at)}
                  {corrigindo && (
                    <button
                      disabled={enviandoCorr}
                      onClick={() => confirm('Remover esta etapa? Ela fica guardada no histórico.') && corrigir({ entidade: 'etapa_remover', id: e.id }, 'Etapa removida.')}
                      className="text-red-400 hover:text-red-300"
                    >
                      Remover
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {notasInternas?.length > 0 && (
        <div className="mb-8">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Notas internas da oficina (não visíveis ao cliente)</p>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2">
            {notasInternas.map((n: any) => (
              <div key={n.id} className="text-sm">
                <span className="text-slate-300 font-medium">{n.remetente?.nome}:</span>{' '}
                <span className="text-slate-400">{n.texto}</span>
                <span className="text-slate-600 text-xs ml-2">{formatDateTime(n.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-8">
        <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Conversa (cliente ↔ oficina) — {mensagens.length} mensagem(ns)</p>
        {mensagens.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma mensagem trocada.</p>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3 max-h-96 overflow-y-auto">
            {mensagens.map((m: any) => (
              <div key={m.id} className="text-sm">
                <span className="text-slate-300 font-medium">{m.remetente?.nome} <span className="text-slate-500 text-xs">({m.remetente?.tipo})</span>:</span>{' '}
                {m.audio_url ? (
                  <span className="text-slate-400">🎤 áudio{m.transcricao ? ` — "${m.transcricao}"` : ''}</span>
                ) : (
                  <span className="text-slate-400">{m.texto}</span>
                )}
                <span className="text-slate-600 text-xs ml-2">{formatDateTime(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {avaliacao && (
        <div className="mb-8">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Avaliação do cliente</p>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <p className="text-amber-400 font-semibold">{'★'.repeat(avaliacao.nota)}{'☆'.repeat(5 - avaliacao.nota)}</p>
            {avaliacao.comentario && <p className="text-slate-300 text-sm mt-2">{avaliacao.comentario}</p>}
          </div>
        </div>
      )}

      {historico.length > 0 && (
        <div className="mb-8">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Histórico de correções do admin ({historico.length})</p>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
            {historico.map((h: any) => (
              <div key={h.id} className="text-sm border-b border-slate-700/60 last:border-0 pb-3 last:pb-0">
                <p className="text-white">
                  {ACAO_LABEL[h.acao] || h.acao} <span className="text-slate-500">({h.entidade})</span>
                  <span className="text-slate-500 text-xs ml-2">{formatDateTime(h.created_at)} · {h.admin?.nome || h.admin?.email || 'admin'}</span>
                </p>
                {h.motivo && <p className="text-amber-200/90 text-xs mt-0.5">Motivo: {h.motivo}</p>}
                <p className="text-slate-400 text-xs mt-0.5">Antes: {resumo(h.antes)} → Depois: {resumo(h.depois)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {emergencia && (
        <div className="mb-8">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Acidente vinculado</p>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <p className="text-slate-300 text-sm">{emergencia.nome} · {emergencia.telefone}</p>
            <Link href={`/admin/emergencias/${emergencia.id}`} className="text-blue-400 hover:underline text-xs mt-2 inline-block">
              Ver detalhes completos do acidente →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
