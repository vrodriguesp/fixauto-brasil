'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { currencyForCountry } from '@/lib/currency';
import { formatDate } from '@/lib/utils';
import type { Oficina, Solicitacao, Orcamento } from '@fixauto/shared';
import TrocarEmail from '@/components/admin/TrocarEmail';

interface ComissaoResumo {
  individual: { taxa: number | null; ate: string | null; motivo: string | null; vigente: boolean } | null;
  efetiva: { tipo?: 'percentual' | 'valor_fixo'; taxa: number; valorFixo?: number | null; moeda?: string; origem: 'individual' | 'global' };
  oficina: { parceiro_fundador: boolean; parceiro_fundador_desde: string | null };
}

interface ComissaoLancamento {
  id: string;
  orcamento_id: string;
  valor_servico: number;
  taxa_aplicada: number;
  valor_comissao: number;
  status: 'pendente' | 'pago';
  pago_em: string | null;
  created_at: string;
}

export default function AdminOficinaDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [oficina, setOficina] = useState<Oficina | null>(null);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [comissao, setComissao] = useState<ComissaoResumo | null>(null);
  const [modoGlobal, setModoGlobal] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [lancamentos, setLancamentos] = useState<ComissaoLancamento[]>([]);
  const [marcandoPagoId, setMarcandoPagoId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      // Oficina
      const { data: ofi } = await supabase
        .from('oficinas')
        .select('*, profile:profiles(*)')
        .eq('id', id)
        .single();

      if (ofi) setOficina(ofi as Oficina);

      // Recent solicitacoes via orcamentos
      const { data: orcs } = await supabase
        .from('orcamentos')
        .select('*, solicitacao:solicitacoes(*, veiculo:veiculos(*))')
        .eq('oficina_id', id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (orcs) {
        setOrcamentos(orcs as Orcamento[]);
        // Extract unique solicitacoes
        const solMap = new Map<string, Solicitacao>();
        orcs.forEach((o: Record<string, unknown>) => {
          const sol = o.solicitacao as Solicitacao | null;
          if (sol && !solMap.has(sol.id)) {
            solMap.set(sol.id, sol);
          }
        });
        setSolicitacoes(Array.from(solMap.values()));
      }

      // Taxa que vale hoje (hierarquia individual > global). Vem da API
      // do admin: comissao_config so e legivel pela propria oficina (RLS).
      const resCom = await fetch('/api/admin/comissao');
      if (resCom.ok) {
        const dados = await resCom.json();
        setModoGlobal(dados.global?.comissao_servicos_modo || '');
        setComissao((dados.oficinas || []).find((o: any) => o.oficina_id === id) || null);
      }

      // Comissao lancamentos (breakdown of what this oficina owes/paid, and why)
      const { data: lancs } = await supabase
        .from('comissao_lancamento')
        .select('*')
        .eq('oficina_id', id)
        .order('created_at', { ascending: false });

      setLancamentos((lancs as ComissaoLancamento[]) || []);

      setLoading(false);
    }

    fetchData();
  }, [id]);

  const handleMarcarPago = async (lancamentoId: string, novoStatus: 'pendente' | 'pago') => {
    setMarcandoPagoId(lancamentoId);
    const res = await fetch('/api/admin/comissao', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lancamento_id: lancamentoId, status: novoStatus }),
    });
    if (res.ok) {
      const updated = await res.json();
      setLancamentos((prev) => prev.map((l) => (l.id === lancamentoId ? { ...l, ...updated } : l)));
    }
    setMarcandoPagoId(null);
  };

  const moeda = currencyForCountry(oficina?.pais);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-700 rounded w-64" />
        <div className="h-48 bg-slate-800 rounded-xl" />
        <div className="h-48 bg-slate-800 rounded-xl" />
      </div>
    );
  }

  if (!oficina) {
    return (
      <div className="text-slate-400">
        Oficina não encontrada.{' '}
        <Link href="/admin/oficinas" className="text-blue-400 hover:text-blue-300">
          Voltar
        </Link>
      </div>
    );
  }

  const statusColor: Record<string, string> = {
    aberta: 'bg-blue-500/20 text-blue-400',
    em_orcamento: 'bg-purple-500/20 text-purple-400',
    aceita: 'bg-emerald-500/20 text-emerald-400',
    em_andamento: 'bg-amber-500/20 text-amber-400',
    concluida: 'bg-green-500/20 text-green-400',
    cancelada: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/oficinas"
          className="text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-white">{oficina.nome_fantasia}</h1>
        <span
          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
            oficina.ativa
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-red-500/20 text-red-400'
          }`}
        >
          {oficina.ativa ? 'Ativa' : 'Inativa'}
        </span>
      </div>

      {/* Info card */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Informações</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {(oficina as any).profile?.id && (
            <div className="md:col-span-2">
              <span className="text-slate-400">Email de acesso (login):</span>
              <TrocarEmail profileId={(oficina as any).profile.id} emailAtual={(oficina as any).profile.email || ''}
                aoTrocar={(email) => setOficina({ ...oficina, profile: { ...(oficina as any).profile, email } } as Oficina)} />
            </div>
          )}
          <div>
            <span className="text-slate-400">Endereço:</span>
            <p className="text-white">{oficina.endereco}</p>
          </div>
          <div>
            <span className="text-slate-400">Cidade:</span>
            <p className="text-white">{oficina.cidade}, {oficina.estado} - {oficina.cep}</p>
          </div>
          <div>
            <span className="text-slate-400">Especialidades:</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {oficina.especialidades.map((esp) => (
                <span
                  key={esp}
                  className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded text-xs"
                >
                  {esp}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span className="text-slate-400">Avaliação:</span>
            <div className="flex items-center gap-2 mt-1">
              <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-white font-medium">
                {oficina.avaliacao_media.toFixed(1)} ({oficina.total_avaliacoes} avaliações)
              </span>
            </div>
          </div>
          <div>
            <span className="text-slate-400">CNPJ:</span>
            <p className="text-white">{oficina.cnpj || 'Não informado'}</p>
          </div>
          <div>
            <span className="text-slate-400">Raio de atendimento:</span>
            <p className="text-white">{oficina.raio_atendimento_km} km</p>
          </div>
        </div>
      </div>

      {/* Comissao: o que vale hoje e de onde vem (edicao em /admin/comissoes) */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Comissão</h2>
          <Link href="/admin/comissoes" className="text-blue-400 hover:text-blue-300 text-sm">Editar em Comissões →</Link>
        </div>
        {comissao ? (
          <div className="flex flex-wrap items-start gap-8 text-sm">
            <div>
              <p className="text-slate-400 mb-1">Condição que vale hoje</p>
              <p className="text-white text-2xl font-semibold">
                {comissao.efetiva.tipo === 'valor_fixo'
                  ? `${(comissao.efetiva.valorFixo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ${comissao.efetiva.moeda || ''}/serviço`
                  : `${(comissao.efetiva.taxa * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`}
              </p>
              <span className={`inline-flex mt-1 px-2 py-0.5 rounded text-xs font-medium ${comissao.efetiva.origem === 'individual' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'}`}>
                {comissao.efetiva.origem === 'individual' ? 'Condição individual' : `Regra global · ${({ isento: 'sem comissão', fixa: 'percentual fixo', desempenho: 'desempenho', por_servico: 'valor por serviço' } as Record<string, string>)[modoGlobal] || modoGlobal}`}
              </span>
            </div>
            {comissao.individual && (
              <div>
                <p className="text-slate-400 mb-1">Taxa individual</p>
                <p className={comissao.individual.vigente ? 'text-white' : 'text-slate-500 line-through'}>
                  {comissao.individual.taxa != null ? `${(comissao.individual.taxa * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '—'}
                </p>
                <p className="text-slate-400 text-xs">
                  {comissao.individual.ate ? `${comissao.individual.vigente ? 'até' : 'venceu em'} ${formatDate(comissao.individual.ate + 'T12:00:00')}` : 'sem prazo'}
                  {comissao.individual.motivo && ` · ${comissao.individual.motivo}`}
                </p>
              </div>
            )}
            <div>
              <p className="text-slate-400 mb-1">Parceira fundadora</p>
              <p className={comissao.oficina.parceiro_fundador ? 'text-yellow-300' : 'text-slate-500'}>
                {comissao.oficina.parceiro_fundador
                  ? `⭐ Sim${comissao.oficina.parceiro_fundador_desde ? `, desde ${formatDate(comissao.oficina.parceiro_fundador_desde)}` : ''}`
                  : 'Não'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">Não foi possível carregar a comissão.</p>
        )}
      </div>

      {/* Comissao lancamentos: o que essa oficina deve/pagou, e por que */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Lançamentos de Comissão</h2>
          <div className="flex gap-4 text-sm">
            <span className="text-amber-400 font-medium">
              Pendente: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(
                lancamentos.filter((l) => l.status === 'pendente').reduce((s, l) => s + l.valor_comissao, 0)
              )}
            </span>
            <span className="text-emerald-400 font-medium">
              Pago: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(
                lancamentos.filter((l) => l.status === 'pago').reduce((s, l) => s + l.valor_comissao, 0)
              )}
            </span>
          </div>
        </div>
        {lancamentos.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhum lançamento de comissão ainda (gerado quando um serviço é concluído e a entrega é confirmada).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                  <th className="text-left py-2 pr-4">Data</th>
                  <th className="text-right py-2 pr-4">Valor do serviço</th>
                  <th className="text-right py-2 pr-4">Taxa</th>
                  <th className="text-right py-2 pr-4">Comissão</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-left py-2">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {lancamentos.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-4 text-slate-300">{new Date(l.created_at).toLocaleDateString('pt-BR')}</td>
                    <td className="py-2 pr-4 text-right text-white">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(l.valor_servico)}
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-300">{(l.taxa_aplicada * 100).toFixed(1)}%</td>
                    <td className="py-2 pr-4 text-right text-white font-medium">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(l.valor_comissao)}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        l.status === 'pago' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => handleMarcarPago(l.id, l.status === 'pago' ? 'pendente' : 'pago')}
                        disabled={marcandoPagoId === l.id}
                        className="text-blue-400 hover:text-blue-300 text-xs font-medium disabled:opacity-50"
                      >
                        {l.status === 'pago' ? 'Marcar pendente' : 'Marcar como pago'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent solicitacoes */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Solicitações Recentes
        </h2>
        {solicitacoes.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma solicitação encontrada</p>
        ) : (
          <div className="space-y-3">
            {solicitacoes.map((sol) => (
              <div
                key={sol.id}
                className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg"
              >
                <div>
                  <p className="text-white text-sm font-medium">
                    {sol.tipo} - {sol.veiculo?.fipe_modelo || 'Veículo'}
                  </p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {new Date(sol.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <span
                  className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                    statusColor[sol.status] || 'bg-slate-600 text-slate-300'
                  }`}
                >
                  {sol.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent orcamentos */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Orçamentos Recentes
        </h2>
        {orcamentos.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhum orçamento encontrado</p>
        ) : (
          <div className="space-y-3">
            {orcamentos.map((orc) => (
              <div
                key={orc.id}
                className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg"
              >
                <div>
                  <p className="text-white text-sm font-medium">
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: moeda,
                    }).format(orc.valor_total)}
                  </p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Prazo: {orc.prazo_dias} dias -{' '}
                    {new Date(orc.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <span
                  className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                    orc.status === 'aceito'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : orc.status === 'recusado'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-slate-600 text-slate-300'
                  }`}
                >
                  {orc.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
