'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { formatDate } from '@/lib/utils';

interface Veiculo {
  id: string;
  fipe_marca: string;
  fipe_modelo: string;
  fipe_ano: string;
  placa: string | null;
  apelido: string | null;
  created_at: string;
  totalIntervencoes: number;
  dono: { id: string; nome: string; email: string } | null;
}

export default function AdminVeiculosPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Carregando...</div>}>
      <AdminVeiculosContent />
    </Suspense>
  );
}

function AdminVeiculosContent() {
  const searchParams = useSearchParams();
  const clienteId = searchParams.get('cliente_id');
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [marca, setMarca] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (marca) params.set('marca', marca);
    if (clienteId) params.set('cliente_id', clienteId);
    const res = await fetch(`/api/admin/veiculos?${params.toString()}`);
    const data = await res.json();
    setVeiculos(data.veiculos || []);
    setMarcas(data.marcas || []);
    setLoading(false);
  };

  useEffect(() => {
    const debounce = setTimeout(fetchData, 300);
    return () => clearTimeout(debounce);
  }, [q, marca, clienteId]);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Veículos</h1>
          <p className="text-slate-400 text-sm mt-1">Histórico de intervenções por carro, cruzando todas as oficinas</p>
        </div>
        <a
          href={`/api/admin/export?tipo=veiculos${marca ? `&marca=${encodeURIComponent(marca)}` : ''}`}
          className="text-sm bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          Exportar CSV
        </a>
      </div>

      {clienteId && (
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-300 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 w-fit">
          Filtrando por cliente específico
          <Link href="/admin/veiculos" className="text-blue-400 hover:underline">Limpar</Link>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por placa, marca, modelo ou apelido..."
          className="flex-1 min-w-[220px] bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select value={marca} onChange={(e) => setMarca(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todas as marcas</option>
          {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-slate-800 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                {['Veículo', 'Placa', 'Dono', 'Intervenções', 'Cadastrado em', ''].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {veiculos.map((v) => (
                <tr key={v.id} className="hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4 text-white font-medium">
                    {v.fipe_marca} {v.fipe_modelo} {v.fipe_ano}
                    {v.apelido && <span className="text-slate-500 text-xs ml-1">"{v.apelido}"</span>}
                  </td>
                  <td className="px-6 py-4 text-slate-300 text-sm">{v.placa || '—'}</td>
                  <td className="px-6 py-4">
                    <p className="text-slate-300 text-sm">{v.dono?.nome}</p>
                    <p className="text-slate-500 text-xs">{v.dono?.email}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-300 text-sm">{v.totalIntervencoes}</td>
                  <td className="px-6 py-4 text-slate-400 text-sm whitespace-nowrap">{formatDate(v.created_at)}</td>
                  <td className="px-6 py-4">
                    <Link href={`/admin/veiculos/${v.id}`} className="text-blue-400 hover:text-blue-300 font-medium text-sm">
                      Ver histórico
                    </Link>
                  </td>
                </tr>
              ))}
              {veiculos.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">Nenhum veículo encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
