'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import type { ItemShop } from '@/lib/pecas-lote5';
import type { PaginaResolvida } from '@/lib/shop-pagina';
import ShopVitrine, { CartaoItem, type RotulosVitrine } from './ShopVitrine';

// Pecas lote 5 (20/11): Shop das oficinas. A parte editavel (banner, textos, blocos, destaques) vem do servidor (versao
// publicada no /admin/shop-pagina); a busca le /api/pecas/shop (so a dona, Shop ligado ou conta de teste, mesmo pais e
// tipo de conta). "Pedir" = cotacao so para aquela loja (/api/pecas/pedir); a loja confirma com o preco ja preenchido e a
// oficina confirma o pedido na aba Pecas, como hoje. Sem telefone/e-mail da loja. Contribuicoes Fable A1-A5, C1.

const UNIDADES = ['un', 'jogo', 'par', 'litro', 'kg', 'metro', 'caixa'];
const DECIMAIS = ['litro', 'kg', 'metro'];

export function useRotulosVitrine(): RotulosVitrine {
  const t = useTranslations('pecasL5');
  const tp = useTranslations('pecas');
  const unidade = (u: string) => tp(`unidades.${UNIDADES.includes(u) ? u : 'un'}`);
  return {
    destaqueBipfix: t('destaqueBipfix'), etiquetaPromocao: t('etiquetaPromocao'), pedir: t('pedir'),
    porUnidade: (u) => t('porUnidade', { unidade: unidade(u) }), unidade,
    validaAte: (d) => t('validaAte', { data: d }), atualizado: (q) => t('atualizado', { quando: q }),
    condicao: (c) => t(`condicao.${['nova', 'usada', 'recondicionada'].includes(c) ? c : 'nova'}`),
    destaquesTitulo: t('destaquesTitulo'), precoAnterior: t('precoAnterior'),
  };
}

