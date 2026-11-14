import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { podeVerSolicitacao } from '@/lib/acesso-servico';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { baixarMidia } from '@/lib/midia-servidor';
import { routing } from '@/i18n/routing';
import { currencyForCountry } from '@/lib/currency';
import { chamarGemini } from '@/lib/gemini';
import { promptAnalise, normalizarAnalise, VERSAO_ANALISE } from '@/lib/analise-prompt';

const NOMES: Record<string, string> = { pt: 'portugues do Brasil', 'pt-PT': 'portugues europeu', en: 'ingles', et: 'estoniano', it: 'italiano', ru: 'russo' };
const IDIOMA_DO_PAIS: Record<string, string> = { EE: 'et', IT: 'it', PT: 'pt-PT', BR: 'pt' };
const valido = (l: unknown) => (routing.locales as readonly string[]).find((x) => x.toLowerCase() === String(l || '').trim().toLowerCase());

export async function POST(req: NextRequest) {
  try {
    const corpo = await req.json();
    const solicitacao_id = corpo?.solicitacao_id;
    if (!solicitacao_id) {
      return NextResponse.json({ error: 'solicitacao_id obrigatório' }, { status: 400 });
    }

    // So quem pode ver o pedido (cliente, oficinas enquanto aberto, oficina
    // envolvida, admin).
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    if (!(await podeVerSolicitacao(userId, solicitacao_id))) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const [{ data: existing }, { data: fotos }, { data: sol }] = await Promise.all([
      supabaseAdmin.from('analise_dano').select('*').eq('solicitacao_id', solicitacao_id).maybeSingle(),
      supabaseAdmin.from('solicitacao_fotos').select('id, foto_url').eq('solicitacao_id', solicitacao_id),
      supabaseAdmin.from('solicitacoes')
        .select('tipo, descricao, pais, veiculo:veiculos(fipe_marca, fipe_modelo, fipe_ano, fipe_valor)')
        .eq('id', solicitacao_id).single(),
    ]);

    // O que a IA leu: tipo + descricao + fotos. Analise de formato antigo
    // (sem estimativa detalhada/observacoes/perguntas) ou de um pedido que
    // mudou depois (cliente mandou foto ou editou o texto) e refeita; antes a
    // primeira analise ficava para sempre.
    const fotoIds = (fotos || []).map((f) => f.id).sort();
    const entrada = createHash('sha1').update(JSON.stringify([sol?.tipo || '', (sol?.descricao || '').trim(), fotoIds])).digest('hex').slice(0, 16);
    const bruto = (existing?.raw_response || {}) as { versao?: number; entrada?: string };
    if (existing && Number(bruto.versao || 0) >= VERSAO_ANALISE && (!bruto.entrada || bruto.entrada === entrada)) {
      return NextResponse.json({ analise: existing });
    }

    // Sem foto a IA analisa pela descricao (dono 03/11) ou, sem descricao,
    // pelo tipo de servico + carro (ex.: revisao). So 'outro' sem nada nao da.
    const temDescricao = !!sol?.descricao?.trim();
    const tipoUtil = !!sol?.tipo && sol.tipo !== 'outro';
    if (fotoIds.length === 0 && !temDescricao && !tipoUtil) {
      if (existing) return NextResponse.json({ analise: existing });
      return NextResponse.json({ error: 'Nada para analisar', codigo: 'SEM_FOTOS' }, { status: 404 });
    }

    // limite por pessoa so quando a IA e chamada de fato (cada analise custa);
    // antes contava tambem quem so abria uma analise ja pronta
    if (!dentroDoLimite(`analisar:${userId}`, 20, 60 * 60 * 1000)) {
      if (existing) return NextResponse.json({ analise: existing, desatualizada: true });
      return NextResponse.json({ error: 'Muitas requisições', codigo: 'IA_OCUPADA' }, { status: 429 });
    }

    const veiculo = sol?.veiculo as any;
    const carro = [veiculo?.fipe_marca, veiculo?.fipe_modelo, veiculo?.fipe_ano].filter(Boolean).join(' ') || 'nao informado';
    const contexto = `Veículo: ${carro}. Tipo de serviço: ${sol?.tipo || 'não informado'}. Descrição do cliente: ${sol?.descricao?.trim() || 'não informada'}.${veiculo?.fipe_valor ? ` Valor FIPE: ${veiculo.fipe_valor}.` : ''}`;

    // Lingua da tela de quem pediu (o texto e mostrado a ela; os outros leem
    // traduzido), senao a do perfil, senao a do pais do pedido. Antes: so o
    // perfil, e perfil sem lingua virava portugues do Brasil.
    const pais = (sol as { pais?: string | null } | null)?.pais || 'EE';
    let idioma = valido(corpo?.idioma);
    if (!idioma) {
      const { data: perfil } = await supabaseAdmin.from('profiles').select('idioma').eq('id', userId).maybeSingle();
      idioma = valido(perfil?.idioma) || IDIOMA_DO_PAIS[pais] || 'en';
    }
    const nomeIdioma = NOMES[idioma] || 'ingles';
    const moeda = currencyForCountry(pais) === 'BRL' ? 'reais (BRL)' : 'euros (EUR)';
    const mercado = pais === 'BR' ? 'Brasil' : pais === 'EE' ? 'Estonia' : pais === 'IT' ? 'Italia' : pais === 'PT' ? 'Portugal' : pais;

    // Build image parts for Gemini
    const imageParts: any[] = [];
    for (const foto of (fotos || []).slice(0, 4)) {
      try {
        // Espaco privado: baixa pelo servidor (o endereco publico nao abre mais)
        const midia = await baixarMidia(foto.foto_url);
        if (!midia) continue;
        imageParts.push({
          inline_data: { mime_type: midia.tipo.startsWith('image/') ? midia.tipo : 'image/jpeg', data: midia.buffer.toString('base64') },
        });
      } catch { /* skip */ }
    }
    // foto que nao baixou: segue so com o texto (se houver)
    if (imageParts.length === 0 && !temDescricao && !tipoUtil) {
      if (existing) return NextResponse.json({ analise: existing });
      return NextResponse.json({ error: 'Não foi possível carregar as fotos' }, { status: 500 });
    }
    const soTexto = imageParts.length === 0;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      if (existing) return NextResponse.json({ analise: existing, desatualizada: true });
      return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 500 });
    }

    // Gemini as vezes responde "alta demanda" (503/429): tenta de novo e,
    // se continuar, usa outro modelo - antes a oficina via o erro em ingles.
    const corpoGemini = {
      contents: [{
        parts: [
          ...imageParts,
          { text: promptAnalise({ tipo: sol?.tipo, contexto, soTexto, mercado, moeda, nomeIdioma }) },
        ],
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    };
    // 3.5-flash por ultimo: levou 82 s numa leitura de 2 paginas (09/10)
    const geminiRes = await chamarGemini(
      [{ modelo: 'gemini-2.5-flash' }, { modelo: 'gemini-3.5-flash-lite' }, { modelo: 'gemini-3.5-flash' }],
      corpoGemini, { rotulo: 'analisar-dano' },
    );

    if (!geminiRes || !geminiRes.ok) {
      const errData = geminiRes ? await geminiRes.json().catch(() => ({})) : {};
      const msgErro = String((errData as any).error?.message || '');
      console.error('[analisar-dano] Gemini', geminiRes?.status, msgErro);
      // IA fora do ar: a analise antiga continua valendo (a tela mostra o que tem)
      if (existing) return NextResponse.json({ analise: existing, desatualizada: true });
      // foto que a IA nao consegue ler (corrompida/formato) x servico ocupado
      if (geminiRes?.status === 400 && /image/i.test(msgErro)) {
        return NextResponse.json({ error: 'Foto ilegivel', codigo: 'FOTO_INVALIDA' }, { status: 422 });
      }
      return NextResponse.json({ error: 'IA ocupada', codigo: 'IA_OCUPADA' }, { status: 503 });
    }

    const geminiData = await geminiRes.json();
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    // Find the text part (skip "thought" parts from Gemini 2.5)
    const textPart = parts.find((p: any) => p.text && !p.thought);
    const content = textPart?.text || parts.find((p: any) => p.text)?.text;

    if (!content) {
      console.error('[analisar-dano] Gemini response:', JSON.stringify(geminiData).slice(0, 500));
      if (existing) return NextResponse.json({ analise: existing, desatualizada: true });
      return NextResponse.json({ error: 'Sem resposta da IA', codigo: 'IA_OCUPADA' }, { status: 503 });
    }

    // Parse JSON - handle truncated responses by fixing incomplete JSON
    let parsed;
    let completa = true;
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
      completa = false;
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
        // so o resumo, se der; nada inventado (antes: checklist fixo em portugues)
        const resumoMatch = rawJson.match(/"resumo"\s*:\s*"([^"]+)"/);
        const sevMatch = rawJson.match(/"severidade"\s*:\s*"([^"]+)"/);
        parsed = { resumo: resumoMatch ? resumoMatch[1] : '', severidade: sevMatch?.[1], confianca: 0.3 };
      }
    }

    const a = normalizarAnalise(parsed, soTexto);
    if (!a.resumo && !a.estimativa_custo && a.observacoes.length === 0 && a.perguntas_sugeridas.length === 0) {
      if (existing) return NextResponse.json({ analise: existing, desatualizada: true });
      return NextResponse.json({ error: 'Resposta vazia da IA', codigo: 'IA_OCUPADA' }, { status: 503 });
    }

    // Uma linha por pedido (UNIQUE solicitacao_id): refazer substitui.
    // Resposta cortada nao ganha a versao atual: na proxima abertura e refeita.
    const { data: analise, error: insertError } = await supabaseAdmin
      .from('analise_dano')
      .upsert({
        solicitacao_id,
        resumo: a.resumo,
        severidade: a.severidade,
        checklist_inspecao: a.checklist_inspecao,
        pecas_afetadas: a.pecas_afetadas,
        estimativa_custo: a.estimativa_custo,
        confianca: a.confianca,
        fotos_analisadas: imageParts.length ? fotoIds : [],
        modelo_usado: geminiData.modelVersion || 'gemini',
        raw_response: { ...a, versao: completa ? VERSAO_ANALISE : 1, entrada, idioma, so_texto: soTexto },
        created_at: new Date().toISOString(),
      }, { onConflict: 'solicitacao_id' })
      .select()
      .single();

    if (insertError) {
      console.error('[analisar-dano] gravar', insertError.message);
      if (existing) return NextResponse.json({ analise: existing, desatualizada: true });
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ analise });
  } catch (err) {
    console.error('[analisar-dano]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
