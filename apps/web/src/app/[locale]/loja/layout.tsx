import MensagensDaArea from '@/components/i18n/MensagensDaArea';
import PecasV3ProviderArea from '@/components/pecas/PecasV3ProviderArea';

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <MensagensDaArea locale={locale}><PecasV3ProviderArea>{children}</PecasV3ProviderArea></MensagensDaArea>;
}
