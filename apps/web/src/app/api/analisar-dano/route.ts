import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { solicitacao_id } = await req.json();
    if (!solicitacao_id) {
      return NextResponse.json({ error: 'solicitacao_id obrigatório' }, { status: 400 });
    }

    // Check cached analysis
    const { data: existing } = await supabaseAdmin
      .from('analise_dano')
      .select('*')
      .eq('solicitacao_id', solicitacao_id)
      .single();

    if (existing) {
      return NextResponse.json({ analise: existing });
    }

    // Fetch photos
    const { data: fotos } = await supabaseAdmin
      .from('solicitacao_fotos')
      .select('id, foto_url')
      .eq('solicitacao_id', solicitacao_id);

    if (!fotos || fotos.length === 0) {
      return NextResponse.json({ error: 'Nenhuma foto encontrada' }, { status: 404 });
    }

    // Fetch solicitacao for context
    const { data: sol } = await supabaseAdmin
      .from('solicitacoes')
      .select('tipo, descricao, veiculo:veiculos(fipe_marca, fipe_modelo, fipe_ano, fipe_valor)')
      .eq('id', solicitacao_id)
      .single();

    const veiculo = sol?.veiculo as any;
    const contexto = `Veículo: ${veiculo?.fipe_marca || ''} ${veiculo?.fipe_modelo || ''} ${veiculo?.fipe_ano || ''}. Tipo de serviço: ${sol?.tipo || 'não informado'}. Descrição do cliente: ${sol?.descricao || 'não informada'}.${veiculo?.fipe_valor ? ` Valor FIPE: ${veiculo.fipe_valor}.` : ''}`;

    // Build image parts for Gemini
    const imageParts: any[] = [];
    for (const foto of fotos.slice(0, 4)) {
      try {
        const res = await fetch(foto.foto_url);
        const buffer = await res.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = res.headers.get('content-type') || 'image/jpeg';
        imageParts.push({
          inline_data: { mime_type: mimeType, data: base64 },
        });
      } catch { /* skip */ }
    }

    if (imageParts.length === 0) {
      return NextResponse.json({ error: 'Não foi possível carregar as fotos' }, { status: 500 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 500 });
    }

    // Call Gemini Vision API
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              ...imageParts,
              {
                text: `Você é um especialista em reparos automotivos no Brasil. Analise estas fotos de dano veicular. ${contexto}

Responda APENAS em JSON com esta estrutura exata, sem texto adicional:
{
  "resumo": "Descrição clara do dano visível para a oficina",
  "severidade": "leve" ou "moderado" ou "grave" ou "severo",
  "checklist_inspecao": ["item 1 para verificar", "item 2", ...],
  "pecas_afetadas": ["peça 1", "peça 2", ...],
  "estimativa_custo": { "min": número_em_reais, "max": número_em_reais },
  "confianca": número entre 0 e 1
}
Seja preciso e prático. Considere preços do mercado brasileiro.`,
              },
            ],
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1500,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errData = await geminiRes.json();
      return NextResponse.json({ error: errData.error?.message || 'Erro na API Gemini' }, { status: 500 });
    }

    const geminiData = await geminiRes.json();
    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      return NextResponse.json({ error: 'Sem resposta da IA' }, { status: 500 });
    }

    // Extract JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Resposta inválida da IA' }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Store in DB
    const { data: analise, error: insertError } = await supabaseAdmin
      .from('analise_dano')
      .insert({
        solicitacao_id,
        resumo: parsed.resumo || '',
        severidade: parsed.severidade || 'moderado',
        checklist_inspecao: parsed.checklist_inspecao || [],
        pecas_afetadas: parsed.pecas_afetadas || [],
        estimativa_custo: parsed.estimativa_custo || null,
        confianca: parsed.confianca || null,
        fotos_analisadas: fotos.map((f) => f.id),
        modelo_usado: 'gemini-2.0-flash',
        raw_response: parsed,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ analise });
  } catch (err) {
    console.error('[analisar-dano]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
