'use client';

import { useState } from 'react';

// Correcao manual de status pelo admin (via /api/admin/corrigir): troca o
// status, exige motivo e registra no historico. Usado onde so o status
// precisa de correcao (emergencia, pedido de peca...).
export default function CorrigirStatus({
  entidade,
  id,
  atual,
  opcoes,
  onFeito,
}: {
  entidade: 'emergencia' | 'pedido_peca' | 'orcamento';
  id: string;
  atual: string;
  opcoes: Record<string, string>;
  onFeito?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [status, setStatus] = useState(atual);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="text-amber-400 hover:text-amber-300 text-xs font-medium">
        ✏️ Corrigir status
      </button>
    );
  }

  const salvar = async () => {
    setEnviando(true);
    setMsg(null);
    const res = await fetch('/api/admin/corrigir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entidade, id, alteracoes: { status }, motivo }),
    });
    const r = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) return setMsg(r.error || 'Erro ao corrigir');
    setAberto(false);
    setMotivo('');
    onFeito?.();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5">
        {Object.entries(opcoes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (obrigatório)"
        className="min-w-[180px] flex-1 bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5"
      />
      <button
        onClick={salvar}
        disabled={enviando || status === atual || motivo.trim().length < 3}
        className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
      >
        Salvar
      </button>
      <button onClick={() => { setAberto(false); setStatus(atual); }} className="text-slate-400 hover:text-white text-xs">Cancelar</button>
      {msg && <p className="w-full text-xs text-red-400">{msg}</p>}
    </div>
  );
}
