import { Platform } from 'react-native';

// Versao web do app (Safari): ao tocar num campo, assim que o teclado abre a area visivel encolhe
// e o Safari deixa o campo meio escondido; leva o campo para o meio da area visivel, sem tirar o
// foco (dono 09/11: "tenho que reposicionar a pagina"). No app instalado o teclado ja e tratado.
let ligado = false;
export function centrarCampoAoDigitar() {
  if (Platform.OS !== 'web' || ligado || typeof window === 'undefined') return;
  ligado = true;
  const v = window.visualViewport;
  let campo: HTMLElement | null = null;
  let ate = 0;
  const centrar = () => {
    if (!campo || Date.now() > ate || document.activeElement !== campo) return;
    campo.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  document.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement;
    if (!/^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    // na conversa a tela ja fica presa a area visivel: rolar a pagina ali tirava o cabecalho
    if (el.closest('[data-conversa]')) return;
    campo = el; ate = Date.now() + 1500;
    setTimeout(centrar, 350);
  });
  v?.addEventListener('resize', centrar);
}
