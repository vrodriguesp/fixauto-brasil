'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatDate, formatDateTime, cleanDescricao } from '@/lib/utils';
import { STATUS_SOLICITACAO } from '@fixauto/shared';

const STATUS_BADGE: Record<string, string> = {
  aberta: 'bg-blue-500/20 text-blue-400',
  em_orcamento: 'bg-yellow-500/20 text-yellow-400',
  aceita: 'bg-emerald-500/20 text-emerald-400',
  em_andamento: 'bg-purple-500/20 text-purple-400',
  concluida: 'bg-slate-500/20 text-slate-300',
  cancelada: 'bg-red-500/20 text-red-400',
};

export default function AdminVeiculoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/veiculos/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-slate-400">Carregando...</div>;
  if (!data) return <div className="text-slate-400">Veículo não encontrado.</div>;

  const { veiculo, solicitacoes, notasInternas, oficinasQuePassou } = data;

  return (
    <div className="max-w-5xl">
      <Link href="/admin/veiculos" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">← Voltar</Link>
      <h1 className="text-2xl font-bold text-white">
        {veiculo.fipe_marca} {veiculo.fipe_modelo} {veiculo.fipe_ano}
      </h1>
      <p className="text-slate-400 text-sm mt-1">Placa {veiculo.placa || 'não informada'} · Cadastrado em {formatDate(veiculo.created_at)}</p>

      <div className="grid sm:grid-cols-2 gap-4 my-6">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Dono</p>
          <p className="text-white font-medium">{veiculo.dono?.nome}</p>
          <p className="text-slate-400 text-sm">{veiculo.dono?.email}</p>
          <p className="text-slate-400 text-sm">{veiculo.dono?.telefone}</p>
          <Link href={`/admin/solicitacoes?cliente_id=${veiculo.dono?.id}`} className="text-blue-400 hover:underline text-xs mt-2 inline-block">
            Ver outras solicitações deste cliente →
          </Link>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Passou por</p>
          {oficinasQuePassou.length === 0 ? (
            <p className="text-slate-500 text-sm">Nenhum serviço confirmado ainda.</p>
          ) : (
            <ul className="text-slate-300 text-sm space-y-1">
              {oficinasQuePassou.map((nome: string) => <li key={nome}>{nome}</li>)}
            </ul>
          )}
        </div>
      </div>

      <div className="mb-8">
        <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Intervenções ({solicitacoes.length})</p>
        {solicitacoes.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma solicitação registrada pra esse veículo.</p>
        ) : (
          <div className="space-y-3">
            {solicitacoes.map((s: any) => {
              const orcamentoAceito = (s.orcamentos || []).find((o: any) => o.status === 'aceito');
              return (
                <div key={s.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-white font-medium">{cleanDescricao(s.descricao)}</p>
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[s.status] || 'bg-slate-500/20 text-slate-300'}`}>
                      {STATUS_SOLICITACAO[s.status as keyof typeof STATUS_SOLICITACAO]?.label || s.status}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mt-1">
                    {orcamentoAceito?.oficina?.nome_fantasia ? `Atendida por ${orcamentoAceito.oficina.nome_fantasia} · ` : ''}
                    {formatDateTime(s.created_at)}
                  </p>
                  {s.avaliacao?.[0] && (
                    <p className="text-amber-400 text-xs mt-1">{'★'.repeat(s.avaliacao[0].nota)}{'☆'.repeat(5 - s.avaliacao[0].nota)}</p>
                  )}
                  <Link href={`/admin/solicitacoes/${s.id}`} className="text-blue-400 hover:underline text-xs mt-2 inline-block">
                    Ver detalhes completos →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {notasInternas?.length > 0 && (
        <div className="mb-8">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Notas internas registradas sobre esse veículo</p>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2">
            {notasInternas.map((n: any) => (
              <div key={n.id} className="text-sm">
                <span className="text-slate-300 font-medium">{n.remetente?.nome} ({n.agenda?.oficina?.nome_fantasia}):</span>{' '}
                <span className="text-slate-400">{n.texto}</span>
                <span className="text-slate-600 text-xs ml-2">{formatDateTime(n.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
