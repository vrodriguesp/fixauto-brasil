import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Traducao automatica com DeepL (dono 03/11). Cada texto e traduzido uma vez so
// por lingua de destino e fica em `traducoes` (migracao 068). Sem chave, com
// erro ou ja na lingua de destino: texto null (quem chama mostra o original).

// lingua do site -> lingua de destino do DeepL
export const ALVO_DEEPL: Record<string, string> = { pt: 'PT-BR', 'pt-PT': 'PT-PT', en: 'EN-GB', et: 'ET', it: 'IT', ru: 'RU' };

export interface Traducao { texto: string | null; origem: string | null }

const hashDe = (texto: string, alvo: string) => createHash('sha256').update(`${alvo}\n${texto}`).digest('hex');

/** Traduz `textos` para a lingua do site `lingua` (pt, et, ru...). Mesma ordem na volta. */
export async function traduzirTextos(textos: string[], lingua: string): Promise<Traducao[]> {
  const alvo = ALVO_DEEPL[lingua];
  const vazio: Traducao = { texto: null, origem: null };
  const resultado: Traducao[] = textos.map(() => vazio);
  if (!alvo || !textos.length) return resultado;
  const limpos = textos.map((t) => (t || '').trim());
  const hashes = limpos.map((t) => hashDe(t, alvo));

  // 1) o que ja foi traduzido antes
  const { data: guardadas } = await supabaseAdmin.from('traducoes').select('hash, origem, traducao').in('hash', Array.from(new Set(hashes)));
  const porHash = new Map((guardadas || []).map((g) => [g.hash, g]));
  const faltam: number[] = [];
  limpos.forEach((t, i) => {
    if (!t) return;
    const g = porHash.get(hashes[i]);
    if (g) resultado[i] = { texto: g.traducao, origem: g.origem };
    else faltam.push(i);
  });

  // 2) o resto vai ao DeepL numa chamada so
  const chave = process.env.DEEPL_API_KEY;
  const novos = Array.from(new Map(faltam.map((i) => [hashes[i], i])).values());
  if (!chave || !novos.length) return resultado;
  const host = chave.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  try {
    const r = await fetch(`${host}/v2/translate`, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: novos.map((i) => limpos[i]), target_lang: alvo }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { console.error('[deepl]', r.status, (await r.text()).slice(0, 200)); return resultado; }
    const d = await r.json();
    const linhas = novos.map((i, k) => {
      const tr = d.translations?.[k];
      const origem = String(tr?.detected_source_language || '').toUpperCase() || null;
      // ja estava na lingua de quem le: guarda sem traducao
      const mesma = !!origem && alvo.split('-')[0] === origem.split('-')[0];
      return { hash: hashes[i], alvo, origem, traducao: mesma ? null : (tr?.text ?? null) };
    });
    await supabaseAdmin.from('traducoes').upsert(linhas, { onConflict: 'hash' });
    const porNovo = new Map(linhas.map((l) => [l.hash, l]));
    for (const i of faltam) { const l = porNovo.get(hashes[i]); if (l) resultado[i] = { texto: l.traducao, origem: l.origem }; }
  } catch (e) {
    console.error('[deepl]', e);
  }
  return resultado;
}
