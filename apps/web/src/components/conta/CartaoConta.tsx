'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import PausarAvisos from '@/components/conta/PausarAvisos';

// Cartao "Conta" no fim do perfil (dono 19/11 - P6): e-mail de acesso, pausa dos avisos (oficina) e, por ultimo,
// o link para excluir a conta - antes era um link vermelho solto logo abaixo de "Salvar", onde quem rolava o
// perfil ate ao fim caia nele (caso real 19/11). A exclusao continua com confirmacao na propria pagina.
export default function CartaoConta() {
  const t = useTranslations('excluirConta');
  const { user } = useAuth() as any;
  return (
    <section className="card mt-10" aria-labelledby="conta-titulo" data-testid="cartao-conta">
      <h2 id="conta-titulo" className="text-lg font-semibold text-gray-900">{t('contaTitulo')}</h2>
      {user?.email && <p className="mt-1 text-sm text-gray-500 break-all">{user.email}</p>}
      {user?.tipo === 'oficina' && <div className="mt-4 border-t border-gray-100 pt-4"><PausarAvisos compacto /></div>}
      <div className="mt-4 border-t border-gray-100 pt-4">
        <p className="text-sm text-gray-600">{t('excluirAjuda')}</p>
        <Link href="/excluir-conta" className="mt-2 inline-flex min-h-[44px] items-center text-sm font-medium text-red-700 hover:underline" data-testid="link-excluir-conta">{t('link')} ›</Link>
      </div>
    </section>
  );
}
