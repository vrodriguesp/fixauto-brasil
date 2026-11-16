'use client';

import TextoTraduzido from '@/components/ui/TextoTraduzido';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/image-compress';
import { INTL_LOCALE } from '@/lib/utils';
import type { CotacaoPecaMensagem, TipoFornecedorPeca } from '@fixauto/shared';
import MidiaPrivada from '@/components/midia/MidiaPrivada';

interface Props {
  cotacaoId: string;
  fornecedorTipo: TipoFornecedorPeca;
  fornecedorId: string;
  titulo: string;
  subtitulo?: string;
  /** botao Voltar dentro do cabecalho do chat (M11: antes ficava acima e saia da tela) */
  onVoltar?: () => void;
  voltarLabel?: string;
}

/**
 * Thread de chat entre a oficina dona de uma cotacao de peca e um dos
 * fornecedores (loja ou oficina) que respondeu. Uma cotacao pode ter varias
 * respostas -> a conversa e por par (cotacao, fornecedor), pra nao vazar
 * entre concorrentes (mesma logica de "lance fechado" das respostas).
 */
export default function ChatCotacaoPeca({ cotacaoId, fornecedorTipo, fornecedorId, titulo, subtitulo, onVoltar, voltarLabel }: Props) {
  const { user } = useAuth();
  const locale = useLocale();
  const tChat = useTranslations('chatCotacaoPeca');
  const [messages, setMessages] = useState<CotacaoPecaMensagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  // A1 (16/11): mensagens da outra parte viram lidas ao abrir a conversa (o cartao
  // do pedido mostra quantas nao lidas ha em cada conversa)
  const marcarLidas = async () => {
    if (!user) return;
    await supabase.from('cotacoes_pecas_mensagens').update({ lida: true })
      .eq('cotacao_id', cotacaoId).eq('fornecedor_tipo', fornecedorTipo).eq('fornecedor_id', fornecedorId)
      .neq('remetente_id', user.id).eq('lida', false);
  };
  // A2 (16/11): aviso (sino; e-mail no maximo 1 por hora) para a outra parte
  const avisarOutraParte = (mensagemId?: string) => {
    if (!mensagemId) return;
    fetch('/api/notificar-mensagem-peca', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagemId }),
    }).catch(() => {});
  };

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
    if ((data || []).some((m: any) => !m.lida && m.remetente_id !== user?.id)) marcarLidas();
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMessages(); }, [cotacaoId, fornecedorTipo, fornecedorId, user?.id]);

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
            if ((data as any).remetente_id !== user?.id) marcarLidas();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotacaoId, fornecedorTipo, fornecedorId, user?.id]);

  // rola so a lista (antes scrollIntoView rolava a pagina inteira e o cabecalho sumia - M11)
  useEffect(() => { const el = listaRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages]);

  const handleSend = async () => {
    if (!texto.trim() || !user || sending) return;
    const value = texto.trim();
    setTexto('');
    setSending(true);
    const { data: nova } = await supabase.from('cotacoes_pecas_mensagens').insert({
      cotacao_id: cotacaoId,
      fornecedor_tipo: fornecedorTipo,
      fornecedor_id: fornecedorId,
      remetente_id: user.id,
      texto: value,
    }).select('id').single();
    avisarOutraParte(nova?.id);
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
        const { data: nova } = await supabase.from('cotacoes_pecas_mensagens').insert({
          cotacao_id: cotacaoId,
          fornecedor_tipo: fornecedorTipo,
          fornecedor_id: fornecedorId,
          remetente_id: user.id,
          imagem_url: urlData.publicUrl,
        }).select('id').single();
        avisarOutraParte(nova?.id);
        await fetchMessages();
      }
    } finally {
      setUploadingImg(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString(INTL_LOCALE[locale] || 'en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="altura-conversa flex flex-col max-w-3xl mx-auto bg-white" data-testid="chat-peca">
      <div className="bg-white border-b px-4 py-3 flex-shrink-0 flex items-center gap-3">
        {onVoltar && (
          <button type="button" onClick={onVoltar} aria-label={voltarLabel} title={voltarLabel} className="-ml-1 p-1 text-gray-500 hover:text-gray-700 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="min-w-0">
          <h1 className="font-semibold text-gray-900 text-sm truncate">{titulo}</h1>
          {subtitulo && <p className="text-xs text-gray-500 truncate">{subtitulo}</p>}
        </div>
      </div>

      <div ref={listaRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-gray-500 text-sm">{tChat('nenhuma')}</p>
            <p className="text-gray-400 text-xs mt-1">{tChat('dica')}</p>
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
                      <MidiaPrivada url={msg.imagem_url}>{(u) => (
<a href={u} target="_blank" rel="noopener noreferrer">
                        <img src={u} alt={tChat('fotoEnviada')} className="rounded-lg max-w-full max-h-64 object-cover" />
                      </a>
)}</MidiaPrivada>
                    ) : (
                      <TextoTraduzido texto={msg.texto} ativo={!isOwn} className="text-sm whitespace-pre-wrap break-words" />
                    )}
                    <p className={`text-[10px] mt-1 ${isOwn ? 'text-primary-200' : 'text-gray-400'} text-right`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="conversa-composer bg-white border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex-shrink-0">
        {uploadingImg ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-500">{tChat('enviandoFoto')}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={handleImagem} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
              title={tChat('enviarFoto')}
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
              placeholder={tChat('placeholder')}
              className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <button
              onClick={handleSend}
              disabled={sending || !texto.trim()}
              className="w-10 h-10 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-full flex items-center justify-center transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
