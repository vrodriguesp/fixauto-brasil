import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

// 404 no idioma da URL, com menu, rodape e links para as paginas principais
// (antes era a pagina padrao do Next, em ingles e sem nenhum link). O status
// HTTP continua 404, que basta para os buscadores nao indexarem a pagina.
export default function NaoEncontrado() {
  const t = useTranslations('naoEncontrado');
  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-6xl font-bold text-primary-600">404</p>
      <h1 className="text-2xl font-bold text-gray-900 mt-4">{t('titulo')}</h1>
      <p className="text-gray-600 mt-2">{t('texto')}</p>
      <ul className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
        <li><Link href="/" className="btn-primary inline-block">{t('inicio')}</Link></li>
        <li><Link href="/guias" className="btn-secondary inline-block">{t('guias')}</Link></li>
        <li><Link href="/emergencia" className="btn-secondary inline-block">{t('emergencia')}</Link></li>
      </ul>
    </div>
  );
}
