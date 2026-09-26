'use client';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import TutorialHub, { TutorialModulo } from '@/components/tutorial/TutorialHub';

export default function LojaAprenderPage() {
  const { loja, loading } = useAuth();

  if (loading || !loja) {
    return <div className="max-w-6xl mx-auto px-4 py-20 text-center text-gray-400">Carregando...</div>;
  }

  const modulos: TutorialModulo[] = [
    {
      id: 'como-funciona',
      emoji: '📖',
      titulo: 'Como funciona a loja de peças',
      resumo: 'Oficinas publicam pedidos de peça ("cotações"). Você responde com preço e prazo. A oficina escolhe a melhor resposta e confirma o pedido. A entrega e o pagamento são combinados diretamente com a oficina — o BipFix não processa isso. Só quando você marca o pedido como entregue é que o BipFix cobra uma pequena comissão.',
      passosGuiados: [
        'Abra Dashboard no menu e leia o card "Como funciona".',
        'Repare nos 3 números: cotações abertas pra responder, pedidos confirmados e peças ativas no seu catálogo.',
      ],
      desafio: 'Entenda o fluxo completo antes de começar: cotação → resposta → pedido confirmado → entrega → comissão.',
      linkReal: '/loja/dashboard',
      linkRotulo: 'Ver meu dashboard →',
    },
    {
      id: 'perfil',
      emoji: '🏬',
      titulo: 'Perfil da loja',
      resumo: 'Complete os dados da sua loja — endereço, cidade, estado e CEP corretos importam, mesmo que hoje não filtrem as cotações que você vê (todas as cotações abertas do Brasil aparecem pra você, sem filtro de distância ainda).',
      passosGuiados: [
        'Abra Perfil no menu.',
        'Confira/edite nome fantasia, CNPJ, endereço, cidade e estado.',
        'Clique em "Salvar".',
      ],
      desafio: 'Deixe o cadastro da sua loja completo e correto (nada de "A definir" no endereço).',
      linkReal: '/loja/perfil',
      verificar: async () => loja.cidade !== 'A definir' && loja.endereco !== 'A definir',
    },
    {
      id: 'catalogo',
      emoji: '📦',
      titulo: 'Catálogo de peças',
      resumo: 'Cadastre as peças que você tem em estoque: nome, compatibilidade com marca/modelo/ano, preço e quantidade. Serve como seu controle interno de estoque dentro do BipFix.',
      opcional: true,
      passosGuiados: [
        'Abra Catálogo no menu.',
        'Clique em "+ Nova Peça".',
        'Preencha nome e preço (obrigatórios) — marca, modelo, ano e descrição são opcionais.',
        'Clique em "Adicionar".',
      ],
      desafio: 'Cadastre pelo menos uma peça no seu catálogo.',
      linkReal: '/loja/catalogo',
      verificar: async () => {
        const { count } = await supabase.from('pecas_catalogo').select('*', { count: 'exact', head: true }).eq('loja_id', loja.id);
        return (count || 0) > 0;
      },
    },
    {
      id: 'cotacoes',
      emoji: '💬',
      titulo: 'Responder cotações de oficinas',
      resumo: 'É aqui que você disputa vendas: uma lista de pedidos de peça publicados por oficinas, esperando resposta. Preço e prazo bons aumentam sua chance de ser escolhido. Só a oficina vê todas as respostas — outras lojas não veem seu preço.',
      passosGuiados: [
        'Abra Cotações no menu.',
        'Encontre uma cotação aberta pra uma peça que você tem.',
        'Clique em "Responder cotação".',
        'Preencha preço, prazo em dias, e uma observação se quiser.',
        'Clique em "Enviar resposta".',
      ],
      desafio: 'Responda pelo menos uma cotação de oficina com preço e prazo reais.',
      linkReal: '/loja/cotacoes',
      dica: 'Responder rápido (menos de 2h) reduz sua taxa de comissão mais tarde.',
      verificar: async () => {
        const { count } = await supabase.from('cotacoes_pecas_respostas').select('*', { count: 'exact', head: true }).eq('loja_id', loja.id);
        return (count || 0) > 0;
      },
    },
    {
      id: 'pedidos',
      emoji: '🚚',
      titulo: 'Pedidos e entrega',
      resumo: 'Quando uma oficina escolhe sua resposta, o pedido aparece aqui. Combine a entrega e o pagamento diretamente com a oficina (fora da plataforma) e, quando entregar de verdade, marque como entregue.',
      passosGuiados: [
        'Abra Pedidos no menu.',
        'Combine entrega/pagamento com a oficina (use o link "Conversar" se precisar).',
        'Depois de entregar de verdade, clique em "Marcar entregue".',
      ],
      desafio: 'Marque um pedido confirmado como entregue.',
      linkReal: '/loja/pedidos',
      verificar: async () => {
        const { count } = await supabase.from('pedidos_pecas').select('*', { count: 'exact', head: true }).eq('loja_id', loja.id).eq('status', 'entregue');
        return (count || 0) > 0;
      },
    },
    {
      id: 'comissao',
      emoji: '💰',
      titulo: 'Comissão da plataforma',
      resumo: 'A taxa começa em 3% e cai conforme você responde rápido e entrega volume de pedidos — mínimo de 1,5% na prática. Só é cobrada quando o pedido é marcado como entregue, nunca antes disso.',
      passosGuiados: [
        'Abra Comissão no menu.',
        'Veja sua taxa atual, o que está pendente e o que já foi pago.',
      ],
      desafio: 'Confira sua taxa atual e o que você pode fazer pra reduzi-la.',
      linkReal: '/loja/comissao',
      linkRotulo: 'Ver minha comissão →',
    },
  ];

  return (
    <TutorialHub
      titulo="Aprenda a usar o BipFix"
      subtitulo="Um passo de cada vez. Escolha o modo Guiado se quiser instruções detalhadas, ou Autônomo se já quiser tentar sozinho."
      storageKey="bipfix_tutorial_loja"
      modulos={modulos}
    />
  );
}
