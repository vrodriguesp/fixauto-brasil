'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@fixauto/shared';

interface OficinaVinculo {
  nome: string;
  papel: 'dono' | 'funcionario';
}

export default function AdminUsuariosPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [oficinaPorProfile, setOficinaPorProfile] = useState<Record<string, OficinaVinculo>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ nome: '', telefone: '' });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchProfiles = async () => {
    setLoading(true);
    let query = supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (search.trim()) {
      query = query.or(`nome.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data } = await query.limit(100);
    setProfiles((data as Profile[]) || []);

    // Map each profile to the oficina it owns or works for
    const [{ data: oficinas }, { data: funcionarios }] = await Promise.all([
      supabase.from('oficinas').select('profile_id, nome_fantasia'),
      supabase.from('funcionarios').select('profile_id, oficina:oficinas(nome_fantasia)'),
    ]);

    const map: Record<string, OficinaVinculo> = {};
    (oficinas || []).forEach((o) => {
      map[o.profile_id] = { nome: o.nome_fantasia, papel: 'dono' };
    });
    (funcionarios || []).forEach((f: any) => {
      if (!map[f.profile_id] && f.oficina?.nome_fantasia) {
        map[f.profile_id] = { nome: f.oficina.nome_fantasia, papel: 'funcionario' };
      }
    });
    setOficinaPorProfile(map);

    setLoading(false);
  };

  useEffect(() => {
    const debounce = setTimeout(fetchProfiles, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  const tipoBadge = (tipo: string) => {
    switch (tipo) {
      case 'cliente':
        return 'bg-blue-500/20 text-blue-400';
      case 'oficina':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'admin':
        return 'bg-rose-500/20 text-rose-400';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  const startEdit = (profile: Profile) => {
    setEditingId(profile.id);
    setEditForm({ nome: profile.nome, telefone: profile.telefone || '' });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, nome: editForm.nome, telefone: editForm.telefone || null }),
    });
    setSaving(false);
    setEditingId(null);
    await fetchProfiles();
  };

  const handleToggleAtivo = async (profile: Profile) => {
    const acao = profile.ativo ? 'desativar' : 'ativar';
    const vinculo = oficinaPorProfile[profile.id];
    const aviso = profile.ativo && vinculo?.papel === 'dono'
      ? ` Isso também desativa a oficina "${vinculo.nome}" (deixa de aparecer pra clientes).`
      : '';
    if (!confirm(`Tem certeza que quer ${acao} ${profile.nome}?${aviso}`)) return;

    setBusyId(profile.id);
    await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: profile.id, ativo: !profile.ativo }),
    });
    setBusyId(null);
    await fetchProfiles();
  };

  const handleDelete = async (profile: Profile) => {
    const vinculo = oficinaPorProfile[profile.id];
    const aviso = vinculo?.papel === 'dono'
      ? ` Isso apaga PERMANENTEMENTE a oficina "${vinculo.nome}" e tudo ligado a ela (funcionários, orçamentos, agenda).`
      : '';
    if (!confirm(`Remover ${profile.nome} permanentemente? Essa ação não pode ser desfeita.${aviso}`)) return;

    setBusyId(profile.id);
    await fetch('/api/admin/usuarios', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: profile.id }),
    });
    setBusyId(null);
    await fetchProfiles();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Usuarios</h1>

      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou email..."
          className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">Nome</th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">Email</th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">Tipo</th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">Oficina</th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">Status</th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">Cadastro</th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {profiles.map((profile) => (
                <tr key={profile.id} className={`hover:bg-slate-700/50 transition-colors ${!profile.ativo ? 'opacity-50' : ''}`}>
                  {editingId === profile.id ? (
                    <td colSpan={7} className="px-6 py-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Nome</label>
                          <input
                            type="text"
                            value={editForm.nome}
                            onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Telefone</label>
                          <input
                            type="text"
                            value={editForm.telefone}
                            onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })}
                            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-white text-sm px-3 py-1.5">
                          Cancelar
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving}
                          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
                        >
                          {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center">
                            <span className="text-white text-sm font-semibold">{profile.nome.charAt(0)}</span>
                          </div>
                          <span className="text-white font-medium">{profile.nome}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-300 text-sm">{profile.email}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${tipoBadge(profile.tipo)}`}>
                          {profile.tipo}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {oficinaPorProfile[profile.id] ? (
                          <span className="text-slate-300">
                            {oficinaPorProfile[profile.id].papel === 'dono' ? 'Dono de ' : 'Pertence à '}
                            <span className="text-white font-medium">{oficinaPorProfile[profile.id].nome}</span>
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          profile.ativo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {profile.ativo ? 'Ativo' : 'Desativado'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-sm">
                        {new Date(profile.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 text-sm">
                          <button onClick={() => startEdit(profile)} className="text-blue-400 hover:text-blue-300 font-medium">
                            Editar
                          </button>
                          {profile.tipo !== 'admin' && (
                            <>
                              <button
                                onClick={() => handleToggleAtivo(profile)}
                                disabled={busyId === profile.id}
                                className={`font-medium disabled:opacity-50 ${profile.ativo ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                              >
                                {profile.ativo ? 'Desativar' : 'Ativar'}
                              </button>
                              <button
                                onClick={() => handleDelete(profile)}
                                disabled={busyId === profile.id}
                                className="text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
                              >
                                Remover
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {profiles.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    Nenhum usuario encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
