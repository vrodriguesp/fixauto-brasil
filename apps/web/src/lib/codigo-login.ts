import { randomInt, createHash, randomUUID } from 'node:crypto';
import { supabaseAdmin } from './supabase-admin';
import { iguaisSeguro } from './segredos';
import { enviarEmail } from './email';
import { escapeHtml } from './email-i18n';
import { idiomaDoSite } from './site-url';

// "Receber um codigo por e-mail" na tela de login (site e app; dono 12/11;
// migracao 080, tabela codigos_login). Entra em contas COM ou SEM senha - a
// senha nao muda. Mesmas regras do codigo do pedido: so o hash no banco, 5
// tentativas contadas no banco, 15 min de validade. E-mail sem conta tambem
// ganha uma linha (user_id nulo, codigo nunca enviado): a resposta e a mesma
// para todo mundo, como no /api/esqueci-senha (nao revela quem tem conta).
export const CODIGO_LOGIN_MINUTOS = 15;
export const CODIGO_LOGIN_TENTATIVAS = 5;

export const novoCodigoLogin = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const hashCodigoLogin = (id: string, codigo: string) => createHash('sha256').update(`login:${id}:${codigo}`).digest('hex');
export const codigoLoginConfere = (id: string, codigo: string, hash: string) =>
  /^\d{6}$/.test(codigo) && iguaisSeguro(hashCodigoLogin(id, codigo), hash);

/** Guarda o pedido de codigo (ou um registro vazio para e-mail sem conta) e devolve o id. */
export async function guardarCodigoLogin(email: string, userId: string | null, codigo: string | null): Promise<string> {
  const id = randomUUID();
  const { error } = await supabaseAdmin.from('codigos_login').insert({
    id, user_id: userId, email,
    // sem conta: hash de um codigo aleatorio que nunca foi enviado (ninguem acerta)
    codigo_hash: hashCodigoLogin(id, codigo ?? novoCodigoLogin()),
    expira_em: new Date(Date.now() + CODIGO_LOGIN_MINUTOS * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return id;
}

/** Apaga codigos vencidos ha mais de 1 h (chamado de vez em quando, sem bloquear). */
export async function limparCodigosLogin() {
  await supabaseAdmin.from('codigos_login').delete().lt('expira_em', new Date(Date.now() - 3600 * 1000).toISOString()).then(() => {}, () => {});
}

// E-mail do codigo de login (6 idiomas): o codigo grande e sozinho na linha.
const TXT: Record<string, { assunto: string; ola: string; texto: string; validade: string; ignore: string }> = {
  et: { assunto: 'Sinu BipFixi sisselogimiskood: {c}', ola: 'Tere, {n}!', texto: 'Sisesta see kood BipFixi sisselogimise lehel:', validade: 'Kood kehtib 15 minutit ja seda saab kasutada ühe korra.', ignore: 'Kui sa ei proovinud sisse logida, ignoreeri seda kirja – ilma koodita ei pääse keegi sinu kontole.' },
  ru: { assunto: 'Ваш код входа BipFix: {c}', ola: 'Здравствуйте, {n}!', texto: 'Введите этот код на странице входа BipFix:', validade: 'Код действует 15 минут и подходит только один раз.', ignore: 'Если вы не пытались войти, просто проигнорируйте это письмо – без кода никто не попадёт в ваш аккаунт.' },
  en: { assunto: 'Your BipFix sign-in code: {c}', ola: 'Hello {n},', texto: 'Enter this code on the BipFix sign-in page:', validade: 'The code is valid for 15 minutes and works once.', ignore: 'If you did not try to sign in, ignore this e-mail – nobody can access your account without the code.' },
  it: { assunto: 'Il tuo codice di accesso BipFix: {c}', ola: 'Ciao {n},', texto: 'Inserisci questo codice nella pagina di accesso BipFix:', validade: 'Il codice è valido per 15 minuti e funziona una sola volta.', ignore: 'Se non hai provato ad accedere, ignora questa e-mail: senza il codice nessuno entra nel tuo account.' },
  pt: { assunto: 'Seu código de acesso BipFix: {c}', ola: 'Olá, {n}!', texto: 'Digite este código na página de entrada da BipFix:', validade: 'O código vale por 15 minutos e funciona uma vez só.', ignore: 'Se você não tentou entrar, ignore este e-mail – sem o código ninguém entra na sua conta.' },
  'pt-PT': { assunto: 'O seu código de acesso BipFix: {c}', ola: 'Olá, {n}!', texto: 'Introduza este código na página de entrada da BipFix:', validade: 'O código é válido durante 15 minutos e funciona uma só vez.', ignore: 'Se não tentou iniciar sessão, ignore este e-mail – sem o código ninguém entra na sua conta.' },
};

export async function enviarCodigoLogin(email: string, nome: string, codigo: string, idioma: string | null): Promise<boolean> {
  const x = TXT[idiomaDoSite(idioma)] || TXT.en;
  const f = (s: string) => s.replace('{c}', codigo).replace('{n}', escapeHtml(nome));
  return enviarEmail({ para: email, assunto: f(x.assunto), html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0c4a6e;color:white;padding:24px;border-radius:12px 12px 0 0;"><h1 style="margin:0;font-size:24px;">BipFix</h1></div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
        <p>${f(x.ola)}</p>
        <p>${x.texto}</p>
        <p style="font-size:36px;font-weight:bold;letter-spacing:8px;margin:24px 0;color:#0c4a6e;">${codigo}</p>
        <p style="color:#6b7280;">${x.validade}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:12px;color:#9ca3af;">${x.ignore}</p>
      </div>
    </div>` });
}
