'use client';

import { useState, useCallback } from 'react';
import AudioPlayer from './AudioPlayer';
import { supabase } from '@/lib/supabase';

interface AudioMessageProps {
  audioUrl: string;
  duration: number;
  transcricao?: string;
  transcricaoStatus?: string;
  mensagemId: string;
}

export default function AudioMessage({
  audioUrl,
  duration,
  transcricao,
  transcricaoStatus,
  mensagemId,
}: AudioMessageProps) {
  const [showTranscricao, setShowTranscricao] = useState(false);
  const [localTranscricao, setLocalTranscricao] = useState(transcricao);
  const [localStatus, setLocalStatus] = useState(transcricaoStatus);
  const [transcribing, setTranscribing] = useState(false);

  const handleTranscrever = useCallback(async () => {
    setTranscribing(true);
    setLocalStatus('processando');

    // Try browser-native Web Speech API first (free)
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        // Play audio through AudioContext and pipe to recognition
        const response = await fetch(audioUrl);
        const blob = await response.blob();
        const audioEl = new Audio(URL.createObjectURL(blob));

        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = true;
        recognition.interimResults = false;

        let fullText = '';

        await new Promise<void>((resolve, reject) => {
          recognition.onresult = (event: any) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                fullText += event.results[i][0].transcript + ' ';
              }
            }
          };
          recognition.onend = () => resolve();
          recognition.onerror = (e: any) => {
            if (e.error === 'no-speech') resolve();
            else reject(e);
          };

          // Start recognition and play audio simultaneously
          recognition.start();
          audioEl.play();

          // Stop after audio ends + small buffer
          audioEl.onended = () => {
            setTimeout(() => {
              recognition.stop();
            }, 1000);
          };

          // Timeout fallback
          setTimeout(() => {
            recognition.stop();
            audioEl.pause();
          }, (duration + 5) * 1000);
        });

        if (fullText.trim()) {
          setLocalTranscricao(fullText.trim());
          setLocalStatus('concluida');
          setShowTranscricao(true);
          // Save to DB
          await supabase.from('mensagens').update({
            transcricao: fullText.trim(),
            transcricao_status: 'concluida',
          }).eq('id', mensagemId);
          setTranscribing(false);
          return;
        }
      } catch { /* fallback to server */ }
    }

    // Fallback: server-side transcription
    try {
      const res = await fetch('/api/transcrever-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagemId }),
      });
      const data = await res.json();
      if (data.transcricao) {
        setLocalTranscricao(data.transcricao);
        setLocalStatus('concluida');
        setShowTranscricao(true);
      } else {
        setLocalStatus('erro');
      }
    } catch {
      setLocalStatus('erro');
    } finally {
      setTranscribing(false);
    }
  }, [audioUrl, duration, mensagemId]);

  return (
    <div className="space-y-1.5">
      <AudioPlayer src={audioUrl} duration={duration} />

      {localTranscricao && localStatus === 'concluida' ? (
        <button
          onClick={() => setShowTranscricao(!showTranscricao)}
          className="text-[11px] underline opacity-70 hover:opacity-100 transition-opacity"
        >
          {showTranscricao ? 'Ouvir audio' : 'Ver transcricao'}
        </button>
      ) : localStatus === 'processando' || transcribing ? (
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
          <span className="text-[11px] opacity-70">Transcrevendo...</span>
        </div>
      ) : localStatus === 'erro' ? (
        <button
          onClick={handleTranscrever}
          className="text-[11px] underline opacity-70 hover:opacity-100 transition-opacity"
        >
          Erro. Tentar novamente?
        </button>
      ) : (
        <button
          onClick={handleTranscrever}
          className="text-[11px] underline opacity-70 hover:opacity-100 transition-opacity"
        >
          Transcrever
        </button>
      )}

      {showTranscricao && localTranscricao && (
        <p className="text-xs opacity-80 italic leading-relaxed">{localTranscricao}</p>
      )}
    </div>
  );
}
