import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

// Titulo proprio e curto (Google, "Influencing title links": titulos unicos,
// sem texto repetido); antes herdava o titulo da home.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('tituloEscolherTipo') };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
