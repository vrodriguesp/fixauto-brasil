import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { jaNaLingua, linguaDoTexto } from '@/lib/lingua-provavel';

// Traducao automatica com DeepL (dono 03/11). Cada texto e traduzido uma vez so
// por lingua de destino e fica em `traducoes` (migracao 068). Sem chave, com
// erro ou ja na lingua de destino: texto null (quem chama mostra o original).
// Texto que claramente ja esta na lingua de quem le nem vai ao DeepL nem ao
// cache (lib/lingua-provavel.ts) - economiza chamadas (dono 03/11).

// lingua do site -> lingua de destino do DeepL
export const ALVO_DEEPL: Record<string, string> = { pt: 'PT-BR', 'pt-PT': 'PT-PT', en: 'EN-GB', et: 'ET', it: 'IT', ru: 'RU' };

// contexto do site para o DeepL (nao e cobrado): resolve ambiguidades como
// "auto vastu võtta" = a oficina recebe o carro (teste cego 03/11)
const CONTEXTO = 'Car repair marketplace in Tallinn, Estonia. Messages, repair requests and quotes between car owners and auto repair workshops. When an owner asks a workshop to "auto vastu võtta" (принять машину), the owner brings the car and the workshop receives it.';
// pares com glossario de oficina no DeepL (scripts/deepl-glossario.mjs)
const PARES_GLOSSARIO = new Set(['et>ru', 'ru>et']);

export interface Traducao { texto: string | null; origem: string | null }

const hashDe = (texto: string, alvo: string) => createHash('sha256').update(`${alvo}\n${texto}`).digest('hex');

/** Traduz `textos` para a lingua do site `lingua` (pt, et, ru...). Mesma ordem na volta.
 *  guardar=false: nao le nem grava o cache (chat de suporte: texto pessoal, nao se repete
 *  e a traducao ja fica na propria mensagem - apagar a conversa apaga tudo). */
export async function traduzirTextos(textos: string[], lingua: string, guardar = true): Promise<Traducao[]> {
  const alvo = ALVO_DEEPL[lingua];
  const vazio: Traducao = { texto: null, origem: null };
  const resultado: Traducao[] = textos.map(() => vazio);
  if (!alvo || !textos.length) return resultado;
  const limpos = textos.map((t) => (t || '').trim());
  const hashes = limpos.map((t) => hashDe(t, alvo));

  // 1) o que ja foi traduzido antes
  const pular = new Set(limpos.map((t, i) => (!t || jaNaLingua(t, lingua) ? i : -1)));
  const consultar = hashes.filter((_, i) => !pular.has(i));
  const { data: guardadas } = guardar && consultar.length ? await supabaseAdmin.from('traducoes').select('hash, origem, traducao').in('hash', Array.from(new Set(consultar))) : { data: [] };
  const porHash = new Map((guardadas || []).map((g) => [g.hash, g]));
  const faltam: number[] = [];
  limpos.forEach((t, i) => {
    // ja na lingua de quem le: sem traducao, mas com a origem (o chat de suporte nao confunde com "DeepL falhou")
    if (pular.has(i)) { if (t) resultado[i] = { texto: null, origem: alvo.split('-')[0] }; return; }
    const g = porHash.get(hashes[i]);
    if (g) resultado[i] = { texto: g.traducao, origem: g.origem };
    else faltam.push(i);
  });

  // 2) o resto vai ao DeepL: uma chamada por lingua de origem conhecida com glossario
  //    (ET<->RU, scripts/deepl-glossario.mjs) e uma sem origem (o DeepL detecta)
  const chave = process.env.DEEPL_API_KEY;
  const novos = Array.from(new Map(faltam.map((i) => [hashes[i], i])).values());
  if (!chave || !novos.length) return resultado;
  const host = chave.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const glossario = process.env.DEEPL_GLOSSARIO_ID;
  const grupos = new Map<string, number[]>();
  for (const i of novos) {
    const origem = glossario ? linguaDoTexto(limpos[i]) : null;
    const g = origem && PARES_GLOSSARIO.has(`${origem}>${alvo.split('-')[0].toLowerCase()}`) ? origem : '';
    grupos.set(g, [...(grupos.get(g) || []), i]);
  }
  try {
    // allSettled: se uma chamada cair (tempo, rede), a outra continua valendo e vai para o cache
    const linhas = (await Promise.allSettled(Array.from(grupos).map(async ([origem, idx]) => {
      const r = await fetch(`${host}/v2/translate`, {
        method: 'POST',
        headers: { Authorization: `DeepL-Auth-Key ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: idx.map((i) => limpos[i]), target_lang: alvo, context: CONTEXTO,
          ...(origem ? { source_lang: origem.toUpperCase(), glossary_id: glossario } : {}),
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) { console.error('[deepl]', r.status, (await r.text()).slice(0, 200)); return []; }
      const d = await r.json();
      return idx.map((i, k) => {
        const tr = d.translations?.[k];
        const detectada = String(tr?.detected_source_language || '').toUpperCase() || null;
        // ja estava na lingua de quem le: guarda sem traducao
        const mesma = !!detectada && alvo.split('-')[0] === detectada.split('-')[0];
        return { hash: hashes[i], alvo, origem: detectada, traducao: mesma ? null : (tr?.text ?? null) };
      });
    }))).flatMap((r) => (r.status === 'fulfilled' ? r.value : (console.error('[deepl]', r.reason), [])));
    if (guardar && linhas.length) await supabaseAdmin.from('traducoes').upsert(linhas, { onConflict: 'hash' });
    const porNovo = new Map(linhas.map((l) => [l.hash, l]));
    for (const i of faltam) { const l = porNovo.get(hashes[i]); if (l) resultado[i] = { texto: l.traducao, origem: l.origem }; }
  } catch (e) {
    console.error('[deepl]', e);
  }
  return resultado;
}
