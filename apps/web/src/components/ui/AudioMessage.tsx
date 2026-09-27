'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import AudioPlayer from './AudioPlayer';

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
  const t = useTranslations('audioMessage');
  const [showTranscricao, setShowTranscricao] = useState(false);
  const [localTranscricao, setLocalTranscricao] = useState(transcricao);
  const [localStatus, setLocalStatus] = useState(transcricaoStatus);
  const [transcribing, setTranscribing] = useState(false);

  const handleTranscrever = async () => {
    setTranscribing(true);
    setLocalStatus('processando');

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
  };

  return (
    <div className="space-y-1.5">
      <AudioPlayer src={audioUrl} duration={duration} />

      {localTranscricao && localStatus === 'concluida' ? (
        <button
          onClick={() => setShowTranscricao(!showTranscricao)}
          className="text-[11px] underline opacity-70 hover:opacity-100 transition-opacity"
        >
          {showTranscricao ? t('hideTranscription') : t('showTranscription')}
        </button>
      ) : localStatus === 'processando' || transcribing ? (
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
          <span className="text-[11px] opacity-70">{t('transcribing')}</span>
        </div>
      ) : localStatus === 'erro' ? (
        <button
          onClick={handleTranscrever}
          className="text-[11px] underline opacity-70 hover:opacity-100 transition-opacity"
        >
          {t('errorRetry')}
        </button>
      ) : (
        <button
          onClick={handleTranscrever}
          className="text-[11px] underline opacity-70 hover:opacity-100 transition-opacity"
        >
          {t('transcribe')}
        </button>
      )}

      {showTranscricao && localTranscricao && (
        <p className="text-xs opacity-80 italic leading-relaxed">{localTranscricao}</p>
      )}
    </div>
  );
}
