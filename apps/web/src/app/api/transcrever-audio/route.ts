import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { participaDaSolicitacao } from '@/lib/acesso-servico';
import { supabaseAdmin } from '@/lib/supabase-admin';


export async function POST(request: NextRequest) {
  try {
    const { mensagemId } = await request.json();
    if (!mensagemId) {
      return NextResponse.json({ error: 'mensagemId obrigatório' }, { status: 400 });
    }

    // So quem participa da conversa (cliente ou oficina envolvida) - antes
    // qualquer um lia a transcricao de qualquer audio e gastava o Gemini.
    const userId = await getSessionUserId(request);
    if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const { data: dono } = await supabaseAdmin.from('mensagens').select('solicitacao_id').eq('id', mensagemId).maybeSingle();
    if (!dono || !(await participaDaSolicitacao(userId, dono.solicitacao_id))) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    if (!dentroDoLimite(`transcrever:${userId}`, 30, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
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
      // Chave no cabecalho, nao na URL (URLs aparecem em logs de proxy)
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
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
