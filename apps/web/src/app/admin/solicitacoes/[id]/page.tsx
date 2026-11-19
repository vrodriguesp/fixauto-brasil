'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatCurrency, formatDateTime, cleanDescricao } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { STATUS_SOLICITACAO, STATUS_ORCAMENTO } from '@fixauto/shared';
import MidiaPrivada from '@/components/midia/MidiaPrivada';
import { formatarJanela, janelaDaAgenda } from '@/lib/turnos';
import TriagemPedido, { rotuloTipo } from '@/components/admin/TriagemPedido';
import { Presenca, usePresenca } from '@/components/admin/Presenca';

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
  // triagem do pedido (085)
  mudar_tipo: 'Tipo do pedido alterado',
  avisar_tipo_novo: 'Oficinas avisadas após mudar o tipo',
  convidar_oficinas: 'Pedido enviado a oficinas escolhidas',
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
    .map(([k, val]) => Array.isArray(val) ? `${k}: ${val.length}` : `${k}: ${typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val) ? formatDateTime(val) : String(val ?? '—')}`)
    .join(' · ');
}

// motivos de "nao tenho interesse" (components/oficina/DispensarPedido.tsx)
const MOTIVO_DISPENSA: Record<string, string> = { nao_faz: 'Não faz o serviço', faz_parte: 'Faz só parte', sem_agenda: 'Sem agenda', longe: 'Longe demais', outro: 'Outro motivo' };

const MOTIVO_FORA: Record<string, string> = {
  orcou: 'já orçou', dispensou: 'disse que não tem interesse', inativa: 'oficina inativa', dono_inativo: 'conta do dono desativada',
  sem_email: 'sem e-mail', conta_teste: 'conta de teste diferente da do cliente', nao_atende: 'já não atende este pedido (raio/serviço)',
  aviso_recente: 'avisada há menos de 12 h', lembrada_recente: 'lembrada há pouco (48 h no pedido / 24 h na oficina)',
};
const EVENTO_CONTATO: Record<string, string> = {
  avisada: 'avisada do pedido', convidada: 'convidada pela BipFix', lembrada: 'lembrete', link_enviado: 'link de acesso enviado',
  link_visto: 'abriu o link', link_entrou: 'entrou pelo link', orcou: 'enviou orçamento', dispensou: 'não tenho interesse',
};

