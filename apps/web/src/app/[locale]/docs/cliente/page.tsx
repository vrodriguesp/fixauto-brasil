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

export default function DocsClientePage() {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Guia do Motorista</h1>
        <p className="text-gray-600 text-lg">
          Tudo o que você precisa saber para encontrar a melhor oficina, comparar orçamentos e acompanhar o reparo do seu veículo.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        <Accordion title="1. Como se cadastrar" defaultOpen>
          <p>Criar sua conta no BipFix é rápido e gratuito. Siga os passos abaixo:</p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Acesse a página de cadastro"
              desc="Clique em 'Preciso de um reparo' na página inicial ou acesse diretamente /cadastro."
            />
            <StepItem
              number={2}
              title="Preencha seus dados"
              desc="Informe seu nome completo, e-mail, telefone (com DDD) e crie uma senha segura."
            />
            <StepItem
              number={3}
              title="Confirme seu e-mail"
              desc="Você receberá um e-mail de confirmação. Clique no link para ativar sua conta."
            />
            <StepItem
              number={4}
              title="Cadastre seu veículo"
              desc="Adicione a marca, modelo, ano e placa do seu veículo. Você pode cadastrar mais de um."
            />
          </div>
        </Accordion>

        <Accordion title="2. Como criar uma solicitação">
          <p>
            A solicitação é o pedido de orçamento que você envia para as oficinas. O processo tem 5 etapas simples:
          </p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Selecione o veículo"
              desc="Escolha qual dos seus veículos cadastrados precisa de reparo."
            />
            <StepItem
              number={2}
              title="Tipo de serviço"
              desc="Selecione a categoria do serviço: funilaria, pintura, mecânica, elétrica, vidros, entre outras."
            />
            <StepItem
              number={3}
              title="Fotos e descrição"
              desc="Tire fotos do dano ou problema e adicione uma descrição detalhada. Quanto mais informações, melhor será o orçamento."
            />
            <StepItem
              number={4}
              title="Localização"
              desc="Confirme sua localização para que oficinas próximas recebam sua solicitação. Você pode usar o GPS ou digitar o endereço."
            />
            <StepItem
              number={5}
              title="Revisão e envio"
              desc="Revise todas as informações e envie. Oficinas próximas serão notificadas e começarão a preparar orçamentos."
            />
          </div>
        </Accordion>

        <Accordion title="3. Como comparar orçamentos">
          <p>
            Quando oficinas enviam orçamentos, você pode compará-los com facilidade. Cada orçamento exibe o preço total, prazo estimado, itens detalhados e a avaliação da oficina.
          </p>
          <p className="mt-3 font-medium text-gray-900">Selos de destaque:</p>
          <ul className="list-disc list-inside space-y-2 mt-2">
            <li>
              <span className="font-medium text-green-700">Selo de Qualidade</span> — Oficinas com avaliação média acima de 4.5 estrelas e mais de 10 serviços concluídos.
            </li>
            <li>
              <span className="font-medium text-blue-700">Resposta Rápida</span> — Oficinas que responderam sua solicitação em menos de 1 hora.
            </li>
            <li>
              <span className="font-medium text-orange-700">Ajuste de Preço</span> — Indica que a oficina está disposta a negociar o valor do orçamento.
            </li>
          </ul>
          <p className="mt-3">
            Use os filtros para ordenar por preço, prazo ou avaliação. Clique em cada orçamento para ver o detalhamento completo dos itens e serviços.
          </p>
        </Accordion>

        <Accordion title="4. Como agendar o serviço">
          <p>
            Após comparar os orçamentos, escolha o que melhor atende suas necessidades:
          </p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Aceite o orçamento"
              desc="Clique em 'Aceitar orçamento' no orçamento escolhido. A oficina será notificada imediatamente."
            />
            <StepItem
              number={2}
              title="Escolha a data"
              desc="A oficina disponibiliza horários na agenda. Selecione o dia e horário que melhor se encaixa na sua rotina."
            />
            <StepItem
              number={3}
              title="Confirmação"
              desc="Após a confirmação, você receberá os detalhes do agendamento por e-mail e na plataforma, incluindo o endereço da oficina."
            />
          </div>
        </Accordion>

        <Accordion title="5. Acompanhamento em tempo real">
          <p>
            Após levar o veículo à oficina, você pode acompanhar cada etapa do reparo pela plataforma:
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            <li><span className="font-medium">Check-in</span> — Quando o veículo chega na oficina, a equipe registra a entrada.</li>
            <li><span className="font-medium">Em andamento</span> — A oficina atualiza o status conforme avança nas etapas do serviço.</li>
            <li><span className="font-medium">Etapas detalhadas</span> — Você vê o progresso: desmontagem, reparo, pintura, montagem, controle de qualidade.</li>
            <li><span className="font-medium">Pronto para retirada</span> — Quando o serviço é concluído, você recebe uma notificação para buscar o veículo.</li>
            <li><span className="font-medium">Check-out</span> — A oficina registra a saída e o serviço é marcado como finalizado.</li>
          </ul>
          <p className="mt-3">
            Acesse a página de acompanhamento a qualquer momento pelo menu &quot;Meus Serviços&quot; no seu painel.
          </p>
        </Accordion>

        <Accordion title="6. Como avaliar o serviço">
          <p>
            Após a conclusão do serviço, você pode avaliar a oficina para ajudar outros motoristas:
          </p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Nota de 1 a 5 estrelas"
              desc="Avalie a qualidade geral do serviço prestado."
            />
            <StepItem
              number={2}
              title="Comentário"
              desc="Escreva um comentário descrevendo sua experiência. Seja honesto e detalhado."
            />
            <StepItem
              number={3}
              title="Publicação"
              desc="Sua avaliação aparecerá no perfil público da oficina, ajudando outros motoristas a decidir."
            />
          </div>
          <p className="mt-3 text-sm bg-blue-50 p-3 rounded-lg">
            Sua avaliação é muito importante. Ela ajuda a manter a qualidade da plataforma e reconhece as melhores oficinas.
          </p>
        </Accordion>

        <Accordion title="7. Emergência — Acabei de Bater">
          <p>
            O BipFix tem um fluxo especial para situações de emergência:
          </p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Acesse o botão de emergência"
              desc="Na página inicial ou no seu painel, clique no botão vermelho 'Acabei de Bater'."
            />
            <StepItem
              number={2}
              title="Registre o incidente"
              desc="Tire fotos do dano na hora. Você também pode registrar o outro veículo envolvido, incluindo placa e fotos."
            />
            <StepItem
              number={3}
              title="Localização automática"
              desc="O sistema usa seu GPS para encontrar oficinas mais próximas ao local do acidente."
            />
            <StepItem
              number={4}
              title="Orçamentos rápidos"
              desc="Oficinas próximas recebem sua solicitação com prioridade e enviam orçamentos em minutos."
            />
          </div>
          <p className="mt-3 text-sm bg-red-50 p-3 rounded-lg text-red-800">
            Em caso de acidente com vítimas, ligue primeiro para o SAMU (192) ou Bombeiros (193). Sua segurança vem em primeiro lugar.
          </p>
        </Accordion>
      </div>
    </div>
  );
}
