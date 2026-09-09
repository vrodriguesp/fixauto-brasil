'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatDateTime } from '@/lib/utils';

export default function AdminEmergenciaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/emergencias/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-slate-400">Carregando...</div>;
  if (!data) return <div className="text-slate-400">Emergência não encontrada.</div>;

  const { emergencia, fotos, outroVeiculo, mensagens, oficinasNotificadas } = data;

  return (
    <div className="max-w-5xl">
      <Link href="/admin/emergencias" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">← Voltar</Link>
      <h1 className="text-2xl font-bold text-white">Acidente — {emergencia.nome}</h1>
      <p className="text-slate-400 text-sm mt-1">{emergencia.endereco} · {formatDateTime(emergencia.created_at)}</p>

      <div className="grid sm:grid-cols-2 gap-4 my-6">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Motorista envolvido</p>
          <p className="text-white font-medium">{emergencia.nome}</p>
          <p className="text-slate-400 text-sm">{emergencia.email} · {emergencia.telefone}</p>
          {emergencia.descricao && <p className="text-slate-300 text-sm mt-2">{emergencia.descricao}</p>}
          {emergencia.solicitacao_id && (
            <Link href={`/admin/solicitacoes/${emergencia.solicitacao_id}`} className="text-blue-400 hover:underline text-xs mt-2 inline-block">
              Ver solicitação de serviço gerada →
            </Link>
          )}
        </div>
        {outroVeiculo && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Outro veículo envolvido</p>
            <p className="text-white font-medium">{outroVeiculo.nome} — placa {outroVeiculo.placa}</p>
            <p className="text-slate-400 text-sm">{outroVeiculo.telefone || outroVeiculo.email || 'Sem contato informado'}</p>
            {outroVeiculo.observacoes && <p className="text-slate-300 text-sm mt-2">{outroVeiculo.observacoes}</p>}
            <p className="text-slate-500 text-xs mt-2">{outroVeiculo.notificado ? 'Notificado' : 'Não notificado ainda'}</p>
          </div>
        )}
      </div>

      {fotos.length > 0 && (
        <div className="mb-8">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Fotos do acidente ({fotos.length})</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {fotos.map((f: any) => (
              <a key={f.id} href={f.foto_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                <img src={f.foto_url} alt="Foto" className="w-32 h-32 object-cover rounded-lg border border-slate-700" />
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mb-8">
        <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Oficinas notificadas ({oficinasNotificadas.length})</p>
        {oficinasNotificadas.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma oficina notificada.</p>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            {oficinasNotificadas.map((o: any) => (
              <div key={o.id} className="flex items-center justify-between px-4 py-3 border-b border-slate-700 last:border-0">
                <div>
                  <p className="text-white text-sm">{o.oficina?.nome_fantasia}</p>
                  <p className="text-slate-500 text-xs">{o.distancia_km ? `${o.distancia_km.toFixed(1)}km` : ''}</p>
                </div>
                <span className={`text-xs font-medium ${o.respondeu ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {o.respondeu ? 'Respondeu' : 'Sem resposta'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-8">
        <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Conversa entre os motoristas ({mensagens.length})</p>
        {mensagens.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma mensagem trocada.</p>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2 max-h-80 overflow-y-auto">
            {mensagens.map((m: any) => (
              <div key={m.id} className="text-sm">
                <span className="text-slate-300 font-medium">{m.remetente_tipo === 'proprietario' ? emergencia.nome : (outroVeiculo?.nome || 'Outro motorista')}:</span>{' '}
                <span className="text-slate-400">{m.texto}</span>
                <span className="text-slate-600 text-xs ml-2">{formatDateTime(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
