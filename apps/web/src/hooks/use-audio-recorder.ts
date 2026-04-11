'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const BUCKET = 'damage-photos';

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const durationRef = useRef(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const startRecording = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4',
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      durationRef.current = 0;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
        if (durationRef.current >= 120) {
          stopRecording();
        }
      }, 1000);

      return true;
    } catch {
      return false;
    }
  };

  const stopRecording = (): Promise<{ blob: Blob; duration: number } | null> => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') {
        cleanup();
        setIsRecording(false);
        resolve(null);
        return;
      }

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        const finalDuration = durationRef.current;
        cleanup();
        setIsRecording(false);
        setDuration(0);
        resolve({ blob, duration: finalDuration });
      };

      mr.stop();
    });
  };

  const uploadAudio = async (blob: Blob, solicitacaoId: string): Promise<string | null> => {
    setUploading(true);
    try {
      const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
      const fileName = `audio/${solicitacaoId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, blob, { contentType: blob.type });

      if (error) {
        console.error('Audio upload error:', error);
        return null;
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
      return data.publicUrl;
    } finally {
      setUploading(false);
    }
  };

  return {
    isRecording,
    duration,
    uploading,
    startRecording,
    stopRecording,
    uploadAudio,
  };
}
