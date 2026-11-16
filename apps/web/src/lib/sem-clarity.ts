// Dono 16/11: o painel admin nao entra nas gravacoes do Clarity. O admin fica fora
// do layout com o Analytics, mas o script do Clarity carregado numa pagina publica
// continua gravando quando a pessoa navega para /admin sem recarregar. Ao abrir o
// admin: para a gravacao e marca o aparelho, que daqui em diante nao carrega o
// Clarity nem nas paginas publicas (as visitas do proprio dono saem da conta).
export const SEM_CLARITY_KEY = 'bipfix_sem_clarity';

export function aparelhoSemClarity(): boolean {
  try { return localStorage.getItem(SEM_CLARITY_KEY) === '1'; } catch { return false; }
}

export function marcarAparelhoSemClarity() {
  try { localStorage.setItem(SEM_CLARITY_KEY, '1'); } catch { /* modo privado: so para esta pagina */ }
  try { (window as any).clarity?.('stop'); } catch { /* sem Clarity carregado */ }
}
