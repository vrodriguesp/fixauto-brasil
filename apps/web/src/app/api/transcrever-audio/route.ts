import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

    // Return cached transcription
    if (msg.transcricao && msg.transcricao_status === 'concluida') {
      return NextResponse.json({ transcricao: msg.transcricao });
    }

    if (!msg.audio_url) {
      return NextResponse.json({ error: 'Sem áudio nesta mensagem' }, { status: 400 });
    }

    // Update status
    await supabaseAdmin.from('mensagens').update({ transcricao_status: 'processando' }).eq('id', mensagemId);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      await supabaseAdmin.from('mensagens').update({ transcricao_status: 'erro' }).eq('id', mensagemId);
      return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 500 });
    }

    // Download audio
    const audioRes = await fetch(msg.audio_url);
    const audioBuffer = await audioRes.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    const mimeType = audioRes.headers.get('content-type') || 'audio/webm';

    // Use Gemini to transcribe
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: base64Audio } },
              { text: 'Transcreva este áudio em português brasileiro. Retorne APENAS o texto falado, sem formatação, sem aspas, sem explicação.' },
            ],
          }],
          generationConfig: { maxOutputTokens: 2000 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json();
      await supabaseAdmin.from('mensagens').update({ transcricao_status: 'erro' }).eq('id', mensagemId);
      return NextResponse.json({ error: err.error?.message || 'Erro Gemini' }, { status: 500 });
    }

    const geminiData = await geminiRes.json();
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find((p: any) => p.text && !p.thought);
    const transcricao = (textPart?.text || '').trim();

    if (!transcricao) {
      await supabaseAdmin.from('mensagens').update({ transcricao_status: 'erro' }).eq('id', mensagemId);
      return NextResponse.json({ error: 'Não foi possível transcrever' }, { status: 500 });
    }

    // Save transcription
    await supabaseAdmin.from('mensagens').update({
      transcricao,
      transcricao_status: 'concluida',
    }).eq('id', mensagemId);

    return NextResponse.json({ transcricao });
  } catch (err) {
    console.error('[transcrever-audio]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
