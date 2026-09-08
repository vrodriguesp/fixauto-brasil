'use client';

import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';

interface Fornecedor {
  id: string;
  tipo: 'loja' | 'oficina';
  nome_fantasia: string;
  cidade: string;
  estado: string;
  ativa: boolean;
  email: string | null;
  created_at: string;
  ultimo_login: string | null;
}

interface Resumo {
  totalLojas: number;
  lojasAtivas: number;
  totalOficinasFornecedoras: number;
  oficinasFornecedorasAtivas: number;
  ativosUltimos7Dias: number;
  nuncaLogou: number;
  totalCotacoes: number;
  cotacoesRespondidas: number;
  pedidosConfirmados: number;
  pedidosEntregues: number;
  comissaoPendente: number;
  comissaoPaga: number;
}

export default function AdminPecasPage() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'loja' | 'oficina'>('todos');

  const fetchData = async () => {
    try {
      const res = await fetch('/api/admin/pecas-fornecedores');
      if (!res.ok) throw new Error('Erro ao buscar fornecedores de peças');
      const data = await res.json();
      setFornecedores(data.fornecedores);
      setResumo(data.resumo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const formatUltimoLogin = (iso: string | null) => {
    if (!iso) return { texto: 'Nunca logou', classe: 'text-red-400' };
    const dias = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
    const texto = dias === 0 ? 'Hoje' : dias === 1 ? 'Ontem' : `Há ${dias} dias`;
    const classe = dias <= 7 ? 'text-emerald-400' : dias <= 30 ? 'text-amber-400' : 'text-red-400';
    return { texto, classe };
  };

  const linhas = fornecedores.filter((f) => filtro === 'todos' || f.tipo === filtro);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-700 rounded w-64" />
        <div className="h-32 bg-slate-800 rounded-xl" />
        <div className="h-64 bg-slate-800 rounded-xl" />
      </div>
    );
  }

  if (error || !resumo) {
    return <div className="bg-red-900/20 border border-red-800 text-red-300 p-4 rounded-lg">{error}</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Portal de Peças</h1>
        <p className="text-slate-400 text-sm mt-1">Rastreabilidade de quem está usando o canal e se a comissão está de fato rendendo</p>
      </div>

      {/* Resumo de cadastro/atividade */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Lojas de peças</p>
          <p className="text-2xl font-bold text-white">{resumo.lojasAtivas} <span className="text-slate-500 text-base font-normal">/ {resumo.totalLojas} ativas</span></p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Oficinas fornecedoras</p>
          <p className="text-2xl font-bold text-white">{resumo.oficinasFornecedorasAtivas} <span className="text-slate-500 text-base font-normal">/ {resumo.totalOficinasFornecedoras} ativas</span></p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Logaram nos últimos 7 dias</p>
          <p className="text-2xl font-bold text-emerald-400">{resumo.ativosUltimos7Dias}</p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Nunca logaram</p>
          <p className="text-2xl font-bold text-red-400">{resumo.nuncaLogou}</p>
        </div>
      </div>

      {/* Uso do canal e comissao */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Cotações abertas</p>
          <p className="text-2xl font-bold text-white">{resumo.totalCotacoes} <span className="text-slate-500 text-base font-normal">({resumo.cotacoesRespondidas} respondidas)</span></p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Pedidos confirmados</p>
          <p className="text-2xl font-bold text-white">{resumo.pedidosConfirmados} <span className="text-slate-500 text-base font-normal">({resumo.pedidosEntregues} entregues)</span></p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Comissão pendente</p>
          <p className="text-2xl font-bold text-amber-400">{formatCurrency(resumo.comissaoPendente)}</p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Comissão paga</p>
          <p className="text-2xl font-bold text-emerald-400">{formatCurrency(resumo.comissaoPaga)}</p>
        </div>
      </div>

      {resumo.pedidosEntregues > 0 && resumo.comissaoPendente === 0 && resumo.comissaoPaga === 0 && (
        <div className="bg-amber-900/20 border border-amber-800 text-amber-300 p-4 rounded-lg text-sm">
          Há {resumo.pedidosEntregues} pedido(s) entregue(s) mas nenhuma comissão lançada — vale investigar antes de decidir se o canal compensa.
        </div>
      )}

      {/* Tabela de fornecedores */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="font-semibold text-white">Fornecedores cadastrados</h2>
          <div className="flex gap-1 bg-slate-900 rounded-lg p-1">
            {(['todos', 'loja', 'oficina'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filtro === f ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {f === 'todos' ? 'Todos' : f === 'loja' ? 'Lojas' : 'Oficinas'}
              </button>
            ))}
          </div>
        </div>
        {linhas.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-10">Nenhum fornecedor cadastrado ainda</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-700">
                  <th className="text-left py-2.5 px-4 font-medium">Nome</th>
                  <th className="text-left py-2.5 px-4 font-medium">Tipo</th>
                  <th className="text-left py-2.5 px-4 font-medium">Local</th>
                  <th className="text-left py-2.5 px-4 font-medium">Status</th>
                  <th className="text-left py-2.5 px-4 font-medium">Cadastro</th>
                  <th className="text-left py-2.5 px-4 font-medium">Último login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {linhas.map((f) => {
                  const login = formatUltimoLogin(f.ultimo_login);
                  return (
                    <tr key={`${f.tipo}-${f.id}`}>
                      <td className="py-2.5 px-4 text-white">{f.nome_fantasia}<p className="text-xs text-slate-500">{f.email}</p></td>
                      <td className="py-2.5 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.tipo === 'loja' ? 'bg-orange-900/40 text-orange-300' : 'bg-sky-900/40 text-sky-300'}`}>
                          {f.tipo === 'loja' ? 'Loja de peças' : 'Oficina fornecedora'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">{f.cidade}, {f.estado}</td>
                      <td className="py-2.5 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.ativa ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                          {f.ativa ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-400">{new Date(f.created_at).toLocaleDateString('pt-BR')}</td>
                      <td className={`py-2.5 px-4 font-medium ${login.classe}`}>{login.texto}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
