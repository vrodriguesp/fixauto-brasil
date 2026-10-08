// Textos e comportamento das telas de erro (app/error.tsx e global-error.tsx).
// Elas ficam fora do next-intl (podem aparecer quando o proprio layout
// quebrou), entao o idioma vem do endereco: /et/..., /it/..., /pt-br/...

const TEXTOS = {
  pt: { titulo: 'Algo deu errado nesta página', texto: 'A equipe já foi avisada automaticamente. Tente novamente ou volte ao início.', tentar: 'Tentar novamente', inicio: 'Ir para o início', atualizando: 'Atualizando a página…' },
  'pt-PT': { titulo: 'Algo correu mal nesta página', texto: 'A equipa já foi avisada automaticamente. Tente novamente ou volte ao início.', tentar: 'Tentar novamente', inicio: 'Ir para o início', atualizando: 'A atualizar a página…' },
  en: { titulo: 'Something went wrong on this page', texto: 'Our team has been notified automatically. Try again or go back to the home page.', tentar: 'Try again', inicio: 'Go to home', atualizando: 'Refreshing the page…' },
  et: { titulo: 'Sellel lehel läks midagi valesti', texto: 'Meie meeskonda on automaatselt teavitatud. Proovi uuesti või mine avalehele.', tentar: 'Proovi uuesti', inicio: 'Avalehele', atualizando: 'Lehte värskendatakse…' },
  it: { titulo: 'Qualcosa è andato storto in questa pagina', texto: 'Il nostro team è già stato avvisato. Riprova o torna alla home.', tentar: 'Riprova', inicio: 'Vai alla home', atualizando: 'Aggiornamento della pagina…' },
  ru: { titulo: 'На этой странице что-то пошло не так', texto: 'Наша команда уже получила уведомление. Попробуйте ещё раз или вернитесь на главную.', tentar: 'Попробовать снова', inicio: 'На главную', atualizando: 'Обновляем страницу…' },
} as const;

const PREFIXOS: Record<string, keyof typeof TEXTOS> = { 'pt-br': 'pt', pt: 'pt', 'pt-pt': 'pt-PT', en: 'en', et: 'et', it: 'it', ru: 'ru' };

export function idiomaDoEndereco(): keyof typeof TEXTOS {
  if (typeof window === 'undefined') return 'en';
  const p = window.location.pathname.split('/')[1]?.toLowerCase() || '';
  if (PREFIXOS[p]) return PREFIXOS[p];
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('pt')) return nav === 'pt-pt' ? 'pt-PT' : 'pt';
  return (PREFIXOS[nav.slice(0, 2)] as keyof typeof TEXTOS) || 'en';
}

export const textosErro = () => TEXTOS[idiomaDoEndereco()];

// Pagina aberta antes de uma publicacao nova: os arquivos antigos (chunks)
// nao existem mais e a navegacao quebra ("Loading chunk ... failed"). O
// certo e recarregar a pagina - uma vez so (marca na sessao, para nao
// entrar em ciclo se o erro for outro).
export function ehVersaoAntiga(error: Error) {
  return /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|Failed to find Server Action/i.test(`${error.name} ${error.message}`);
}

export function recarregarUmaVez(): boolean {
  try {
    const chave = 'bipfix_recarregou_versao';
    const ultima = Number(sessionStorage.getItem(chave) || 0);
    if (Date.now() - ultima < 30000) return false;
    sessionStorage.setItem(chave, String(Date.now()));
  } catch { /* sem sessionStorage: recarrega mesmo assim */ }
  window.location.reload();
  return true;
}
