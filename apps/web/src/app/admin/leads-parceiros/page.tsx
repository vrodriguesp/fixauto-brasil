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
  pais: 'EE' | 'IT' | 'PT' | 'BR' | null;
}

const PAISES: Record<string, { nome: string; bandeira: string; ddi: string }> = {
  EE: { nome: 'Estônia', bandeira: '🇪🇪', ddi: '372' },
  IT: { nome: 'Itália', bandeira: '🇮🇹', ddi: '39' },
  PT: { nome: 'Portugal', bandeira: '🇵🇹', ddi: '351' },
  BR: { nome: 'Brasil', bandeira: '🇧🇷', ddi: '55' },
};
// numero com + ja tem o codigo do pais; senao usa o do mercado do interessado
const linkWhatsapp = (numero: string, pais: string | null) => {
  const digitos = numero.replace(/\D/g, '');
  if (numero.trim().startsWith('+') || !pais || !PAISES[pais]) return `https://wa.me/${digitos}`;
  return `https://wa.me/${PAISES[pais].ddi}${digitos.replace(/^0+/, '')}`;
};

export default function AdminLeadsParceirosPage() {
  const [leads, setLeads] = useState<LeadParceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'todos' | 'pendentes'>('pendentes');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pais, setPais] = useState<string>('todos');

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

  const doPais = pais === 'todos' ? leads : leads.filter((l) => (l.pais || '') === pais);
  const visiveis = filtro === 'pendentes' ? doPais.filter((l) => !l.contatado) : doPais;
  const paisesComLead = Array.from(new Set(leads.map((l) => l.pais || '')));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interessados em ser parceiro</h1>
          <p className="text-gray-600 mt-1">Contatos da página &quot;Seja parceiro&quot; de todos os países</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          <button onClick={() => setFiltro('pendentes')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${filtro === 'pendentes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            Pendentes ({doPais.filter((l) => !l.contatado).length})
          </button>
          <button onClick={() => setFiltro('todos')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${filtro === 'todos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            Todos ({doPais.length})
          </button>
        </div>
      </div>

      {paisesComLead.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="País">
          {['todos', ...paisesComLead].map((p) => (
            <button key={p || 'sem'} type="button" onClick={() => setPais(p)} aria-pressed={pais === p}
              className={`rounded-full border px-3 py-1.5 text-sm ${pais === p ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white text-gray-700'}`}>
              {p === 'todos' ? 'Todos os países' : p ? `${PAISES[p].bandeira} ${PAISES[p].nome}` : 'Sem país'} ({p === 'todos' ? leads.length : leads.filter((l) => (l.pais || '') === p).length})
            </button>
          ))}
        </div>
      )}

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
                    {lead.pais && PAISES[lead.pais] && <span className="text-xs text-gray-700">{PAISES[lead.pais].bandeira} {PAISES[lead.pais].nome}</span>}
                    <span className="text-xs text-gray-400">{timeAgo(lead.created_at)}</span>
                  </div>
                  <p className="font-semibold text-gray-900">{lead.nome_negocio}</p>
                  <p className="text-sm text-gray-600">{lead.nome_responsavel} · {lead.cidade}, {lead.estado}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    <a href={linkWhatsapp(lead.whatsapp, lead.pais)} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline font-medium">
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
