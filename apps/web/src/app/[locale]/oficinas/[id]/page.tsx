import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import OficinaPerfilClient from './OficinaPerfilClient';
import { carregarPerfilOficina } from './perfil-dados';
import { OG_LOCALE, type Locale } from '@/i18n/routing';
import { capitalizarCidade, hreflangAlternates, imagemCompartilhamento } from '@/lib/seo-utils';
import { descricaoParaLocale, tipoOficinaTitulo } from '@/lib/oficina-publica';

// Dados da oficina mudam (aprovacao, fotos): sem isto a pagina ficava guardada
// como 404 mesmo depois de a oficina ser aprovada.
export const revalidate = 60;

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
  // title/description pelo tipo da oficina (auditoria 18/11: uma vidraria aparecia como
  // "autoremonditöökoda"); description = a descricao do dono na lingua da pagina, se houver
  const tipo = tipoOficinaTitulo(oficina.especialidades);
  const vars = { nome: oficina.nome_fantasia, cidade, estado: oficina.estado };
  const title = t(tipo === 'carroceria' ? 'metaTitleCarroceria' : tipo === 'geral' ? 'metaTitleGeral' : 'metaTitleTemplate', vars);
  const descricaoDono = (descricaoParaLocale(oficina.descricao, oficina.descricao_traducoes, locale).texto || '').replace(/\s+/g, ' ').trim();
  const description = descricaoDono.length >= 40
    ? `${oficina.nome_fantasia}, ${cidade}: ${descricaoDono}`.slice(0, 158)
    : t(tipo === 'carroceria' ? 'metaDescriptionCarroceria' : tipo === 'geral' ? 'metaDescriptionGeral' : 'metaDescriptionTemplate', vars);
  const alternates = hreflangAlternates(locale, `/oficinas/${id}`);

  return {
    title,
    description,
    alternates,
    ...(dados.teste ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      images: oficina.logo_url ? [{ url: oficina.logo_url }] : imagemCompartilhamento(locale),
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
