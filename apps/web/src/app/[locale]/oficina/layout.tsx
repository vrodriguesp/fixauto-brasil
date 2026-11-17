import MensagensDaArea from '@/components/i18n/MensagensDaArea';
import PecasV3ProviderArea from '@/components/pecas/PecasV3ProviderArea';

export default async function OficinaLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <MensagensDaArea locale={locale}>
      <PecasV3ProviderArea><div className="oficina-theme">{children}</div></PecasV3ProviderArea>
    </MensagensDaArea>
  );
}
