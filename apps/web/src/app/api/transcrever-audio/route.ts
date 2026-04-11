import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const getOpenAI = () => new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { mensagemId } = await request.json();

    if (!mensagemId) {
      return NextResponse.json({ error: 'mensagemId obrigatorio' }, { status: 400 });
    }

    // Fetch the message to get audio_url
    const { data: mensagem, error: fetchError } = await supabaseAdmin
      .from('mensagens')
      .select('id, audio_url, transcricao, transcricao_status')
      .eq('id', mensagemId)
      .single();

    if (fetchError || !mensagem) {
      return NextResponse.json({ error: 'Mensagem nao encontrada' }, { status: 404 });
    }

    if (!mensagem.audio_url) {
      return NextResponse.json({ error: 'Mensagem nao possui audio' }, { status: 400 });
    }

    // If already transcribed, return existing
    if (mensagem.transcricao && mensagem.transcricao_status === 'concluida') {
      return NextResponse.json({ transcricao: mensagem.transcricao });
    }

    // Mark as processing
    await supabaseAdmin
      .from('mensagens')
      .update({ transcricao_status: 'processando' })
      .eq('id', mensagemId);

    // Download the audio file
    const audioResponse = await fetch(mensagem.audio_url);
    if (!audioResponse.ok) {
      throw new Error('Falha ao baixar audio');
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer]);

    // Determine file extension from URL
    const ext = mensagem.audio_url.includes('.webm') ? 'webm' : 'mp4';
    const audioFile = new File([audioBlob], `audio.${ext}`, {
      type: ext === 'webm' ? 'audio/webm' : 'audio/mp4',
    });

    // Send to OpenAI Whisper
    const openai = getOpenAI();
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'pt',
    });

    // Update message with transcription
    await supabaseAdmin
      .from('mensagens')
      .update({
        transcricao: transcription.text,
        transcricao_status: 'concluida',
      })
      .eq('id', mensagemId);

    return NextResponse.json({ transcricao: transcription.text });
  } catch (error) {
    console.error('Erro na transcricao:', error);

    // Try to mark as error
    try {
      const { mensagemId } = await request.clone().json();
      if (mensagemId) {
        await supabaseAdmin
          .from('mensagens')
          .update({ transcricao_status: 'erro' })
          .eq('id', mensagemId);
      }
    } catch { /* ignore */ }

    return NextResponse.json(
      { error: 'Erro ao transcrever audio' },
      { status: 500 }
    );
  }
}
