// Selo oficial "Disponivel no Google Play" (dono 09/11: app aprovado e publicado em 08/11).
// O app so esta na loja da Estonia: o selo aparece so nas versoes da Estonia (et, ru, en).
// Imagens oficiais do Google (play.google.com/intl/en_us/badges), sem mudar cor nem texto.
const ALT: Record<string, string> = {
  et: 'Hankige teenusest Google Play',
  ru: 'Доступно в Google Play',
  en: 'Get it on Google Play',
};

export const APP_ANDROID = 'com.bipfix.cliente';

export default function GooglePlaySelo({ locale, className = 'h-12 w-auto' }: { locale: string; className?: string }) {
  if (!ALT[locale]) return null;
  return (
    <a href={`https://play.google.com/store/apps/details?id=${APP_ANDROID}&hl=${locale}&gl=EE`}
      target="_blank" rel="noopener noreferrer" data-testid="selo-google-play" className="inline-block">
      <img src={`/images/badges/google-play-${locale}.png`} alt={ALT[locale]} width={646} height={250} loading="lazy" className={className} />
    </a>
  );
}
