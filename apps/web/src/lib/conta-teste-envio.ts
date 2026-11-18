import { supabaseAdmin } from './supabase-admin';

// Contas de teste (profiles.conta_teste = true) nao recebem e-mail (Resend), SMS
// (Twilio) nem push do app (Expo) em producao - pedido do dono 18/11: os testes
// em producao com as contas TEST - ... nao podem gastar envio nem encher caixas.
// Contas reais: nada muda (mesma chamada, mesmo conteudo); se a consulta falhar,
// o envio segue como antes (na duvida, envia).

const VALIDADE_MS = 5 * 60 * 1000;
const MAX_ITENS = 1000;
const porEmail = new Map<string, { teste: boolean; ate: number }>();
const porPerfil = new Map<string, { teste: boolean; ate: number }>();

function lembrar(m: Map<string, { teste: boolean; ate: number }>, chave: string, teste: boolean) {
  if (m.size >= MAX_ITENS) m.clear();
  m.set(chave, { teste, ate: Date.now() + VALIDADE_MS });
}

// ilike sem curinga: o e-mail pode ter "_" (curinga do LIKE)
const semCuringa = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** true se o endereco e de um perfil marcado como conta de teste */
export async function emailDeContaTeste(email: string | null | undefined): Promise<boolean> {
  const chave = String(email || '').trim().toLowerCase();
  if (!chave || !chave.includes('@')) return false;
  const c = porEmail.get(chave);
  if (c && c.ate > Date.now()) return c.teste;
  try {
    const { data, error } = await supabaseAdmin.from('profiles').select('id')
      .ilike('email', semCuringa(chave)).eq('conta_teste', true).limit(1);
    if (error) throw new Error(error.message);
    const teste = (data || []).length > 0;
    lembrar(porEmail, chave, teste);
    return teste;
  } catch (e) {
    console.error('[envio] consulta conta de teste falhou:', (e as Error).message);
    return false;
  }
}

/** true se o perfil e conta de teste */
export async function perfilDeContaTeste(profileId: string | null | undefined): Promise<boolean> {
  if (!profileId) return false;
  const c = porPerfil.get(profileId);
  if (c && c.ate > Date.now()) return c.teste;
  try {
    const { data, error } = await supabaseAdmin.from('profiles').select('conta_teste').eq('id', profileId).maybeSingle();
    if (error) throw new Error(error.message);
    const teste = data?.conta_teste === true;
    lembrar(porPerfil, profileId, teste);
    return teste;
  } catch (e) {
    console.error('[envio] consulta conta de teste falhou:', (e as Error).message);
    return false;
  }
}
