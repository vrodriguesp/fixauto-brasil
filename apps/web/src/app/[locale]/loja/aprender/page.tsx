'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import TutorialHub, { TutorialModulo } from '@/components/tutorial/TutorialHub';

interface ModuloTexto {
  titulo: string;
  resumo: string;
  passosGuiados: string[];
  desafio: string;
  linkRotulo?: string;
  dica?: string;
}

export default function LojaAprenderPage() {
  const t = useTranslations('lojaAprender');
  const { loja, loading } = useAuth();

  if (loading || !loja) {
    return <div className="max-w-6xl mx-auto px-4 py-20 text-center text-gray-400">{t('loading')}</div>;
  }

  const modulosTexto = t.raw('modulos') as Record<string, ModuloTexto>;

  const modulos: TutorialModulo[] = [
    {
      id: 'como-funciona',
      emoji: '📖',
      ...modulosTexto['como-funciona'],
      linkReal: '/loja/dashboard',
    },
    {
      id: 'perfil',
      emoji: '🏬',
      ...modulosTexto['perfil'],
      linkReal: '/loja/perfil',
      verificar: async () => loja.cidade !== 'A definir' && loja.endereco !== 'A definir',
    },
    {
      id: 'catalogo',
      emoji: '📦',
      ...modulosTexto['catalogo'],
      opcional: true,
      linkReal: '/loja/catalogo',
      verificar: async () => {
        const { count } = await supabase.from('pecas_catalogo').select('*', { count: 'exact', head: true }).eq('loja_id', loja.id);
        return (count || 0) > 0;
      },
    },
    {
      id: 'cotacoes',
      emoji: '💬',
      ...modulosTexto['cotacoes'],
      linkReal: '/loja/cotacoes',
      verificar: async () => {
        const { count } = await supabase.from('cotacoes_pecas_respostas').select('*', { count: 'exact', head: true }).eq('loja_id', loja.id);
        return (count || 0) > 0;
      },
    },
    {
      id: 'pedidos',
      emoji: '🚚',
      ...modulosTexto['pedidos'],
      linkReal: '/loja/pedidos',
      verificar: async () => {
        const { count } = await supabase.from('pedidos_pecas').select('*', { count: 'exact', head: true }).eq('loja_id', loja.id).eq('status', 'entregue');
        return (count || 0) > 0;
      },
    },
    {
      id: 'comissao',
      emoji: '💰',
      ...modulosTexto['comissao'],
      linkReal: '/loja/comissao',
    },
  ];

  return (
    <TutorialHub
      titulo={t('titulo')}
      subtitulo={t('subtitulo')}
      storageKey="bipfix_tutorial_loja"
      modulos={modulos}
    />
  );
}
