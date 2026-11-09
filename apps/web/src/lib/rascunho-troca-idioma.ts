// Trocar a lingua no meio de um formulario nao pode apagar o que a pessoa digitou (dono 08/11:
// mudando a data no calendario, trocou a lingua e perdeu tudo). Antes so cadastro, pedido sem
// conta e emergencia guardavam rascunho; agora vale para o site todo:
//  - ao clicar numa lingua, guarda os campos da tela (por id/name), a rolagem e os estados de
//    tela registrados (ex.: "mudar a data" aberto) para a pagina de destino;
//  - na pagina nova, devolve os valores aos campos quando eles aparecem (ate 10 s, pois varios
//    formularios so aparecem depois de carregar os dados).
// Senha, arquivo e campos escondidos nunca sao guardados.

const CHAVE = 'bipfix_troca_idioma';
const PREFIXO_UI = 'bipfix_ui:';
const VALIDADE_MS = 2 * 60 * 1000;

type Campo = { v?: string; c?: boolean };
type Rascunho = { destino: string; ts: number; campos: Record<string, Campo>; ui: Record<string, string>; y: number };

const caminho = (href: string) => { try { return new URL(href, window.location.href).pathname; } catch { return href; } };
const chaveDoCampo = (el: Element) => el.id ? `#${el.id}` : (el.getAttribute('name') ? `@${el.getAttribute('name')}` : '');
const ignorar = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
  const tipo = (el as HTMLInputElement).type;
  // senha nunca, nem visivel ("ver senha" vira type=text; senha temporaria da equipe) - auditoria 09/11
  const auto = (el.getAttribute('autocomplete') || '').toLowerCase();
  if (/password|one-time-code/.test(auto) || /senha|password|parool|pass/i.test(`${el.id} ${el.getAttribute('name') || ''}`) || el.closest('[data-sem-rascunho]')) return true;
  return ['password', 'file', 'hidden', 'submit', 'button', 'reset', 'image'].includes(tipo)
    || el.closest('[aria-hidden="true"]') !== null || el.tabIndex === -1 || el.disabled;
};

export function guardarParaTrocaDeIdioma(destinoHref: string) {
  try {
    const campos: Record<string, Campo> = {};
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('main input, main textarea, main select').forEach((el) => {
      const k = chaveDoCampo(el);
      if (!k || ignorar(el)) return;
      const tipo = (el as HTMLInputElement).type;
      if (tipo === 'checkbox' || tipo === 'radio') { if (el.id) campos[k] = { c: (el as HTMLInputElement).checked }; }
      else if (el.value) campos[k] = { v: el.value };
    });
    const ui: Record<string, string> = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIXO_UI)) ui[k] = sessionStorage.getItem(k) || '';
    }
    const r: Rascunho = { destino: caminho(destinoHref), ts: Date.now(), campos, ui, y: window.scrollY };
    sessionStorage.setItem(CHAVE, JSON.stringify(r));
  } catch { /* sem sessionStorage: segue a troca */ }
}

/** Ha uma troca de lingua acontecendo para esta pagina? (os estados de tela registrados voltam) */
export function veioDeTrocaDeIdioma(): Rascunho | null {
  try {
    const r = JSON.parse(sessionStorage.getItem(CHAVE) || 'null') as Rascunho | null;
    if (!r) return null;
    if (Date.now() - r.ts > VALIDADE_MS || (r.destino !== window.location.pathname && Date.now() - r.ts > 10000)) {
      // rascunho vencido ou de outra pagina (ex.: redirecionou): nao fica guardado na aba
      sessionStorage.removeItem(CHAVE);
      return null;
    }
    if (r.destino !== window.location.pathname) return null;
    return r;
  } catch { return null; }
}

// valor num campo controlado pelo React: setter nativo + evento, senao o React desfaz
// devolve se o valor pegou (lista ainda sem as opcoes: tenta de novo quando elas chegarem)
function aplicar(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, c: Campo): boolean {
  const tipo = (el as HTMLInputElement).type;
  if (tipo === 'checkbox' || tipo === 'radio') {
    if (c.c !== undefined && (el as HTMLInputElement).checked !== c.c) (el as HTMLInputElement).click();
    return true;
  }
  if (c.v === undefined || el.value === c.v) return true;
  if (el instanceof HTMLSelectElement && !Array.from(el.options).some((o) => o.value === c.v)) return false;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, c.v);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  return true;
}

/** Na pagina nova: devolve os campos conforme aparecem (ate 10 s) e a rolagem. */
export function restaurarAposTrocaDeIdioma() {
  const r = veioDeTrocaDeIdioma();
  if (!r) return;
  const faltam = new Map(Object.entries(r.campos));
  let rolou = false;
  const passo = () => {
    for (const [k, c] of Array.from(faltam.entries())) {
      const el = (k.startsWith('#') ? document.getElementById(k.slice(1)) : document.querySelector(`[name="${CSS.escape(k.slice(1))}"]`)) as HTMLInputElement | null;
      if (el && el.isConnected && aplicar(el, c)) faltam.delete(k);
    }
    if (!rolou && document.body.scrollHeight > r.y + window.innerHeight / 2) { window.scrollTo(0, r.y); rolou = true; }
    if (!faltam.size && rolou) fim();
  };
  const obs = new MutationObserver(() => passo());
  const tmr = setTimeout(() => fim(), 10000);
  function fim() { obs.disconnect(); clearTimeout(tmr); try { sessionStorage.removeItem(CHAVE); } catch {} }
  obs.observe(document.body, { childList: true, subtree: true });
  passo();
}

/** Estado de tela (ex.: qual formulario esta aberto) que sobrevive a troca de lingua. */
export function lerEstadoUi(chave: string): string | null {
  const r = veioDeTrocaDeIdioma();
  return r ? (r.ui[PREFIXO_UI + chave] ?? null) : null;
}
export function gravarEstadoUi(chave: string, valor: string | null) {
  try { if (valor === null) sessionStorage.removeItem(PREFIXO_UI + chave); else sessionStorage.setItem(PREFIXO_UI + chave, valor); } catch {}
}
