'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/utils';

interface LeadParceiro {
  id: string;
  tipo: 'oficina' | 'loja_pecas';
  nome_responsavel: string;
  nome_negocio: string;
  cidade: string;
  estado: string;
  whatsapp: string;
  email: string | null;
  observacao: string | null;
  contatado: boolean;
  created_at: string;
}

export default function AdminLeadsParceirosPage() {
  const [leads, setLeads] = useState<LeadParceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'todos' | 'pendentes'>('pendentes');
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchLeads = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('leads_parceiros')
      .select('*')
      .order('created_at', { ascending: false });
    setLeads((data as LeadParceiro[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, []);

  const marcarContatado = async (id: string, contatado: boolean) => {
    setBusyId(id);
    await fetch('/api/admin/leads-parceiros', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, contatado }),
    });
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, contatado } : l)));
    setBusyId(null);
  };

  const visiveis = filtro === 'pendentes' ? leads.filter((l) => !l.contatado) : leads;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interessados em ser parceiro</h1>
          <p className="text-gray-600 mt-1">Leads recebidos pela página /seja-parceiro</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          <button onClick={() => setFiltro('pendentes')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${filtro === 'pendentes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            Pendentes ({leads.filter((l) => !l.contatado).length})
          </button>
          <button onClick={() => setFiltro('todos')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${filtro === 'todos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            Todos ({leads.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-24 bg-gray-200 rounded-xl" />
          <div className="h-24 bg-gray-200 rounded-xl" />
        </div>
      ) : visiveis.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">Nenhum interessado {filtro === 'pendentes' ? 'pendente' : 'ainda'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visiveis.map((lead) => (
            <div key={lead.id} className={`card ${lead.contatado ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${lead.tipo === 'oficina' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {lead.tipo === 'oficina' ? 'Oficina' : 'Loja de peças'}
                    </span>
                    <span className="text-xs text-gray-400">{timeAgo(lead.created_at)}</span>
                  </div>
                  <p className="font-semibold text-gray-900">{lead.nome_negocio}</p>
                  <p className="text-sm text-gray-600">{lead.nome_responsavel} · {lead.cidade}, {lead.estado}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    <a href={`https://wa.me/55${lead.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline font-medium">
                      WhatsApp: {lead.whatsapp}
                    </a>
                    {lead.email && <span className="ml-3">{lead.email}</span>}
                  </p>
                  {lead.observacao && <p className="text-sm text-gray-500 mt-2 italic">&quot;{lead.observacao}&quot;</p>}
                </div>
                <button
                  onClick={() => marcarContatado(lead.id, !lead.contatado)}
                  disabled={busyId === lead.id}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg flex-shrink-0 disabled:opacity-50 ${lead.contatado ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
                >
                  {lead.contatado ? 'Reabrir' : 'Marcar contatado'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
