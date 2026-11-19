'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Pecas lote 5 (20/11, migracao 105): interruptor do Shop + moderacao de itens e promocoes (ocultar com motivo).
// O Shop so vale para as oficinas reais com pecas_shop_ativo E pecas_v3_ativo ligados; contas de teste veem antes.
type Linha = { id: string; nome?: string; titulo?: string; preco: number; visibilidade: string; oculto?: boolean; oculta?: boolean; oculto_motivo?: string | null; oculta_motivo?: string | null; loja?: { nome_fantasia: string } | null };

export default function PecasShopAdmin() {
  const [dados, setDados] = useState<{ shop: boolean; v3: boolean; promocoes: Linha[]; itens: Linha[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = async () => {
    const r = await fetch('/api/admin/pecas-shop', { cache: 'no-store' });
    if (r.ok) setDados(await r.json()); else setErro(`Erro ${r.status}`);
  };
  useEffect(() => { carregar(); }, []);

  const alternarShop = async () => {
    if (!dados) return;
    const novo = !dados.shop;
    if (!confirm(novo ? 'Ligar o Shop para TODAS as oficinas? (só vale com as peças v3 também ligadas; termos e comissão Q-6 decididos?)' : 'Desligar o Shop? A página das oficinas volta a dar 404.')) return;
    const r = await fetch('/api/admin/pecas-shop', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chave: 'shop', ativo: novo }) });
    if (!r.ok) setErro('Não foi possível mudar o interruptor.');
    await carregar();
  };
  const moderar = async (tipo: 'item' | 'promocao', l: Linha) => {
    const oculto = !(l.oculto ?? l.oculta);
    const motivo = oculto ? prompt('Motivo (a loja vê este texto):') : '';
    if (oculto && (!motivo || motivo.trim().length < 3)) return;
    const r = await fetch('/api/admin/pecas-shop', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, id: l.id, oculto, motivo }) });
    if (!r.ok) setErro('Não foi possível mudar.');
    await carregar();
  };

  if (!dados) return <div className="card text-sm text-gray-600">{erro || 'Carregando Shop…'}</div>;
  const tabela = (tipo: 'item' | 'promocao', linhas: Linha[]) => (
    <ul className="divide-y divide-gray-100">
      {linhas.map((l) => {
        const oc = !!(l.oculto ?? l.oculta);
        return (
          <li key={l.id} data-testid={`admin-shop-${tipo}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className={oc ? 'line-through text-gray-500' : ''}>{l.nome || l.titulo} · {l.loja?.nome_fantasia || '-'} · {Number(l.preco).toFixed(2)} € · {l.visibilidade}{oc ? ` · oculto: ${l.oculto_motivo || l.oculta_motivo || ''}` : ''}</span>
            <button type="button" data-testid={`admin-shop-${tipo}-moderar`} className="btn-secondary text-xs" onClick={() => moderar(tipo, l)}>{oc ? 'Mostrar' : 'Ocultar'}</button>
          </li>
        );
      })}
      {!linhas.length && <li className="py-2 text-sm text-gray-600">Nenhum.</li>}
    </ul>
  );
  return (
    <div className="card space-y-4" data-testid="admin-shop">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Shop das oficinas (lote 5)</h2>
          <p className="text-sm text-gray-600" data-testid="admin-shop-estado">Shop {dados.shop ? 'LIGADO' : 'desligado'} · peças v3 {dados.v3 ? 'ligadas' : 'desligadas'} → {dados.shop && dados.v3 ? 'oficinas reais veem o Shop' : 'só contas de teste veem o Shop'}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/shop-pagina" className="btn-secondary text-sm">Editar a página</Link>
          <button type="button" data-testid="admin-shop-interruptor" className="btn-primary text-sm" onClick={alternarShop}>{dados.shop ? 'Desligar Shop' : 'Ligar Shop'}</button>
        </div>
      </div>
      {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      <div><h3 className="font-medium">Promoções (últimas 100)</h3>{tabela('promocao', dados.promocoes)}</div>
      <div><h3 className="font-medium">Itens do catálogo (últimos 100)</h3>{tabela('item', dados.itens)}</div>
    </div>
  );
}
