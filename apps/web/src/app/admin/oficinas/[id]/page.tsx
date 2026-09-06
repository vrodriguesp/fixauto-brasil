'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Oficina, Solicitacao, Orcamento } from '@fixauto/shared';

interface ComissaoConfigLocal {
  taxa_padrao: number;
  taxa_fixa_override: number | null;
  usa_override: boolean;
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
  const [comissaoConfig, setComissaoConfig] = useState<ComissaoConfigLocal>({
    taxa_padrao: 0.10,
    taxa_fixa_override: null,
    usa_override: false,
  });
  const [overrideRate, setOverrideRate] = useState('10');
  const [useOverride, setUseOverride] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
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

      // Comissao config
      const { data: config } = await supabase
        .from('comissao_config')
        .select('*')
        .eq('oficina_id', id)
        .single();

      if (config) {
        setComissaoConfig(config as ComissaoConfigLocal);
        setUseOverride(config.usa_override);
        setOverrideRate(
          config.taxa_fixa_override
            ? (config.taxa_fixa_override * 100).toFixed(1)
            : (config.taxa_padrao * 100).toFixed(1)
        );
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

  const handleSaveComissao = async () => {
    setSaving(true);
    setSaveMsg(null);

    const taxaValue = parseFloat(overrideRate) / 100;

    const res = await fetch('/api/admin/comissao', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oficina_id: id,
        taxa_fixa_override: taxaValue,
        usa_override: useOverride,
      }),
    });

    if (res.ok) {
      setSaveMsg('Configuracao salva com sucesso!');
      const updated = await res.json();
      setComissaoConfig(updated);
    } else {
      setSaveMsg('Erro ao salvar configuracao');
    }

    setSaving(false);
    setTimeout(() => setSaveMsg(null), 3000);
  };

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
        Oficina nao encontrada.{' '}
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
        <h2 className="text-lg font-semibold text-white mb-4">Informacoes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-400">Endereco:</span>
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
            <span className="text-slate-400">Avaliacao:</span>
            <div className="flex items-center gap-2 mt-1">
              <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-white font-medium">
                {oficina.avaliacao_media.toFixed(1)} ({oficina.total_avaliacoes} avaliacoes)
              </span>
            </div>
          </div>
          <div>
            <span className="text-slate-400">CNPJ:</span>
            <p className="text-white">{oficina.cnpj || 'Nao informado'}</p>
          </div>
          <div>
            <span className="text-slate-400">Raio de atendimento:</span>
            <p className="text-white">{oficina.raio_atendimento_km} km</p>
          </div>
        </div>
      </div>

      {/* Commission config */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Configuracao de Comissao</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-slate-400 mb-1">Taxa padrao da plataforma</p>
            <p className="text-white font-medium">
              {(comissaoConfig.taxa_padrao * 100).toFixed(1)}%
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={useOverride}
                onChange={(e) => setUseOverride(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
            <span className="text-sm text-slate-300">
              Usar taxa fixa personalizada para esta oficina
            </span>
          </div>

          {useOverride && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Taxa fixa (%)
              </label>
              <input
                type="number"
                value={overrideRate}
                onChange={(e) => setOverrideRate(e.target.value)}
                step="0.5"
                min="0"
                max="50"
                className="w-32 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveComissao}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            {saveMsg && (
              <span
                className={`text-sm ${
                  saveMsg.includes('sucesso') ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {saveMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Comissao lancamentos: o que essa oficina deve/pagou, e por que */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Lancamentos de Comissao</h2>
          <div className="flex gap-4 text-sm">
            <span className="text-amber-400 font-medium">
              Pendente: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                lancamentos.filter((l) => l.status === 'pendente').reduce((s, l) => s + l.valor_comissao, 0)
              )}
            </span>
            <span className="text-emerald-400 font-medium">
              Pago: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                lancamentos.filter((l) => l.status === 'pago').reduce((s, l) => s + l.valor_comissao, 0)
              )}
            </span>
          </div>
        </div>
        {lancamentos.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhum lancamento de comissao ainda (gerado quando um servico e concluido e a entrega e confirmada).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                  <th className="text-left py-2 pr-4">Data</th>
                  <th className="text-right py-2 pr-4">Valor do servico</th>
                  <th className="text-right py-2 pr-4">Taxa</th>
                  <th className="text-right py-2 pr-4">Comissao</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-left py-2">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {lancamentos.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-4 text-slate-300">{new Date(l.created_at).toLocaleDateString('pt-BR')}</td>
                    <td className="py-2 pr-4 text-right text-white">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(l.valor_servico)}
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-300">{(l.taxa_aplicada * 100).toFixed(1)}%</td>
                    <td className="py-2 pr-4 text-right text-white font-medium">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(l.valor_comissao)}
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
          Solicitacoes Recentes
        </h2>
        {solicitacoes.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma solicitacao encontrada</p>
        ) : (
          <div className="space-y-3">
            {solicitacoes.map((sol) => (
              <div
                key={sol.id}
                className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg"
              >
                <div>
                  <p className="text-white text-sm font-medium">
                    {sol.tipo} - {sol.veiculo?.fipe_modelo || 'Veiculo'}
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
          Orcamentos Recentes
        </h2>
        {orcamentos.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhum orcamento encontrado</p>
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
                      currency: 'BRL',
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
