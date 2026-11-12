import { supabaseAdmin } from './supabase-admin';

// Login sem senha, de uso unico (dono 12/11): o servidor gera o token do
// Supabase (generateLink NAO manda e-mail nenhum) e o navegador/app troca por
// sessao com supabase.auth.verifyOtp({ token_hash, type: 'email' }). So e chamado
// depois de uma prova do e-mail (codigo de 6 digitos digitado, link de uso unico
// tocado). O e-mail vem da propria conta (user_id), nunca do que foi digitado.
// senhaDefinida=false: a tela "crie a sua senha" aparece antes do destino.
export async function loginPorToken(userId: string): Promise<{ tokenHash: string | null; senhaDefinida: boolean }> {
  const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
  let tokenHash: string | null = null;
  if (u?.user?.email) {
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: u.user.email });
    if (error) console.error('[login-token] generateLink', error.message);
    tokenHash = link?.properties?.hashed_token || null;
  }
  const { data: perfil } = await supabaseAdmin.from('profiles').select('senha_definida').eq('id', userId).maybeSingle();
  return { tokenHash, senhaDefinida: perfil?.senha_definida !== false };
}
