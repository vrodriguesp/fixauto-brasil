import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Traducao automatica do texto livre (descricao do pedido, itens e observacoes
// do orcamento, chat) para a lingua de quem le - como Airbnb/Booking: cada um
// escreve na sua lingua e ve "traduzido do ... / ver original" (dono 03/11:
// pedido em estoniano, oficina russa). DeepL API; cada texto e traduzido uma
// vez so por lingua e fica guardado em `traducoes`. Sem chave ou com erro, a
// tela mostra o original.

// lingua do site -> lingua de destino do DeepL
const ALVO: Record<string, string> = { pt: 'PT-BR', 'pt-PT': 'PT-PT', en: 'EN-GB', et: 'ET', it: 'IT', ru: 'RU' };
const MAX_TEXTOS = 50;
const MAX_CHARS = 3000;

export interface Traducao { texto: string | null; origem: string | null }

const hashDe = (texto: string, alvo: string) => createHash('sha256').update(`${alvo}\n${texto}`).digest('hex');

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const corpo = await request.json().catch(() => null);
  const alvo = ALVO[corpo?.lingua as string];
  const textos: string[] = Array.isArray(corpo?.textos) ? corpo.textos.slice(0, MAX_TEXTOS).map((t: unknown) => String(t ?? '').slice(0, MAX_CHARS)) : [];
  if (!alvo || !textos.length) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  const vazio: Traducao = { texto: null, origem: null };
  const hashes = textos.map((t) => hashDe(t.trim(), alvo));
  const resultado: Traducao[] = textos.map(() => vazio);

  // 1) o que ja foi traduzido antes
  const { data: guardadas } = await supabaseAdmin.from('traducoes').select('hash, origem, traducao').in('hash', Array.from(new Set(hashes)));
  const porHash = new Map((guardadas || []).map((g) => [g.hash, g]));
  const faltam: number[] = [];
  textos.forEach((t, i) => {
    if (!t.trim()) return;
    const g = porHash.get(hashes[i]);
    if (g) resultado[i] = { texto: g.traducao, origem: g.origem };
    else faltam.push(i);
  });

  // 2) o resto vai ao DeepL numa chamada so (com limite por pessoa)
  const chave = process.env.DEEPL_API_KEY;
  const novos = Array.from(new Map(faltam.map((i) => [hashes[i], i])).values());
  if (chave && novos.length && dentroDoLimite(`traduzir:${userId}`, 120, 60 * 60 * 1000)) {
    const host = chave.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
    try {
      const r = await fetch(`${host}/v2/translate`, {
        method: 'POST',
        headers: { Authorization: `DeepL-Auth-Key ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: novos.map((i) => textos[i].trim()), target_lang: alvo }),
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const d = await r.json();
        const linhas = novos.map((i, k) => {
          const tr = d.translations?.[k];
          const origem = String(tr?.detected_source_language || '').toUpperCase() || null;
          // ja estava na lingua de quem le: guarda sem traducao (a tela mostra o original)
          const mesma = !!origem && alvo.split('-')[0] === origem.split('-')[0];
          return { hash: hashes[i], alvo, origem, traducao: mesma ? null : (tr?.text ?? null) };
        });
        await supabaseAdmin.from('traducoes').upsert(linhas, { onConflict: 'hash' });
        const porNovo = new Map(linhas.map((l) => [l.hash, l]));
        for (const i of faltam) { const l = porNovo.get(hashes[i]); if (l) resultado[i] = { texto: l.traducao, origem: l.origem }; }
      } else {
        console.error('[traduzir] DeepL', r.status, (await r.text()).slice(0, 200));
      }
    } catch (e) {
      console.error('[traduzir]', e);
    }
  }

  return NextResponse.json({ traducoes: resultado });
}
