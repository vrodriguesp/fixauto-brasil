'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Oficina } from '@fixauto/shared';

export default function AdminOficinasPage() {
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchOficinas = async () => {
    setLoading(true);
    let query = supabase
      .from('oficinas')
      .select('*')
      .order('created_at', { ascending: false });

    if (search.trim()) {
      query = query.ilike('nome_fantasia', `%${search}%`);
    }

    const { data } = await query.limit(100);
    setOficinas((data as Oficina[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    const debounce = setTimeout(fetchOficinas, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  const handleToggleAtiva = async (oficina: Oficina) => {
    const acao = oficina.ativa ? 'desativar' : 'ativar';
    if (!confirm(`Tem certeza que quer ${acao} "${oficina.nome_fantasia}"? ${oficina.ativa ? 'Ela deixa de aparecer pra clientes.' : ''}`)) return;
    setBusyId(oficina.id);
    await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: oficina.profile_id, ativo: !oficina.ativa }),
    });
    setBusyId(null);
    await fetchOficinas();
  };

  const handleDelete = async (oficina: Oficina) => {
    if (!confirm(`Remover "${oficina.nome_fantasia}" permanentemente? Isso apaga a oficina, funcionários, orçamentos e agenda ligados a ela. Não pode ser desfeito.`)) return;
    setBusyId(oficina.id);
    await fetch('/api/admin/usuarios', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: oficina.profile_id }),
    });
    setBusyId(null);
    await fetchOficinas();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Oficinas</h1>

      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome da oficina..."
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
                  Nome Fantasia
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Cidade
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Avaliação
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Avaliações
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Status
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {oficinas.map((oficina) => (
                <tr
                  key={oficina.id}
                  className="hover:bg-slate-700/50 transition-colors"
                >
                  <td className="px-6 py-4 text-white font-medium">
                    {oficina.nome_fantasia}
                  </td>
                  <td className="px-6 py-4 text-slate-300 text-sm">
                    {oficina.cidade}, {oficina.estado}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <svg
                        className="w-4 h-4 text-amber-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-amber-400 text-sm font-medium">
                        {oficina.avaliacao_media.toFixed(1)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">
                    {oficina.total_avaliacoes}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        oficina.ativa
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {oficina.ativa ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3 text-sm">
                      <Link
                        href={`/admin/oficinas/${oficina.id}`}
                        className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                      >
                        Ver detalhes
                      </Link>
                      <button
                        onClick={() => handleToggleAtiva(oficina)}
                        disabled={busyId === oficina.id}
                        className={`font-medium disabled:opacity-50 ${oficina.ativa ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                      >
                        {oficina.ativa ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        onClick={() => handleDelete(oficina)}
                        disabled={busyId === oficina.id}
                        className="text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
                      >
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {oficinas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Nenhuma oficina encontrada
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
