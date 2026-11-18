import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { chamarGemini } from '@/lib/gemini';
import { traduzirTextos } from '@/lib/deepl';
import { linguaDoTexto } from '@/lib/lingua-provavel';
import { LOCALES_SITE, type DescricaoTraducoes, type LocaleSite } from '@/lib/oficina-publica';

// Traducao da descricao publica da oficina ("Töökojast") para as 6 linguas do
// site, UMA vez por texto, ao gravar o perfil (dono 18/11: "nao precisa traduzir
// cada vez que alguem abre a pagina"). Fica em oficinas.descricao_traducoes
// (migracao 099): { origem, hash, et, ru, en, pt, 'pt-PT', it }. A pagina le o
// guardado; sem traducao mostra o original.
//
// Provedor: UMA chamada ao Gemini devolvendo todas as linguas em JSON (plano
// gratis ~20 pedidos/dia - nunca uma chamada por lingua). Sem Gemini/erro: DeepL
// (lib/deepl.ts, uma chamada por lingua, com o cache `traducoes`). Nos testes
// TRADUCAO_FAKE=1 devolve "[xx] texto" sem chamar ninguem.

const NOMES: Record<LocaleSite, string> = { et: 'Estonian', ru: 'Russian', en: 'English', pt: 'Brazilian Portuguese', 'pt-PT': 'European Portuguese', it: 'Italian' };
const MAX_CHARS = 2000;

export const hashDescricao = (texto: string) => createHash('sha256').update(texto.trim()).digest('hex').slice(0, 32);

function origemDe(texto: string): LocaleSite {
  const l = linguaDoTexto(texto);
  return (l && (LOCALES_SITE as readonly string[]).includes(l) ? l : 'et') as LocaleSite;
}

async function viaGemini(texto: string, origem: LocaleSite, alvos: LocaleSite[]): Promise<Partial<Record<LocaleSite, string>> | null> {
  const res = await chamarGemini(
    [{ modelo: 'gemini-2.5-flash', semRaciocinio: true }, { modelo: 'gemini-3.5-flash-lite' }],
    {
      contents: [{ role: 'user', parts: [{ text:
        `Translate the following car repair workshop description (written in ${NOMES[origem]}) into ${alvos.map((a) => `${NOMES[a]} (key "${a}")`).join(', ')}. ` +
        'Keep the meaning, tone and line breaks; do not add information; keep company and insurer names as they are. ' +
        'Answer ONLY with a JSON object whose keys are exactly the given keys and values are the translations.\n\n' +
        `TEXT:\n${texto}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: 'application/json' },
    },
    { rotulo: 'traduzir-descricao', prazoTotalMs: 40_000, prazoTentativaMs: 25_000 },
  );
  if (!res?.ok) return null;
  try {
    const j = await res.json();
    const bruto = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
    const obj = JSON.parse(bruto.replace(/^```json\s*|```\s*$/g, ''));
    const saida: Partial<Record<LocaleSite, string>> = {};
    for (const a of alvos) if (typeof obj?.[a] === 'string' && obj[a].trim()) saida[a] = obj[a].trim();
    return Object.keys(saida).length ? saida : null;
  } catch { return null; }
}

async function viaDeepL(texto: string, alvos: LocaleSite[]): Promise<Partial<Record<LocaleSite, string>>> {
  const saida: Partial<Record<LocaleSite, string>> = {};
  for (const a of alvos) {
    const [t] = await traduzirTextos([texto], a);
    if (t?.texto) saida[a] = t.texto;
  }
  return saida;
}

/** Traduz `texto` para todas as linguas do site menos a de origem. */
export async function traduzirDescricao(texto: string): Promise<DescricaoTraducoes> {
  const t = (texto || '').trim().slice(0, MAX_CHARS);
  const origem = origemDe(t);
  const alvos = LOCALES_SITE.filter((l) => l !== origem);
  const base: DescricaoTraducoes = { origem, hash: hashDescricao(t) };
  if (!t) return base;
  if (process.env.TRADUCAO_FAKE === '1') {
    for (const a of alvos) base[a] = `[${a}] ${t}`;
    return base;
  }
  const g = await viaGemini(t, origem, alvos);
  const trad = g || (await viaDeepL(t, alvos));
  return { ...base, ...trad };
}

/** Garante a traducao guardada da oficina (so se a descricao mudou desde a ultima).
 *  Devolve o que ficou gravado ou null sem descricao. `forcar` ignora o hash. */
export async function garantirTraducaoDescricao(oficinaId: string, forcar = false): Promise<{ traducoes: DescricaoTraducoes | null; traduziu: boolean }> {
  const { data, error } = await supabaseAdmin.from('oficinas').select('descricao, descricao_traducoes').eq('id', oficinaId).maybeSingle();
  if (error || !data) return { traducoes: null, traduziu: false };
  const descricao = (data.descricao || '').trim();
  const atual = (data.descricao_traducoes || null) as DescricaoTraducoes | null;
  if (!descricao) {
    if (atual) await supabaseAdmin.from('oficinas').update({ descricao_traducoes: null }).eq('id', oficinaId);
    return { traducoes: null, traduziu: false };
  }
  if (!forcar && atual?.hash === hashDescricao(descricao)) return { traducoes: atual, traduziu: false };
  const novas = await traduzirDescricao(descricao);
  const { error: eUp } = await supabaseAdmin.from('oficinas').update({ descricao_traducoes: novas }).eq('id', oficinaId);
  if (eUp) console.error('[traduzir-descricao] gravar', eUp.message);
  return { traducoes: novas, traduziu: true };
}
