// Movido para packages/shared/format.ts (24/09 - reaproveitado pelo app
// mobile, que precisa da mesma logica de moeda por pais). Re-exportado
// aqui pra nao quebrar nenhum dos ~40 arquivos que importam de
// '@/lib/currency'.
export { currencyForCountry, countryNameForCode } from '@fixauto/shared';
