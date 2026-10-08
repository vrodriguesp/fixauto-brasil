import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { podeVerSolicitacao } from '@/lib/acesso-servico';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { baixarMidia } from '@/lib/midia-servidor';
import { idiomaDoSite } from '@/lib/site-url';
import { currencyForCountry } from '@/lib/currency';


export async function POST(req: NextRequest) {
  try {
    const { solicitacao_id } = await req.json();
    if (!solicitacao_id) {
      return NextResponse.json({ error: 'solicitacao_id obrigatório' }, { status: 400 });
    }

    // So quem pode ver o pedido (cliente, oficinas enquanto aberto, oficina
    // envolvida, admin); limite por pessoa porque cada analise nova custa.
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    if (!(await podeVerSolicitacao(userId, solicitacao_id))) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    if (!dentroDoLimite(`analisar:${userId}`, 20, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
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
      return NextResponse.json({ error: 'Nenhuma foto encontrada', codigo: 'SEM_FOTOS' }, { status: 404 });
    }

    // Fetch solicitacao for context
    const { data: sol } = await supabaseAdmin
      .from('solicitacoes')
      .select('tipo, descricao, pais, veiculo:veiculos(fipe_marca, fipe_modelo, fipe_ano, fipe_valor)')
      .eq('id', solicitacao_id)
      .single();

    const veiculo = sol?.veiculo as any;
    const contexto = `Veículo: ${veiculo?.fipe_marca || ''} ${veiculo?.fipe_modelo || ''} ${veiculo?.fipe_ano || ''}. Tipo de serviço: ${sol?.tipo || 'não informado'}. Descrição do cliente: ${sol?.descricao || 'não informada'}.${veiculo?.fipe_valor ? ` Valor FIPE: ${veiculo.fipe_valor}.` : ''}`;

    // Idioma de quem pediu a analise (o texto e mostrado a ela) e moeda/
    // mercado do pais do pedido - antes era sempre portugues do Brasil e reais,
    // tambem para oficinas de Tallinn.
    const { data: perfil } = await supabaseAdmin.from('profiles').select('idioma').eq('id', userId).maybeSingle();
    const idioma = idiomaDoSite(perfil?.idioma);
    const NOMES: Record<string, string> = { pt: 'portugues do Brasil', 'pt-PT': 'portugues europeu', en: 'ingles', et: 'estoniano', it: 'italiano', ru: 'russo' };
    const nomeIdioma = NOMES[idioma] || 'ingles';
    const pais = (sol as { pais?: string | null } | null)?.pais || (idioma === 'pt' ? 'BR' : 'EE');
    const moeda = currencyForCountry(pais) === 'BRL' ? 'reais (BRL)' : 'euros (EUR)';
    const mercado = pais === 'BR' ? 'Brasil' : pais === 'EE' ? 'Estonia' : pais;

    // Build image parts for Gemini
    const imageParts: any[] = [];
    for (const foto of fotos.slice(0, 4)) {
      try {
        // Espaco privado: baixa pelo servidor (o endereco publico nao abre mais)
        const midia = await baixarMidia(foto.foto_url);
        if (!midia) continue;
        imageParts.push({
          inline_data: { mime_type: midia.tipo.startsWith('image/') ? midia.tipo : 'image/jpeg', data: midia.buffer.toString('base64') },
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

    // Gemini as vezes responde "alta demanda" (503/429): tenta de novo e,
    // se continuar, usa outro modelo - antes a oficina via o erro em ingles.
    const corpoGemini = JSON.stringify({
          contents: [{
            parts: [
              ...imageParts,
              {
                text: `Especialista em reparos automotivos (${mercado}). ${contexto}
Analise as fotos e responda JSON CURTO E DIRETO:
{"resumo":"max 2 frases","severidade":"leve|moderado|grave|severo","checklist_inspecao":["max 5 itens"],"pecas_afetadas":["max 5 pecas"],"estimativa_custo":{"min":0,"max":0},"confianca":0.8,"perguntas_sugeridas":["max 3 perguntas para a oficina fazer ao cliente para entender melhor o dano"]}
Seja BREVE. Escreva os textos (resumo, checklist_inspecao, pecas_afetadas, perguntas_sugeridas) em ${nomeIdioma}. O campo severidade deve ser EXATAMENTE um destes valores, sem traduzir: leve, moderado, grave, severo. Precos em ${moeda} do mercado de ${mercado}.`,
              },
            ],
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        });
    const MODELOS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];
    let geminiRes: Response | null = null;
    let modeloUsado = MODELOS[0];
    for (const modelo of MODELOS) {
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        geminiRes = await fetch(
          // Chave no cabecalho, nao na URL (URLs aparecem em logs de proxy)
          `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
          { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: corpoGemini },
        ).catch(() => null);
        modeloUsado = modelo;
        if (geminiRes && geminiRes.ok) break;
        if (geminiRes && ![429, 500, 503].includes(geminiRes.status)) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (geminiRes && geminiRes.ok) break;
    }

    if (!geminiRes || !geminiRes.ok) {
      const errData = geminiRes ? await geminiRes.json().catch(() => ({})) : {};
      console.error('[analisar-dano] Gemini', geminiRes?.status, (errData as any).error?.message);
      return NextResponse.json({ error: 'IA ocupada', codigo: 'IA_OCUPADA' }, { status: 503 });
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
          severidade: sevMatch && ['leve', 'moderado', 'grave', 'severo'].includes(sevMatch[1]) ? sevMatch[1] : 'moderado',
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
        severidade: ['leve', 'moderado', 'grave', 'severo'].includes(parsed.severidade) ? parsed.severidade : 'moderado',
        checklist_inspecao: parsed.checklist_inspecao || [],
        pecas_afetadas: parsed.pecas_afetadas || [],
        estimativa_custo: parsed.estimativa_custo || null,
        confianca: parsed.confianca || null,
        fotos_analisadas: fotos.map((f) => f.id),
        modelo_usado: modeloUsado,
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
