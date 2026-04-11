'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

interface Mensagem {
  id: string;
  solicitacao_id: string;
  remetente_id: string;
  texto: string;
  lida: boolean;
  created_at: string;
  remetente?: {
    nome: string;
    tipo: string;
  };
}

interface SolicitacaoInfo {
  id: string;
  descricao: string;
  veiculo?: {
    fipe_marca: string;
    fipe_modelo: string;
    fipe_ano: string;
    placa: string;
  };
}

interface OficinaInfo {
  nome_fantasia: string;
}

export default function ClienteMensagensPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const [messages, setMessages] = useState<Mensagem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [solicitacao, setSolicitacao] = useState<SolicitacaoInfo | null>(null);
  const [oficina, setOficina] = useState<OficinaInfo | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch solicitacao info and the oficina from the accepted orcamento
  useEffect(() => {
    async function fetchInfo() {
      const { data: sol } = await supabase
        .from('solicitacoes')
        .select('id, descricao, veiculo:veiculos!solicitacoes_veiculo_id_fkey(fipe_marca, fipe_modelo, fipe_ano, placa)')
        .eq('id', id)
        .single();

      if (sol) {
        setSolicitacao(sol as unknown as SolicitacaoInfo);
      }

      // Try to find the oficina from orcamentos for this solicitacao
      const { data: orc } = await supabase
        .from('orcamentos')
        .select('oficina:oficinas!orcamentos_oficina_id_fkey(nome_fantasia)')
        .eq('solicitacao_id', id)
        .eq('status', 'aceito')
        .single();

      if (orc?.oficina) {
        setOficina(orc.oficina as unknown as OficinaInfo);
      } else {
        // Fallback: get any oficina that sent an orcamento
        const { data: anyOrc } = await supabase
          .from('orcamentos')
          .select('oficina:oficinas!orcamentos_oficina_id_fkey(nome_fantasia)')
          .eq('solicitacao_id', id)
          .limit(1)
          .single();

        if (anyOrc?.oficina) {
          setOficina(anyOrc.oficina as unknown as OficinaInfo);
        }
      }
    }
    fetchInfo();
  }, [id]);

  // Fetch messages
  useEffect(() => {
    async function fetchMessages() {
      setLoading(true);
      const { data } = await supabase
        .from('mensagens')
        .select('*, remetente:profiles!mensagens_remetente_id_fkey(nome, tipo)')
        .eq('solicitacao_id', id)
        .order('created_at', { ascending: true });

      if (data) {
        setMessages(data as Mensagem[]);
      }
      setLoading(false);
    }
    fetchMessages();
  }, [id]);

  // Mark messages as read
  useEffect(() => {
    if (!user || messages.length === 0) return;
    const unread = messages.filter((m) => !m.lida && m.remetente_id !== user.id);
    if (unread.length > 0) {
      supabase
        .from('mensagens')
        .update({ lida: true })
        .eq('solicitacao_id', id)
        .neq('remetente_id', user.id)
        .then();
    }
  }, [messages, user, id]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`msgs-cliente-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
          filter: `solicitacao_id=eq.${id}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('mensagens')
            .select('*, remetente:profiles!mensagens_remetente_id_fkey(nome, tipo)')
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages((prev) => {
              // Skip if already exists (by real id)
              if (prev.some((m) => m.id === data.id)) return prev;
              // Replace optimistic temp message if it matches
              const tempIndex = prev.findIndex(
                (m) => m.id.startsWith('temp-') && m.remetente_id === data.remetente_id && m.texto === data.texto
              );
              if (tempIndex >= 0) {
                const updated = [...prev];
                updated[tempIndex] = data as Mensagem;
                return updated;
              }
              return [...prev, data as Mensagem];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || sending) return;

    const texto = newMessage.trim();
    setNewMessage('');
    setSending(true);

    const { error } = await supabase.from('mensagens').insert({
      solicitacao_id: id,
      remetente_id: user.id,
      texto,
    });

    if (!error) {
      // Optimistically add to local state
      setMessages(prev => [...prev, {
        id: `temp-${Date.now()}`,
        solicitacao_id: id,
        remetente_id: user.id,
        texto,
        lida: false,
        created_at: new Date().toISOString(),
        remetente: { nome: user.nome, tipo: user.tipo },
      }]);

      // Notify the oficina
      const { data: orcs } = await supabase.from('orcamentos').select('oficina:oficinas(profile_id)').eq('solicitacao_id', id).limit(1);
      if (orcs?.[0]?.oficina) {
        try {
          await supabase.from('notificacoes').insert({
            profile_id: (orcs[0].oficina as any).profile_id,
            tipo: 'nova_mensagem',
            titulo: 'Nova mensagem do cliente',
            mensagem: texto.slice(0, 100),
            dados: { solicitacao_id: id },
          });
        } catch { /* non-blocking */ }
      }
    }

    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateSeparator = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Hoje';
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const shouldShowDateSeparator = (index: number) => {
    if (index === 0) return true;
    const current = new Date(messages[index].created_at).toDateString();
    const previous = new Date(messages[index - 1].created_at).toDateString();
    return current !== previous;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Link
          href={`/cliente/orcamentos/${id}`}
          className="text-gray-500 hover:text-gray-700"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <div>
          <h1 className="font-semibold text-gray-900 text-sm">
            {oficina?.nome_fantasia || 'Oficina'}
          </h1>
          <p className="text-xs text-gray-500">
            {solicitacao?.veiculo
              ? `${solicitacao.veiculo.fipe_marca} ${solicitacao.veiculo.fipe_modelo}`
              : 'Carregando...'}
          </p>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm">Nenhuma mensagem ainda.</p>
            <p className="text-gray-400 text-xs mt-1">Envie a primeira mensagem para a oficina.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg, index) => {
              const isOwn = msg.remetente_id === user?.id;
              return (
                <div key={msg.id}>
                  {shouldShowDateSeparator(index) && (
                    <div className="flex justify-center my-4">
                      <span className="bg-white text-gray-500 text-xs px-3 py-1 rounded-full shadow-sm">
                        {formatDateSeparator(msg.created_at)}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1`}>
                    <div
                      className={`max-w-[75%] px-3 py-2 rounded-2xl ${
                        isOwn
                          ? 'bg-primary-600 text-white rounded-br-md'
                          : 'bg-white text-gray-900 rounded-bl-md shadow-sm'
                      }`}
                    >
                      {!isOwn && msg.remetente?.nome && (
                        <p className="text-xs font-medium text-orange-600 mb-0.5">
                          {msg.remetente.nome}
                        </p>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.texto}</p>
                      <p
                        className={`text-[10px] mt-1 ${
                          isOwn ? 'text-primary-200' : 'text-gray-400'
                        } text-right`}
                      >
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="bg-white border-t px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="w-10 h-10 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
