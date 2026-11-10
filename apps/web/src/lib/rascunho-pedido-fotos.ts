// Fotos do pedido em andamento (/pedido), guardadas no aparelho (IndexedDB) para
// nao sumirem quando a pagina recarrega. No Android isso acontece ao voltar da
// galeria ou da camera: o Chrome fecha a aba para liberar memoria (emulador
// Android, dono 10/11). O texto do pedido fica no localStorage (PedidoSemConta);
// as fotos ficam aqui, num banco proprio (o da emergencia apaga o dele inteiro).
const BANCO = 'bipfix_rascunho_pedido';
const LOJA = 'fotos';

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(LOJA); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}

/** Guarda as fotos (substitui as anteriores); false se o navegador nao deixar. */
export async function gravarFotosPedido(fotos: File[]): Promise<boolean> {
  try {
    // bytes (ArrayBuffer), nao Blob: o Safari em navegacao privada recusa Blob no IndexedDB
    const itens = await Promise.all(fotos.map(async (f) => ({ nome: f.name, tipo: f.type, bytes: await f.arrayBuffer() })));
    const db = await abrirBanco();
    await new Promise<void>((ok, falha) => {
      const tx = db.transaction(LOJA, 'readwrite');
      tx.objectStore(LOJA).put(itens, 'atual');
      tx.oncomplete = () => ok();
      tx.onerror = () => falha(tx.error);
    });
    db.close();
    return true;
  } catch { return false; }
}

export async function lerFotosPedido(): Promise<File[]> {
  try {
    const db = await abrirBanco();
    const lista = await new Promise<any[] | undefined>((ok, falha) => {
      const r = db.transaction(LOJA, 'readonly').objectStore(LOJA).get('atual');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => falha(r.error);
    });
    db.close();
    if (!Array.isArray(lista)) return [];
    return lista.map((f) => new File([f.bytes], f.nome || 'foto.jpg', { type: f.tipo || 'image/jpeg' }));
  } catch { return []; }
}

export function apagarFotosPedido() {
  try { indexedDB.deleteDatabase(BANCO); } catch { /* ignora */ }
}
