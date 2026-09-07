'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import type { PecaCatalogo } from '@fixauto/shared';

export default function LojaCatalogoPage() {
  const { loja } = useAuth();
  const [pecas, setPecas] = useState<PecaCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: '', descricao: '', fipe_marca: '', fipe_modelo: '', fipe_ano: '', preco: '', quantidade_estoque: '1',
  });

  const fetchPecas = async () => {
    if (!loja) return;
    setLoading(true);
    const { data } = await supabase
      .from('pecas_catalogo')
      .select('*')
      .eq('loja_id', loja.id)
      .order('created_at', { ascending: false });
    setPecas((data as PecaCatalogo[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchPecas(); }, [loja]);

  const handleAdd = async () => {
    if (!loja || !form.nome || !form.preco) return;
    setSaving(true);
    await supabase.from('pecas_catalogo').insert({
      loja_id: loja.id,
      nome: form.nome,
      descricao: form.descricao || null,
      fipe_marca: form.fipe_marca || null,
      fipe_modelo: form.fipe_modelo || null,
      fipe_ano: form.fipe_ano || null,
      preco: parseFloat(form.preco),
      quantidade_estoque: parseInt(form.quantidade_estoque) || 0,
    });
    setForm({ nome: '', descricao: '', fipe_marca: '', fipe_modelo: '', fipe_ano: '', preco: '', quantidade_estoque: '1' });
    setShowForm(false);
    setSaving(false);
    await fetchPecas();
  };

  const handleToggleAtivo = async (peca: PecaCatalogo) => {
    await supabase.from('pecas_catalogo').update({ ativo: !peca.ativo }).eq('id', peca.id);
    await fetchPecas();
  };

  const handleDelete = async (peca: PecaCatalogo) => {
    if (!confirm(`Remover "${peca.nome}" do catálogo?`)) return;
    await supabase.from('pecas_catalogo').delete().eq('id', peca.id);
    await fetchPecas();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catálogo de Peças</h1>
          <p className="text-gray-600 mt-1">Anuncie peças em estoque - oficinas podem ver e comprar direto</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ Nova Peça</button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Adicionar Peça</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da peça *</label>
              <input type="text" className="input-field" placeholder="Ex: Farol dianteiro direito" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição (opcional)</label>
              <input type="text" className="input-field" placeholder="Detalhes, condição, etc." value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marca compatível</label>
              <input type="text" className="input-field" placeholder="Ex: Fiat" value={form.fipe_marca} onChange={(e) => setForm({ ...form, fipe_marca: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modelo compatível</label>
              <input type="text" className="input-field" placeholder="Ex: Argo" value={form.fipe_modelo} onChange={(e) => setForm({ ...form, fipe_modelo: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ano compatível</label>
              <input type="text" className="input-field" placeholder="Ex: 2020" value={form.fipe_ano} onChange={(e) => setForm({ ...form, fipe_ano: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$) *</label>
              <input type="number" step="0.01" className="input-field" placeholder="0,00" value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade em estoque</label>
              <input type="number" className="input-field" value={form.quantidade_estoque} onChange={(e) => setForm({ ...form, quantidade_estoque: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
            <button onClick={handleAdd} disabled={saving || !form.nome || !form.preco} className="btn-primary disabled:opacity-50">
              {saving ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </div>
      )}

      {pecas.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">Nenhuma peça cadastrada ainda</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pecas.map((peca) => (
            <div key={peca.id} className={`card flex items-center justify-between gap-4 ${!peca.ativo ? 'opacity-60' : ''}`}>
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{peca.nome}</p>
                {(peca.fipe_marca || peca.fipe_modelo) && (
                  <p className="text-sm text-gray-500">{peca.fipe_marca} {peca.fipe_modelo} {peca.fipe_ano}</p>
                )}
                <p className="text-sm text-gray-600 mt-1">{formatCurrency(peca.preco)} · {peca.quantidade_estoque} em estoque</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => handleToggleAtivo(peca)} className={`px-3 py-1 text-xs rounded-lg font-medium ${peca.ativo ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                  {peca.ativo ? 'Desativar' : 'Ativar'}
                </button>
                <button onClick={() => handleDelete(peca)} className="p-1 text-gray-400 hover:text-red-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
