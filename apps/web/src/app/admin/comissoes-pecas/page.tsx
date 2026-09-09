'use client';

import { Fragment, useEffect, useState } from 'react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface ComissaoPecaRow {
  fornecedor_tipo: 'loja' | 'oficina';
  fornecedor_id: string;
  fornecedor: { id: string; nome_fantasia: string; cidade: string; estado: string; ativa: boolean };
  taxa_padrao: number;
  taxa_calculada: number | null;
  taxa_fixa_override: number | null;
  usa_override: boolean;
  total_pendente: number;
  total_pago: number;
}

interface Lancamento {
  id: string;
  valor_pedido: number;
  taxa_aplicada: number;
  valor_comissao: number;
  status: 'pendente' | 'pago';
  created_at: string;
  pedido: { quantidade: number; cotacao: { peca_descricao: string } | null } | null;
}

const rowKey = (r: { fornecedor_tipo: string; fornecedor_id: string }) => `${r.fornecedor_tipo}:${r.fornecedor_id}`;

export default function AdminComissoesPecasPage() {
  const [rows, setRows] = useState<ComissaoPecaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'todos' | 'loja' | 'oficina'>('todos');
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ taxa: '3.0', usaOverride: false });
  const [saving, setSaving] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loadingLancamentos, setLoadingLancamentos] = useState(false);
  const [marcandoPagoId, setMarcandoPagoId] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/comissao-pecas');
    setRows(res.ok ? await res.json() : []);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

  const getTaxaAtual = (r: ComissaoPecaRow) => {
    if (r.usa_override && r.taxa_fixa_override != null) return r.taxa_fixa_override;
    return r.taxa_calculada ?? r.taxa_padrao;
  };

  const startEdit = (r: ComissaoPecaRow) => {
    setEditKey(rowKey(r));
    setEditForm({ taxa: (getTaxaAtual(r) * 100).toFixed(1), usaOverride: r.usa_override });
  };

  const handleSaveEdit = async (r: ComissaoPecaRow) => {
    setSaving(true);
    await fetch('/api/admin/comissao-pecas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fornecedor_tipo: r.fornecedor_tipo,
        fornecedor_id: r.fornecedor_id,
        taxa_fixa_override: parseFloat(editForm.taxa) / 100,
        usa_override: editForm.usaOverride,
      }),
    });
    setSaving(false);
    setEditKey(null);
    await fetchRows();
  };

  const toggleExpand = async (r: ComissaoPecaRow) => {
    const key = rowKey(r);
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    setLoadingLancamentos(true);
    const params = new URLSearchParams({ fornecedor_tipo: r.fornecedor_tipo, fornecedor_id: r.fornecedor_id });
    const res = await fetch(`/api/admin/comissao-pecas/lancamentos?${params.toString()}`);
    setLancamentos(res.ok ? await res.json() : []);
    setLoadingLancamentos(false);
  };

  const handleMarcarPago = async (lancamentoId: string, novoStatus: 'pendente' | 'pago') => {
    setMarcandoPagoId(lancamentoId);
    await fetch('/api/admin/comissao-pecas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lancamento_id: lancamentoId, status: novoStatus }),
    });
    setLancamentos((prev) => prev.map((l) => (l.id === lancamentoId ? { ...l, status: novoStatus } : l)));
    setMarcandoPagoId(null);
    await fetchRows();
  };

  const linhas = rows.filter((r) => filtro === 'todos' || r.fornecedor_tipo === filtro);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-700 rounded w-64" />
        <div className="h-64 bg-slate-800 rounded-xl" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Comissão de Peças</h1>
        <p className="text-slate-400 text-sm mt-1">Taxa por fornecedor (loja de peças ou oficina vendendo excedente) e lançamentos por pedido</p>
      </div>

      <div className="flex gap-1 bg-slate-800 rounded-lg p-1 mb-6 w-fit border border-slate-700">
        {(['todos', 'loja', 'oficina'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filtro === f ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {f === 'todos' ? 'Todos' : f === 'loja' ? 'Lojas' : 'Oficinas'}
          </button>
        ))}
      </div>

      {linhas.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <p className="text-slate-400">Nenhum fornecedor de peças cadastrado ainda.</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                {['Fornecedor', 'Tipo', 'Taxa atual', 'Override', 'Pendente', 'Pago', 'Ações'].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {linhas.map((r) => {
                const key = rowKey(r);
                const isEditing = editKey === key;
                const isExpanded = expandedKey === key;
                return (
                  <Fragment key={key}>
                    <tr className="hover:bg-slate-700/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-white font-medium text-sm">{r.fornecedor.nome_fantasia}</p>
                        <p className="text-slate-500 text-xs">{r.fornecedor.cidade}, {r.fornecedor.estado}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.fornecedor_tipo === 'loja' ? 'bg-orange-900/40 text-orange-300' : 'bg-sky-900/40 text-sky-300'}`}>
                          {r.fornecedor_tipo === 'loja' ? 'Loja de peças' : 'Oficina fornecedora'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.1"
                            value={editForm.taxa}
                            onChange={(e) => setEditForm({ ...editForm, taxa: e.target.value })}
                            className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                          />
                        ) : (
                          <span className="text-white font-medium text-sm">{(getTaxaAtual(r) * 100).toFixed(1)}%</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <label className="flex items-center gap-2 text-xs text-slate-300">
                            <input type="checkbox" checked={editForm.usaOverride} onChange={(e) => setEditForm({ ...editForm, usaOverride: e.target.checked })} />
                            Fixar manualmente
                          </label>
                        ) : (
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${r.usa_override ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-600 text-slate-400'}`}>
                            {r.usa_override ? 'Manual' : 'Automática'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-medium ${r.total_pendente > 0 ? 'text-amber-400' : 'text-slate-400'}`}>{formatCurrency(r.total_pendente)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-emerald-400">{formatCurrency(r.total_pago)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 text-sm">
                          {isEditing ? (
                            <>
                              <button onClick={() => setEditKey(null)} className="text-slate-400 hover:text-white">Cancelar</button>
                              <button onClick={() => handleSaveEdit(r)} disabled={saving} className="text-blue-400 hover:text-blue-300 font-medium disabled:opacity-50">
                                {saving ? 'Salvando...' : 'Salvar'}
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(r)} className="text-blue-400 hover:text-blue-300 font-medium">Editar taxa</button>
                              <button onClick={() => toggleExpand(r)} className="text-slate-300 hover:text-white font-medium">
                                {isExpanded ? 'Ocultar' : 'Ver lançamentos'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 bg-slate-900/50">
                          {loadingLancamentos ? (
                            <p className="text-slate-500 text-sm">Carregando...</p>
                          ) : lancamentos.length === 0 ? (
                            <p className="text-slate-500 text-sm">Nenhum lançamento ainda.</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-slate-500 border-b border-slate-700">
                                  <th className="text-left py-2 pr-4">Peça</th>
                                  <th className="text-left py-2 pr-4">Data</th>
                                  <th className="text-right py-2 pr-4">Valor pedido</th>
                                  <th className="text-right py-2 pr-4">Taxa</th>
                                  <th className="text-right py-2 pr-4">Comissão</th>
                                  <th className="text-left py-2 pr-4">Status</th>
                                  <th className="text-left py-2">Ação</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800">
                                {lancamentos.map((l) => (
                                  <tr key={l.id}>
                                    <td className="py-2 pr-4 text-slate-300">{l.pedido?.cotacao?.peca_descricao || '—'}</td>
                                    <td className="py-2 pr-4 text-slate-400">{formatDate(l.created_at)}</td>
                                    <td className="py-2 pr-4 text-right text-white">{formatCurrency(l.valor_pedido)}</td>
                                    <td className="py-2 pr-4 text-right text-slate-400">{(l.taxa_aplicada * 100).toFixed(1)}%</td>
                                    <td className="py-2 pr-4 text-right text-white font-medium">{formatCurrency(l.valor_comissao)}</td>
                                    <td className="py-2 pr-4">
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.status === 'pago' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                        {l.status === 'pago' ? 'Pago' : 'Pendente'}
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
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
