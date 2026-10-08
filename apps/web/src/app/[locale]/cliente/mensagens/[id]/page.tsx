'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import AudioRecorder from '@/components/ui/AudioRecorder';
import AudioMessage from '@/components/ui/AudioMessage';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';

interface Mensagem {
  id: string;
  solicitacao_id: string;
  remetente_id: string;
  texto: string;
  tipo?: string;
  audio_url?: string;
  audio_duracao_segundos?: number;
  transcricao?: string;
  transcricao_status?: string;
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
  const t = useTranslations('clienteMensagemDetalhe');
  const [erroEnvio, setErroEnvio] = useState(false);
  const locale = useLocale();
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const [messages, setMessages] = useState<Mensagem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [solicitacao, setSolicitacao] = useState<SolicitacaoInfo | null>(null);
  const [oficina, setOficina] = useState<OficinaInfo | null>(null);
  const [oficinaId, setOficinaId] = useState<string | null>(null);
  // ?pagador=1: quem abre e o responsavel pelo pagamento de um acidente -
  // conversa particular dele com a oficina (o cliente do pedido nao a ve)
  const [modoPagador, setModoPagador] = useState(false);
  const pagadorId = modoPagador ? (user?.id ?? null) : null;
  const [opcoesOficina, setOpcoesOficina] = useState<{ id: string; nome: string }[] | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const tGar = useTranslations('garantia');
  const [conversaFechada, setConversaFechada] = useState(false);
  useEffect(() => {
    const ofId = oficinaId;
    if (!ofId) return;
    supabase.rpc('conversa_aberta', { p_sol: id, p_of: ofId }).then(({ data }) => setConversaFechada(data === false));
  }, [id, oficinaId]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const { uploadAudio } = useAudioRecorder();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Cada oficina tem a sua conversa com o cliente: ?oficina=<id> diz qual.
  // Sem ele (link antigo, notificacao, botao geral): orcamento aceito -> essa
  // oficina; uma so oficina na conversa -> ela; varias -> o cliente escolhe.
  useEffect(() => {
    async function fetchInfo() {
      const params = new URLSearchParams(window.location.search);
      if (params.get('pagador') === '1') setModoPagador(true);
      const { data: sol } = await supabase
        .from('solicitacoes')
        .select('id, descricao, veiculo:veiculos!solicitacoes_veiculo_id_fkey(fipe_marca, fipe_modelo, fipe_ano, placa)')
        .eq('id', id)
        .single();

      if (sol) {
        setSolicitacao(sol as unknown as SolicitacaoInfo);
      }

      const pedida = new URLSearchParams(window.location.search).get('oficina');
      if (pedida) {
        setOficinaId(pedida);
        return;
      }
      const [{ data: orcs }, { data: msgs }] = await Promise.all([
        supabase.from('orcamentos').select('oficina_id, status, oficina:oficinas!orcamentos_oficina_id_fkey(nome_fantasia)').eq('solicitacao_id', id),
        supabase.from('mensagens').select('oficina_id').eq('solicitacao_id', id),
      ]);
      const aceito = (orcs || []).find((o: any) => o.status === 'aceito');
      if (aceito) {
        setOficinaId(aceito.oficina_id);
        return;
      }
      const nomes = new Map<string, string>();
      (orcs || []).forEach((o: any) => nomes.set(o.oficina_id, o.oficina?.nome_fantasia || ''));
      const semNome = (msgs || []).map((m: any) => m.oficina_id).filter((o: string) => !nomes.has(o));
      if (semNome.length) {
        const { data: ofs } = await supabase.from('oficinas').select('id, nome_fantasia').in('id', Array.from(new Set(semNome)));
        (ofs || []).forEach((o: any) => nomes.set(o.id, o.nome_fantasia || ''));
        semNome.forEach((o: string) => { if (!nomes.has(o)) nomes.set(o, ''); });
      }
      if (nomes.size === 1) {
        setOficinaId(Array.from(nomes.keys())[0]);
        return;
      }
      setOpcoesOficina(Array.from(nomes.entries()).map(([oid, nome]) => ({ id: oid, nome })));
      setLoading(false);
    }
    fetchInfo();
  }, [id]);

  // Nome da oficina desta conversa
  useEffect(() => {
    if (!oficinaId) return;
    supabase.from('oficinas').select('nome_fantasia').eq('id', oficinaId).maybeSingle()
      .then(({ data }) => { if (data) setOficina(data as OficinaInfo); });
  }, [oficinaId]);

  // Fetch messages
  useEffect(() => {
    if (!oficinaId || (modoPagador && !pagadorId)) return;
    async function fetchMessages() {
      setLoading(true);
      let q = supabase
        .from('mensagens')
        .select('*, remetente:profiles!mensagens_remetente_id_fkey(nome, tipo)')
        .eq('solicitacao_id', id)
        .eq('oficina_id', oficinaId!);
      q = pagadorId ? q.eq('pagador_id', pagadorId) : q.is('pagador_id', null);
      const { data } = await q.order('created_at', { ascending: true });

      if (data) {
        setMessages(data as Mensagem[]);
      }
      setLoading(false);
    }
    fetchMessages();
  }, [id, oficinaId, modoPagador, pagadorId]);

  // Mark messages as read
  useEffect(() => {
    if (!user || !oficinaId || messages.length === 0) return;
    const unread = messages.filter((m) => !m.lida && m.remetente_id !== user.id);
    if (unread.length > 0) {
      let q = supabase
        .from('mensagens')
        .update({ lida: true })
        .eq('solicitacao_id', id)
        .eq('oficina_id', oficinaId)
        .neq('remetente_id', user.id);
      q = pagadorId ? q.eq('pagador_id', pagadorId) : q.is('pagador_id', null);
      q.then();
    }
  }, [messages, user, id, oficinaId, pagadorId]);

  // Real-time subscription
  useEffect(() => {
    if (!oficinaId) return;
    const channel = supabase
      .channel(`msgs-cliente-${id}-${oficinaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
          filter: `solicitacao_id=eq.${id}`,
        },
        async (payload) => {
          if ((payload.new as any).oficina_id !== oficinaId || ((payload.new as any).pagador_id || null) !== pagadorId) return;
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
  }, [id, oficinaId, pagadorId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !oficinaId || sending) return;

    const texto = newMessage.trim();
    setNewMessage('');
    setSending(true);

    const { data: novaMsg, error } = await supabase.from('mensagens').insert({
      solicitacao_id: id,
      oficina_id: oficinaId,
      pagador_id: pagadorId,
      remetente_id: user.id,
      texto,
    }).select('id').single();

    if (error) {
      // nao some o texto: devolve ao campo e avisa
      console.error(error);
      setNewMessage(texto);
      setErroEnvio(true);
      setSending(false);
      return;
    }
    setErroEnvio(false);

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

      // aviso a quem recebe, pelo servidor (idioma dele; antes falhava sem aparecer)
      if (novaMsg?.id) fetch('/api/avisar-mensagem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagemId: novaMsg.id }) }).catch(() => {});
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

  const handleAudioRecorded = async (blob: Blob, audioDuration: number) => {
    if (!user || !oficinaId) return;
    setShowAudioRecorder(false);
    setUploadingAudio(true);

    try {
      const audioUrl = await uploadAudio(blob, id, oficinaId, pagadorId);
      if (!audioUrl) return;

      const { data: novaMsg, error } = await supabase.from('mensagens').insert({
        solicitacao_id: id,
        oficina_id: oficinaId,
        pagador_id: pagadorId,
        remetente_id: user.id,
        texto: '[Audio]',
        tipo: 'audio',
        audio_url: audioUrl,
        audio_duracao_segundos: audioDuration,
      }).select('id').single();

      if (!error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            solicitacao_id: id,
            remetente_id: user.id,
            texto: '[Audio]',
            tipo: 'audio',
            audio_url: audioUrl,
            audio_duracao_segundos: audioDuration,
            lida: false,
            created_at: new Date().toISOString(),
            remetente: { nome: user.nome, tipo: user.tipo },
          },
        ]);

        // aviso a quem recebe, pelo servidor (idioma dele; antes falhava sem aparecer)
        if (novaMsg?.id) fetch('/api/avisar-mensagem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagemId: novaMsg.id }) }).catch(() => {});
      }
    } finally {
      setUploadingAudio(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateSeparator = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return t('today');
    if (d.toDateString() === yesterday.toDateString()) return t('yesterday');
    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const shouldShowDateSeparator = (index: number) => {
    if (index === 0) return true;
    const current = new Date(messages[index].created_at).toDateString();
    const previous = new Date(messages[index - 1].created_at).toDateString();
    return current !== previous;
  };

  if (!oficinaId && opcoesOficina) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Link href="/cliente/mensagens" className="text-sm text-gray-500 hover:text-gray-700">&larr; {t('voltarConversas')}</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-3 mb-1">{t('escolherOficinaTitulo')}</h1>
        <p className="text-sm text-gray-500 mb-4">{t('escolherOficinaTexto')}</p>
        {opcoesOficina.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded-xl p-4">{t('semConversaAinda')}</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {opcoesOficina.map((o) => (
              <button key={o.id} type="button" onClick={() => setOficinaId(o.id)}
                className="w-full text-left px-4 py-4 min-h-[44px] hover:bg-gray-50 font-medium text-gray-900">
                {o.nome || t('workshopFallback')}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] h-[calc(100dvh-4rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Link
          href={modoPagador ? '/cliente/mensagens' : `/cliente/orcamentos/${id}`}
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
            {oficina?.nome_fantasia || t('workshopFallback')}
          </h1>
          <p className="text-xs text-gray-500">
            {modoPagador
              ? t('pagadorSubtitulo')
              : solicitacao?.veiculo
                ? `${solicitacao.veiculo.fipe_marca} ${solicitacao.veiculo.fipe_modelo}`
                : ''}
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
            <p className="text-gray-500 text-sm">{t('noMessagesYet')}</p>
            <p className="text-gray-400 text-xs mt-1">{t('sendFirstMessage')}</p>
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
                      {msg.tipo === 'audio' && msg.audio_url ? (
                        <AudioMessage
                          audioUrl={msg.audio_url}
                          duration={msg.audio_duracao_segundos || 0}
                          transcricao={msg.transcricao}
                          transcricaoStatus={msg.transcricao_status}
                          mensagemId={msg.id}
                        />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.texto}</p>
                      )}
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
      {conversaFechada ? (
        <p className="bg-gray-100 border-t px-4 py-3 text-sm text-gray-600 flex-shrink-0" role="status">{tGar('conversaEncerrada')}</p>
      ) : (
      <div className="bg-white border-t px-4 py-3 flex-shrink-0">
        {erroEnvio && <p className="text-xs text-red-700 mb-2" role="alert">{t('erroEnviar')}</p>}
        {showAudioRecorder ? (
          <AudioRecorder onRecorded={handleAudioRecorded} />
        ) : uploadingAudio ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-500">{t('sendingAudio')}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('messagePlaceholder')}
              className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {newMessage.trim() ? (
              <button
                onClick={handleSend}
                disabled={sending}
                className="w-10 h-10 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center transition-colors flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => setShowAudioRecorder(true)}
                className="w-10 h-10 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                title={t('recordAudio')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
