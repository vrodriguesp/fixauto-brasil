// Selo oficial "Download on the App Store" (dono 10/11: app iOS aprovado e publicado, versao 1.0).
// Como o Android, o app so esta na loja da Estonia: selo so nas versoes da Estonia (et, ru, en).
// SVGs oficiais da Apple (toolbox.marketingtools.apple.com), sem mudar cor nem texto. O SVG nao
// tem margem (o PNG do Google Play tem): a altura menor deixa os dois selos do mesmo tamanho visivel.
const ALT: Record<string, string> = {
  et: 'Laadi alla App Store’ist',
  ru: 'Загрузите в App Store',
  en: 'Download on the App Store',
};
const LARGURA: Record<string, number> = { et: 142.17, ru: 119.66, en: 119.66 };

export const APP_IOS_ID = '6831984530';

export default function AppStoreSelo({ locale, className = 'h-9 w-auto' }: { locale: string; className?: string }) {
  if (!ALT[locale]) return null;
  return (
    <a href={`https://apps.apple.com/ee/app/id${APP_IOS_ID}`}
      target="_blank" rel="noopener noreferrer" data-testid="selo-app-store" className="inline-block">
      <img src={`/images/badges/app-store-${locale}.svg`} alt={ALT[locale]} width={LARGURA[locale]} height={40} loading="lazy" className={className} />
    </a>
  );
}
