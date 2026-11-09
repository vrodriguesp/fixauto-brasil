import { router } from 'expo-router';

// Pagina da oficina: tela propria do app (app/oficina/[id].tsx). Antes abria a pagina do site
// e, ao voltar, a pessoa caia no inicio do site, fora do app (dono 09/11, Android e iPhone).
// O idioma fica no app; o parametro continua para nao mudar quem chama.
export function abrirOficina(oficinaId: string, _idioma?: string) {
  router.push(`/oficina/${oficinaId}`);
}
