import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getSessionUserId } from '@/lib/api-auth';
import { oficinaDaDona, pecasShopAtivo } from '@/lib/pecas-lote5';
import { conteudoPublicado, resolverDestaques, resolverIdioma } from '@/lib/shop-pagina';
import ShopOficina from '@/components/pecas/ShopOficina';

export const dynamic = 'force-dynamic';

// Pecas lote 5 (20/11): Shop das oficinas. Atras do interruptor: sem o Shop ligado (pecas_shop_ativo E pecas_v3_ativo)
// e sem conta de teste, ou sem oficina ativa de que a pessoa e dona, a pagina nao existe (404). Painel logado: noindex,
// fora do sitemap. O conteudo editavel e a versao PUBLICADA no /admin/shop-pagina (rascunho nunca aparece aqui).
async function acesso() {
  const userId = await getSessionUserId();
  if (!userId || !(await pecasShopAtivo(userId))) return null;
  return oficinaDaDona(userId);
}

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'pecasL5' });
  const base: Metadata = { robots: { index: false, follow: false }, title: t('shopTitulo') };
  if (!(await acesso())) return base;
  const c = await conteudoPublicado();
  const p = c ? resolverIdioma(c, params.locale) : null;
  return { ...base, title: p?.seoTitulo || p?.titulo || t('shopTitulo'), description: p?.seoDescricao || undefined };
}

export default async function OficinaShopPage({ params }: { params: { locale: string } }) {
  const of = await acesso();
  if (!of) notFound();
  const c = await conteudoPublicado();
  const pagina = c ? resolverIdioma(c, params.locale) : null;
  const destaques = c ? await resolverDestaques(c.destaques, { pais: of.pais, teste: of.teste }) : [];
  const bannerUrl = pagina?.banner ? `/api/pecas/shop-imagem?c=${encodeURIComponent(pagina.banner)}` : null;
  return <ShopOficina pagina={pagina} bannerUrl={bannerUrl} destaques={destaques} />;
}
