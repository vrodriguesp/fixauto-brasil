'use client';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import TutorialHub, { TutorialModulo } from '@/components/tutorial/TutorialHub';

export default function OficinaAprenderPage() {
  const { oficina, funcionario, loading } = useAuth();
  const isMecanico = funcionario?.cargo === 'mecanico';

  if (loading || !oficina) {
    return <div className="max-w-6xl mx-auto px-4 py-20 text-center text-gray-400">Carregando...</div>;
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
        titulo: 'Meus Veículos: check-in e etapas',
        resumo: 'Aqui você vê só os veículos atribuídos a você. Faz o check-in quando o carro chega, e registra cada etapa do reparo (diagnóstico, execução, etc.) pra oficina e o cliente acompanharem o progresso.',
        passosGuiados: [
          'Abra Oficina no menu (sua lista de veículos, chamada "Meus Veículos").',
          'Na aba "Aguardando", clique em "Check-in" no veículo que chegou.',
          'Clique em "+ Etapa" pra registrar o progresso (ex: Em diagnóstico, Em execução, Teste final).',
          'Clique na linha do veículo pra ver a linha do tempo completa e conversar com o cliente se precisar.',
        ],
        desafio: 'Faça o check-in de um veículo atribuído a você e registre pelo menos uma etapa de manutenção.',
        linkReal: '/oficina/veiculos-em-servico',
        dica: 'A entrega final (fechar o serviço) é feita pelo dono da oficina ou por um administrativo, não por você.',
        verificar: async () => {
          if (!funcionario) return false;
          const { count } = await supabase.from('manutencao_etapas').select('*', { count: 'exact', head: true }).eq('funcionario_id', funcionario.id);
          return (count || 0) > 0;
        },
      },
      {
        id: 'notas-internas',
        emoji: '🔒',
        titulo: 'Notas internas (falar com o dono sem o cliente ver)',
        resumo: 'Dentro de cada veículo, tem uma caixa "Notas internas" só pra equipe — dono e mecânico. Use pra avisar coisas tipo "faltou peça, já pedi" ou tirar uma dúvida, sem que isso apareça pro cliente. É diferente do botão "Mensagem", que fala direto com o cliente.',
        passosGuiados: [
          'Abra Oficina no menu e clique num veículo pra expandir os detalhes.',
          'Role até a caixa amarela "Notas internas (não vai pro cliente)".',
          'Escreva sua nota e clique em Enviar — o dono recebe uma notificação na hora, no sino do menu.',
        ],
        desafio: 'Escreva uma nota interna em algum veículo sob sua responsabilidade.',
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
        titulo: 'Minha Agenda',
        resumo: 'Uma visão de calendário só dos veículos atribuídos a você: quando cada um está previsto pra chegar, quais já fizeram check-in e quais já foram entregues.',
        passosGuiados: [
          'Abra Agenda no menu.',
          'Use as visões Mês, Dia ou Lista pra ver o que está previsto pra você.',
          'Você também pode fazer o check-in direto por aqui, igual em "Oficina".',
        ],
        desafio: 'Confira sua agenda e identifique quando é o próximo check-in previsto pra você.',
        linkReal: '/oficina/agenda',
        linkRotulo: 'Ver minha agenda →',
      },
    ];

    return (
      <TutorialHub
        titulo="Aprenda a usar o BipFix"
        subtitulo="Sua formação como mecânico: check-in e etapas dos veículos sob sua responsabilidade."
        storageKey="bipfix_tutorial_oficina_mecanico"
        modulos={modulosMecanico}
      />
    );
  }

  const modulos: TutorialModulo[] = [
    {
      id: 'perfil',
      emoji: '🏪',
      titulo: 'Perfil e especialidades',
      resumo: 'É o seu cadastro mestre: define que tipo de serviço você atende, seu raio de atendimento e o que os clientes veem na sua página pública. Sem especialidades marcadas, você não recebe nenhuma solicitação.',
      passosGuiados: [
        'Abra Perfil no menu.',
        'Em "Especialidades", marque pelo menos um tipo de serviço que sua oficina faz (ex: Mecânica, Funilaria).',
        'Preencha endereço, cidade, estado e raio de atendimento.',
        '(Opcional) Adicione uma logo e fotos da oficina.',
        'Clique em "Salvar Alterações" no fim da página.',
      ],
      desafio: 'Configure seu perfil de forma que você comece a receber solicitações de clientes de verdade: pelo menos uma especialidade marcada e endereço preenchido.',
      linkReal: '/oficina/perfil',
      verificar: async () => (oficina.especialidades?.length || 0) > 0 && !!oficina.endereco,
    },
    {
      id: 'solicitacoes',
      emoji: '📋',
      titulo: 'Solicitações e orçamento',
      resumo: 'É a "vitrine" de pedidos de reparo de clientes na sua região. Você escolhe quais orçar. O cliente só vê seu nome e foto até você orçar — o contato completo só aparece depois que ele aceitar.',
      passosGuiados: [
        'Abra Solicitações no menu.',
        'Clique em uma solicitação da lista para ver os detalhes (fotos do dano, veículo, descrição).',
        'Clique em "Enviar Orçamento".',
        'Adicione ao menos um item (descrição, tipo, valor, quantidade).',
        'Escolha se você absorve a comissão ou repassa ao cliente.',
        'Defina prazo, datas disponíveis para check-in, e clique em "Enviar Orçamento".',
      ],
      desafio: 'Envie um orçamento de verdade para alguma solicitação aberta na sua região.',
      linkReal: '/oficina/solicitacoes',
      dica: 'Quanto mais rápido você responde, menor fica sua taxa de comissão — ver módulo "Comissão".',
      verificar: async () => {
        const { count } = await supabase.from('orcamentos').select('*', { count: 'exact', head: true }).eq('oficina_id', oficina.id);
        return (count || 0) > 0;
      },
    },
    {
      id: 'checkin',
      emoji: '🔧',
      titulo: 'Agenda, check-in e entrega',
      resumo: 'Depois que o cliente aceita o orçamento, o veículo entra na sua agenda. Você faz o check-in quando ele chega, registra as etapas do reparo, e confirma a entrega no final.',
      passosGuiados: [
        'Abra Oficina no menu (lista de veículos em serviço).',
        'Na aba "Aguardando", clique em "Check-in" no veículo que chegou.',
        'Clique em "+ Etapa" pra registrar o progresso (ex: Em diagnóstico, Em execução).',
        'Quando terminar, clique em "Entrega" pra fechar o serviço.',
      ],
      desafio: 'Faça o check-in de um veículo (da plataforma ou manual, em Check-in Manual) e registre pelo menos uma etapa de manutenção.',
      linkReal: '/oficina/veiculos-em-servico',
      dica: 'Não tem nenhum orçamento aceito ainda? Use "Check-in Manual" no menu Mais pra registrar um cliente que chegou direto na oficina, sem passar pelo site.',
      verificar: async () => {
        const { count } = await supabase.from('agenda').select('*', { count: 'exact', head: true }).eq('oficina_id', oficina.id).in('status', ['em_andamento', 'concluido']);
        return (count || 0) > 0;
      },
    },
    {
      id: 'notas-internas',
      emoji: '🔒',
      titulo: 'Notas internas com a equipe',
      resumo: 'Dentro de cada veículo, tem uma caixa "Notas internas" só pra você e seus mecânicos — combinados, avisos, dúvidas sobre o serviço, sem que nada disso apareça pro cliente (diferente do botão "Mensagem", que fala com o cliente). Quando alguém escreve, você recebe uma notificação na hora no sino do menu.',
      passosGuiados: [
        'Abra Oficina no menu e clique num veículo pra expandir os detalhes.',
        'Role até a caixa amarela "Notas internas (não vai pro cliente)".',
        'Escreva algo e clique em Enviar.',
      ],
      desafio: 'Escreva uma nota interna em algum veículo em serviço.',
      linkReal: '/oficina/veiculos-em-servico',
      verificar: async () => {
        const { count } = await supabase.from('veiculo_notas_internas').select('*', { count: 'exact', head: true }).eq('oficina_id', oficina.id);
        return (count || 0) > 0;
      },
    },
    {
      id: 'comissao',
      emoji: '💰',
      titulo: 'Como funciona a comissão',
      resumo: 'O BipFix cobra uma taxa sobre cada serviço concluído — mas ela não é fixa. Começa em 15% e cai até 5% conforme você responde rápido, revisa pouco o orçamento, tem boa avaliação e mantém volume de serviços.',
      passosGuiados: [
        'Abra Comissão no menu.',
        'Veja sua taxa atual e o que está reduzindo (ou não) cada critério.',
        'Leia a dica: responder rápido, evitar revisão de orçamento e pedir avaliação ao cliente reduz sua taxa.',
      ],
      desafio: 'Explore a tela de Comissão e identifique qual critério mais aumentaria sua taxa se você melhorasse.',
      linkReal: '/oficina/comissao',
      linkRotulo: 'Ver minha comissão →',
    },
    {
      id: 'equipe',
      emoji: '👥',
      titulo: 'Equipe (opcional)',
      resumo: 'Se você trabalha sozinho, pode pular esse módulo tranquilo — nada no site obriga ter funcionários. Mas se tiver mecânicos, você pode cadastrá-los aqui e até definir quantos carros cada um consegue atender ao mesmo tempo.',
      opcional: true,
      passosGuiados: [
        'Abra Mais → Equipe no menu.',
        'Clique em "+ Novo Funcionário".',
        'Preencha e-mail, uma senha temporária, e escolha o cargo (Mecânico ou Administrador).',
        'Clique em "Cadastrar" e repasse a senha pro funcionário.',
      ],
      desafio: 'Cadastre um funcionário mecânico e defina uma capacidade máxima de veículos simultâneos pra ele.',
      linkReal: '/oficina/equipe',
      verificar: async () => {
        const { count } = await supabase.from('funcionarios').select('*', { count: 'exact', head: true }).eq('oficina_id', oficina.id);
        return (count || 0) > 0;
      },
    },
    {
      id: 'distribuicao',
      emoji: '🗂️',
      titulo: 'Distribuição de trabalho (opcional)',
      resumo: 'Um quadro visual pra organizar qual mecânico vai cuidar de cada veículo — inclusive antes dele chegar na oficina. Ajuda a planejar a semana e evitar sobrecarregar um mecânico enquanto outro está livre.',
      opcional: true,
      passosGuiados: [
        'Abra Mais → Distribuição de Trabalho no menu.',
        'Veja os veículos agendados e em serviço organizados em colunas por mecânico (e uma coluna "Não atribuído").',
        'Escolha o responsável de cada veículo no seletor do card.',
      ],
      desafio: 'Atribua um responsável a pelo menos um veículo agendado, antes mesmo dele chegar.',
      linkReal: '/oficina/distribuicao',
      verificar: async () => {
        const { count } = await supabase.from('agenda').select('*', { count: 'exact', head: true }).eq('oficina_id', oficina.id).not('funcionario_id', 'is', null);
        return (count || 0) > 0;
      },
    },
    {
      id: 'peças',
      emoji: '🔩',
      titulo: 'Peças: comprar de lojas ou vender excedente',
      resumo: 'Precisa de uma peça? Peça cotação pra lojas parceiras (e até pra outras oficinas vizinhas). E se você tem estoque sobrando, também pode virar fornecedor e vender pra oficinas perto de você.',
      opcional: true,
      passosGuiados: [
        'Abra Mais → Peças no menu.',
        'Na aba "Comprar", clique em "+ Nova Cotação" e descreva a peça que precisa.',
        'Espere respostas de lojas/oficinas próximas, compare preço e prazo, e confirme o pedido escolhido.',
        '(Opcional) Na aba "Vender excedente", ative o interruptor pra começar a responder cotações de oficinas vizinhas.',
      ],
      desafio: 'Crie uma cotação de peça pedindo algo que sua oficina realmente usa no dia a dia.',
      linkReal: '/oficina/pecas',
      verificar: async () => {
        const { count } = await supabase.from('cotacoes_pecas').select('*', { count: 'exact', head: true }).eq('oficina_id', oficina.id);
        return (count || 0) > 0;
      },
    },
  ];

  return (
    <TutorialHub
      titulo="Aprenda a usar o BipFix"
      subtitulo="Um passo de cada vez. Escolha o modo Guiado se quiser instruções detalhadas, ou Autônomo se já quiser tentar sozinho."
      storageKey="bipfix_tutorial_oficina"
      modulos={modulos}
    />
  );
}
