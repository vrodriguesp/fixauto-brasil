import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getTranslations } from 'next-intl/server';
import OficinaPerfilClient from './OficinaPerfilClient';
import { INTL_LOCALE } from '@/lib/utils';
import { capitalizarCidade, hreflangAlternates } from '@/lib/seo-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Metadata unica por oficina (nome + cidade no title) - antes desta pagina
// virar um wrapper server-side, TODO perfil publico de oficina mostrava o
// mesmo title/description genericos da home no Google e ao compartilhar,
// desperdicando o maior ativo de SEO local do site (uma URL indexavel por
// oficina cadastrada).
export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'oficinaPerfilPublico' });

  const { data: oficina } = await supabase
    .from('oficinas')
    .select('nome_fantasia, cidade, estado, avaliacao_media, total_avaliacoes')
    .eq('id', id)
    .single();

  if (!oficina) {
    return { title: t('metaNotFoundTitle') };
  }

  const cidade = capitalizarCidade(oficina.cidade);
  const title = t('metaTitleTemplate', { nome: oficina.nome_fantasia, cidade, estado: oficina.estado });
  const description = t('metaDescriptionTemplate', { nome: oficina.nome_fantasia, cidade, estado: oficina.estado });
  const alternates = hreflangAlternates(locale, `/oficinas/${id}`);

  return {
    title,
    description,
    alternates,
    openGraph: {
      type: 'website',
      locale: (INTL_LOCALE[locale] || 'pt-BR').replace('-', '_'),
      siteName: 'BipFix',
      title,
      description,
      url: alternates.canonical,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default function OficinaPublicPage() {
  return <OficinaPerfilClient />;
}
