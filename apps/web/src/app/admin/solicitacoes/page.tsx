'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { formatDate, cleanDescricao } from '@/lib/utils';
import { TIPOS_SERVICO, STATUS_SOLICITACAO } from '@fixauto/shared';

const STATUS_BADGE: Record<string, string> = {
  aberta: 'bg-blue-500/20 text-blue-400',
  em_orcamento: 'bg-yellow-500/20 text-yellow-400',
  aceita: 'bg-emerald-500/20 text-emerald-400',
  em_andamento: 'bg-purple-500/20 text-purple-400',
  concluida: 'bg-slate-500/20 text-slate-300',
  cancelada: 'bg-red-500/20 text-red-400',
};

interface Row {
  id: string;
  tipo: string;
  descricao: string;
  status: string;
  urgencia: string;
  created_at: string;
  emergencia_id: string | null;
  cliente: { nome: string; email: string } | null;
  veiculo: { fipe_marca: string; fipe_modelo: string; placa: string | null } | null;
  totalOrcamentos: number;
  orcamentoAceito: boolean;
}

export default function AdminSolicitacoesPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Carregando...</div>}>
      <AdminSolicitacoesContent />
    </Suspense>
  );
}

function AdminSolicitacoesContent() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [resumo, setResumo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [tipo, setTipo] = useState('');
  const [q, setQ] = useState('');
  const clienteId = searchParams.get('cliente_id');

  const fetchData = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (tipo) params.set('tipo', tipo);
    if (q) params.set('q', q);
    if (clienteId) params.set('cliente_id', clienteId);
    const res = await fetch(`/api/admin/solicitacoes?${params.toString()}`);
    const data = await res.json();
    setRows(data.solicitacoes || []);
    setResumo(data.resumo || null);
    setLoading(false);
  };

  useEffect(() => {
    const debounce = setTimeout(fetchData, 300);
    return () => clearTimeout(debounce);
  }, [status, tipo, q, clienteId]);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Solicitações</h1>
          <p className="text-slate-400 text-sm mt-1">Visão completa de todos os pedidos de serviço da plataforma</p>
        </div>
        <a
          href={`/api/admin/export?tipo=solicitacoes${status ? `&status=${status}` : ''}`}
          className="text-sm bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          Exportar CSV
        </a>
      </div>

      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: resumo.total },
            { label: 'Sem orçamento', value: resumo.semOrcamento, alert: true },
            { label: 'Em andamento', value: resumo.emAndamento },
            { label: 'Concluídas', value: resumo.concluidas },
          ].map((s) => (
            <div key={s.label} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-xs uppercase tracking-wide">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.alert && s.value > 0 ? 'text-amber-400' : 'text-white'}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {clienteId && (
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-300 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 w-fit">
          Filtrando por cliente específico
          <Link href="/admin/solicitacoes" className="text-blue-400 hover:underline">Limpar</Link>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por descrição ou endereço..."
          className="flex-1 min-w-[220px] bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_SOLICITACAO).map(([value, s]) => (
            <option key={value} value={value}>{s.label}</option>
          ))}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os tipos</option>
          {TIPOS_SERVICO.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
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
                {['Cliente', 'Veículo', 'Serviço', 'Orçamentos', 'Status', 'Criada em', ''].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-white font-medium">{r.cliente?.nome || '—'}</p>
                    <p className="text-slate-500 text-xs">{r.cliente?.email}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-300 text-sm">
                    {r.veiculo ? `${r.veiculo.fipe_marca} ${r.veiculo.fipe_modelo}` : '—'}
                    {r.veiculo?.placa && <span className="text-slate-500"> · {r.veiculo.placa}</span>}
                  </td>
                  <td className="px-6 py-4 text-slate-300 text-sm max-w-xs truncate">
                    {r.emergencia_id && <span className="text-red-400 font-semibold mr-1">⚡</span>}
                    {cleanDescricao(r.descricao)}
                  </td>
                  <td className="px-6 py-4 text-slate-300 text-sm">
                    {r.totalOrcamentos}
                    {r.orcamentoAceito && <span className="ml-1 text-emerald-400 text-xs">(aceito)</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[r.status] || 'bg-slate-500/20 text-slate-300'}`}>
                      {STATUS_SOLICITACAO[r.status as keyof typeof STATUS_SOLICITACAO]?.label || r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm whitespace-nowrap">{formatDate(r.created_at)}</td>
                  <td className="px-6 py-4">
                    <Link href={`/admin/solicitacoes/${r.id}`} className="text-blue-400 hover:text-blue-300 font-medium text-sm">
                      Ver detalhes
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">Nenhuma solicitação encontrada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
