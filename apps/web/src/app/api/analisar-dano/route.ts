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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              ...imageParts,
              {
                text: `Especialista em reparos automotivos Brasil. ${contexto}
Analise as fotos e responda JSON CURTO E DIRETO:
{"resumo":"max 2 frases","severidade":"leve|moderado|grave|severo","checklist_inspecao":["max 5 itens"],"pecas_afetadas":["max 5 pecas"],"estimativa_custo":{"min":0,"max":0},"confianca":0.8,"perguntas_sugeridas":["max 3 perguntas para a oficina fazer ao cliente para entender melhor o dano"]}
Seja BREVE. Preços em reais do mercado brasileiro.`,
              },
            ],
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errData = await geminiRes.json();
      return NextResponse.json({ error: errData.error?.message || 'Erro na API Gemini' }, { status: 500 });
    }

    const geminiData = await geminiRes.json();
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    // Find the text part (skip "thought" parts from Gemini 2.5)
    const textPart = parts.find((p: any) => p.text && !p.thought);
    const content = textPart?.text || parts.find((p: any) => p.text)?.text;

    if (!content) {
      const rawPreview = JSON.stringify(geminiData).slice(0, 500);
      console.error('[analisar-dano] Gemini response:', rawPreview);
      return NextResponse.json({ error: `Sem resposta da IA. Debug: ${rawPreview}` }, { status: 500 });
    }

    // Parse JSON - handle truncated responses by fixing incomplete JSON
    let parsed;
    let rawJson = content.trim();

    // Remove markdown wrappers
    const mdMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (mdMatch) rawJson = mdMatch[1].trim();

    // If doesn't start with {, extract it
    if (!rawJson.startsWith('{')) {
      const braceMatch = rawJson.match(/\{[\s\S]*/);
      if (braceMatch) rawJson = braceMatch[0];
    }

    try {
      parsed = JSON.parse(rawJson);
    } catch {
      // Try to fix truncated JSON by closing brackets
      let fixed = rawJson;
      // Remove trailing incomplete string/value
      fixed = fixed.replace(/,\s*"[^"]*$/, '');
      fixed = fixed.replace(/,\s*\[[^\]]*$/, '');
      fixed = fixed.replace(/,\s*$/, '');
      // Close open brackets
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      const openBrackets = (fixed.match(/\[/g) || []).length;
      const closeBrackets = (fixed.match(/\]/g) || []).length;
      for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
      for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';

      try {
        parsed = JSON.parse(fixed);
      } catch {
        // Last resort: build minimal response from what we have
        const resumoMatch = rawJson.match(/"resumo"\s*:\s*"([^"]+)"/);
        const sevMatch = rawJson.match(/"severidade"\s*:\s*"([^"]+)"/);
        parsed = {
          resumo: resumoMatch ? resumoMatch[1] : 'Análise parcial - verifique as fotos manualmente',
          severidade: sevMatch ? sevMatch[1] : 'moderado',
          checklist_inspecao: ['Verificar danos estruturais', 'Inspecionar pintura', 'Checar alinhamento'],
          pecas_afetadas: ['Verificar nas fotos'],
          estimativa_custo: null,
          confianca: 0.3,
        };
      }
    }

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
        modelo_usado: 'gemini-2.5-flash',
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
