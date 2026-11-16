'use client';

import { useState } from 'react';

// "Lembretes de hoje" (dono 16/11): todos os pedidos abertos de uma vez, um e-mail por
// oficina com todos os pedidos que ela ainda nao respondeu. Previa com caixas (o admin
// desmarca quem ja foi contatado por fora) -> enviar. Regra em lib/lembrar-oficinas.ts.
const MOTIVO: Record<string, string> = {
  orcou: 'já orçou', dispensou: 'não tem interesse', inativa: 'oficina inativa', dono_inativo: 'conta do dono desativada',
  sem_email: 'sem e-mail', conta_teste: 'conta de teste diferente', nao_atende: 'já não atende', aviso_recente: 'avisada há menos de 12 h',
  lembrada_recente: 'lembrada há pouco',
};

export default function LembretesHoje() {
  const [previa, setPrevia] = useState<{ oficinas: any[]; ficamFora: any[] } | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const abrir = async () => {
    setOcupado(true); setResultado(null);
    const res = await fetch('/api/admin/lembretes');
    const r = await res.json().catch(() => ({}));
    setOcupado(false);
    if (!res.ok) { setResultado(r.error || 'Erro ao montar a prévia.'); return; }
    setPrevia(r);
    setMarcadas(new Set((r.oficinas || []).map((o: any) => o.oficina_id)));
  };

  const enviar = async () => {
    if (!marcadas.size) return;
    setOcupado(true);
    const res = await fetch('/api/admin/lembretes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oficinaIds: Array.from(marcadas) }) });
    const r = await res.json().catch(() => ({}));
    setOcupado(false);
    if (!res.ok) { setResultado(r.error || 'Erro ao enviar.'); return; }
    setPrevia(null);
    setResultado((r.enviados || []).map((e: any) => `${e.nome} (pedidos ${e.pedidos.join(', ')}): e-mail ${e.email}`).join(' · ') || 'Nenhum lembrete enviado.');
  };

  return (
    <div className="mb-6">
      <button onClick={abrir} disabled={ocupado} data-testid="lembretes-hoje" className="text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-colors">
        {ocupado && !previa ? 'Calculando...' : 'Lembretes de hoje'}
      </button>
      {resultado && <p className="text-xs text-slate-400 mt-2" data-testid="lembretes-resultado">{resultado}</p>}
      {previa && (
        <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4" data-testid="lembretes-previa">
          <p className="text-slate-200 text-sm font-medium mb-2">Um e-mail por oficina, com todos os pedidos que ela ainda não respondeu</p>
          {previa.oficinas.length === 0 ? (
            <p className="text-slate-400 text-sm">Nenhuma oficina para lembrar agora.</p>
          ) : (
            <ul className="space-y-1 mb-3">
              {previa.oficinas.map((o: any) => (
                <li key={o.oficina_id} data-testid="lembretes-oficina" data-oficina={o.oficina_id}>
                  <label className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
                    <input type="checkbox" checked={marcadas.has(o.oficina_id)}
                      onChange={(e) => setMarcadas((m) => { const n = new Set(m); if (e.target.checked) n.add(o.oficina_id); else n.delete(o.oficina_id); return n; })} />
                    <span>{o.nome}</span>
                    <span className="text-slate-500 text-xs">{o.email} · pedidos {o.pedidos.map((p: any) => p.numero).join(', ')}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {previa.ficamFora.length > 0 && (
            <details className="mb-3">
              <summary className="text-slate-400 text-xs cursor-pointer">Ficam de fora ({previa.ficamFora.length})</summary>
              <ul className="text-xs text-slate-400 space-y-0.5 mt-1">
                {previa.ficamFora.map((f: any, i: number) => <li key={i} data-motivo={f.motivo}>Pedido {f.numero} · {f.nome}: {MOTIVO[f.motivo] || f.motivo}</li>)}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={enviar} disabled={ocupado || !marcadas.size} data-testid="lembretes-confirmar" className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {ocupado ? 'Enviando...' : `Enviar a ${marcadas.size} oficina(s)`}
            </button>
            <button onClick={() => setPrevia(null)} className="text-slate-300 text-sm px-4 py-2 rounded-lg border border-slate-600">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
