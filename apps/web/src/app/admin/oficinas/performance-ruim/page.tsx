'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Oficina, Avaliacao } from '@fixauto/shared';

const MIN_AVALIACOES = 3;
const LIMITE_NOTA_RUIM = 3;

interface OficinaComAvaliacoes extends Oficina {
  ultimosComentarios: Avaliacao[];
}

export default function AdminPerformanceRuimPage() {
  const [oficinas, setOficinas] = useState<OficinaComAvaliacoes[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [limiteNota, setLimiteNota] = useState(LIMITE_NOTA_RUIM);

  const fetchData = async () => {
    setLoading(true);
    const { data: todasOficinas } = await supabase
      .from('oficinas')
      .select('*, profile:profiles(email, telefone)')
      .gt('total_avaliacoes', MIN_AVALIACOES)
      .lte('avaliacao_media', limiteNota)
      .order('avaliacao_media', { ascending: true });

    const ruins = (todasOficinas as (Oficina & { profile?: { email: string; telefone: string | null } })[]) || [];

    const comAvaliacoes = await Promise.all(
      ruins.map(async (ofi) => {
        const { data: avals } = await supabase
          .from('avaliacoes')
          .select('*, cliente:profiles!avaliacoes_cliente_id_fkey(nome)')
          .eq('oficina_id', ofi.id)
          .order('created_at', { ascending: false })
          .limit(3);
        return { ...ofi, ultimosComentarios: (avals as Avaliacao[]) || [] };
      })
    );

    setOficinas(comAvaliacoes as OficinaComAvaliacoes[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limiteNota]);

  const handleToggleAtiva = async (oficina: OficinaComAvaliacoes) => {
    const acao = oficina.ativa ? 'desativar' : 'ativar';
    if (!confirm(`Tem certeza que quer ${acao} "${oficina.nome_fantasia}"?`)) return;
    setBusyId(oficina.id);
    await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: oficina.profile_id, ativo: !oficina.ativa }),
    });
    setBusyId(null);
    await fetchData();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Oficinas com Performance Ruim</h1>
        <p className="text-slate-400 text-sm">
          Oficinas com mais de {MIN_AVALIACOES} avaliações e nota média baixa — candidatas a contato ou desativação.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <label className="text-sm text-slate-400">Considerar "ruim" abaixo de:</label>
        <select
          value={limiteNota}
          onChange={(e) => setLimiteNota(Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value={2}>2.0 estrelas</option>
          <option value={2.5}>2.5 estrelas</option>
          <option value={3}>3.0 estrelas</option>
          <option value={3.5}>3.5 estrelas</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : oficinas.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <p className="text-slate-400">
            Nenhuma oficina com mais de {MIN_AVALIACOES} avaliações e nota abaixo de {limiteNota.toFixed(1)} no momento.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {oficinas.map((oficina) => (
            <div key={oficina.id} className="bg-slate-800 rounded-xl border border-red-900/50 p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-white font-semibold text-lg">{oficina.nome_fantasia}</h2>
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                      oficina.ativa ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {oficina.ativa ? 'Ativa' : 'Desativada'}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm mt-0.5">{oficina.cidade}, {oficina.estado}</p>
                  <p className="text-slate-500 text-xs mt-1">
                    {(oficina as any).profile?.email} {(oficina as any).profile?.telefone ? `· ${(oficina as any).profile.telefone}` : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1.5 justify-end">
                    <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-red-400 font-bold text-xl">{oficina.avaliacao_media.toFixed(1)}</span>
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5">{oficina.total_avaliacoes} avaliações</p>
                </div>
              </div>

              {oficina.ultimosComentarios.filter((a) => a.comentario).length > 0 && (
                <div className="bg-slate-900/50 rounded-lg p-3 mb-4 space-y-2">
                  {oficina.ultimosComentarios.filter((a) => a.comentario).map((a) => (
                    <p key={a.id} className="text-sm text-slate-300">
                      <span className="text-amber-400">{'★'.repeat(a.nota)}{'☆'.repeat(5 - a.nota)}</span>{' '}
                      <span className="text-slate-500">— {(a as any).cliente?.nome || 'Cliente'}:</span> "{a.comentario}"
                    </p>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 text-sm">
                <Link href={`/admin/oficinas/${oficina.id}`} className="text-blue-400 hover:text-blue-300 font-medium">
                  Ver detalhes
                </Link>
                {(oficina as any).profile?.email && (
                  <a href={`mailto:${(oficina as any).profile.email}`} className="text-slate-400 hover:text-white font-medium">
                    Contatar por e-mail
                  </a>
                )}
                <button
                  onClick={() => handleToggleAtiva(oficina)}
                  disabled={busyId === oficina.id}
                  className={`font-medium disabled:opacity-50 ${oficina.ativa ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                >
                  {oficina.ativa ? 'Desativar oficina' : 'Reativar oficina'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
