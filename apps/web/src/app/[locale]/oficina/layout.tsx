import MensagensDaArea from '@/components/i18n/MensagensDaArea';

export default function OficinaLayout({ children }: { children: React.ReactNode }) {
  return (
    <MensagensDaArea>
      <div className="oficina-theme">{children}</div>
    </MensagensDaArea>
  );
}
