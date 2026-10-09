import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { participaDaConversa } from '@/lib/acesso-servico';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { baixarMidia } from '@/lib/midia-servidor';
import { chamarGemini } from '@/lib/gemini';

// Mesmo esquema do leitor de orcamento: com o modelo ocupado (429/503) tenta
// de novo e passa para o seguinte, em vez de falhar na primeira.
// 3.5-flash primeiro: no teste com audio real em estoniano acertou ("Tere, see on test"), o 2.5 nao
const MODELOS = [{ modelo: 'gemini-3.5-flash' }, { modelo: 'gemini-2.5-flash', semRaciocinio: true }, { modelo: 'gemini-3.5-flash-lite' }];
const IDIOMA_NOME: Record<string, string> = { pt: 'Brazilian Portuguese', 'pt-PT': 'European Portuguese', en: 'English', et: 'Estonian', it: 'Italian', ru: 'Russian' };

// O iPhone grava .mp4/.m4a e o armazenamento as vezes devolve video/mp4 ou
// octet-stream: o tipo vem da extensao quando o do arquivo nao e de audio.
function tipoDoAudio(url: string, tipo: string) {
  if (tipo.startsWith('audio/')) return tipo;
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  return ({ mp4: 'audio/mp4', m4a: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', caf: 'audio/x-caf' } as Record<string, string>)[ext || ''] || 'audio/webm';
}


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
    const { data: dono } = await supabaseAdmin.from('mensagens').select('solicitacao_id, oficina_id, pagador_id').eq('id', mensagemId).maybeSingle();
    if (!dono || !(await participaDaConversa(userId, dono.solicitacao_id, dono.oficina_id, dono.pagador_id))) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    if (!dentroDoLimite(`transcrever:${userId}`, 30, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
    }

    // Fetch the message
    const { data: msg } = await supabaseAdmin
      .from('mensagens')
      .select('audio_url, transcricao, transcricao_status, remetente:profiles!mensagens_remetente_id_fkey(idioma)')
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
    // Espaco privado: baixa pelo servidor (o endereco publico nao abre mais)
    const midia = await baixarMidia(msg.audio_url);
    if (!midia) {
      await supabaseAdmin.from('mensagens').update({ transcricao_status: 'erro' }).eq('id', mensagemId);
      return NextResponse.json({ error: 'Áudio indisponível' }, { status: 500 });
    }
    const base64Audio = midia.buffer.toString('base64');
    const mimeType = tipoDoAudio(msg.audio_url, midia.tipo);
    // idioma do app de quem falou: dica forte para frases curtas (sem ela,
    // "Tere, see on test" em estoniano virava "Teray, say on test")
    const idioma = (msg as any).remetente?.idioma as string | undefined;
    const dica = idioma && IDIOMA_NOME[idioma] ? ` The speaker uses the app in ${IDIOMA_NOME[idioma]}, so the audio is most likely in ${IDIOMA_NOME[idioma]} (but keep whatever language is actually spoken).` : '';
    const corpo = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Audio } },
          { text: `Transcribe this audio word for word in the SAME language it was spoken (do not translate), with that language's correct spelling and punctuation.${dica} Return ONLY the spoken text, no formatting, no quotes, no explanation.` },
        ],
      }],
      // sem "pensamento": ele consumia o limite de saida e a resposta vinha vazia
      generationConfig: { maxOutputTokens: 2000, temperature: 0 },
    };

    // audio de 1 min leva poucos segundos; o prazo evita a tela esperando sem fim
    const geminiRes = await chamarGemini(MODELOS, corpo, { rotulo: 'transcrever-audio' });

    if (!geminiRes?.ok) {
      const err = geminiRes ? await geminiRes.json().catch(() => ({})) : {};
      console.error('[transcrever-audio] gemini', geminiRes?.status, JSON.stringify(err).slice(0, 300));
      await supabaseAdmin.from('mensagens').update({ transcricao_status: 'erro' }).eq('id', mensagemId);
      return NextResponse.json({ error: 'IA ocupada', codigo: 'IA_OCUPADA' }, { status: 503 });
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
