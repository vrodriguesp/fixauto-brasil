'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';

const STATUS_BADGE: Record<string, string> = {
  aberta: 'bg-red-500/20 text-red-400',
  em_orcamento: 'bg-yellow-500/20 text-yellow-400',
  resolvida: 'bg-emerald-500/20 text-emerald-400',
  cancelada: 'bg-slate-500/20 text-slate-300',
};

const STATUS_LABEL: Record<string, string> = {
  aberta: 'Aberta',
  em_orcamento: 'Em orçamento',
  resolvida: 'Resolvida',
  cancelada: 'Cancelada',
};

export default function AdminEmergenciasPage() {
  const [emergencias, setEmergencias] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const res = await fetch(`/api/admin/emergencias?${params.toString()}`);
    const data = await res.json();
    setEmergencias(data.emergencias || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [status]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Emergências</h1>
      <p className="text-slate-400 text-sm mb-6">Fluxo "Acabei de bater" — acidentes registrados na plataforma</p>

      <div className="flex flex-wrap gap-3 mb-6">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-slate-800 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                {['Envolvido', 'Local', 'Oficinas notificadas', 'Status', 'Registrada em', ''].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {emergencias.map((e) => (
                <tr key={e.id} className="hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-white font-medium">{e.nome}</p>
                    <p className="text-slate-500 text-xs">{e.telefone}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-300 text-sm max-w-xs truncate">{e.endereco}</td>
                  <td className="px-6 py-4 text-slate-300 text-sm">
                    {e.totalOficinasResponderam}/{e.totalOficinasNotificadas} responderam
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[e.status] || 'bg-slate-500/20 text-slate-300'}`}>
                      {STATUS_LABEL[e.status] || e.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                  <td className="px-6 py-4">
                    <Link href={`/admin/emergencias/${e.id}`} className="text-blue-400 hover:text-blue-300 font-medium text-sm">
                      Ver detalhes
                    </Link>
                  </td>
                </tr>
              ))}
              {emergencias.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">Nenhuma emergência registrada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
