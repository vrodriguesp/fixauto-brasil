import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { traduzirTextos } from '@/lib/deepl';

// Chat de suporte (dono 03/11) - regras do servidor. Ver migracao 069.

/** lingua em que o admin le as mensagens */
export const IDIOMA_ADMIN = 'pt';
/** admin "online" = abriu alguma pagina do admin nos ultimos 3 min */
const ONLINE_MS = 3 * 60 * 1000;
/** mensagem automatica no maximo uma vez a cada 6 h por conversa */
const AUTO_MS = 6 * 60 * 60 * 1000;
/** e-mail ao admin / a pessoa: no maximo um a cada 15 min por conversa */
export const AVISO_MS = 15 * 60 * 1000;
/** a pessoa esta com o chat aberto se buscou mensagens nos ultimos 2 min */
export const ATIVO_MS = 2 * 60 * 1000;

export const LINGUAS = ['pt', 'pt-PT', 'en', 'et', 'it', 'ru'] as const;
export const linguaValida = (l: unknown) => (LINGUAS as readonly string[]).includes(String(l)) ? String(l) : 'et';

export const novoToken = () => randomBytes(24).toString('hex');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export interface Conversa {
  id: string; profile_id: string | null; visitante_nome: string | null; visitante_email: string | null;
  idioma: string; nao_lidas_usuario: number; nao_lidas_admin: number;
  usuario_visto_em: string | null; admin_avisado_em: string | null; usuario_avisado_em: string | null;
}
const CAMPOS = 'id, profile_id, visitante_nome, visitante_email, idioma, nao_lidas_usuario, nao_lidas_admin, usuario_visto_em, admin_avisado_em, usuario_avisado_em';

/** conversa de quem chama: pela conta (logado) ou pela chave do visitante.
 *  erro=true: falha do banco (nao confundir com "nao existe" - o visitante perderia a chave) */
export async function conversaDe(userId: string | null, conversaId?: string | null, token?: string | null): Promise<{ conversa: Conversa | null; erro: boolean }> {
  if (!userId && (!conversaId || !token || !/^[0-9a-f-]{36}$/.test(conversaId))) return { conversa: null, erro: false };
  const q = supabaseAdmin.from('suporte_conversas').select(CAMPOS);
  const { data, error } = userId ? await q.eq('profile_id', userId).maybeSingle() : await q.eq('id', conversaId!).eq('token_hash', hashToken(token!)).maybeSingle();
  if (error) console.error('[suporte] conversa', error.message);
  return { conversa: (data as Conversa | null) ?? null, erro: !!error };
}

export async function configSuporte(): Promise<{ traducao: boolean; adminOnline: boolean }> {
  const { data } = await supabaseAdmin.from('plataforma_config').select('suporte_traducao, admin_visto_em').eq('id', 1).maybeSingle();
  return {
    traducao: data?.suporte_traducao ?? true,
    adminOnline: !!data?.admin_visto_em && Date.now() - Date.parse(data.admin_visto_em) < ONLINE_MS,
  };
}

// limite de traducao por conversa e por dia (protege a cota do DeepL de quem
// manda mensagens em massa); passou, a mensagem vai sem traducao. Na memoria:
// zera quando o servidor reinicia - suficiente para o volume de hoje.
const LIMITE_CHARS_DIA = 10_000;
const gastoDia = new Map<string, number>();

/** traduz um texto para `lingua` se a traducao estiver ligada; null = mostra o original */
export async function traduzirSeLigado(texto: string, lingua: string, ligado: boolean, conversaId: string) {
  if (!ligado) return { traducao: null, origem: null };
  const chave = `${new Date().toISOString().slice(0, 10)}:${conversaId}`;
  const gasto = (gastoDia.get(chave) || 0) + texto.length;
  if (gasto > LIMITE_CHARS_DIA) return { traducao: null, origem: null };
  gastoDia.set(chave, gasto);
  if (gastoDia.size > 5000) gastoDia.clear();
  const [t] = await traduzirTextos([texto], lingua, false);
  return { traducao: t.texto, origem: t.origem };
}

/** a ultima mensagem automatica desta conversa foi ha mais de 6 h (ou nunca) */
export async function podeMandarAuto(conversaId: string) {
  const { data } = await supabaseAdmin.from('suporte_mensagens').select('created_at').eq('conversa_id', conversaId).eq('autor', 'auto')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return !data || Date.now() - Date.parse(data.created_at) > AUTO_MS;
}

export const recente = (iso: string | null, ms: number) => !!iso && Date.now() - Date.parse(iso) < ms;
