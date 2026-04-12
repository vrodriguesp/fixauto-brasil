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
          Tudo o que voce precisa saber para encontrar a melhor oficina, comparar orcamentos e acompanhar o reparo do seu veiculo.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        <Accordion title="1. Como se cadastrar" defaultOpen>
          <p>Criar sua conta no BipFix e rapido e gratuito. Siga os passos abaixo:</p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Acesse a pagina de cadastro"
              desc="Clique em 'Preciso de um reparo' na pagina inicial ou acesse diretamente /cadastro."
            />
            <StepItem
              number={2}
              title="Preencha seus dados"
              desc="Informe seu nome completo, e-mail, telefone (com DDD) e crie uma senha segura."
            />
            <StepItem
              number={3}
              title="Confirme seu e-mail"
              desc="Voce recebera um e-mail de confirmacao. Clique no link para ativar sua conta."
            />
            <StepItem
              number={4}
              title="Cadastre seu veiculo"
              desc="Adicione a marca, modelo, ano e placa do seu veiculo. Voce pode cadastrar mais de um."
            />
          </div>
        </Accordion>

        <Accordion title="2. Como criar uma solicitacao">
          <p>
            A solicitacao e o pedido de orcamento que voce envia para as oficinas. O processo tem 5 etapas simples:
          </p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Selecione o veiculo"
              desc="Escolha qual dos seus veiculos cadastrados precisa de reparo."
            />
            <StepItem
              number={2}
              title="Tipo de servico"
              desc="Selecione a categoria do servico: funilaria, pintura, mecanica, eletrica, vidros, entre outras."
            />
            <StepItem
              number={3}
              title="Fotos e descricao"
              desc="Tire fotos do dano ou problema e adicione uma descricao detalhada. Quanto mais informacoes, melhor sera o orcamento."
            />
            <StepItem
              number={4}
              title="Localizacao"
              desc="Confirme sua localizacao para que oficinas proximas recebam sua solicitacao. Voce pode usar o GPS ou digitar o endereco."
            />
            <StepItem
              number={5}
              title="Revisao e envio"
              desc="Revise todas as informacoes e envie. Oficinas proximas serao notificadas e comecarao a preparar orcamentos."
            />
          </div>
        </Accordion>

        <Accordion title="3. Como comparar orcamentos">
          <p>
            Quando oficinas enviam orcamentos, voce pode compara-los com facilidade. Cada orcamento exibe o preco total, prazo estimado, itens detalhados e a avaliacao da oficina.
          </p>
          <p className="mt-3 font-medium text-gray-900">Selos de destaque:</p>
          <ul className="list-disc list-inside space-y-2 mt-2">
            <li>
              <span className="font-medium text-green-700">Selo de Qualidade</span> — Oficinas com avaliacao media acima de 4.5 estrelas e mais de 10 servicos concluidos.
            </li>
            <li>
              <span className="font-medium text-blue-700">Resposta Rapida</span> — Oficinas que responderam sua solicitacao em menos de 1 hora.
            </li>
            <li>
              <span className="font-medium text-orange-700">Ajuste de Preco</span> — Indica que a oficina esta disposta a negociar o valor do orcamento.
            </li>
          </ul>
          <p className="mt-3">
            Use os filtros para ordenar por preco, prazo ou avaliacao. Clique em cada orcamento para ver o detalhamento completo dos itens e servicos.
          </p>
        </Accordion>

        <Accordion title="4. Como agendar o servico">
          <p>
            Apos comparar os orcamentos, escolha o que melhor atende suas necessidades:
          </p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Aceite o orcamento"
              desc="Clique em 'Aceitar orcamento' no orcamento escolhido. A oficina sera notificada imediatamente."
            />
            <StepItem
              number={2}
              title="Escolha a data"
              desc="A oficina disponibiliza horarios na agenda. Selecione o dia e horario que melhor se encaixa na sua rotina."
            />
            <StepItem
              number={3}
              title="Confirmacao"
              desc="Apos a confirmacao, voce recebera os detalhes do agendamento por e-mail e na plataforma, incluindo o endereco da oficina."
            />
          </div>
        </Accordion>

        <Accordion title="5. Acompanhamento em tempo real">
          <p>
            Apos levar o veiculo a oficina, voce pode acompanhar cada etapa do reparo pela plataforma:
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            <li><span className="font-medium">Check-in</span> — Quando o veiculo chega na oficina, a equipe registra a entrada.</li>
            <li><span className="font-medium">Em andamento</span> — A oficina atualiza o status conforme avanca nas etapas do servico.</li>
            <li><span className="font-medium">Etapas detalhadas</span> — Voce ve o progresso: desmontagem, reparo, pintura, montagem, controle de qualidade.</li>
            <li><span className="font-medium">Pronto para retirada</span> — Quando o servico e concluido, voce recebe uma notificacao para buscar o veiculo.</li>
            <li><span className="font-medium">Check-out</span> — A oficina registra a saida e o servico e marcado como finalizado.</li>
          </ul>
          <p className="mt-3">
            Acesse a pagina de acompanhamento a qualquer momento pelo menu &quot;Meus Servicos&quot; no seu painel.
          </p>
        </Accordion>

        <Accordion title="6. Como avaliar o servico">
          <p>
            Apos a conclusao do servico, voce pode avaliar a oficina para ajudar outros motoristas:
          </p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Nota de 1 a 5 estrelas"
              desc="Avalie a qualidade geral do servico prestado."
            />
            <StepItem
              number={2}
              title="Comentario"
              desc="Escreva um comentario descrevendo sua experiencia. Seja honesto e detalhado."
            />
            <StepItem
              number={3}
              title="Publicacao"
              desc="Sua avaliacao aparecera no perfil publico da oficina, ajudando outros motoristas a decidir."
            />
          </div>
          <p className="mt-3 text-sm bg-blue-50 p-3 rounded-lg">
            Sua avaliacao e muito importante. Ela ajuda a manter a qualidade da plataforma e reconhece as melhores oficinas.
          </p>
        </Accordion>

        <Accordion title="7. Emergencia — Acabei de Bater">
          <p>
            O BipFix tem um fluxo especial para situacoes de emergencia:
          </p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Acesse o botao de emergencia"
              desc="Na pagina inicial ou no seu painel, clique no botao vermelho 'Acabei de Bater'."
            />
            <StepItem
              number={2}
              title="Registre o incidente"
              desc="Tire fotos do dano na hora. Voce tambem pode registrar o outro veiculo envolvido, incluindo placa e fotos."
            />
            <StepItem
              number={3}
              title="Localizacao automatica"
              desc="O sistema usa seu GPS para encontrar oficinas mais proximas ao local do acidente."
            />
            <StepItem
              number={4}
              title="Orcamentos rapidos"
              desc="Oficinas proximas recebem sua solicitacao com prioridade e enviam orcamentos em minutos."
            />
          </div>
          <p className="mt-3 text-sm bg-red-50 p-3 rounded-lg text-red-800">
            Em caso de acidente com vitimas, ligue primeiro para o SAMU (192) ou Bombeiros (193). Sua seguranca vem em primeiro lugar.
          </p>
        </Accordion>
      </div>
    </div>
  );
}
