import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getTranslations } from 'next-intl/server';
import OficinaPerfilClient from './OficinaPerfilClient';
import { INTL_LOCALE } from '@/lib/utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Oficinas digitam a cidade livremente no cadastro (ex: "sao paulo", tudo
// minusculo, sem acento) - isso vaza pro title/description exibido no
// Google, entao pelo menos capitaliza cada palavra aqui na exibicao, sem
// mexer no valor salvo no banco.
function capitalizarCidade(cidade: string): string {
  return cidade
    .split(' ')
    .map((palavra) => (palavra.length > 2 ? palavra.charAt(0).toUpperCase() + palavra.slice(1) : palavra))
    .join(' ');
}

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
  const url = `https://bipfix.com/oficinas/${id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: (INTL_LOCALE[locale] || 'pt-BR').replace('-', '_'),
      siteName: 'BipFix',
      title,
      description,
      url,
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
