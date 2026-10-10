'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import TutorialHub, { TutorialModulo } from '@/components/tutorial/TutorialHub';

export default function OficinaAprenderPage() {
  const t = useTranslations('oficinaAprender');
  const { oficina, funcionario, loading } = useAuth();
  const isMecanico = funcionario?.cargo === 'mecanico';

  if (loading || !oficina) {
    return <div className="max-w-6xl mx-auto px-4 py-20 text-center text-gray-400">{t('carregando')}</div>;
  }

  // Mecanico so tem acesso a "Meus Veiculos" no menu (nao ve Perfil,
  // Comissao, Equipe, Pecas) - a formacao dele fica so na parte que ele
  // de fato usa: check-in e etapas do reparo do veiculo atribuido a ele.
  // Ele nao tem o botao "Entrega" (so quem nao e mecanico finaliza).
  if (isMecanico) {
    const modulosMecanico: TutorialModulo[] = [
      {
        id: 'meus-veiculos',
        emoji: '🔧',
        titulo: t('mecanico.meusVeiculos.titulo'),
        resumo: t('mecanico.meusVeiculos.resumo'),
        passosGuiados: t.raw('mecanico.meusVeiculos.passosGuiados') as string[],
        desafio: t('mecanico.meusVeiculos.desafio'),
        linkReal: '/oficina/veiculos-em-servico',
        dica: t('mecanico.meusVeiculos.dica'),
        verificar: async () => {
          if (!funcionario) return false;
          const { count } = await supabase.from('manutencao_etapas').select('*', { count: 'exact', head: true }).eq('funcionario_id', funcionario.id);
          return (count || 0) > 0;
        },
      },
      {
        id: 'notas-internas',
        emoji: '🔒',
        titulo: t('mecanico.notasInternas.titulo'),
        resumo: t('mecanico.notasInternas.resumo'),
        passosGuiados: t.raw('mecanico.notasInternas.passosGuiados') as string[],
        desafio: t('mecanico.notasInternas.desafio'),
        linkReal: '/oficina/veiculos-em-servico',
        verificar: async () => {
          if (!funcionario) return false;
          const { count } = await supabase.from('veiculo_notas_internas').select('*', { count: 'exact', head: true }).eq('remetente_id', funcionario.profile_id);
          return (count || 0) > 0;
        },
      },
      {
        id: 'minha-agenda',
        emoji: '📅',
        titulo: t('mecanico.minhaAgenda.titulo'),
        resumo: t('mecanico.minhaAgenda.resumo'),
        passosGuiados: t.raw('mecanico.minhaAgenda.passosGuiados') as string[],
        desafio: t('mecanico.minhaAgenda.desafio'),
        linkReal: '/oficina/agenda',
        linkRotulo: t('mecanico.minhaAgenda.linkRotulo'),
      },
    ];

    return (
      <TutorialHub
        titulo={t('tituloGeral')}
        subtitulo={t('subtituloMecanico')}
        storageKey="bipfix_tutorial_oficina_mecanico"
        modulos={modulosMecanico}
      />
    );
  }

  const modulos: TutorialModulo[] = [
    {
      id: 'perfil',
      emoji: '🏪',
      titulo: t('geral.perfil.titulo'),
      resumo: t('geral.perfil.resumo'),
      passosGuiados: t.raw('geral.perfil.passosGuiados') as string[],
      desafio: t('geral.perfil.desafio'),
      linkReal: '/oficina/perfil',
      verificar: async () => (oficina.especialidades?.length || 0) > 0 && !!oficina.endereco,
    },
    {
      id: 'solicitacoes',
      emoji: '📋',
      titulo: t('geral.solicitacoes.titulo'),
      resumo: t('geral.solicitacoes.resumo'),
      passosGuiados: t.raw('geral.solicitacoes.passosGuiados') as string[],
      desafio: t('geral.solicitacoes.desafio'),
      linkReal: '/oficina/solicitacoes',
      dica: t('geral.solicitacoes.dica'),
      verificar: async () => {
        const { count } = await supabase.from('orcamentos').select('*', { count: 'exact', head: true }).eq('oficina_id', oficina.id);
        return (count || 0) > 0;
      },
    },
    {
      id: 'checkin',
      emoji: '🔧',
      titulo: t('geral.checkin.titulo'),
      resumo: t('geral.checkin.resumo'),
      passosGuiados: t.raw('geral.checkin.passosGuiados') as string[],
      desafio: t('geral.checkin.desafio'),
      linkReal: '/oficina/veiculos-em-servico',
      dica: t('geral.checkin.dica'),
      verificar: async () => {
        const { count } = await supabase.from('agenda').select('*', { count: 'exact', head: true }).eq('oficina_id', oficina.id).in('status', ['em_andamento', 'concluido']);
        return (count || 0) > 0;
      },
    },
    {
      id: 'notas-internas',
      emoji: '🔒',
      titulo: t('geral.notasInternas.titulo'),
      resumo: t('geral.notasInternas.resumo'),
      passosGuiados: t.raw('geral.notasInternas.passosGuiados') as string[],
      desafio: t('geral.notasInternas.desafio'),
      linkReal: '/oficina/veiculos-em-servico',
      verificar: async () => {
        const { count } = await supabase.from('veiculo_notas_internas').select('*', { count: 'exact', head: true }).eq('oficina_id', oficina.id);
        return (count || 0) > 0;
      },
    },
    {
      id: 'comissao',
      emoji: '💰',
      titulo: t('geral.comissao.titulo'),
      resumo: t('geral.comissao.resumo'),
      passosGuiados: t.raw('geral.comissao.passosGuiados') as string[],
      desafio: t('geral.comissao.desafio'),
      linkReal: '/oficina/comissao',
      linkRotulo: t('geral.comissao.linkRotulo'),
    },
    {
      id: 'equipe',
      emoji: '👥',
      titulo: t('geral.equipe.titulo'),
      resumo: t('geral.equipe.resumo'),
      opcional: true,
      passosGuiados: t.raw('geral.equipe.passosGuiados') as string[],
      desafio: t('geral.equipe.desafio'),
      linkReal: '/oficina/equipe',
      verificar: async () => {
        const { count } = await supabase.from('funcionarios').select('*', { count: 'exact', head: true }).eq('oficina_id', oficina.id);
        return (count || 0) > 0;
      },
    },
    {
      id: 'distribuicao',
      emoji: '🗂️',
      titulo: t('geral.distribuicao.titulo'),
      resumo: t('geral.distribuicao.resumo'),
      opcional: true,
      passosGuiados: t.raw('geral.distribuicao.passosGuiados') as string[],
      desafio: t('geral.distribuicao.desafio'),
      linkReal: '/oficina/agenda?vista=quadro',
      verificar: async () => {
        // desafio: um elevador/posto reservado ou usado por um carro (migracao 057)
        const { count } = await supabase.from('posto_ocupacoes').select('*', { count: 'exact', head: true }).eq('oficina_id', oficina.id);
        return (count || 0) > 0;
      },
    },
    {
      id: 'peças',
      emoji: '🔩',
      titulo: t('geral.pecas.titulo'),
      resumo: t('geral.pecas.resumo'),
      opcional: true,
      passosGuiados: t.raw('geral.pecas.passosGuiados') as string[],
      desafio: t('geral.pecas.desafio'),
      linkReal: '/oficina/pecas',
      verificar: async () => {
        const { count } = await supabase.from('cotacoes_pecas').select('*', { count: 'exact', head: true }).eq('oficina_id', oficina.id);
        return (count || 0) > 0;
      },
    },
  ];

  return (
    <TutorialHub
      titulo={t('tituloGeral')}
      subtitulo={t('subtituloGeral')}
      storageKey="bipfix_tutorial_oficina"
      modulos={modulos}
    />
  );
}
