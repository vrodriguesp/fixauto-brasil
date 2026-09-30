import MensagensDaArea from '@/components/i18n/MensagensDaArea';

export default async function OficinaLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <MensagensDaArea locale={locale}>
      <div className="oficina-theme">{children}</div>
    </MensagensDaArea>
  );
}
