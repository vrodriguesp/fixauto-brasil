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
    nome: '',
    email: '',
    senha: '',
    cargo: 'mecanico' as 'admin' | 'mecanico',
    especialidade: '',
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ nome: '', telefone: '', especialidade: '', capacidade_maxima: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [novaSenhaGerada, setNovaSenhaGerada] = useState<{ nome: string; senha: string } | null>(null);

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
    if (!oficina || !form.email || !form.senha) return;
    if (form.senha.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    setSaving(true);
    setError('');

    const res = await fetch('/api/funcionarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: form.nome || undefined,
        email: form.email,
        senha: form.senha,
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
      setForm({ nome: '', email: '', senha: '', cargo: 'mecanico', especialidade: '' });
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

  const startEdit = (func: Funcionario & { profile?: { nome: string; email: string; telefone: string | null } }) => {
    setEditingId(func.id);
    setEditForm({
      nome: func.profile?.nome || '',
      telefone: func.profile?.telefone || '',
      especialidade: func.especialidade || '',
      capacidade_maxima: func.capacidade_maxima != null ? String(func.capacidade_maxima) : '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSavingEdit(true);
    await fetch('/api/funcionarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingId,
        nome: editForm.nome,
        telefone: editForm.telefone || null,
        especialidade: editForm.especialidade || null,
        capacidade_maxima: editForm.capacidade_maxima === '' ? null : parseInt(editForm.capacidade_maxima),
      }),
    });
    setSavingEdit(false);
    setEditingId(null);
    await fetchFuncionarios();
  };

  const handleResetSenha = async (func: Funcionario & { profile?: { nome: string; email: string; telefone: string | null } }) => {
    if (!confirm(`Gerar uma nova senha temporária para ${func.profile?.nome || 'este funcionário'}? A senha atual deixará de funcionar.`)) return;
    setResettingId(func.id);
    const res = await fetch('/api/funcionarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: func.id, resetSenha: true }),
    });
    const data = await res.json();
    setResettingId(null);
    if (data.novaSenha) {
      setNovaSenhaGerada({ nome: func.profile?.nome || 'Funcionário', senha: data.novaSenha });
    }
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
      {novaSenhaGerada && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setNovaSenhaGerada(null)}>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-2">Nova senha gerada</h3>
            <p className="text-sm text-gray-600 mb-3">
              Enviamos por e-mail para <strong>{novaSenhaGerada.nome}</strong>, mas você também pode repassar direto:
            </p>
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-center mb-4">
              <span className="text-xl font-mono tracking-wider text-sky-900">{novaSenhaGerada.senha}</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">No próximo login, a pessoa será solicitada a escolher uma nova senha.</p>
            <button onClick={() => setNovaSenhaGerada(null)} className="btn-primary w-full">Fechar</button>
          </div>
        </div>
      )}
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input
                type="text"
                className="input-field"
                placeholder="Nome do funcionário"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                className="input-field"
                placeholder="email@exemplo.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha temporária *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Mínimo 6 caracteres"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">
                Passe esta senha ao funcionário. No primeiro login, ele será solicitado a escolher uma nova senha.
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
                placeholder="Ex: Motor, Funilaria, Elétrica..."
                value={form.especialidade}
                onChange={(e) => setForm({ ...form, especialidade: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => { setShowForm(false); setError(''); }} className="btn-secondary">
              Cancelar
            </button>
            <button onClick={handleAdd} disabled={saving || !form.email || !form.senha} className="btn-primary disabled:opacity-50">
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
              {editingId === func.id ? (
                <div className="flex-1 grid sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nome</label>
                    <input
                      type="text"
                      className="input-field !py-1.5"
                      value={editForm.nome}
                      onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Telefone</label>
                    <input
                      type="text"
                      className="input-field !py-1.5"
                      value={editForm.telefone}
                      onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Especialidade</label>
                    <input
                      type="text"
                      className="input-field !py-1.5"
                      value={editForm.especialidade}
                      onChange={(e) => setEditForm({ ...editForm, especialidade: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Capacidade (carros simultâneos)</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="Sem limite"
                      className="input-field !py-1.5"
                      value={editForm.capacidade_maxima}
                      onChange={(e) => setEditForm({ ...editForm, capacidade_maxima: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-4 flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="btn-secondary !py-1.5 !px-3 text-sm">
                      Cancelar
                    </button>
                    <button onClick={handleSaveEdit} disabled={savingEdit} className="btn-primary !py-1.5 !px-3 text-sm disabled:opacity-50">
                      {savingEdit ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              ) : (
              <>
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
                  <p className="text-xs text-gray-400 mt-0.5">
                    Capacidade: {func.capacidade_maxima != null ? `${func.capacidade_maxima} carro(s) simultâneos` : 'sem limite definido'}
                  </p>
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
                  onClick={() => startEdit(func)}
                  className="px-3 py-1 text-xs rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleResetSenha(func)}
                  disabled={resettingId === func.id}
                  className="px-3 py-1 text-xs rounded-lg font-medium bg-sky-100 text-sky-800 hover:bg-sky-200 disabled:opacity-50"
                >
                  {resettingId === func.id ? 'Gerando...' : 'Gerar nova senha'}
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
              </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
