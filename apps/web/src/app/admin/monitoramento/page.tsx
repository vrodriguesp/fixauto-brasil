'use client';

import { useEffect, useState } from 'react';

interface Monitoramento {
  acessos: {
    porDia: { dia: string; total: number }[];
    topPaginas: { path: string; total: number }[];
    statusCodes: Record<string, number>;
    ipsUnicos: number;
    totalRequisicoes: number;
  };
  clientErrors: { id: string; mensagem: string; url: string | null; created_at: string }[];
  serverErrors: string[];
}

export default function AdminMonitoramentoPage() {
  const [data, setData] = useState<Monitoramento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/admin/monitoramento');
      if (!res.ok) throw new Error('Erro ao buscar monitoramento');
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-700 rounded w-64" />
        <div className="h-48 bg-slate-800 rounded-xl" />
        <div className="h-48 bg-slate-800 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="bg-red-900/20 border border-red-800 text-red-300 p-4 rounded-lg">{error}</div>;
  }

  const maxDia = Math.max(1, ...data.acessos.porDia.map((d) => d.total));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Monitoramento em Tempo Real</h1>
          <p className="text-slate-400 text-sm mt-1">Atualiza automaticamente a cada 30s</p>
        </div>
        <a
          href="https://netdata.bipfix.com"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          Abrir infraestrutura da VM (Netdata) ↗
        </a>
      </div>

      {/* Resumo de acessos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <p className="text-sm text-slate-400 mb-1">Requisições (últimas ~20k linhas de log)</p>
          <p className="text-3xl font-bold text-white">{data.acessos.totalRequisicoes.toLocaleString('pt-BR')}</p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <p className="text-sm text-slate-400 mb-1">IPs únicos (na mesma janela)</p>
          <p className="text-3xl font-bold text-white">{data.acessos.ipsUnicos.toLocaleString('pt-BR')}</p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <p className="text-sm text-slate-400 mb-2">Status HTTP</p>
          <div className="flex gap-4 text-sm">
            {Object.entries(data.acessos.statusCodes).map(([code, total]) => (
              <span key={code} className={code.startsWith('2') ? 'text-emerald-400' : code.startsWith('4') ? 'text-amber-400' : code.startsWith('5') ? 'text-red-400' : 'text-slate-300'}>
                {code}: <strong>{total}</strong>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Requisicoes por dia */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Requisições por dia (últimos 7 dias com dado)</h2>
        <div className="flex items-end gap-3 h-40">
          {data.acessos.porDia.map((d) => (
            <div key={d.dia} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-xs text-slate-400">{d.total}</span>
              <div
                className="w-full bg-blue-500/60 rounded-t"
                style={{ height: `${(d.total / maxDia) * 100}%`, minHeight: 4 }}
              />
              <span className="text-xs text-slate-500">{d.dia}</span>
            </div>
          ))}
          {data.acessos.porDia.length === 0 && <p className="text-slate-500 text-sm">Sem dados ainda</p>}
        </div>
      </div>

      {/* Top paginas */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Páginas mais acessadas</h2>
        <div className="space-y-2">
          {data.acessos.topPaginas.map((p) => (
            <div key={p.path} className="flex items-center justify-between text-sm">
              <span className="text-slate-300 truncate">{p.path}</span>
              <span className="text-white font-medium">{p.total}</span>
            </div>
          ))}
          {data.acessos.topPaginas.length === 0 && <p className="text-slate-500 text-sm">Sem dados ainda</p>}
        </div>
      </div>

      {/* Erros client-side */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Erros no navegador (páginas dos usuários)</h2>
        {data.clientErrors.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhum erro registrado</p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {data.clientErrors.map((e) => (
              <div key={e.id} className="border-l-2 border-red-500 pl-3">
                <p className="text-red-300 text-sm font-medium">{e.mensagem}</p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {e.url} · {new Date(e.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Erros server-side */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Erros do servidor (últimas linhas)</h2>
        {data.serverErrors.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhum erro recente</p>
        ) : (
          <div className="bg-slate-900 rounded-lg p-4 max-h-96 overflow-y-auto">
            <pre className="text-xs text-slate-400 whitespace-pre-wrap">{data.serverErrors.join('\n')}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
