import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Fallback server-side transcription
// Primary transcription uses browser Web Speech API (free, in AudioMessage.tsx)
// This route is only called when the browser API is unavailable
export async function POST(request: NextRequest) {
  try {
    const { mensagemId } = await request.json();
    if (!mensagemId) {
      return NextResponse.json({ error: 'mensagemId obrigatório' }, { status: 400 });
    }

    // Fetch the message
    const { data: msg } = await supabaseAdmin
      .from('mensagens')
      .select('audio_url, transcricao, transcricao_status')
      .eq('id', mensagemId)
      .single();

    if (!msg) {
      return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
    }

    if (msg.transcricao && msg.transcricao_status === 'concluida') {
      return NextResponse.json({ transcricao: msg.transcricao });
    }

    if (!msg.audio_url) {
      return NextResponse.json({ error: 'Sem áudio nesta mensagem' }, { status: 400 });
    }

    // Update status
    await supabaseAdmin.from('mensagens').update({ transcricao_status: 'processando' }).eq('id', mensagemId);

    // For now, mark as unavailable server-side since we're not using OpenAI/Whisper
    // The primary transcription method is the browser Web Speech API
    await supabaseAdmin.from('mensagens').update({
      transcricao: 'Transcrição não disponível no servidor. Use um navegador compatível com Web Speech API.',
      transcricao_status: 'erro',
    }).eq('id', mensagemId);

    return NextResponse.json({
      error: 'Transcrição server-side não configurada. Use a transcrição do navegador.',
    }, { status: 501 });
  } catch (err) {
    console.error('[transcrever-audio]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
