import type { Metadata } from 'next';
import Link from 'next/link';
import StructuredData from '@/components/seo/StructuredData';
import { generateFAQSchema } from '@/lib/seo-utils';

export const metadata: Metadata = {
  title: 'Sistema de Gestão para Oficina Mecânica e Mais Clientes',
  description:
    'Software gratuito para oficina mecânica organizar agenda, orçamentos e equipe, e ganhar visibilidade para conseguir mais clientes na sua região. Cadastre sua oficina no BipFix.',
  keywords: [
    'sistema de gestão para oficina mecânica',
    'software para oficina mecânica',
    'aplicativo para oficina mecânica',
    'programa de gestão de oficina',
    'como conseguir mais clientes para oficina mecânica',
    'divulgar oficina mecânica',
    'marketing para oficina mecânica',
    'app para gerenciar oficina',
    'sistema para funilaria e pintura',
  ],
  alternates: { canonical: 'https://bipfix.com/para-oficinas' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'BipFix',
    title: 'Sistema de Gestão para Oficina Mecânica e Mais Clientes | BipFix',
    description:
      'Organize sua oficina e apareça para motoristas da sua região precisando de reparo. Cadastro gratuito.',
    url: 'https://bipfix.com/para-oficinas',
  },
};

const FAQ_ITEMS = [
  {
    pergunta: 'Quanto custa o sistema de gestão do BipFix para minha oficina?',
    resposta:
      'O cadastro e o uso das ferramentas de gestão (agenda, orçamentos, equipe, avaliações) não têm mensalidade. Hoje não cobramos comissão dos parceiros iniciais. Caso isso mude no futuro, avisamos com pelo menos 30 dias de antecedência antes de qualquer cobrança, conforme nossos Termos de Uso.',
  },
  {
    pergunta: 'Como o BipFix ajuda minha oficina a conseguir mais clientes?',
    resposta:
      'Motoristas da sua região que precisam de reparo enviam fotos do dano e recebem orçamentos de oficinas próximas, incluindo a sua. Seu perfil público também aparece no Google para quem pesquisa oficinas na sua cidade, com suas avaliações, especialidades e localização.',
  },
  {
    pergunta: 'O sistema substitui uma planilha ou caderno de agendamento?',
    resposta:
      'Sim. Você organiza sua agenda por veículo e funcionário, distribui o trabalho entre mecânicos, controla a capacidade de atendimento e recebe notificações automáticas — tudo em um só lugar, sem depender de papel ou planilhas soltas.',
  },
  {
    pergunta: 'Preciso ter conhecimento técnico para usar?',
    resposta:
      'Não. A plataforma foi desenhada para o dia a dia da oficina, com um portal de aprendizado guiado dentro do próprio sistema para você e sua equipe aprenderem cada função em poucos minutos.',
  },
  {
    pergunta: 'Consigo comprar peças de fornecedores pela plataforma?',
    resposta:
      'Sim. Você pode abrir cotações de peças para lojas parceiras e outras oficinas da região, comparar preços e prazos, e negociar diretamente pelo chat antes de confirmar o pedido.',
  },
];

