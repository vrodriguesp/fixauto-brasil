import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const getOpenAI = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    const imageContent = fotos.slice(0, 4).map((f) => ({
      type: 'image_url' as const,
      image_url: { url: f.foto_url, detail: 'low' as const },
    }));

    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Você é um especialista em reparos automotivos no Brasil. Analise as fotos de dano em veículos e responda SEMPRE em JSON com esta estrutura exata:
{
  "resumo": "Descrição clara do dano visível para a oficina",
  "severidade": "leve" | "moderado" | "grave" | "severo",
  "checklist_inspecao": ["item 1 para verificar", "item 2", ...],
  "pecas_afetadas": ["peça 1", "peça 2", ...],
  "estimativa_custo": { "min": número_em_reais, "max": número_em_reais },
  "confianca": número entre 0 e 1
}
Seja preciso e prático. Considere preços do mercado brasileiro.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Analise estas fotos de dano veicular. ${contexto}` },
            ...imageContent,
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'Sem resposta da IA' }, { status: 500 });
    }

    const parsed = JSON.parse(content);

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
        modelo_usado: 'gpt-4o',
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
