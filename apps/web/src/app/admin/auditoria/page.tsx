'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';

const ENTIDADE_LABEL: Record<string, string> = {
  solicitacao: 'Solicitação',
  orcamento: 'Orçamento',
  agenda: 'Agendamento',
  etapa: 'Etapa do conserto',
  emergencia: 'Emergência',
  pedido_peca: 'Pedido de peça',
  oficina: 'Oficina',
  loja: 'Loja',
  plataforma_config: 'Comissão global',
  comissao_lancamento: 'Lançamento de comissão',
  comissao_pecas_lancamento: 'Lançamento de comissão (peças)',
};

function resumo(v: any): string {
  if (v == null) return '—';
  if (typeof v !== 'object') return String(v);
  return Object.entries(v)
    .filter(([k]) => !['id', 'agenda_id', 'funcionario_id', 'created_at', 'oficinas'].includes(k))
    .map(([k, val]) => `${k}: ${typeof val === 'number' && k.includes('taxa') ? `${(val * 100).toFixed(2)}%` : typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val) ? formatDateTime(val) : String(val ?? '—')}`)
    .join(' · ');
}

// Tudo o que o admin mudou em dados de outras pessoas: status corrigidos,
// agendamentos, etapas, comissao global/individual, selo de fundador.
export default function AdminAuditoriaPage() {
  const [linhas, setLinhas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [entidade, setEntidade] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/auditoria?limit=300${entidade ? `&entidade=${entidade}` : ''}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setLinhas)
      .finally(() => setLoading(false));
  }, [entidade]);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-white mb-1">Histórico do admin</h1>
      <p className="text-slate-400 text-sm mb-6">Quem mudou o quê, quando e por quê. Nada aqui pode ser apagado pela interface.</p>

      <select value={entidade} onChange={(e) => setEntidade(e.target.value)} className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 mb-4">
        <option value="">Tudo</option>
        {Object.entries(ENTIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>

      {loading ? (
        <p className="text-slate-400">Carregando...</p>
      ) : linhas.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center text-slate-400">Nenhuma ação registrada ainda.</div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 divide-y divide-slate-700">
          {linhas.map((h) => (
            <div key={h.id} className="p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-white font-medium">
                  {ENTIDADE_LABEL[h.entidade] || h.entidade} · <span className="text-slate-300 font-normal">{h.acao.replace(/_/g, ' ')}</span>
                </p>
                <p className="text-slate-500 text-xs">{formatDateTime(h.created_at)} · {h.admin?.nome || h.admin?.email || 'admin'}</p>
              </div>
              {h.motivo && <p className="text-amber-200/90 text-xs mt-1">Motivo: {h.motivo}</p>}
              <p className="text-slate-400 text-xs mt-1 break-words">Antes: {resumo(h.antes)}</p>
              <p className="text-slate-400 text-xs break-words">Depois: {resumo(h.depois)}</p>
              {h.solicitacao_id && (
                <Link href={`/admin/solicitacoes/${h.solicitacao_id}`} className="text-blue-400 hover:underline text-xs mt-1 inline-block">Ver solicitação →</Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
