import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import OficinaPerfilClient from './OficinaPerfilClient';
import { carregarPerfilOficina } from './perfil-dados';
import { OG_LOCALE, type Locale } from '@/i18n/routing';
import { capitalizarCidade, hreflangAlternates, imagemCompartilhamento } from '@/lib/seo-utils';

type Params = { params: Promise<{ locale: string; id: string }> };

// Metadata unica por oficina (nome + cidade no title): cada perfil e uma URL
// indexavel por idioma - o principal ativo de SEO local do site.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'oficinaPerfilPublico' });
  const dados = await carregarPerfilOficina(id);
  if (!dados) return { title: t('metaNotFoundTitle') };

  const { oficina } = dados;
  const cidade = capitalizarCidade(oficina.cidade);
  const title = t('metaTitleTemplate', { nome: oficina.nome_fantasia, cidade, estado: oficina.estado });
  const description = t('metaDescriptionTemplate', { nome: oficina.nome_fantasia, cidade, estado: oficina.estado });
  const alternates = hreflangAlternates(locale, `/oficinas/${id}`);

  return {
    title,
    description,
    alternates,
    openGraph: {
      images: imagemCompartilhamento(locale),
      type: 'website',
      locale: OG_LOCALE[locale as Locale],
      siteName: 'BipFix',
      title,
      description,
      url: alternates.canonical,
    },
    twitter: { card: 'summary', title, description },
  };
}

// Pagina renderizada no servidor com os dados completos (nome, endereco,
// servicos, horario, avaliacoes, dados estruturados). Oficina inexistente ou
// desativada -> 404 de verdade (antes: 200 com "Carregando...", um soft 404).
export default async function OficinaPublicPage({ params }: Params) {
  const { id } = await params;
  const dados = await carregarPerfilOficina(id);
  if (!dados) notFound();
  return <OficinaPerfilClient dados={dados} />;
}
