// Rascunho do registro de acidente sem login (pedido do dono 31/10): quando o
// e-mail ja tem conta, a pessoa entra (ou pede nova senha) sem perder o que
// preencheu. Texto no localStorage (o link de nova senha pode abrir noutra
// aba); fotos no IndexedDB, quando o navegador deixa. Vale 24 h.
const CHAVE = 'bipfix_rascunho_emergencia';
const VALIDADE_MS = 24 * 60 * 60 * 1000;
const BANCO = 'bipfix_rascunhos';
const LOJA = 'fotos_emergencia';

export type RascunhoEmergencia = {
  nome: string; email: string; telefone: string; descricao: string; placa: string;
  tipoAcidente: 'eu_causei' | 'outro_causou' | 'sem_outro';
  localizacao: string; coords: { lat: number; lon: number } | null; geoResolved: boolean;
  veiculoInfo: { marca: string; modelo: string; ano: string; cor: string } | null;
  seguro: unknown;
  salvoEm?: number; qtdFotos?: number;
};

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(LOJA); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}

async function gravarFotos(fotos: File[]): Promise<boolean> {
  try {
    const db = await abrirBanco();
    await new Promise<void>((ok, falha) => {
      const tx = db.transaction(LOJA, 'readwrite');
      tx.objectStore(LOJA).put(fotos.map((f) => ({ nome: f.name, tipo: f.type, blob: f as Blob })), 'atual');
      tx.oncomplete = () => ok();
      tx.onerror = () => falha(tx.error);
    });
    db.close();
    return true;
  } catch { return false; }
}

async function lerFotos(): Promise<File[] | null> {
  try {
    const db = await abrirBanco();
    const lista = await new Promise<any[] | undefined>((ok, falha) => {
      const r = db.transaction(LOJA, 'readonly').objectStore(LOJA).get('atual');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => falha(r.error);
    });
    db.close();
    if (!Array.isArray(lista)) return null;
    return lista.map((f) => new File([f.blob], f.nome || 'foto.jpg', { type: f.tipo || 'image/jpeg' }));
  } catch { return null; }
}

/** Guarda o rascunho; devolve false se as fotos nao puderam ser guardadas. */
export async function salvarRascunhoEmergencia(dados: RascunhoEmergencia, fotos: File[]): Promise<boolean> {
  try { localStorage.setItem(CHAVE, JSON.stringify({ ...dados, salvoEm: Date.now(), qtdFotos: fotos.length })); } catch { return false; }
  return fotos.length ? gravarFotos(fotos) : true;
}

export async function lerRascunhoEmergencia(): Promise<{ dados: RascunhoEmergencia; fotos: File[] | null } | null> {
  let dados: RascunhoEmergencia | null = null;
  try { dados = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { dados = null; }
  if (!dados) return null;
  if (!dados.salvoEm || Date.now() - dados.salvoEm > VALIDADE_MS) { apagarRascunhoEmergencia(); return null; }
  const fotos = dados.qtdFotos ? await lerFotos() : [];
  return { dados, fotos };
}

export function temRascunhoEmergencia(): boolean {
  try { return !!localStorage.getItem(CHAVE); } catch { return false; }
}

export function apagarRascunhoEmergencia() {
  try { localStorage.removeItem(CHAVE); } catch {}
  try { indexedDB.deleteDatabase(BANCO); } catch {}
}
