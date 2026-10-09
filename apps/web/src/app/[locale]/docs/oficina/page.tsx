import { setRequestLocale } from 'next-intl/server';
import GuiaAjuda from '@/components/docs/GuiaAjuda';

// setRequestLocale: sem ele a pagina estatica e gerada no idioma padrao
// (ingles) em todas as versoes - next-intl exige em cada pagina.
export default async function DocsOficinaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <GuiaAjuda namespace="docsOficina" locale={locale} />;
}
