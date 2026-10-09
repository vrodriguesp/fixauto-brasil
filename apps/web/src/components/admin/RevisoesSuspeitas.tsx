'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Linha {
  oficinaId: string; nome: string; propostas: number; aumentoMedio: number;
  recusadas: number; retiradas: number; ultimoMotivo: string; alerta: boolean;
}

// Monitoramento de "orcamento baixo para ganhar, depois sobe" (migracao 049):
// propostas de revisao feitas DEPOIS do aceite, por oficina, nos ultimos 90
// dias. Alerta: alguma terminou com o carro retirado, ou 2+ propostas com
// aumento medio acima de 20%.
export default function RevisoesSuspeitas() {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);

  useEffect(() => {
    (async () => {
      const desde = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data } = await supabase.from('orcamento_revisoes')
        .select('oficina_id, valor_anterior, valor_novo, status, motivo, created_at, oficina:oficinas(nome_fantasia)')
        .gte('created_at', desde).order('created_at', { ascending: false }).limit(2000);
      const por: Record<string, Linha & { somaPct: number }> = {};
      for (const r of (data || []) as any[]) {
        const l = por[r.oficina_id] ||= { oficinaId: r.oficina_id, nome: r.oficina?.nome_fantasia || '—', propostas: 0, aumentoMedio: 0, recusadas: 0, retiradas: 0, ultimoMotivo: r.motivo, alerta: false, somaPct: 0 };
        l.propostas++;
        if (Number(r.valor_anterior) > 0) l.somaPct += ((Number(r.valor_novo) - Number(r.valor_anterior)) / Number(r.valor_anterior)) * 100;
        // desde 09/10 recusar = encerrar o servico (status 'retirada'); 'recusada' so em revisoes antigas
        if (r.status === 'recusada' || r.status === 'retirada') l.recusadas++;
        if (r.status === 'retirada') l.retiradas++;
      }
      setLinhas(Object.values(por).map((l) => {
        const aumentoMedio = Math.round(l.somaPct / l.propostas);
        return { ...l, aumentoMedio, alerta: l.recusadas > 0 || (l.propostas >= 2 && aumentoMedio > 20) };
      }).sort((a, b) => Number(b.alerta) - Number(a.alerta) || b.aumentoMedio - a.aumentoMedio));
    })();
  }, []);

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <h2 className="text-lg font-semibold text-white mb-1">Revisões de orçamento depois do aceite (90 dias)</h2>
      <p className="text-sm text-slate-400 mb-4">Oficinas que dão um preço baixo e depois pedem mais. Recusar = o cliente encerra o serviço e retira o carro. Alerta: alguma recusa, ou 2+ propostas com aumento médio acima de 20%.</p>
      {linhas === null ? <p className="text-slate-400 text-sm">Carregando…</p> : linhas.length === 0 ? (
        <p className="text-slate-400 text-sm">Nenhuma revisão no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-400">
              <th className="py-2 pr-4">Oficina</th><th className="py-2 pr-4">Propostas</th><th className="py-2 pr-4">Aumento médio</th>
              <th className="py-2 pr-4">Recusadas (carro retirado)</th><th className="py-2">Último motivo</th>
            </tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.oficinaId} className={`border-t border-slate-700 ${l.alerta ? 'text-amber-300' : 'text-slate-200'}`}>
                  <td className="py-2 pr-4"><Link href={`/admin/oficinas/${l.oficinaId}`} className="underline">{l.alerta ? '⚠️ ' : ''}{l.nome}</Link></td>
                  <td className="py-2 pr-4">{l.propostas}</td>
                  <td className="py-2 pr-4">{l.aumentoMedio > 0 ? '+' : ''}{l.aumentoMedio}%</td>
                  <td className="py-2 pr-4">{l.recusadas}</td>
                  <td className="py-2 max-w-xs truncate" title={l.ultimoMotivo}>{l.ultimoMotivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
