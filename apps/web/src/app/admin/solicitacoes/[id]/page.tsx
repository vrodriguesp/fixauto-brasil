'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatCurrency, formatDateTime, cleanDescricao } from '@/lib/utils';
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
};

export default function AdminSolicitacaoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cobrando, setCobrando] = useState(false);
  const [cobrancaResultado, setCobrancaResultado] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/solicitacoes/${id}`);
    setData(res.ok ? await res.json() : null);
    setLoading(false);
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
        {(solicitacao.status === 'aberta' || solicitacao.status === 'em_orcamento') && (
          <div className="text-right">
            <button onClick={handleCobrar} disabled={cobrando} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {cobrando ? 'Notificando...' : 'Cobrar oficinas próximas'}
            </button>
            {cobrancaResultado && <p className="text-xs text-slate-400 mt-2 max-w-[220px]">{cobrancaResultado}</p>}
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
                    <p className="text-white font-semibold">{formatCurrency(o.valor_total)}</p>
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
                        <span>{formatCurrency(it.valor_total)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-slate-500 text-xs mt-2">Enviado em {formatDateTime(o.created_at)} · Prazo {o.prazo_dias} dia(s)</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {(etapas?.length > 0 || agenda?.length > 0) && (
        <div className="mb-8">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Acompanhamento de manutenção</p>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2">
            {etapas.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <span className="text-white">{e.status}{e.observacao ? ` — ${e.observacao}` : ''}</span>
                <span className="text-slate-500 text-xs">{e.funcionario?.profile?.nome || 'Oficina'} · {formatDateTime(e.created_at)}</span>
              </div>
            ))}
            {etapas.length === 0 && <p className="text-slate-500 text-sm">Nenhuma etapa registrada ainda.</p>}
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
