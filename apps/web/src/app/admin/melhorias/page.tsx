'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/utils';

// Respostas da pagina "Melhorias" das oficinas (migracao 084): pesquisa do calendario (uma por oficina) e
// sugestoes. So leitura (RLS: eh_admin le tudo).

const ROTULOS: Record<string, Record<string, string>> = {
  como_marcam: { telefone: 'Telefone', mensageiro: 'WhatsApp/Messenger', email: 'E-mail', site: 'Site próprio', programa: 'Programa de oficina', papel: 'Caderno/agenda de papel', outro: 'Outro' },
  programa: { nenhum: 'Nenhum', google: 'Google Agenda', outlook: 'Outlook', planilha: 'Excel/planilha', programa_oficina: 'Programa de oficina', outro: 'Outro' },
  carros_dia: { '1-3': '1–3', '4-8': '4–8', '9-15': '9–15', '15+': 'mais de 15' },
  hora_cliente: { exata: 'Hora exata', faixa: 'Faixa de 1–2 h', manha_tarde: 'Manhã ou tarde', telefone: 'Combinam por telefone' },
  calendario_externo: { sim: 'Sim', talvez: 'Talvez', nao: 'Não' },
};
const r = (campo: string, v: string | null | undefined) => (v ? ROTULOS[campo]?.[v] || v : '—');

interface Resposta {
  oficina_id: string; como_marcam: string[]; como_marcam_outro: string | null; programa: string | null; programa_nome: string | null;
  carros_dia: string | null; hora_cliente: string | null; calendario_externo: string | null; maior_tempo: string | null; updated_at: string;
  oficina: { nome_fantasia: string; cidade: string | null } | null;
}
interface Sugestao { id: string; texto: string; created_at: string; oficina: { nome_fantasia: string } | null }

export default function AdminMelhoriasPage() {
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<'pesquisa' | 'sugestoes'>('pesquisa');

  useEffect(() => {
    (async () => {
      const [{ data: a }, { data: b }] = await Promise.all([
        supabase.from('oficina_pesquisa_calendario').select('*, oficina:oficinas(nome_fantasia, cidade)').order('updated_at', { ascending: false }),
        supabase.from('oficina_sugestoes').select('id, texto, created_at, oficina:oficinas(nome_fantasia)').order('created_at', { ascending: false }).limit(500),
      ]);
      setRespostas((a as unknown as Resposta[]) || []);
      setSugestoes((b as unknown as Sugestao[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white">Melhorias (oficinas)</h1>
      <p className="text-slate-400 text-sm mt-1">Pesquisa do calendário e sugestões enviadas pelas oficinas na página &quot;Melhorias&quot;.</p>

      <div className="mt-4 mb-4 flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setAba('pesquisa')} data-testid="admin-mel-aba-pesquisa" className={`px-4 py-2 text-sm font-medium rounded-md ${aba === 'pesquisa' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>
          Pesquisa ({respostas.length})
        </button>
        <button onClick={() => setAba('sugestoes')} data-testid="admin-mel-aba-sugestoes" className={`px-4 py-2 text-sm font-medium rounded-md ${aba === 'sugestoes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>
          Sugestões ({sugestoes.length})
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4"><div className="h-24 bg-gray-200 rounded-xl" /><div className="h-24 bg-gray-200 rounded-xl" /></div>
      ) : aba === 'pesquisa' ? (
        respostas.length === 0 ? <div className="card text-center py-12 text-gray-500">Nenhuma resposta ainda</div> : (
          <div className="space-y-3" data-testid="admin-mel-respostas">
            {respostas.map((x) => (
              <div key={x.oficina_id} className="card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-gray-900">{x.oficina?.nome_fantasia || x.oficina_id}{x.oficina?.cidade ? ` · ${x.oficina.cidade}` : ''}</p>
                  <span className="text-xs text-gray-400">{timeAgo(x.updated_at)}</span>
                </div>
                <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                  <dt className="text-gray-500">1. Como marcam</dt>
                  <dd className="text-gray-900">{x.como_marcam?.length ? x.como_marcam.map((v) => r('como_marcam', v)).join(', ') : '—'}{x.como_marcam_outro ? ` (${x.como_marcam_outro})` : ''}</dd>
                  <dt className="text-gray-500">2. Programa</dt>
                  <dd className="text-gray-900">{r('programa', x.programa)}{x.programa_nome ? ` (${x.programa_nome})` : ''}</dd>
                  <dt className="text-gray-500">3. Carros/dia</dt>
                  <dd className="text-gray-900">{r('carros_dia', x.carros_dia)}</dd>
                  <dt className="text-gray-500">4. Hora ao cliente</dt>
                  <dd className="text-gray-900">{r('hora_cliente', x.hora_cliente)}</dd>
                  <dt className="text-gray-500">5. Google/Outlook</dt>
                  <dd className="text-gray-900">{r('calendario_externo', x.calendario_externo)}</dd>
                  <dt className="text-gray-500">6. Mais toma tempo</dt>
                  <dd className="text-gray-900 whitespace-pre-wrap break-words">{x.maior_tempo || '—'}</dd>
                </dl>
              </div>
            ))}
          </div>
        )
      ) : (
        sugestoes.length === 0 ? <div className="card text-center py-12 text-gray-500">Nenhuma sugestão ainda</div> : (
          <div className="space-y-3" data-testid="admin-mel-sugestoes">
            {sugestoes.map((s) => (
              <div key={s.id} className="card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-gray-900">{s.oficina?.nome_fantasia || '—'}</p>
                  <span className="text-xs text-gray-400">{timeAgo(s.created_at)}</span>
                </div>
                <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words">{s.texto}</p>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
