'use client';

import { useState } from 'react';
import Link from 'next/link';

interface AccordionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Accordion({ title, children, defaultOpen = false }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-lg font-semibold text-gray-900">{title}</span>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-6 pb-6 text-gray-600 leading-relaxed space-y-3 border-t border-gray-100 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

function StepItem({ number, title, desc }: { number: number; title: string; desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold mt-0.5">
        {number}
      </div>
      <div>
        <p className="font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-600 mt-1">{desc}</p>
      </div>
    </div>
  );
}

export default function DocsOficinaPage() {
  return (
    <div>
      {/* Header */}
      <div className="mb-10">
        <Link href="/docs" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar para Central de Ajuda
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Guia da Oficina</h1>
        <p className="text-gray-600 text-lg">
          Aprenda a usar todas as ferramentas do BipFix para atrair clientes, gerenciar serviços e crescer sua oficina.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        <Accordion title="1. Como cadastrar sua oficina" defaultOpen>
          <p>O cadastro da sua oficina no BipFix é simples e leva poucos minutos:</p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Crie sua conta"
              desc="Acesse /cadastro e selecione 'Sou uma oficina'. Preencha os dados do responsável: nome, e-mail e senha."
            />
            <StepItem
              number={2}
              title="Dados da oficina"
              desc="Informe o CNPJ, razão social, nome fantasia, telefone e endereço completo da oficina."
            />
            <StepItem
              number={3}
              title="Especialidades"
              desc="Selecione os tipos de serviço que sua oficina oferece: funilaria, pintura, mecânica, elétrica, vidros, etc."
            />
            <StepItem
              number={4}
              title="Raio de atendimento"
              desc="Defina o raio de distância (em km) que sua oficina aceita receber solicitações. Você pode ajustar depois."
            />
            <StepItem
              number={5}
              title="Perfil completo"
              desc="Adicione fotos da oficina, descrição, horário de funcionamento e formas de pagamento aceitas. Um perfil completo atrai mais clientes."
            />
          </div>
        </Accordion>

        <Accordion title="2. Como receber solicitações">
          <p>
            O BipFix envia solicitações automaticamente para oficinas que atendem aos critérios do cliente:
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            <li><span className="font-medium">Proximidade</span> — O cliente está dentro do raio de atendimento que você definiu.</li>
            <li><span className="font-medium">Especialidade</span> — O tipo de serviço solicitado corresponde às especialidades da sua oficina.</li>
            <li><span className="font-medium">Disponibilidade</span> — Sua oficina está ativa na plataforma e com agenda aberta.</li>
          </ul>
          <p className="mt-3">
            Você recebe notificações no painel e por e-mail. Cada solicitação inclui: fotos do dano, descrição do problema, tipo de veículo e localização do cliente.
          </p>
          <p className="mt-2 text-sm bg-blue-50 p-3 rounded-lg">
            Dica: mantenha seu perfil atualizado e suas especialidades corretas para receber as solicitações mais relevantes.
          </p>
        </Accordion>

        <Accordion title="3. Como enviar orçamentos">
          <p>
            Para enviar um orçamento competitivo e detalhado:
          </p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Avalie a solicitação"
              desc="Analise as fotos e descrição do cliente. Se precisar de mais informações, você pode enviar uma mensagem."
            />
            <StepItem
              number={2}
              title="Adicione itens ao orçamento"
              desc="Liste cada serviço e peça separadamente com descrição, quantidade e valor unitário. Quanto mais detalhado, maior a confiança do cliente."
            />
            <StepItem
              number={3}
              title="Prazo estimado"
              desc="Informe em quantos dias úteis o serviço será concluído."
            />
            <StepItem
              number={4}
              title="Disponibilidade de agenda"
              desc="Selecione os horários disponíveis para o cliente agendar a entrada do veículo."
            />
            <StepItem
              number={5}
              title="Envie o orçamento"
              desc="Revise e envie. O cliente receberá notificação e poderá comparar com outros orçamentos."
            />
          </div>
          <p className="mt-3 text-sm bg-green-50 p-3 rounded-lg text-green-800">
            Orçamentos detalhados e com preços justos têm até 3x mais chance de serem aceitos.
          </p>
        </Accordion>

        <Accordion title="4. Gerenciar agenda">
          <p>
            O painel de agenda permite organizar todos os serviços da sua oficina:
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            <li><span className="font-medium">Check-in</span> — Registre a chegada do veículo na oficina. O cliente é notificado automaticamente.</li>
            <li><span className="font-medium">Eventos internos</span> — Crie serviços internos (que não vieram pelo BipFix) para manter a agenda organizada.</li>
            <li><span className="font-medium">Atribuição</span> — Atribua cada veículo a um mecânico específico da sua equipe.</li>
            <li><span className="font-medium">Check-out</span> — Quando o serviço é concluído e o veículo retirado, registre a saída.</li>
          </ul>
          <p className="mt-3">
            A visualização em calendário mostra todos os serviços agendados, em andamento e concluídos num único lugar.
          </p>
        </Accordion>

        <Accordion title="5. Equipe e mecânicos">
          <p>
            Gerencie os membros da sua equipe diretamente pela plataforma:
          </p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Cadastrar funcionários"
              desc="Adicione mecânicos e outros colaboradores informando nome, e-mail e cargo (mecânico, atendente, gerente)."
            />
            <StepItem
              number={2}
              title="Primeiro acesso"
              desc="O funcionário recebe um e-mail com credenciais temporárias e deve definir uma nova senha no primeiro login."
            />
            <StepItem
              number={3}
              title="Atribuir veículos"
              desc="Atribua veículos em serviço a mecânicos específicos. Cada mecânico vê apenas os veículos atribuídos a ele."
            />
            <StepItem
              number={4}
              title="Permissões por cargo"
              desc="Mecânicos têm acesso limitado (veículos atribuídos). Gerentes e administradores têm acesso completo ao painel."
            />
          </div>
        </Accordion>

        <Accordion title="6. Acompanhamento da manutenção">
          <p>
            Mantenha o cliente informado sobre o andamento do reparo:
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            <li><span className="font-medium">Atualização de status</span> — Mude o status do serviço: recebido, em andamento, aguardando peça, concluído.</li>
            <li><span className="font-medium">Etapas detalhadas</span> — Registre cada fase: desmontagem, reparo estrutural, preparação, pintura, montagem, controle de qualidade.</li>
            <li><span className="font-medium">Notificações automáticas</span> — Cada mudança de status gera uma notificação para o cliente.</li>
            <li><span className="font-medium">Fotos do progresso</span> — Envie fotos das etapas para que o cliente acompanhe visualmente.</li>
          </ul>
          <p className="mt-3 text-sm bg-blue-50 p-3 rounded-lg">
            Oficinas que atualizam o status com frequência recebem avaliações mais altas e fidelizam mais clientes.
          </p>
        </Accordion>

        <Accordion title="7. Avaliações e reputação">
          <p>
            Sua reputação na plataforma é construída pelas avaliações dos clientes:
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            <li><span className="font-medium">Nota de 1 a 5 estrelas</span> — A média aparece no seu perfil público e nos resultados de busca.</li>
            <li><span className="font-medium">Comentários</span> — Clientes podem deixar comentários detalhados sobre a experiência.</li>
            <li><span className="font-medium">Selo de Qualidade</span> — Oficinas com média acima de 4.5 e mais de 10 serviços recebem o selo verde de qualidade.</li>
            <li><span className="font-medium">Resposta Rápida</span> — Responder orçamentos em menos de 1 hora garante o selo azul.</li>
          </ul>
          <p className="mt-3">
            Você pode responder publicamente às avaliações, mostrando profissionalismo e atenção ao cliente.
          </p>
        </Accordion>

        <Accordion title="8. Comissão BipFix">
          <p>
            O BipFix cobra uma comissão sobre serviços realizados através da plataforma. Veja como funciona:
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            <li><span className="font-medium">Como é cobrada</span> — A comissão é calculada sobre o valor total do orçamento aceito pelo cliente.</li>
            <li><span className="font-medium">Transparência</span> — O percentual da comissão é exibido antes do envio do orçamento, sem surpresas.</li>
            <li><span className="font-medium">Faturamento</span> — A cobrança é feita mensalmente, com relatório detalhado de todos os serviços.</li>
          </ul>
          <p className="mt-4 font-medium text-gray-900">Como reduzir sua comissão:</p>
          <ul className="list-disc list-inside space-y-2 mt-2">
            <li>Mantenha uma avaliação média acima de 4.5 estrelas.</li>
            <li>Responda solicitações rapidamente (menos de 1 hora).</li>
            <li>Conclua serviços dentro do prazo estimado.</li>
            <li>Mantenha seu perfil completo e atualizado.</li>
          </ul>
          <p className="mt-3 text-sm bg-green-50 p-3 rounded-lg text-green-800">
            Oficinas com excelente desempenho podem ter redução de até 30% na taxa de comissão.
          </p>
        </Accordion>
      </div>
    </div>
  );
}
