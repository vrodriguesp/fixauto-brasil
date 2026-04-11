'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { CARGOS_FUNCIONARIO } from '@fixauto/shared';
import type { Funcionario } from '@fixauto/shared';

export default function EquipePage() {
  const { oficina } = useAuth();
  const [funcionarios, setFuncionarios] = useState<(Funcionario & { profile?: { nome: string; email: string; telefone: string | null } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    email: '',
    cargo: 'mecanico' as 'admin' | 'mecanico',
    especialidade: '',
  });

  const fetchFuncionarios = async () => {
    if (!oficina) return;
    const { data } = await supabase
      .from('funcionarios')
      .select('*, profile:profiles(nome, email, telefone)')
      .eq('oficina_id', oficina.id)
      .order('created_at', { ascending: false });
    setFuncionarios(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchFuncionarios();
  }, [oficina]);

  const handleAdd = async () => {
    if (!oficina || !form.email) return;
    setSaving(true);
    setError('');

    const res = await fetch('/api/funcionarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        cargo: form.cargo,
        especialidade: form.especialidade || null,
        oficina_id: oficina.id,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
    } else {
      setShowForm(false);
      setForm({ email: '', cargo: 'mecanico', especialidade: '' });
      await fetchFuncionarios();
    }
    setSaving(false);
  };

  const handleToggleAtivo = async (func: Funcionario) => {
    await fetch('/api/funcionarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: func.id, ativo: !func.ativo }),
    });
    await fetchFuncionarios();
  };

  const handleChangeCargo = async (func: Funcionario, cargo: 'admin' | 'mecanico') => {
    await fetch('/api/funcionarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: func.id, cargo }),
    });
    await fetchFuncionarios();
  };

  const handleDelete = async (func: Funcionario) => {
    if (!confirm(`Remover ${func.profile?.nome || 'funcionário'}?`)) return;
    await fetch('/api/funcionarios', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: func.id }),
    });
    await fetchFuncionarios();
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Equipe</h1>
          <p className="text-gray-600 mt-1">Gerencie os funcionários da oficina</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary mt-4 sm:mt-0">
          + Novo Funcionário
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Adicionar Funcionário</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                className="input-field"
                placeholder="email@exemplo.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">
                Se o email ainda não tem conta, será criada automaticamente e enviado convite.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
              <select
                className="input-field"
                value={form.cargo}
                onChange={(e) => setForm({ ...form, cargo: e.target.value as 'admin' | 'mecanico' })}
              >
                <option value="mecanico">{CARGOS_FUNCIONARIO.mecanico.label} - {CARGOS_FUNCIONARIO.mecanico.description}</option>
                <option value="admin">{CARGOS_FUNCIONARIO.admin.label} - {CARGOS_FUNCIONARIO.admin.description}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Especialidade (opcional)</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: Motor, Funilaria, Eletrica..."
                value={form.especialidade}
                onChange={(e) => setForm({ ...form, especialidade: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => { setShowForm(false); setError(''); }} className="btn-secondary">
              Cancelar
            </button>
            <button onClick={handleAdd} disabled={saving || !form.email} className="btn-primary disabled:opacity-50">
              {saving ? 'Cadastrando...' : 'Cadastrar'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {funcionarios.length === 0 ? (
        <div className="card text-center py-12">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="text-gray-500 mb-2">Nenhum funcionário cadastrado</p>
          <p className="text-sm text-gray-400">Adicione mecânicos e administradores para gerenciar os serviços</p>
        </div>
      ) : (
        <div className="space-y-3">
          {funcionarios.map((func) => (
            <div
              key={func.id}
              className={`card flex flex-col sm:flex-row sm:items-center gap-4 ${!func.ativo ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  func.cargo === 'admin' ? 'bg-emerald-100' : 'bg-blue-100'
                }`}>
                  <span className={`font-semibold text-sm ${
                    func.cargo === 'admin' ? 'text-emerald-700' : 'text-blue-700'
                  }`}>
                    {(func.profile?.nome || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 truncate">{func.profile?.nome || 'Sem nome'}</p>
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      func.cargo === 'admin'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {CARGOS_FUNCIONARIO[func.cargo].label}
                    </span>
                    {!func.ativo && (
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        Inativo
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">{func.profile?.email}</p>
                  {func.especialidade && (
                    <p className="text-xs text-gray-400 mt-0.5">Especialidade: {func.especialidade}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <select
                  value={func.cargo}
                  onChange={(e) => handleChangeCargo(func, e.target.value as 'admin' | 'mecanico')}
                  className="input-field !py-1 !px-2 text-xs !w-auto"
                >
                  <option value="mecanico">Mecânico</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={() => handleToggleAtivo(func)}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                    func.ativo
                      ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                      : 'bg-green-100 text-green-800 hover:bg-green-200'
                  }`}
                >
                  {func.ativo ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  onClick={() => handleDelete(func)}
                  className="p-1 text-gray-400 hover:text-red-500"
                >
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
