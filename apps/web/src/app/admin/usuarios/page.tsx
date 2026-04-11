'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@fixauto/shared';

export default function AdminUsuariosPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfiles() {
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
      setLoading(false);
    }

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
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Nome
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Email
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Tipo
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Cadastro
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {profiles.map((profile) => (
                <tr
                  key={profile.id}
                  className="hover:bg-slate-700/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-semibold">
                          {profile.nome.charAt(0)}
                        </span>
                      </div>
                      <span className="text-white font-medium">{profile.nome}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-300 text-sm">{profile.email}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${tipoBadge(profile.tipo)}`}
                    >
                      {profile.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">
                    {new Date(profile.created_at).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
              {profiles.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
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