export default function AdminSolicitacaoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // lembrete as oficinas que receberam e nao responderam (dono 16/11): previa com caixas -> enviar
  const [previaLembrete, setPreviaLembrete] = useState<{ recebem: any[]; ficamFora: any[] } | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [lembrando, setLembrando] = useState(false);
  const [lembreteResultado, setLembreteResultado] = useState<string | null>(null);
  const [novoStatus, setNovoStatus] = useState('');
  const [salvandoStatus, setSalvandoStatus] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  // apagar foto do pedido (conteudo denunciado): motivo obrigatorio, auditoria e aviso ao motorista
  const [apagandoFoto, setApagandoFoto] = useState<string | null>(null);
  const apagarFoto = async (fotoId: string) => {
    const motivo = window.prompt('Motivo da remoção (vai para a auditoria e para o aviso ao motorista):')?.trim();
    if (!motivo) return;
    setApagandoFoto(fotoId);
    const res = await fetch(`/api/admin/solicitacoes/${id}/fotos`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fotoId, motivo }) });
    const r = await res.json().catch(() => ({}));
    setStatusMsg(res.ok ? 'Foto removida. O motorista foi avisado com o motivo.' : (r.error || 'Erro ao remover a foto.'));
    setApagandoFoto(null);
    if (res.ok) await fetchData();
  };
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
  // "online agora / visto ha X" do cliente e das oficinas que receberam o pedido (dono 19/11, migracao 101)
  const presenca = usePresenca(
    [data?.solicitacao?.cliente?.id, ...((data?.contatos || []) as any[]).map((c) => c.profile_id)].filter(Boolean),
  );

  // recarregando = depois de uma acao da triagem: sem a tela "Carregando..." (o bloco nao some com a mensagem)
  const fetchData = async (recarregando = false) => {
    if (!recarregando) setLoading(true);
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

  const abrirPreviaLembrete = async () => {
    setLembrando(true); setLembreteResultado(null);
    const res = await fetch(`/api/admin/solicitacoes/${id}/lembrar`);
    const r = await res.json().catch(() => ({}));
    setLembrando(false);
    if (!res.ok) { setLembreteResultado(r.error || 'Erro ao montar a prévia.'); return; }
    setPreviaLembrete(r);
    setMarcadas(new Set((r.recebem || []).map((o: any) => o.oficina_id)));
  };
  const enviarLembrete = async () => {
    if (!marcadas.size) return;
    setLembrando(true);
    const res = await fetch(`/api/admin/solicitacoes/${id}/lembrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oficinaIds: Array.from(marcadas) }) });
    const r = await res.json().catch(() => ({}));
    setLembrando(false);
    if (!res.ok) { setLembreteResultado(r.error || 'Erro ao enviar o lembrete.'); return; }
    setPreviaLembrete(null);
    setLembreteResultado((r.enviados || []).map((e: any) => `${e.nome}: e-mail ${e.email}`).join(' · ') || 'Nenhum lembrete enviado.');
    fetchData();
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

  const { solicitacao, fotos, orcamentos, mensagens, avaliacao, analiseDano, emergencia, agenda, etapas, notasInternas, dispensas = [], totalVistos = 0, convites = [], contatos = [] } = data;
  const convidadasAdmin = convites.filter((c: any) => c.origem === 'admin');
  const acessoMantido = convites.filter((c: any) => c.origem === 'tipo_alterado');

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
            <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-200" data-testid="tipo-atual">{rotuloTipo(solicitacao.tipo)}</span>
            {solicitacao.numero && <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-white" data-testid="admin-detalhe-numero">Pedido {solicitacao.numero}</span>}
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
              <button onClick={abrirPreviaLembrete} disabled={lembrando} data-testid="lembrar-oficinas" className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                {lembrando && !previaLembrete ? 'Calculando...' : 'Lembrar oficinas'}
              </button>
              <p className="text-[11px] text-slate-500 mt-1 max-w-[260px] ml-auto">Lembra só as oficinas que já receberam este pedido e ainda não orçaram nem disseram que não têm interesse. Você vê a lista antes de enviar.</p>
              {lembreteResultado && <p className="text-xs text-slate-400 mt-2 max-w-[260px] ml-auto" data-testid="lembrar-resultado">{lembreteResultado}</p>}
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
            <label htmlFor="cd553-1" className="block text-xs text-amber-200 mb-1">Motivo da correção (obrigatório, fica no histórico)</label>
            <input id="cd553-1"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: oficina marcou a etapa errada por engano"
              className="w-full bg-slate-900 border border-slate-600 text-white text-sm rounded-lg px-3 py-2"
            />
            {corrMsg && <p className="text-sm text-amber-100 mt-2">{corrMsg}</p>}
          </div>
        )}
      </div>

      <TriagemPedido solicitacao={solicitacao} historico={historico} aoMudar={() => fetchData(true)} />

      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Cliente</p>
          <p className="text-white font-medium">{solicitacao.cliente?.nome}{solicitacao.cliente?.codigo != null && <span className="text-slate-300 font-normal" data-testid="admin-detalhe-cliente-codigo"> · nº {solicitacao.cliente.codigo}</span>}</p>
          <p className="text-slate-400 text-sm">{solicitacao.cliente?.email}</p>
          <p className="text-slate-400 text-sm">{solicitacao.cliente?.telefone}</p>
          {solicitacao.cliente?.id && <Presenca vistoEm={presenca.profiles[solicitacao.cliente.id]} className="mt-1" />}
          <div className="flex flex-wrap gap-x-4 mt-2">
            <Link href={`/admin/solicitacoes?cliente_id=${solicitacao.cliente?.id}`} className="text-blue-400 hover:underline text-xs inline-block">
              Ver outras solicitações deste cliente →
            </Link>
            {solicitacao.cliente?.id && (
              <Link href={`/admin/suporte?profile=${solicitacao.cliente.id}`} className="text-blue-400 hover:underline text-xs inline-block">Escrever ao cliente →</Link>
            )}
          </div>
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
              <div key={f.id} className="flex-shrink-0 w-32" data-testid={f.origem === 'adicionada' ? 'admin-foto-adicionada' : 'admin-foto-criacao'}>
                <MidiaPrivada url={f.foto_url}>{(u) => (
<a href={u} target="_blank" rel="noopener noreferrer" className="block">
                  <img src={u} alt="Foto" className="w-32 h-32 object-cover rounded-lg border border-slate-700" />
                </a>
)}</MidiaPrivada>
                <p className="text-[11px] text-slate-500 mt-1">{f.origem === 'adicionada' ? 'adicionada depois' : 'na criação'}{f.bytes ? ` · ${Math.round(f.bytes / 1024)} KB` : ''}</p>
                <button type="button" onClick={() => apagarFoto(f.id)} disabled={apagandoFoto === f.id} data-testid="admin-apagar-foto"
                  className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50">Apagar com motivo</button>
              </div>
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

      {previaLembrete && (
        <div className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4" data-testid="lembrar-previa">
          <p className="text-slate-200 text-sm font-medium mb-2">Lembrete do pedido {solicitacao.numero}: quem recebe</p>
          {previaLembrete.recebem.length === 0 ? (
            <p className="text-slate-400 text-sm">Nenhuma oficina para lembrar agora.</p>
          ) : (
            <ul className="space-y-1 mb-3">
              {previaLembrete.recebem.map((o: any) => (
                <li key={o.oficina_id} data-testid="lembrar-oficina" data-oficina={o.oficina_id}>
                  <label className="flex items-center gap-2 text-sm text-slate-200">
                    <input type="checkbox" checked={marcadas.has(o.oficina_id)}
                      onChange={(e) => setMarcadas((m) => { const n = new Set(m); if (e.target.checked) n.add(o.oficina_id); else n.delete(o.oficina_id); return n; })} />
                    <span>{o.nome}</span>
                    <span className="text-slate-500 text-xs">{o.email}{o.ultimoAviso ? ` · último aviso ${formatDateTime(o.ultimoAviso)}` : ''}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {previaLembrete.ficamFora.length > 0 && (
            <div className="mb-3" data-testid="lembrar-fora">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Ficam de fora</p>
              <ul className="text-xs text-slate-400 space-y-0.5">
                {previaLembrete.ficamFora.map((f: any) => <li key={f.oficina_id} data-oficina={f.oficina_id} data-motivo={f.motivo}>{f.nome}: {MOTIVO_FORA[f.motivo] || f.motivo}</li>)}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={enviarLembrete} disabled={lembrando || !marcadas.size} data-testid="lembrar-confirmar" className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {lembrando ? 'Enviando...' : `Enviar lembrete a ${marcadas.size}`}
            </button>
            <button onClick={() => setPreviaLembrete(null)} className="text-slate-300 text-sm px-4 py-2 rounded-lg border border-slate-600">Cancelar</button>
          </div>
        </div>
      )}

      {/* historico de contato com as oficinas (dono 16/11: acompanhar tudo pelo admin) */}
      <div className="mb-8" data-testid="admin-contatos-oficinas">
        <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Contato com as oficinas — pedido {solicitacao.numero}</p>
        {contatos.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma oficina recebeu este pedido.</p>
        ) : (
          <div className="space-y-2">
            {contatos.map((c: any) => (
              <div key={c.oficina_id} className="bg-slate-800 border border-slate-700 rounded-lg p-3" data-testid="contato-oficina" data-oficina={c.oficina_id}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                  <p className="text-slate-200 text-sm font-medium">{c.nome}</p>
                  {c.profile_id && <Presenca vistoEm={presenca.profiles[c.profile_id]} />}
                  {c.profile_id && <Link href={`/admin/suporte?profile=${c.profile_id}`} className="text-blue-400 hover:underline text-xs">Escrever à oficina →</Link>}
                </div>
                <ul className="text-xs text-slate-400 space-y-0.5">
                  {c.eventos.map((e: any, i: number) => (
                    <li key={i} data-evento={e.tipo}>
                      <span className="text-slate-500">{formatDateTime(e.em)}</span> · {EVENTO_CONTATO[e.tipo] || e.tipo}{e.detalhe ? ` (${e.detalhe})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* oficinas que marcaram "nao tenho interesse" (migracao 070) */}
      <div className="mb-8" data-testid="admin-dispensas">
        <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">
          Sem interesse ({dispensas.length}) · {totalVistos} {totalVistos === 1 ? 'oficina abriu' : 'oficinas abriram'} o pedido
        </p>
        {dispensas.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma oficina marcou &quot;não tenho interesse&quot;.</p>
        ) : (
          <div className="space-y-2">
            {dispensas.map((d: any) => (
              <div key={d.oficina?.id || d.created_at} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-white font-medium">{d.oficina?.nome_fantasia || '—'}{d.oficina?.cidade && <span className="text-slate-400 font-normal"> · {d.oficina.cidade}</span>}</p>
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300">{MOTIVO_DISPENSA[d.motivo] || d.motivo}</span>
                </div>
                {d.comentario && <p className="text-slate-300 text-sm mt-2 break-words">“{d.comentario}”</p>}
                <p className="text-slate-500 text-xs mt-2">{formatDateTime(d.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* enviado pela BipFix a oficinas escolhidas (085) */}
      <div className="mb-8" data-testid="admin-convites">
        <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">
          Convidadas pela BipFix ({convidadasAdmin.length}){acessoMantido.length > 0 && ` · ${acessoMantido.length} com acesso mantido ao mudar o tipo`}
        </p>
        {convidadasAdmin.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma oficina convidada para este pedido.</p>
        ) : (
          <div className="space-y-2">
            {convidadasAdmin.map((c: any) => (
              <div key={c.oficina_id} className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-white text-sm font-medium">{c.oficina?.nome_fantasia || '—'}{c.oficina?.cidade && <span className="text-slate-400 font-normal"> · {c.oficina.cidade}</span>}</p>
                <p className="text-slate-500 text-xs">{formatDateTime(c.created_at)}{c.admin?.nome ? ` · ${c.admin.nome}` : ''}</p>
                {c.motivo && <p className="w-full text-slate-300 text-xs">Motivo: {c.motivo}</p>}
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
                    {a.status === 'agendado' && <span data-testid="admin-janela"> · janela <span className="whitespace-nowrap">{formatarJanela(janelaDaAgenda(a.data_inicio, a.checkin_ate, a.oficina?.pais ?? 'EE'))}</span></span>}
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
        <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Conversas (cliente ↔ cada oficina) — {mensagens.length} mensagem(ns)</p>
        {mensagens.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma mensagem trocada.</p>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3 max-h-96 overflow-y-auto">
            {mensagens.map((m: any, i: number) => (
              <div key={m.id} className="text-sm">
                {(i === 0 || mensagens[i - 1].oficina_id !== m.oficina_id || mensagens[i - 1].pagador_id !== m.pagador_id) && (
                  <p className="text-amber-300 text-xs uppercase tracking-wide mt-2 mb-1">
                    Conversa com {m.oficina?.nome_fantasia || 'oficina'}{m.pagador_id ? ' — responsável pelo pagamento (outro motorista)' : ''}
                  </p>
                )}
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
