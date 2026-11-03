import { redirect } from 'next/navigation';
import { localePrefix } from '@/i18n/routing';

// Comissao escondida da oficina (dono 03/11): sem cobranca hoje, a pagina so
// assustava quem esta entrando. Ja estava fora do menu desde 01/11; agora nem
// abre pelo endereco. A pagina antiga esta no git (commit 49697a8) e o admin
// continua vendo tudo em /admin/comissoes.
export default async function ComissaoEscondida({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`${localePrefix(locale)}/oficina/pedidos`);
}
