'use client';

import TextoTraduzido, { useTraducoes } from '@/components/ui/TextoTraduzido';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { useOrcamentos } from '@/hooks/use-orcamentos';
import { supabase } from '@/lib/supabase';
import { completarClientes } from '@/lib/resumo-clientes';
import { INTL_LOCALE } from '@/lib/utils';
import AudioRecorder from '@/components/ui/AudioRecorder';
import AudioMessage from '@/components/ui/AudioMessage';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { Link } from '@/i18n/navigation';
import { useConversaCelular } from '@/hooks/use-conversa-celular';
import CampoConversa, { AvisoNovaMensagem } from '@/components/conversa/CampoConversa';

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
  /** so na tela: mostrada na hora, ainda sem confirmacao do servidor */
  enviando?: boolean;
  remetente?: {
    nome: string;
    tipo: string;
  };
}

interface SolicitacaoInfo {
  id: string;
  descricao: string;
  cliente?: {
    nome: string;
  };
  veiculo?: {
    fipe_marca: string;
    fipe_modelo: string;
    fipe_ano: string;
    placa: string;
  };
}

export default function OficinaMensagensPage() {
  const t = useTranslations('oficinaMensagemDetalhe');
  const tConv = useTranslations('conversa');
  const locale = useLocale();
  const params = useParams();
  const id = params.id as string;
  const { user, oficina } = useAuth();
  const [messages, setMessages] = useState<Mensagem[]>([]);
  const [hasOrcamento, setHasOrcamento] = useState(false);
  // conversa particular com o responsavel pelo pagamento de um acidente
  // (null = conversa com o cliente do pedido)
  const [pagadorId, setPagadorId] = useState<string | null>(null);
  const [pagadores, setPagadores] = useState<{ id: string; nome: string }[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [solicitacao, setSolicitacao] = useState<SolicitacaoInfo | null>(null);
  const [solCarregada, setSolCarregada] = useState(false);
  const [erroEnvio, setErroEnvio] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const tGar = useTranslations('garantia');
  const [conversaFechada, setConversaFechada] = useState(false);
  useEffect(() => {
    const ofId = oficina?.id;
    if (!ofId) return;
    supabase.rpc('conversa_aberta', { p_sol: id, p_of: ofId }).then(({ data }) => setConversaFechada(data === false));
    // servico entregue: na garantia so o cliente reabre a conversa; a oficina
    // responde depois que ele escrever (regra do dono, 27/10)
    (async () => {
      const { data: s } = await supabase.from('solicitacoes').select('status, cliente_id').eq('id', id).maybeSingle();
      // entregue/cancelado: sem botao de refazer o orcamento (teste do dono 31/10)
      setEncerrado(s?.status === 'concluida' || s?.status === 'cancelada');
      if (s?.status !== 'concluida') return;
      const { data: ag } = await supabase.from('agenda').select('data_fim, data_inicio').eq('solicitacao_id', id).eq('oficina_id', ofId).eq('status', 'concluido').limit(1).maybeSingle();
      setEntrega({ em: (ag as any)?.data_fim || (ag as any)?.data_inicio || '1970-01-01', cliente: (s as any).cliente_id });
    })();
  }, [id, oficina?.id]);
  const [entrega, setEntrega] = useState<{ em: string; cliente: string } | null>(null);
  const [encerrado, setEncerrado] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const { uploadAudio } = useAudioRecorder();
  const [perguntasSugeridas, setPerguntasSugeridas] = useState<string[]>([]);
  // na lingua da oficina (a analise pode ter sido gerada em outra); o chat
  // traduz de novo para o cliente
  const perguntasIA = useTraducoes(perguntasSugeridas).textos;
  const [showPerguntas, setShowPerguntas] = useState(true);

  // padrao unico das conversas: presa a area visivel no celular, abre no fim, aviso de nova mensagem
  const conversaRef = useRef<HTMLDivElement>(null);
  const { novaMensagem, irParaFim, propsLista } = useConversaCelular({
    conversa: conversaRef, lista: listaRef, quantidade: messages.length,
    ultimaMinha: messages[messages.length - 1]?.remetente_id === user?.id,
  });

  // Fetch solicitacao info
  useEffect(() => {
    async function fetchSolicitacao() {
      const { data } = await supabase
        .from('solicitacoes')
        .select('id, descricao, cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(nome), veiculo:veiculos!solicitacoes_veiculo_id_fkey(fipe_marca, fipe_modelo, fipe_ano, placa)')
        .eq('id', id)
        .single();

      if (data) {
        // nome do cliente antes de a oficina ser escolhida (migracao 074)
        setSolicitacao((await completarClientes(supabase, [data as any]))[0] as unknown as SolicitacaoInfo);
      }
      setSolCarregada(true);
    }
    fetchSolicitacao();

    // Check if this oficina already sent a quote
    if (oficina) {
      supabase.from('orcamentos').select('id').eq('solicitacao_id', id).eq('oficina_id', oficina.id).limit(1)
        .then(({ data }) => {
          const has = !!(data && data.length > 0);
          setHasOrcamento(has);
          // Only show perguntas if no orcamento sent yet
          if (!has) {
            supabase.from('analise_dano').select('raw_response').eq('solicitacao_id', id).single()
              .then(({ data: analise }) => {
                const perguntas = (analise?.raw_response as any)?.perguntas_sugeridas;
                if (perguntas && Array.isArray(perguntas)) setPerguntasSugeridas(perguntas);
              });
          }
        });
    }
  }, [id, oficina]);

  useEffect(() => {
    if (!oficina) return;
    const pedido = new URLSearchParams(window.location.search).get('pagador');
    if (pedido) setPagadorId(pedido);
    (async () => {
      const { data: ms } = await supabase.from('mensagens').select('pagador_id')
        .eq('solicitacao_id', id).eq('oficina_id', oficina.id).not('pagador_id', 'is', null);
      const ids = Array.from(new Set((ms || []).map((m: any) => m.pagador_id as string)));
      if (pedido && !ids.includes(pedido)) ids.push(pedido);
      if (!ids.length) return;
      const { data: perfis } = await supabase.from('profiles').select('id, nome').in('id', ids);
      setPagadores(ids.map((pid) => ({ id: pid, nome: (perfis || []).find((p: any) => p.id === pid)?.nome || '' })));
    })();
  }, [id, oficina]);

  const trocarConversa = (novo: string | null) => {
    if (novo === pagadorId) return;
    setMessages([]);
    setPagadorId(novo);
    window.history.replaceState(null, '', novo ? `${window.location.pathname}?pagador=${novo}` : window.location.pathname);
  };

  // Fetch messages - so a conversa desta oficina com o cliente
  useEffect(() => {
    if (!oficina) return;
    async function fetchMessages() {
      setLoading(true);
      let q = supabase
        .from('mensagens')
        .select('*, remetente:profiles!mensagens_remetente_id_fkey(nome, tipo)')
        .eq('solicitacao_id', id)
        .eq('oficina_id', oficina!.id);
      q = pagadorId ? q.eq('pagador_id', pagadorId) : q.is('pagador_id', null);
      const { data } = await q.order('created_at', { ascending: true });

      if (data) {
        setMessages(data as Mensagem[]);
      }
      setLoading(false);
    }
    fetchMessages();
  }, [id, oficina, pagadorId]);

  // Mark messages as read
  useEffect(() => {
    if (!user || !oficina || messages.length === 0) return;
    const unread = messages.filter((m) => !m.lida && m.remetente_id !== user.id);
    if (unread.length > 0) {
      let q = supabase
        .from('mensagens')
        .update({ lida: true })
        .eq('solicitacao_id', id)
        .eq('oficina_id', oficina.id)
        .neq('remetente_id', user.id);
      q = pagadorId ? q.eq('pagador_id', pagadorId) : q.is('pagador_id', null);
      q.then(() => window.dispatchEvent(new Event('bipfix:mensagens-lidas')));
    }
  }, [messages, user, id, oficina, pagadorId]);

  // Real-time subscription
  useEffect(() => {
    if (!oficina) return;
    const channel = supabase
      .channel(`msgs-oficina-${id}-${oficina.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
          filter: `solicitacao_id=eq.${id}`,
        },
        async (payload) => {
          if ((payload.new as any).oficina_id !== oficina.id || ((payload.new as any).pagador_id || null) !== pagadorId) return;
          // Fetch complete message with remetente info
          const { data } = await supabase
            .from('mensagens')
            .select('*, remetente:profiles!mensagens_remetente_id_fkey(nome, tipo)')
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages((prev) => {
              // Skip if already exists (by real id or temp id for same text)
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
  }, [id, oficina, pagadorId]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !oficina) return;

    const texto = newMessage.trim();
    setNewMessage('');
    setErroEnvio(false);
    // aparece na hora ("enviando"); o campo continua com o foco (teclado aberto, sem pulo)
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: tempId,
      solicitacao_id: id,
      remetente_id: user.id,
      texto,
      lida: false,
      created_at: new Date().toISOString(),
      remetente: { nome: user.nome, tipo: user.tipo },
      enviando: true,
    }]);

    const { data: novaMsg, error } = await supabase.from('mensagens').insert({
      solicitacao_id: id,
      oficina_id: oficina.id,
      pagador_id: pagadorId,
      remetente_id: user.id,
      texto,
    }).select('id').single();

    if (error) {
      // nao some o texto: tira a mensagem da lista, devolve ao campo e avisa
      console.error(error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage((atual) => atual || texto);
      setErroEnvio(true);
      return;
    }
    // confirmada: vira a mensagem de verdade (o tempo real nao duplica, ja tem o id)
    setMessages((prev) => prev.some((m) => m.id === novaMsg.id) ? prev.filter((m) => m.id !== tempId) : prev.map((m) => m.id === tempId ? { ...m, id: novaMsg.id, enviando: false } : m));

    // aviso a quem recebe, pelo servidor (idioma dele; antes falhava sem aparecer)
    if (novaMsg?.id) fetch('/api/avisar-mensagem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagemId: novaMsg.id }) }).catch(() => {});
  };

  const handleAudioRecorded = async (blob: Blob, audioDuration: number) => {
    if (!user || !oficina) return;
    setShowAudioRecorder(false);
    setUploadingAudio(true);

    try {
      const audioUrl = await uploadAudio(blob, id, oficina.id, pagadorId);
      if (!audioUrl) return;

      const { data: novaMsg, error } = await supabase.from('mensagens').insert({
        solicitacao_id: id,
        oficina_id: oficina.id,
        pagador_id: pagadorId,
        remetente_id: user.id,
        texto: t('audioTag'),
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
            texto: t('audioTag'),
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
    return d.toLocaleTimeString(INTL_LOCALE[locale] || 'en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateSeparator = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return t('hoje');
    if (d.toDateString() === yesterday.toDateString()) return t('ontem');
    return d.toLocaleDateString(INTL_LOCALE[locale] || 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const shouldShowDateSeparator = (index: number) => {
    if (index === 0) return true;
    const current = new Date(messages[index].created_at).toDateString();
    const previous = new Date(messages[index - 1].created_at).toDateString();
    return current !== previous;
  };

  return (
    <div ref={conversaRef} data-conversa="" className="altura-conversa flex flex-col max-w-4xl mx-auto bg-white">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/oficina/pedidos/${id}`}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
            <span className="text-primary-700 font-semibold">
              {solicitacao?.cliente?.nome?.charAt(0) || '?'}
            </span>
          </div>
          <div>
            <h1 className="font-semibold text-gray-900 text-sm">
              {solicitacao?.cliente?.nome || (solCarregada ? t('clienteFallback') : t('carregando'))}
            </h1>
            <p className="text-xs text-gray-500">
              {solicitacao?.veiculo
                ? `${solicitacao.veiculo.fipe_marca} ${solicitacao.veiculo.fipe_modelo} ${solicitacao.veiculo.fipe_ano || ''}`
                : ''}
              {solicitacao?.veiculo?.placa ? ` - ${solicitacao.veiculo.placa}` : ''}
            </p>
          </div>
        </div>
        {!encerrado && (
        <Link
          href={`/oficina/orcamento/${id}`}
          data-testid="refazer-orcamento"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          {hasOrcamento ? t('refazerOrcamento') : t('fazerOrcamento')}
        </Link>
        )}
      </div>

      {pagadores.length > 0 && (
        <div className="bg-white border-b px-4 py-2 flex gap-2 overflow-x-auto flex-shrink-0" role="tablist">
          <button type="button" role="tab" aria-selected={!pagadorId} onClick={() => trocarConversa(null)}
            className={`px-3 py-2 min-h-[40px] rounded-full text-sm font-medium whitespace-nowrap ${!pagadorId ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
            {t('abaCliente')}
          </button>
          {pagadores.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={pagadorId === p.id} onClick={() => trocarConversa(p.id)}
              className={`px-3 py-2 min-h-[40px] rounded-full text-sm font-medium whitespace-nowrap ${pagadorId === p.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
              {t('abaPagador')}{p.nome ? ` · ${p.nome}` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Messages area */}
      <div className="relative flex-1 min-h-0 flex flex-col">
      <div ref={listaRef} {...propsLista} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 bg-gray-50" data-testid="conversa-lista">
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
            <p className="text-gray-500 text-sm">{t('nenhumaMensagemAinda')}</p>
            <p className="text-gray-400 text-xs mt-1">{t('envieAPrimeiraMensagem')}</p>
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
                      {/* antes de a oficina ser escolhida o perfil do cliente nao vem (074): nome pelo resumo do pedido */}
                      {!isOwn && (msg.remetente?.nome || (msg.remetente_id === (solicitacao as any)?.cliente_id && solicitacao?.cliente?.nome)) && (
                        <p className="text-xs font-medium text-primary-600 mb-0.5">
                          {msg.remetente?.nome || solicitacao?.cliente?.nome}
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
                        <TextoTraduzido texto={msg.texto} ativo={!isOwn} className="text-sm whitespace-pre-wrap break-words" />
                      )}
                      <p
                        className={`text-[10px] mt-1 ${
                          isOwn ? 'text-primary-200' : 'text-gray-400'
                        } text-right`}
                      >
                        {msg.enviando ? tConv('enviando') : formatTime(msg.created_at)}
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
      <AvisoNovaMensagem visivel={novaMensagem} aoTocar={() => irParaFim()} texto={tConv('novaMensagem')} />
      </div>

      {/* AI suggested questions */}
      {perguntasSugeridas.length > 0 && showPerguntas && (
        <div className="bg-indigo-50 border-t border-indigo-200 px-4 py-2 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-indigo-700">{t('perguntasSugeridasIA')}</span>
            <button onClick={() => setShowPerguntas(false)} className="text-xs text-indigo-400 hover:text-indigo-600">x</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {perguntasIA.map((p, i) => (
              <button key={i} onClick={() => { setNewMessage(p); setShowPerguntas(false); inputRef.current?.focus(); }}
                className="text-xs bg-white border border-indigo-200 text-indigo-800 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors text-left">
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      {conversaFechada ? (
        <p className="bg-gray-100 border-t px-4 py-3 text-sm text-gray-600 flex-shrink-0" role="status">{tGar('conversaEncerrada')}</p>
      ) : entrega && !messages.some((m) => (m.remetente_id === entrega.cliente || (!!pagadorId && m.remetente_id === pagadorId)) && m.created_at > entrega.em) ? (
        <p className="bg-gray-100 border-t px-4 py-3 text-sm text-gray-600 flex-shrink-0" role="status">{tGar('soClienteReabre')}</p>
      ) : (
      <div className="conversa-composer bg-white border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex-shrink-0">
        {erroEnvio && <p className="text-xs text-red-700 mb-2" role="alert">{t('erroEnviar')}</p>}
        {showAudioRecorder ? (
          <AudioRecorder onRecorded={handleAudioRecorded} />
        ) : uploadingAudio ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-500">{t('enviandoAudio')}</span>
          </div>
        ) : (
          <CampoConversa
            ref={inputRef}
            valor={newMessage}
            aoMudar={setNewMessage}
            aoEnviar={handleSend}
            placeholder={t('placeholderMensagem')}
            rotuloEnviar={tConv('enviar')}
            aoGravar={() => setShowAudioRecorder(true)}
            rotuloGravar={t('gravarAudio')}
            testIdEnviar="conversa-enviar"
          />
        )}
      </div>
      )}
    </div>
  );
}
