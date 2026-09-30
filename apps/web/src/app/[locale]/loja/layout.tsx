import MensagensDaArea from '@/components/i18n/MensagensDaArea';

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <MensagensDaArea locale={locale}>{children}</MensagensDaArea>;
}
