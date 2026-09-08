'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { VeiculoNotaInterna } from '@fixauto/shared';

interface Props {
  agendaId: string;
  oficinaId: string;
  /** profile_id de quem esta atribuido a esse veiculo agora, se houver - recebe notificacao junto com o dono. */
  funcionarioResponsavelProfileId?: string | null;
  veiculoLabel: string;
}

/**
 * Comunicacao interna da equipe da oficina sobre um veiculo especifico -
 * mecanico, dono e administrativo conversam aqui (observacoes, duvidas,
 * combinados) sem que nada disso vaze pro cliente. Diferente do chat
 * "Mensagem" (que fala com o cliente).
 */
export default function NotasInternas({ agendaId, oficinaId, funcionarioResponsavelProfileId, veiculoLabel }: Props) {
  const { user, oficina } = useAuth();
  const [notas, setNotas] = useState<VeiculoNotaInterna[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const fetchNotas = async () => {
    const { data } = await supabase
      .from('veiculo_notas_internas')
      .select('*, remetente:profiles!veiculo_notas_internas_remetente_id_fkey(nome)')
      .eq('agenda_id', agendaId)
      .order('created_at', { ascending: true });
    setNotas((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchNotas(); }, [agendaId]);

  useEffect(() => {
    const channel = supabase
      .channel(`notas-internas-${agendaId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'veiculo_notas_internas', filter: `agenda_id=eq.${agendaId}` },
        async (payload) => {
          const { data } = await supabase
            .from('veiculo_notas_internas')
            .select('*, remetente:profiles!veiculo_notas_internas_remetente_id_fkey(nome)')
            .eq('id', (payload.new as any).id)
            .single();
          if (data) setNotas((prev) => (prev.some((n) => n.id === data.id) ? prev : [...prev, data as any]));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [agendaId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [notas]);

  const handleEnviar = async () => {
    if (!texto.trim() || !user || !oficina || enviando) return;
    setEnviando(true);
    const valor = texto.trim();
    setTexto('');

    await supabase.from('veiculo_notas_internas').insert({
      agenda_id: agendaId,
      oficina_id: oficinaId,
      remetente_id: user.id,
      texto: valor,
    });

    // Notifica o dono da oficina e o mecanico responsavel (quem nao for o
    // proprio remetente) - a tela deles atualiza na hora via realtime.
    const destinatarios = new Set<string>();
    if (oficina.profile_id && oficina.profile_id !== user.id) destinatarios.add(oficina.profile_id);
    if (funcionarioResponsavelProfileId && funcionarioResponsavelProfileId !== user.id) destinatarios.add(funcionarioResponsavelProfileId);

    for (const profileId of Array.from(destinatarios)) {
      await supabase.from('notificacoes').insert({
        profile_id: profileId,
        tipo: 'nota_interna_veiculo',
        titulo: 'Nova nota interna',
        mensagem: `${user.nome}: "${valor.slice(0, 80)}" - ${veiculoLabel}`,
        dados: { agenda_id: agendaId },
      });
    }

    setEnviando(false);
  };

  return (
    <div className="mt-3 bg-amber-50/50 border border-amber-200 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Notas internas (não vai pro cliente)</h4>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">Carregando...</p>
      ) : notas.length === 0 ? (
        <p className="text-xs text-gray-400 mb-2">Nenhuma nota ainda. Use pra avisar a equipe sobre esse veículo.</p>
      ) : (
        <div className="space-y-1.5 mb-2 max-h-48 overflow-y-auto">
          {notas.map((n) => (
            <div key={n.id} className={`text-xs px-2.5 py-1.5 rounded-lg ${n.remetente_id === user?.id ? 'bg-amber-100 text-amber-900 ml-6' : 'bg-white text-gray-700 border border-gray-200 mr-6'}`}>
              <p className="font-medium text-[11px] text-gray-500">{n.remetente?.nome || 'Equipe'} · {new Date(n.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
              <p className="whitespace-pre-wrap break-words">{n.texto}</p>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar(); } }}
          onClick={(e) => e.stopPropagation()}
          placeholder="Escrever nota pra equipe..."
          className="flex-1 border border-amber-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
        <button
          onClick={(e) => { e.stopPropagation(); handleEnviar(); }}
          disabled={enviando || !texto.trim()}
          className="text-xs font-medium text-amber-700 hover:text-amber-900 disabled:opacity-40 flex-shrink-0"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
