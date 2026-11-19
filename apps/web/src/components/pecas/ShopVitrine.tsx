'use client';

import { formatCurrency, timeAgo } from '@/lib/utils';
import type { ItemShop } from '@/lib/pecas-lote5';
import type { PaginaResolvida } from '@/lib/shop-pagina';

// Pecas lote 5 (20/11): a parte EDITAVEL do Shop (banner, titulo, subtitulo, blocos curtos, destaques) e o cartao
// de item. Componente de apresentacao, sem i18n proprio: os rotulos vem por props - assim a MESMA peca desenha o
// Shop das oficinas e a previa do editor no /admin (contribuicao Fable B1: nada de segundo componente que diverge).

export type RotulosVitrine = {
  destaqueBipfix: string; etiquetaPromocao: string; pedir: string; porUnidade: (u: string) => string; unidade: (u: string) => string;
  validaAte: (d: string) => string; atualizado: (q: string) => string; condicao: (c: string) => string; destaquesTitulo: string; precoAnterior: string;
};

export function CartaoItem({ it, r, moeda, locale, onPedir, destaque }: { it: ItemShop; r: RotulosVitrine; moeda: string; locale: string; onPedir?: (it: ItemShop, botao: HTMLButtonElement) => void; destaque?: boolean }) {
  return (
    <li data-testid={destaque ? 'shop-destaque' : 'shop-resultado'} data-tipo={it.tipo} data-id={it.id} className="card flex flex-col gap-2 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1 mb-1">
            {destaque && <span className="inline-block text-xs font-semibold text-blue-900 bg-blue-100 rounded px-2 py-0.5">{r.destaqueBipfix}</span>}
            {it.tipo === 'promocao' && <span className="inline-block text-xs font-semibold text-amber-900 bg-amber-100 rounded px-2 py-0.5">{r.etiquetaPromocao}</span>}
          </div>
          <p className="font-semibold text-gray-900 break-words">{it.nome}</p>
          {(it.codigo || it.especificacao) && <p className="text-sm text-gray-600 break-words">{[it.codigo, it.especificacao].filter(Boolean).join(' · ')}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-gray-900" data-testid="shop-preco">{formatCurrency(it.preco, moeda, locale)} <span className="text-xs font-normal text-gray-600">/ {r.unidade(it.unidade)}</span></p>
          {it.precoAnterior != null && <p className="text-xs text-gray-600"><span className="sr-only">{r.precoAnterior} </span><s>{formatCurrency(it.precoAnterior, moeda, locale)}</s></p>}
        </div>
      </div>
      {it.descricao && <p className="text-sm text-gray-700 break-words">{it.descricao}</p>}
      <p className="text-xs text-gray-600">
        {[it.embalagem, it.condicao ? r.condicao(it.condicao) : null, it.validoAte ? r.validaAte(new Date(it.validoAte).toLocaleDateString(locale)) : null, r.atualizado(timeAgo(it.atualizadoEm, locale))].filter(Boolean).join(' · ')}
      </p>
      <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-gray-100">
        <p className="text-sm text-gray-700 min-w-0 truncate" data-testid="shop-loja">
          {it.loja.nome}{it.loja.cidade ? ` · ${it.loja.cidade}` : ''}
          {it.loja.nota != null && <span className="text-gray-600"> · ★ {it.loja.nota.toLocaleString(locale)} ({it.loja.avaliacoes})</span>}
        </p>
        {onPedir && <button type="button" data-testid={destaque ? 'shop-destaque-pedir' : 'shop-pedir'} onClick={(e) => onPedir(it, e.currentTarget)} className="btn-primary text-sm shrink-0 min-h-[44px]">{r.pedir}</button>}
      </div>
    </li>
  );
}

export default function ShopVitrine({ pagina, bannerUrl, destaques, r, moeda, locale, onPedir, tituloPadrao, subtituloPadrao }: {
  pagina: PaginaResolvida | null; bannerUrl: string | null; destaques: ItemShop[]; r: RotulosVitrine; moeda: string; locale: string;
  onPedir?: (it: ItemShop, botao: HTMLButtonElement) => void; tituloPadrao: string; subtituloPadrao: string;
}) {
  const titulo = pagina?.titulo || tituloPadrao;
  const subtitulo = pagina?.subtitulo || subtituloPadrao;
  return (
    <div data-testid="shop-vitrine">
      {bannerUrl ? (
        <div className="relative overflow-hidden rounded-xl mb-6 min-h-[160px] sm:min-h-[220px] flex items-end bg-gray-800" data-testid="shop-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bannerUrl} alt={pagina?.bannerAlt || ''} className="absolute inset-0 h-full w-full object-cover" data-testid="shop-banner" />
          {/* overlay fixo: o texto branco tem contraste com qualquer foto (Fable B5, WCAG 1.4.3) */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/20" aria-hidden="true" />
          <div className="relative p-5 sm:p-8 text-white">
            <h1 className="text-2xl sm:text-3xl font-bold break-words" data-testid="shop-titulo">{titulo}</h1>
            <p className="mt-1 text-white/90 break-words" data-testid="shop-subtitulo">{subtitulo}</p>
          </div>
        </div>
      ) : (
        <div className="mb-6" data-testid="shop-hero">
          <h1 className="text-2xl font-bold text-gray-900 break-words" data-testid="shop-titulo">{titulo}</h1>
          <p className="text-gray-600 mt-1 break-words" data-testid="shop-subtitulo">{subtitulo}</p>
        </div>
      )}
      {!!pagina?.blocos.length && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6" data-testid="shop-blocos">
          {pagina.blocos.map((b, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white p-4" data-testid="shop-bloco">
              {b.titulo && <h2 className="font-semibold text-gray-900 break-words">{b.titulo}</h2>}
              {b.texto && <p className="text-sm text-gray-700 mt-1 break-words whitespace-pre-line">{b.texto}</p>}
            </div>
          ))}
        </div>
      )}
      {destaques.length > 0 && (
        <section className="mb-8" aria-labelledby="shop-destaques-titulo">
          <h2 id="shop-destaques-titulo" className="text-lg font-semibold text-gray-900 mb-3">{r.destaquesTitulo}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {destaques.map((it) => <CartaoItem key={`${it.tipo}:${it.id}`} it={it} r={r} moeda={moeda} locale={locale} onPedir={onPedir} destaque />)}
          </ul>
        </section>
      )}
    </div>
  );
}