export default function ParaOficinasPage() {
  const faqSchema = generateFAQSchema(FAQ_ITEMS);

  const softwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'BipFix para Oficinas',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: 'https://bipfix.com/para-oficinas',
    description:
      'Sistema de gestão para oficina mecânica: agenda, orçamentos, equipe, cotação de peças e visibilidade para novos clientes.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'BRL',
    },
  };

  return (
    <div>
      <StructuredData data={faqSchema} />
      <StructuredData data={softwareSchema} />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
              Gestão organizada e mais clientes para sua oficina mecânica
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-primary-100 leading-relaxed">
              O BipFix é o sistema de gestão que organiza agenda, orçamentos e equipe da sua oficina — e ao mesmo
              tempo te coloca na frente de motoristas da sua região procurando reparo agora.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link
                href="/seja-parceiro"
                className="bg-white text-primary-700 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary-50 transition-colors text-center"
              >
                Quero ser parceiro fundador
              </Link>
              <Link
                href="/oficinas"
                className="border-2 border-white text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white/10 transition-colors text-center"
              >
                Ver oficinas na plataforma
              </Link>
            </div>
            <p className="mt-4 text-sm text-primary-200">
              Sem mensalidade. Sem comissão para os parceiros iniciais.
            </p>
          </div>
        </div>
      </section>

      {/* Dores -> Solucao */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
            Os problemas do dia a dia que o BipFix resolve
          </h2>
          <p className="text-gray-600 text-center mb-16 max-w-2xl mx-auto">
            Feito para a rotina real de quem administra uma oficina, não só para grandes redes
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <DorSolucao
              dor="Agenda em papel ou planilha, difícil de ver quem está fazendo o quê"
              solucao="Agenda visual por veículo e por funcionário, com painel de distribuição de trabalho"
            />
            <DorSolucao
              dor="Poucos clientes novos, dependendo só de indicação"
              solucao="Perfil público indexado no Google e recebimento automático de pedidos de orçamento da região"
            />
            <DorSolucao
              dor="Orçamento feito no WhatsApp, sem controle nem histórico"
              solucao="Orçamentos estruturados, com etapas do reparo e notificação automática ao cliente"
            />
            <DorSolucao
              dor="Sem visibilidade de reputação para se diferenciar da concorrência"
              solucao="Avaliações reais de clientes e badges de reputação exibidos no seu perfil"
            />
            <DorSolucao
              dor="Comunicação da equipe bagunçada entre mecânico e balcão"
              solucao="Notas internas por veículo e notificações em tempo real para a equipe"
            />
            <DorSolucao
              dor="Demora para achar peça e comparar fornecedor"
              solucao="Cotação de peças com lojas parceiras e outras oficinas da sua região, com chat direto"
            />
          </div>
        </div>
      </section>

      {/* Como funciona para conseguir clientes */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Como sua oficina ganha visibilidade
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            <Step number={1} title="Cadastre-se" description="Perfil completo com endereço, especialidades e fotos, em poucos minutos" />
            <Step number={2} title="Apareça na busca" description="Seu perfil público é indexado no Google para quem procura oficina na sua cidade" />
            <Step number={3} title="Receba pedidos" description="Motoristas próximos enviam solicitações de reparo direto para você" />
            <Step number={4} title="Construa reputação" description="Cada serviço bem avaliado aumenta sua posição e confiança com novos clientes" />
          </div>
        </div>
      </section>

      {/* Comissao / transparencia */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Transparência sobre custos</h2>
          <p className="text-gray-600 text-lg leading-relaxed">
            Hoje o cadastro e o uso do sistema de gestão são gratuitos, e não cobramos comissão dos parceiros
            iniciais. Se isso mudar no futuro, você será avisado com no mínimo 30 dias de antecedência antes de
            qualquer cobrança começar a valer, conforme nossos{' '}
            <Link href="/termos" className="text-primary-600 hover:underline font-medium">
              Termos de Uso
            </Link>
            .
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Perguntas frequentes de oficinas</h2>
          <div className="space-y-4">
            {FAQ_ITEMS.map((faq, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="font-semibold text-gray-900 mb-2">{faq.pergunta}</h3>
                <p className="text-gray-600 leading-relaxed text-sm">{faq.resposta}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-16 bg-primary-700 text-white text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Pronto para organizar sua oficina e ganhar mais clientes?</h2>
          <Link
            href="/seja-parceiro"
            className="inline-block mt-4 bg-white text-primary-700 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary-50 transition-colors"
          >
            Quero ser parceiro fundador
          </Link>
        </div>
      </section>
    </div>
  );
}

function DorSolucao({ dor, solucao }: { dor: string; solucao: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
      <p className="text-sm text-red-600 font-medium mb-2">✕ {dor}</p>
      <p className="text-sm text-gray-800 font-medium">✓ {solucao}</p>
    </div>
  );
}

function Step({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="text-center">
      <div className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 font-bold">
        {number}
      </div>
      <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}
