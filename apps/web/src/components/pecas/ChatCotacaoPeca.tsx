'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/image-compress';
import type { CotacaoPecaMensagem, TipoFornecedorPeca } from '@fixauto/shared';

interface Props {
  cotacaoId: string;
  fornecedorTipo: TipoFornecedorPeca;
  fornecedorId: string;
  titulo: string;
  subtitulo?: string;
}

/**
 * Thread de chat entre a oficina dona de uma cotacao de peca e um dos
 * fornecedores (loja ou oficina) que respondeu. Uma cotacao pode ter varias
 * respostas -> a conversa e por par (cotacao, fornecedor), pra nao vazar
 * entre concorrentes (mesma logica de "lance fechado" das respostas).
 */
export default function ChatCotacaoPeca({ cotacaoId, fornecedorTipo, fornecedorId, titulo, subtitulo }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<CotacaoPecaMensagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('cotacoes_pecas_mensagens')
      .select('*, remetente:profiles!cotacoes_pecas_mensagens_remetente_id_fkey(nome, tipo)')
      .eq('cotacao_id', cotacaoId)
      .eq('fornecedor_tipo', fornecedorTipo)
      .eq('fornecedor_id', fornecedorId)
      .order('created_at', { ascending: true });
    setMessages((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchMessages(); }, [cotacaoId, fornecedorTipo, fornecedorId]);

  useEffect(() => {
    const channel = supabase
      .channel(`pecas-msgs-${cotacaoId}-${fornecedorTipo}-${fornecedorId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cotacoes_pecas_mensagens', filter: `cotacao_id=eq.${cotacaoId}` },
        async (payload) => {
          if ((payload.new as any).fornecedor_id !== fornecedorId) return;
          const { data } = await supabase
            .from('cotacoes_pecas_mensagens')
            .select('*, remetente:profiles!cotacoes_pecas_mensagens_remetente_id_fkey(nome, tipo)')
            .eq('id', (payload.new as any).id)
            .single();
          if (data) {
            setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as any]));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cotacaoId, fornecedorTipo, fornecedorId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!texto.trim() || !user || sending) return;
    const value = texto.trim();
    setTexto('');
    setSending(true);
    await supabase.from('cotacoes_pecas_mensagens').insert({
      cotacao_id: cotacaoId,
      fornecedor_tipo: fornecedorTipo,
      fornecedor_id: fornecedorId,
      remetente_id: user.id,
      texto: value,
    });
    await fetchMessages();
    setSending(false);
  };

  const handleImagem = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingImg(true);
    try {
      const compressed = await compressImage(file);
      const ext = compressed.name.split('.').pop() || 'jpg';
      const path = `pecas-mensagens/${cotacaoId}/${fornecedorId}/${Date.now()}.${ext}`;
      const { data: uploadData } = await supabase.storage
        .from('damage-photos')
        .upload(path, compressed, { contentType: compressed.type });
      if (uploadData?.path) {
        const { data: urlData } = supabase.storage.from('damage-photos').getPublicUrl(uploadData.path);
        await supabase.from('cotacoes_pecas_mensagens').insert({
          cotacao_id: cotacaoId,
          fornecedor_tipo: fornecedorTipo,
          fornecedor_id: fornecedorId,
          remetente_id: user.id,
          imagem_url: urlData.publicUrl,
        });
        await fetchMessages();
      }
    } finally {
      setUploadingImg(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-3xl mx-auto">
      <div className="bg-white border-b px-4 py-3 flex-shrink-0">
        <h1 className="font-semibold text-gray-900 text-sm">{titulo}</h1>
        {subtitulo && <p className="text-xs text-gray-500">{subtitulo}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-gray-500 text-sm">Nenhuma mensagem ainda.</p>
            <p className="text-gray-400 text-xs mt-1">Tire dúvidas sobre a peça, prazo ou envie uma foto.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg) => {
              const isOwn = msg.remetente_id === user?.id;
              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-2xl ${isOwn ? 'bg-primary-600 text-white rounded-br-md' : 'bg-white text-gray-900 rounded-bl-md shadow-sm'}`}>
                    {!isOwn && msg.remetente?.nome && (
                      <p className="text-xs font-medium text-primary-600 mb-0.5">{msg.remetente.nome}</p>
                    )}
                    {msg.imagem_url ? (
                      <a href={msg.imagem_url} target="_blank" rel="noopener noreferrer">
                        <img src={msg.imagem_url} alt="Foto enviada" className="rounded-lg max-w-full max-h-64 object-cover" />
                      </a>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.texto}</p>
                    )}
                    <p className={`text-[10px] mt-1 ${isOwn ? 'text-primary-200' : 'text-gray-400'} text-right`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="bg-white border-t px-4 py-3 flex-shrink-0">
        {uploadingImg ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-500">Enviando foto...</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagem} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
              title="Enviar foto"
              type="button"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Digite sua mensagem..."
              className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <button
              onClick={handleSend}
              disabled={sending || !texto.trim()}
              className="w-10 h-10 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-full flex items-center justify-center transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