export default function ShopOficina({ pagina, bannerUrl, destaques }: { pagina: PaginaResolvida | null; bannerUrl: string | null; destaques: ItemShop[] }) {
  const t = useTranslations('pecasL5');
  const locale = useLocale();
  const router = useRouter();
  const { oficina } = useAuth();
  const r = useRotulosVitrine();
  const moeda = currencyForCountry(oficina?.pais || 'EE');
  const [q, setQ] = useState('');
  const [soPromocoes, setSoPromocoes] = useState(false);
  const [itens, setItens] = useState<ItemShop[] | null>(null);
  const [erro, setErro] = useState(false);
  const [pedindo, setPedindo] = useState<ItemShop | null>(null);
  const [qtd, setQtd] = useState(1);
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroPedido, setErroPedido] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<{ loja: string; cotacaoId: string } | null>(null);
  const rodada = useRef(0);
  const dialogo = useRef<HTMLDialogElement>(null);
  const botaoOrigem = useRef<HTMLButtonElement | null>(null);

  const buscar = useCallback(async (texto: string, promos: boolean) => {
    const minha = ++rodada.current;
    setErro(false);
    const p = new URLSearchParams();
    if (texto.trim()) p.set('q', texto.trim());
    if (promos) p.set('promocoes', '1');
    const resp = await fetch(`/api/pecas/shop?${p.toString()}`, { cache: 'no-store' }).catch(() => null);
    const j = resp?.ok ? await resp.json().catch(() => null) : null;
    if (minha !== rodada.current) return;
    if (!j) { setErro(true); setItens([]); return; }
    setItens(j.resultados || []);
  }, []);

  useEffect(() => {
    const espera = setTimeout(() => { buscar(q, soPromocoes); }, q ? 300 : 0);
    return () => clearTimeout(espera);
  }, [q, soPromocoes, buscar]);

  // A1: <dialog> nativo (foco preso, Esc fecha, foco volta ao botao "Pedir")
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (pedindo && !d.open) d.showModal();
    if (!pedindo && d.open) d.close();
  }, [pedindo]);
  const fechar = () => { setPedindo(null); setTimeout(() => botaoOrigem.current?.focus(), 0); };

  const abrirPedido = (it: ItemShop, botao: HTMLButtonElement) => { botaoOrigem.current = botao; setPedindo(it); setQtd(1); setObs(''); setErroPedido(null); setEnviado(null); };
  const passo = pedindo && DECIMAIS.includes(pedindo.unidade) ? 0.5 : 1;
  const mudarQtd = (delta: number) => setQtd((v) => Math.min(9999, Math.max(passo, Math.round((v + delta) * 100) / 100)));

  const enviarPedido = async () => {
    if (!pedindo || enviando) return;
    if (!(qtd > 0 && qtd <= 9999)) { setErroPedido('QUANTIDADE'); return; }
    setEnviando(true);
    setErroPedido(null);
    const corpo = { [pedindo.tipo === 'item' ? 'itemId' : 'promocaoId']: pedindo.id, quantidade: qtd, observacao: obs.trim() || undefined };
    const resp = await fetch('/api/pecas/pedir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).catch(() => null);
    const j = resp ? await resp.json().catch(() => null) : null;
    setEnviando(false);
    if (!resp?.ok || !j?.cotacaoId) { setErroPedido(String(j?.error || 'ERRO')); return; }
    // A5: confirmacao antes de sair; replace (o Voltar nao reabre o dialogo nem reenvia)
    setEnviado({ loja: pedindo.loja.nome, cotacaoId: j.cotacaoId });
  };
  const irParaPedido = () => { if (enviado) router.replace(`/oficina/pecas?cotacao=${encodeURIComponent(enviado.cotacaoId)}`); };

  const erros = ['QUANTIDADE', 'P7_BLOQUEADA', 'NAO_ENCONTRADO', 'MUITAS_TENTATIVAS', 'LIMITE_PAR'];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-end mb-3">
        <Link href="/oficina/pecas" className="text-sm font-medium text-primary-700 hover:underline">{t('voltarPecas')}</Link>
      </div>
      <ShopVitrine pagina={pagina} bannerUrl={bannerUrl} destaques={destaques} r={r} moeda={moeda} locale={locale} onPedir={abrirPedido} tituloPadrao={t('shopTitulo')} subtituloPadrao={t('shopSubtitulo')} />

      <div className="card mb-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <label htmlFor="shop-busca" className="sr-only">{t('buscaRotulo')}</label>
        <input id="shop-busca" data-testid="shop-busca" type="search" className="input-field flex-1 min-h-[44px]" placeholder={t('buscaPlaceholder')} value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} />
        {/* A2: chip com aria-pressed, alvo de 44 px */}
        <button type="button" data-testid="shop-so-promocoes" aria-pressed={soPromocoes} onClick={() => setSoPromocoes((v) => !v)}
          className={`min-h-[44px] px-4 rounded-full border text-sm font-medium ${soPromocoes ? 'bg-blue-100 border-blue-900 text-blue-950' : 'bg-white border-gray-300 text-gray-700'}`}>
          {soPromocoes ? '✓ ' : ''}{t('soPromocoes')}
        </button>
      </div>
      <p className="text-xs text-gray-600 mb-4" data-testid="shop-ordem">{t('ordemExplicacao')}</p>

      <div aria-live="polite">
        {itens === null ? (
          <div className="animate-pulse h-40 bg-gray-200 rounded-xl" />
        ) : erro ? (
          <div className="card text-center py-10 text-gray-700" data-testid="shop-erro">{t('erroCarregar')}</div>
        ) : itens.length === 0 ? (
          <div className="card text-center py-10 text-gray-700" data-testid="shop-vazio">
            <p>{q ? t('nadaEncontrado') : t('shopVazio')}</p>
            {/* C1: estado vazio util - o pedido de cotacao de hoje continua a um toque */}
            <Link href="/oficina/pecas" data-testid="shop-vazio-cotacao" className="btn-primary inline-flex mt-4 min-h-[44px] items-center">{t('pedirCotacaoTodas')}</Link>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {itens.map((it) => <CartaoItem key={`${it.tipo}:${it.id}`} it={it} r={r} moeda={moeda} locale={locale} onPedir={abrirPedido} />)}
          </ul>
        )}
      </div>

      <dialog ref={dialogo} onClose={() => { if (pedindo) fechar(); }} onClick={(e) => { if (e.target === dialogo.current) fechar(); }}
        aria-labelledby="pedir-titulo" className="rounded-xl p-0 w-[calc(100%-2rem)] max-w-md backdrop:bg-black/40" data-testid="pedir-dialogo">
        {pedindo && (
          <div className="p-5">
            {enviado ? (
              <div data-testid="pedir-ok">
                <h2 id="pedir-titulo" className="font-semibold text-gray-900 mb-2">{t('pedidoEnviadoTitulo', { loja: enviado.loja })}</h2>
                <p className="text-sm text-gray-700 mb-4">{t('pedidoEnviadoTexto')}</p>
                <div className="flex justify-end gap-3">
                  <button type="button" className="btn-secondary min-h-[44px]" onClick={fechar}>{t('continuarNoShop')}</button>
                  <button type="button" data-testid="pedir-ver" className="btn-primary min-h-[44px]" onClick={irParaPedido}>{t('verMeuPedido')}</button>
                </div>
              </div>
            ) : (
              <>
                <h2 id="pedir-titulo" className="font-semibold text-gray-900 mb-1">{t('pedirTitulo', { loja: pedindo.loja.nome })}</h2>
                <p className="text-sm text-gray-700 mb-4 break-words">{pedindo.nome}</p>
                <label htmlFor="pedir-quantidade" className="block text-sm font-medium text-gray-700 mb-1">{t('quantidade', { unidade: r.unidade(pedindo.unidade) })}</label>
                {/* A3: stepper; inteiro para un/jogo/par/caixa, meio para litro/kg/metro */}
                <div className="flex items-center gap-2 mb-3">
                  <button type="button" aria-label={t('menos')} className="btn-secondary min-h-[44px] min-w-[44px]" onClick={() => mudarQtd(-passo)}>−</button>
                  <input id="pedir-quantidade" data-testid="pedir-quantidade" inputMode="decimal" className="input-field text-center w-24 min-h-[44px]" value={String(qtd)}
                    aria-invalid={erroPedido === 'QUANTIDADE'} aria-describedby={erroPedido ? 'pedir-erro' : undefined}
                    onChange={(e) => { const n = Number(e.target.value.replace(',', '.')); setQtd(Number.isFinite(n) ? n : 0); }} />
                  <button type="button" aria-label={t('mais')} className="btn-secondary min-h-[44px] min-w-[44px]" onClick={() => mudarQtd(passo)}>+</button>
                </div>
                <label htmlFor="pedir-observacao" className="block text-sm font-medium text-gray-700 mb-1">{t('observacao')}</label>
                <textarea id="pedir-observacao" data-testid="pedir-observacao" className="input-field mb-3" rows={2} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />
                {/* A4: estimativa; quem confirma o preco e a loja */}
                <p className="text-sm text-gray-700 mb-1" data-testid="pedir-total">{t('totalEstimado', { total: formatCurrency(Math.round(pedindo.preco * (qtd || 0) * 100) / 100, moeda, locale) })}</p>
                <p className="text-xs text-gray-600 mb-4">{t('pedirExplicacao')}</p>
                {erroPedido && <p id="pedir-erro" className="text-sm text-red-700 mb-3" role="alert" data-testid="pedir-erro">{t(`erroPedir.${erros.includes(erroPedido) ? erroPedido : 'ERRO'}`)}</p>}
                <div className="flex justify-end gap-3">
                  <button type="button" className="btn-secondary min-h-[44px]" onClick={fechar} disabled={enviando}>{t('cancelar')}</button>
                  <button type="button" data-testid="pedir-enviar" className="btn-primary min-h-[44px] disabled:opacity-50" onClick={enviarPedido} disabled={enviando}>{enviando ? t('enviando') : t('enviarPedido')}</button>
                </div>
              </>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}
