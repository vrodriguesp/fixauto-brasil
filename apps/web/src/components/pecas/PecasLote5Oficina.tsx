'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';

// Pecas lote 5 (20/11): pecas pequenas da aba Pecas da oficina. Tudo so aparece quando o Shop vale para a
// sessao (GET /api/pecas/shop?estado=1: Shop E v3 globais, ou conta de teste; dona de oficina ativa).
// Desligado: nenhum elemento, nenhum data-testid novo.

let estadoShop: Promise<boolean> | null = null;
function shopAtivo(): Promise<boolean> {
  if (!estadoShop) {
    estadoShop = fetch('/api/pecas/shop?estado=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => j?.ativo === true).catch(() => false);
  }
  return estadoShop;
}
function useShopAtivo(): boolean {
  const [ativo, setAtivo] = useState(false);
  useEffect(() => { let vivo = true; shopAtivo().then((v) => { if (vivo) setAtivo(v); }); return () => { vivo = false; }; }, []);
  return ativo;
}

/** Link "Shop" no topo da aba Pecas + foco na cotacao recem-criada (?cotacao=<id>). */
export function LinkShop() {
  const t = useTranslations('pecasL5');
  const ativo = useShopAtivo();
  useEffect(() => {
    if (!ativo) return;
    const id = new URLSearchParams(window.location.search).get('cotacao');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    let n = 0;
    const timer = setInterval(() => {
      const el = document.getElementById(`cotacao-${id}`);
      if (el || ++n > 25) { clearInterval(timer); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }, 200);
    return () => clearInterval(timer);
  }, [ativo]);
  if (!ativo) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3" data-testid="link-shop-faixa">
      <p className="text-sm text-blue-900 flex-1 min-w-0">{t('faixaShop')}</p>
      <Link href="/oficina/shop" data-testid="link-shop" className="btn-primary text-sm">{t('abrirShop')}</Link>
    </div>
  );
}

/** Etiqueta da cotacao de 1 fornecedor (Shop / pedir de novo) no cartao da compradora. */
export function EtiquetaPedidoDireto({ cotacao, pais }: { cotacao: { alvo?: string | null; preco_referencia?: number | null; origem?: string | null }; pais?: string | null }) {
  const t = useTranslations('pecasL5');
  const locale = useLocale();
  if (cotacao.alvo !== 'fornecedor_unico') return null;
  return (
    <p className="text-sm text-gray-600" data-testid="cotacao-pedido-direto">
      <span className="mr-1.5 inline-block rounded-full bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-800 align-middle">
        {cotacao.origem === 'pedir_de_novo' ? t('etiquetaPedirDeNovo') : t('etiquetaPedidoDireto')}
      </span>
      {cotacao.preco_referencia != null && Number(cotacao.preco_referencia) > 0 && (
        <span data-testid="cotacao-preco-referencia">{t('precoCatalogo', { preco: formatCurrency(Number(cotacao.preco_referencia), currencyForCountry(pais || 'EE'), locale) })}</span>
      )}
    </p>
  );
}

/** "Pedir de novo" no pedido entregue de uma loja: cotacao so para a mesma loja, sem placa. */
export function PedirDeNovo({ pedidoId, lojaNome, aoCriar }: { pedidoId: string; lojaNome: string; aoCriar: (cotacaoId: string) => void }) {
  const t = useTranslations('pecasL5');
  const ativo = useShopAtivo();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!ativo) return null;
  const pedir = async () => {
    setEnviando(true); setErro(null);
    const r = await fetch('/api/pecas/pedir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidoId }) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setEnviando(false);
    if (!r?.ok || !j?.cotacaoId) { setErro(String(j?.error || 'ERRO')); return; }
    aoCriar(j.cotacaoId);
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" data-testid="pedir-de-novo-loja" onClick={pedir} disabled={enviando} className="btn-secondary text-sm disabled:opacity-50">
        {enviando ? t('enviando') : t('pedirDeNovoLoja', { loja: lojaNome })}
      </button>
      {erro && <span className="text-sm text-red-700" role="alert" data-testid="pedir-de-novo-loja-erro">{t(`erroPedir.${['P7_BLOQUEADA', 'NAO_ENCONTRADO', 'MUITAS_TENTATIVAS', 'LIMITE_PAR'].includes(erro) ? erro : 'ERRO'}`)}</span>}
    </div>
  );
}
