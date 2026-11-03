import { redirect } from 'next/navigation';
import { localePrefix } from '@/i18n/routing';

// Comissao escondida tambem da loja de pecas (dono 03/11): sem cobranca hoje,
// so assustava. A pagina antiga esta no git (commit f66991e); o admin continua
// vendo tudo em /admin/comissoes-pecas.
export default async function ComissaoEscondida({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`${localePrefix(locale)}/loja/dashboard`);
}
