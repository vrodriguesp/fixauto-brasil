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
          Aprenda a usar todas as ferramentas do BipFix para atrair clientes, gerenciar servicos e crescer sua oficina.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        <Accordion title="1. Como cadastrar sua oficina" defaultOpen>
          <p>O cadastro da sua oficina no BipFix e simples e leva poucos minutos:</p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Crie sua conta"
              desc="Acesse /cadastro e selecione 'Sou uma oficina'. Preencha os dados do responsavel: nome, e-mail e senha."
            />
            <StepItem
              number={2}
              title="Dados da oficina"
              desc="Informe o CNPJ, razao social, nome fantasia, telefone e endereco completo da oficina."
            />
            <StepItem
              number={3}
              title="Especialidades"
              desc="Selecione os tipos de servico que sua oficina oferece: funilaria, pintura, mecanica, eletrica, vidros, etc."
            />
            <StepItem
              number={4}
              title="Raio de atendimento"
              desc="Defina o raio de distancia (em km) que sua oficina aceita receber solicitacoes. Voce pode ajustar depois."
            />
            <StepItem
              number={5}
              title="Perfil completo"
              desc="Adicione fotos da oficina, descricao, horario de funcionamento e formas de pagamento aceitas. Um perfil completo atrai mais clientes."
            />
          </div>
        </Accordion>

        <Accordion title="2. Como receber solicitacoes">
          <p>
            O BipFix envia solicitacoes automaticamente para oficinas que atendem aos criterios do cliente:
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            <li><span className="font-medium">Proximidade</span> — O cliente esta dentro do raio de atendimento que voce definiu.</li>
            <li><span className="font-medium">Especialidade</span> — O tipo de servico solicitado corresponde as especialidades da sua oficina.</li>
            <li><span className="font-medium">Disponibilidade</span> — Sua oficina esta ativa na plataforma e com agenda aberta.</li>
          </ul>
          <p className="mt-3">
            Voce recebe notificacoes no painel e por e-mail. Cada solicitacao inclui: fotos do dano, descricao do problema, tipo de veiculo e localizacao do cliente.
          </p>
          <p className="mt-2 text-sm bg-blue-50 p-3 rounded-lg">
            Dica: mantenha seu perfil atualizado e suas especialidades corretas para receber as solicitacoes mais relevantes.
          </p>
        </Accordion>

        <Accordion title="3. Como enviar orcamentos">
          <p>
            Para enviar um orcamento competitivo e detalhado:
          </p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Avalie a solicitacao"
              desc="Analise as fotos e descricao do cliente. Se precisar de mais informacoes, voce pode enviar uma mensagem."
            />
            <StepItem
              number={2}
              title="Adicione itens ao orcamento"
              desc="Liste cada servico e peca separadamente com descricao, quantidade e valor unitario. Quanto mais detalhado, maior a confianca do cliente."
            />
            <StepItem
              number={3}
              title="Prazo estimado"
              desc="Informe em quantos dias uteis o servico sera concluido."
            />
            <StepItem
              number={4}
              title="Disponibilidade de agenda"
              desc="Selecione os horarios disponiveis para o cliente agendar a entrada do veiculo."
            />
            <StepItem
              number={5}
              title="Envie o orcamento"
              desc="Revise e envie. O cliente recebera notificacao e podera comparar com outros orcamentos."
            />
          </div>
          <p className="mt-3 text-sm bg-green-50 p-3 rounded-lg text-green-800">
            Orcamentos detalhados e com precos justos tem ate 3x mais chance de serem aceitos.
          </p>
        </Accordion>

        <Accordion title="4. Gerenciar agenda">
          <p>
            O painel de agenda permite organizar todos os servicos da sua oficina:
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            <li><span className="font-medium">Check-in</span> — Registre a chegada do veiculo na oficina. O cliente e notificado automaticamente.</li>
            <li><span className="font-medium">Eventos internos</span> — Crie servicos internos (que nao vieram pelo BipFix) para manter a agenda organizada.</li>
            <li><span className="font-medium">Atribuicao</span> — Atribua cada veiculo a um mecanico especifico da sua equipe.</li>
            <li><span className="font-medium">Check-out</span> — Quando o servico e concluido e o veiculo retirado, registre a saida.</li>
          </ul>
          <p className="mt-3">
            A visualizacao em calendario mostra todos os servicos agendados, em andamento e concluidos num unico lugar.
          </p>
        </Accordion>

        <Accordion title="5. Equipe e mecanicos">
          <p>
            Gerencie os membros da sua equipe diretamente pela plataforma:
          </p>
          <div className="space-y-4 mt-4">
            <StepItem
              number={1}
              title="Cadastrar funcionarios"
              desc="Adicione mecanicos e outros colaboradores informando nome, e-mail e cargo (mecanico, atendente, gerente)."
            />
            <StepItem
              number={2}
              title="Primeiro acesso"
              desc="O funcionario recebe um e-mail com credenciais temporarias e deve definir uma nova senha no primeiro login."
            />
            <StepItem
              number={3}
              title="Atribuir veiculos"
              desc="Atribua veiculos em servico a mecanicos especificos. Cada mecanico ve apenas os veiculos atribuidos a ele."
            />
            <StepItem
              number={4}
              title="Permissoes por cargo"
              desc="Mecanicos tem acesso limitado (veiculos atribuidos). Gerentes e administradores tem acesso completo ao painel."
            />
          </div>
        </Accordion>

        <Accordion title="6. Acompanhamento da manutencao">
          <p>
            Mantenha o cliente informado sobre o andamento do reparo:
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            <li><span className="font-medium">Atualizacao de status</span> — Mude o status do servico: recebido, em andamento, aguardando peca, concluido.</li>
            <li><span className="font-medium">Etapas detalhadas</span> — Registre cada fase: desmontagem, reparo estrutural, preparacao, pintura, montagem, controle de qualidade.</li>
            <li><span className="font-medium">Notificacoes automaticas</span> — Cada mudanca de status gera uma notificacao para o cliente.</li>
            <li><span className="font-medium">Fotos do progresso</span> — Envie fotos das etapas para que o cliente acompanhe visualmente.</li>
          </ul>
          <p className="mt-3 text-sm bg-blue-50 p-3 rounded-lg">
            Oficinas que atualizam o status com frequencia recebem avaliacoes mais altas e fidelizam mais clientes.
          </p>
        </Accordion>

        <Accordion title="7. Avaliacoes e reputacao">
          <p>
            Sua reputacao na plataforma e construida pelas avaliacoes dos clientes:
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            <li><span className="font-medium">Nota de 1 a 5 estrelas</span> — A media aparece no seu perfil publico e nos resultados de busca.</li>
            <li><span className="font-medium">Comentarios</span> — Clientes podem deixar comentarios detalhados sobre a experiencia.</li>
            <li><span className="font-medium">Selo de Qualidade</span> — Oficinas com media acima de 4.5 e mais de 10 servicos recebem o selo verde de qualidade.</li>
            <li><span className="font-medium">Resposta Rapida</span> — Responder orcamentos em menos de 1 hora garante o selo azul.</li>
          </ul>
          <p className="mt-3">
            Voce pode responder publicamente as avaliacoes, mostrando profissionalismo e atencao ao cliente.
          </p>
        </Accordion>

        <Accordion title="8. Comissao BipFix">
          <p>
            O BipFix cobra uma comissao sobre servicos realizados atraves da plataforma. Veja como funciona:
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            <li><span className="font-medium">Como e cobrada</span> — A comissao e calculada sobre o valor total do orcamento aceito pelo cliente.</li>
            <li><span className="font-medium">Transparencia</span> — O percentual da comissao e exibido antes do envio do orcamento, sem surpresas.</li>
            <li><span className="font-medium">Faturamento</span> — A cobranca e feita mensalmente, com relatorio detalhado de todos os servicos.</li>
          </ul>
          <p className="mt-4 font-medium text-gray-900">Como reduzir sua comissao:</p>
          <ul className="list-disc list-inside space-y-2 mt-2">
            <li>Mantenha uma avaliacao media acima de 4.5 estrelas.</li>
            <li>Responda solicitacoes rapidamente (menos de 1 hora).</li>
            <li>Conclua servicos dentro do prazo estimado.</li>
            <li>Mantenha seu perfil completo e atualizado.</li>
          </ul>
          <p className="mt-3 text-sm bg-green-50 p-3 rounded-lg text-green-800">
            Oficinas com excelente desempenho podem ter reducao de ate 30% na taxa de comissao.
          </p>
        </Accordion>
      </div>
    </div>
  );
}
