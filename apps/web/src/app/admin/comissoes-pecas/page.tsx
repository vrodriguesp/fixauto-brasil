'use client';

import { Fragment, useEffect, useState } from 'react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';

interface ComissaoPecaRow {
  fornecedor_tipo: 'loja' | 'oficina';
  fornecedor_id: string;
  fornecedor: { id: string; nome_fantasia: string; cidade: string; estado: string; pais: string | null; ativa: boolean; parceiro_fundador: boolean };
  taxa_padrao: number;
  taxa_calculada: number | null;
  taxa_fixa_override: number | null;
  usa_override: boolean;
  override_ate: string | null;
  override_motivo: string | null;
  individual_vigente: boolean;
  efetiva: { taxa: number; origem: 'individual' | 'global' };
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
  const [modoGlobal, setModoGlobal] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'todos' | 'loja' | 'oficina'>('todos');
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ taxa: '3.0', usaOverride: false, ate: '', motivo: '' });
  const [erro, setErro] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loadingLancamentos, setLoadingLancamentos] = useState(false);
  const [marcandoPagoId, setMarcandoPagoId] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/comissao-pecas');
    const dados = res.ok ? await res.json() : null;
    setRows(dados?.fornecedores || []);
    setModoGlobal(dados?.global?.comissao_pecas_modo || '');
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

  const startEdit = (r: ComissaoPecaRow) => {
    setEditKey(rowKey(r));
    setEditForm({
      taxa: ((r.taxa_fixa_override ?? r.efetiva.taxa) * 100).toFixed(1),
      usaOverride: r.usa_override,
      ate: r.override_ate || '',
      motivo: r.override_motivo || '',
    });
  };

  const handleSaveEdit = async (r: ComissaoPecaRow) => {
    setSaving(true);
    setErro(null);
    const res = await fetch('/api/admin/comissao-pecas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fornecedor_tipo: r.fornecedor_tipo,
        fornecedor_id: r.fornecedor_id,
        taxa_fixa_override: parseFloat(editForm.taxa) / 100,
        usa_override: editForm.usaOverride,
        override_ate: editForm.ate || null,
        override_motivo: editForm.motivo,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setErro((await res.json().catch(() => ({}))).error || 'Erro ao salvar');
      return;
    }
    setEditKey(null);
    await fetchRows();
  };

  // Selo de fundador de loja: mesma rota do selo das oficinas
  const alternarFundador = async (r: ComissaoPecaRow) => {
    const valor = !r.fornecedor.parceiro_fundador;
    if (!confirm(valor ? `Marcar ${r.fornecedor.nome_fantasia} como parceira fundadora?` : `Tirar o selo de fundadora de ${r.fornecedor.nome_fantasia}?`)) return;
    await fetch('/api/admin/comissao', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'fundador', valor, ...(r.fornecedor_tipo === 'loja' ? { loja_id: r.fornecedor_id } : { oficina_id: r.fornecedor_id }) }),
    });
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
        <p className="text-slate-400 text-sm mt-2">
          Regra global de peças: <strong className="text-white">{modoGlobal === 'isento' ? 'sem comissão (0%)' : modoGlobal === 'fixa' ? 'taxa fixa' : 'por desempenho (1–3%)'}</strong>
          {' '}(muda em <a href="/admin/comissoes" className="text-blue-400 hover:underline">Comissões</a>). A taxa individual de um fornecedor vale sobre a global até a data de término.
        </p>
        {erro && <p className="text-red-400 text-sm mt-2">{erro}</p>}
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
                {['Fornecedor', 'Tipo', 'Taxa que vale', 'Taxa individual', 'Pendente', 'Pago', 'Ações'].map((h) => (
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
                        <button
                          onClick={() => alternarFundador(r)}
                          className={`mt-1 text-xs px-2 py-0.5 rounded border ${r.fornecedor.parceiro_fundador ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300' : 'border-slate-600 text-slate-500 hover:text-slate-300'}`}
                        >
                          {r.fornecedor.parceiro_fundador ? '⭐ Fundadora' : '☆ Marcar fundadora'}
                        </button>
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
                          <div>
                            <span className="text-white font-medium text-sm">{(r.efetiva.taxa * 100).toFixed(1)}%</span>
                            <span className={`ml-2 inline-flex px-2 py-0.5 rounded text-xs font-medium ${r.efetiva.origem === 'individual' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'}`}>
                              {r.efetiva.origem === 'individual' ? 'Individual' : 'Global'}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <div className="space-y-1.5 w-52">
                            <label className="flex items-center gap-2 text-xs text-slate-300">
                              <input type="checkbox" checked={editForm.usaOverride} onChange={(e) => setEditForm({ ...editForm, usaOverride: e.target.checked })} />
                              Usar taxa individual
                            </label>
                            {editForm.usaOverride && (
                              <>
                                <input type="date" value={editForm.ate} onChange={(e) => setEditForm({ ...editForm, ate: e.target.value })} title="Válida até (vazio = sem prazo)" className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs" />
                                <input value={editForm.motivo} onChange={(e) => setEditForm({ ...editForm, motivo: e.target.value })} placeholder="Motivo" className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs" />
                              </>
                            )}
                          </div>
                        ) : r.usa_override ? (
                          <div className="text-xs">
                            <span className={r.individual_vigente ? 'text-white' : 'text-slate-500 line-through'}>{((r.taxa_fixa_override ?? 0) * 100).toFixed(1)}%</span>
                            <p className="text-slate-400">
                              {r.override_ate ? `${r.individual_vigente ? 'até' : 'venceu em'} ${formatDate(r.override_ate + 'T12:00:00')}` : 'sem prazo'}
                              {r.override_motivo && ` · ${r.override_motivo}`}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-medium ${r.total_pendente > 0 ? 'text-amber-400' : 'text-slate-400'}`}>{formatCurrency(r.total_pendente, currencyForCountry(r.fornecedor?.pais))}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-emerald-400">{formatCurrency(r.total_pago, currencyForCountry(r.fornecedor?.pais))}</span>
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
                                    <td className="py-2 pr-4 text-right text-white">{formatCurrency(l.valor_pedido, currencyForCountry(r.fornecedor?.pais))}</td>
                                    <td className="py-2 pr-4 text-right text-slate-400">{(l.taxa_aplicada * 100).toFixed(1)}%</td>
                                    <td className="py-2 pr-4 text-right text-white font-medium">{formatCurrency(l.valor_comissao, currencyForCountry(r.fornecedor?.pais))}</td>
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
