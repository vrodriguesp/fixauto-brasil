import { setRequestLocale } from 'next-intl/server';
import GuiaAjuda from '@/components/docs/GuiaAjuda';

// setRequestLocale: sem ele a pagina estatica e gerada no idioma padrao
// (ingles) em todas as versoes - next-intl exige em cada pagina.
export default async function DocsClientePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <GuiaAjuda namespace="docsCliente" locale={locale} />;
}
