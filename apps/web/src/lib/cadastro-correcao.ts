import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { hashToken, iguaisSeguro } from './segredos';

// "E-mail errado? Corrigir" na tela "confira seu e-mail" do cadastro (17/11: oficina
// digitou @gmail.con e ficou presa - sem confirmar nao entra, e o reenvio ia para o
// mesmo endereco errado).
//
// So o navegador que ACABOU de criar a conta pode corrigir: o POST /api/cadastro
// devolve um token de uso unico; saber o e-mail de alguem nao basta.
//  - token = <id da conta>.<expira em segundos>.<32 bytes aleatorios>.<HMAC dos tres>
//  - na conta (auth app_metadata.correcao_email, so a service role escreve) fica so o
//    sha256 do token, o prazo e quantas correcoes ja foram feitas (maximo 3).
//  - a cada correcao o token muda (o anterior deixa de valer); o prazo continua o do
//    cadastro (24 h), como o reenvio do pedido sem conta nao estica as 24 h.
// O HMAC existe para o cadastro com e-mail JA cadastrado (que responde igual, sem criar
// conta - nao revela quem tem conta): ele devolve um token "fantasma" no mesmo formato,
// com um id que nao existe. A rota de correcao trata o fantasma como sucesso, e prazo,
// adulteracao e limite valem igual para os dois - a resposta nao diferencia.
export const CORRECAO_PRAZO_MS = 24 * 60 * 60 * 1000;
export const CORRECAO_MAX = 3;

export type CorrecaoGuardada = { hash: string; expira: string; usadas: number };
export type TokenCorrecao = { userId: string; expiraEm: number };

const chave = () => {
  const base = process.env.PEDIDO_LINK_SEGREDO || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error('PEDIDO_LINK_SEGREDO/SUPABASE_SERVICE_ROLE_KEY ausente: correcao de e-mail desligada');
  return createHash('sha256').update(`cadastro-corrigir-email:${base}`).digest();
};
const assinar = (corpo: string) => createHmac('sha256', chave()).update(corpo).digest('base64url');

/** Token novo para a conta (ou para um id fantasma) com o prazo dado. */
export function novoTokenCorrecao(userId: string, expiraEm: number): { token: string; guardar: CorrecaoGuardada } {
  const corpo = `${userId}.${Math.floor(expiraEm / 1000)}.${randomBytes(32).toString('base64url')}`;
  const token = `${corpo}.${assinar(corpo)}`;
  return { token, guardar: { hash: hashToken(token), expira: new Date(Math.floor(expiraEm / 1000) * 1000).toISOString(), usadas: 0 } };
}

/** Cadastro com e-mail que ja tem conta: token no mesmo formato, de conta nenhuma. */
export const tokenFantasma = () => novoTokenCorrecao(randomUUID(), Date.now() + CORRECAO_PRAZO_MS).token;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Confere formato e assinatura (null = adulterado/inventado). O prazo e conferido por quem chama. */
export function lerTokenCorrecao(token: unknown): TokenCorrecao | null {
  if (typeof token !== 'string' || token.length > 300) return null;
  const partes = token.split('.');
  if (partes.length !== 4) return null;
  const [userId, exp, aleatorio, mac] = partes;
  if (!UUID.test(userId) || !/^\d{1,12}$/.test(exp) || !/^[A-Za-z0-9_-]{43}$/.test(aleatorio)) return null;
  if (!iguaisSeguro(assinar(`${userId}.${exp}.${aleatorio}`), mac)) return null;
  return { userId, expiraEm: Number(exp) * 1000 };
}

/** O token e o atual da conta (o anterior a uma correcao deixa de valer). */
export function tokenEhOAtual(token: string, g: CorrecaoGuardada | null | undefined): boolean {
  return !!g && typeof g.hash === 'string' && iguaisSeguro(hashToken(token), g.hash);
}
