// Link aberto sem login (bipfix.com/r/<numero> do SMS/e-mail) ou aviso tocado antes de entrar: guarda a tela
// e abre logo depois do login (o link nunca "morre" - regra do dono 19/11). Fica so na memoria do processo.
let pendente: string | null = null;
export const guardarDestino = (rota: string) => { pendente = rota; };
/** le sem apagar (tela de login: navega para o mesmo lugar que o layout (auth) vai redirecionar) */
export const verDestino = (): string | null => pendente;
export function pegarDestino(): string | null { const r = pendente; pendente = null; return r; }
