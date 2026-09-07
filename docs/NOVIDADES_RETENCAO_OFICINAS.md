# Novidades implementadas — 07/09/2026

Explicação detalhada de tudo que foi implementado na sessão de 07/09/2026, em ordem cronológica. Todos os itens já estão em produção (`bipfix.com`, VM `204.168.139.154`).

---

## 1. Ferramentas de administração

### 1.1 Admin pode editar/desativar/remover usuários e oficinas
*(commit `0972a14`)*

- Nova coluna `profiles.ativo` (padrão `true`, migration 014).
- Uma conta desativada não consegue mais logar nem navegar em rota protegida — é deslogada automaticamente com uma mensagem explicando o motivo.
- Nova rota `PATCH /api/admin/usuarios`: edita nome/telefone e ativa/desativa contas. **Desativar o dono de uma oficina desativa a oficina junto.**
- Nova rota `DELETE /api/admin/usuarios`: remove o usuário do Supabase Auth (o resto dos dados é removido em cascata pelas foreign keys).
- Tela `/admin/usuarios`: nova coluna "Status" e botões Editar / Ativar-Desativar / Remover.
- Tela `/admin/oficinas`: botões Ativar-Desativar / Remover na listagem.
- **Trava de segurança**: não é possível desativar/remover uma conta do tipo `admin` por essa tela.

### 1.2 Página de oficinas com performance ruim
*(commit `81abbcb`, `/admin/oficinas/performance-ruim`)*

- Lista automaticamente oficinas com **mais de 3 avaliações e nota média abaixo de um limite ajustável** (padrão 3.0 estrelas — o admin pode mudar o limite na própria tela).
- Mostra os últimos comentários de clientes para dar contexto ao admin.
- Atalho para contatar a oficina por e-mail, e botão para ativar/desativar direto da lista (sem precisar ir em `/admin/oficinas`).

### 1.3 Dashboard de monitoramento em tempo real
*(commit `ae27a7a`, `/admin/monitoramento`)*

Infraestrutura de observabilidade que não existia antes:
- **Netdata** instalado na VM (CPU/RAM/disco/rede em tempo real), acessível só de localhost e exposto publicamente em `netdata.bipfix.com` protegido por senha (nginx basic auth).
- Logs do nginx do site separados dos outros sites que rodam na mesma VM (antes estavam todos misturados no mesmo arquivo).
- Nova tabela `app_errors` (migration 015) + rota pública `POST /api/log-error` para capturar erros JavaScript do navegador de qualquer página do site.
- Novo componente `ErrorReporter` (carregado no layout raiz do site inteiro): escuta os eventos `error` e `unhandledrejection` do navegador e reporta automaticamente para `/api/log-error` — captura de erros "de graça", sem precisar instrumentar cada página.
  - **Limitação conhecida**: esse mecanismo captura erros globais do JavaScript (ex: exceção não tratada num evento, numa Promise), mas **não** captura um erro de renderização do React que é interceptado pela Error Boundary do Next.js (como era o caso do bug do Perfil corrigido em 08/09 — não aparece em `app_errors` porque o React tratou o erro antes de virar um evento global). Bom saber disso na hora de investigar bugs futuros: se não aparecer em `/admin/monitoramento`, não significa que não aconteceu.
- Tela `/admin/monitoramento`: resumo de acessos por dia, páginas mais vistas, status HTTP, erros client-side (da tabela nova) e erros server-side (lendo o log de erro do PM2 direto), com link direto para o Netdata. Atualiza sozinha a cada 30 segundos.

---

## 2. Retenção de oficinas (feature principal do dia)

Objetivo geral: reduzir o incentivo/oportunidade de a oficina "fechar por fora" com o cliente sem pagar comissão à plataforma, e aumentar o custo de trocar de plataforma (dados/reputação que só existem aqui).

### Fase 1 — Esconder contato do cliente antes do compromisso
*(commit `d5ae34c`)*

- Antes: a oficina via nome, telefone e e-mail do cliente já na fase de solicitação (antes de aceitar/orçar). Isso permitia combinar o serviço por fora e nunca formalizar pela plataforma.
- Agora: nas telas de **navegação/detalhe de solicitações ainda não aceitas**, a oficina só vê **nome e avatar** do cliente — sem telefone/e-mail.
- Depois que a solicitação é aceita (agenda, veículos em serviço), o contato completo continua aparecendo normalmente — isso não mudou, só a fase "pré-compromisso".

### Fase 2 — Comissão por performance e fidelidade
*(commit `d5ae34c`, `apps/web/src/lib/comissao.ts`, migration 016)*

Já existia uma tela (`oficina/comissao`) e uma configuração (`COMISSAO_CONFIG`) desenhadas para isso, mas o cálculo de fato **nunca tinha sido implementado** — a taxa nunca mudava na prática. Agora funciona de verdade:

- Taxa parte de **15%** (`TAXA_BASE`) e nunca passa dos limites **5% a 15%** (`TAXA_MIN`/`TAXA_MAX`).
- Reduções aplicadas (cumulativas):
  | Critério | Condição | Redução |
  |---|---|---|
  | Resposta rápida | tempo médio de resposta < 2h | -3% |
  | Resposta rápida | tempo médio de resposta < 4h (se não bateu o de 2h) | -2% |
  | Poucas revisões de orçamento | média de revisões < 1.0 | -3% (soma os dois bônus) |
  | Poucas revisões de orçamento | média de revisões < 1.5 | -2% |
  | Boa avaliação dos clientes | nota média ≥ 4.5 | -3% |
  | Boa avaliação dos clientes | nota média ≥ 4.0 (se não bateu 4.5) | -2% |
  | **Volume/fidelidade (novo)** | ≥ 25 serviços concluídos nos últimos 90 dias | -2% |
  | **Volume/fidelidade (novo)** | ≥ 10 serviços concluídos nos últimos 90 dias (se não bateu 25) | -1% |
- A taxa é **recalculada automaticamente** sempre que: um orçamento é enviado ou revisado, uma nova avaliação chega, ou um serviço é marcado como concluído.
- Existe uma opção de "override" manual (`taxa_fixa_override` em `comissao_config`) que, se ativada, ignora todo o cálculo — pensada para casos especiais tratados manualmente pelo admin.
- O bônus de volume é o que mais diretamente ataca o problema de retenção: quanto mais serviço a oficina passa pela plataforma, menor a taxa — cria um incentivo crescente para não desviar negócio para fora.

### Fase 3 — Badges de reputação no perfil público
*(commit `26b9c50`, `apps/web/src/app/oficinas/[id]/page.tsx`)*

O perfil público da oficina já calculava badges de qualidade e resposta rápida a partir de dados reais (isso já existia). Foram adicionados dois novos badges:

- **"N+ serviços concluídos"** — em faixas (tiers) de 10 / 50 / 100 / 500, contados a partir de orçamentos aceitos com solicitação concluída. Importante: essa contagem usa uma tabela pública (sem bloqueio de RLS), diferente da tabela de comissão que só a própria oficina/admin pode ler.
- **"Parceira desde MM/AAAA"** — a partir da data de cadastro da oficina (`oficinas.created_at`).

Ideia por trás: essa reputação (número de serviços, badges, tempo de casa) só existe dentro do BipFix — é histórico acumulado que a oficina perde se sair da plataforma, o que aumenta o custo de trocar para um concorrente.

### Fase 4 — Gestão de capacidade
*(commit `b2d8014`, inspirado em ferramentas do setor como ServiceTitan/Tekmetric/Shopmonkey)*

- A oficina já podia declarar sua capacidade por tipo de serviço (`oficinas.capacidade_servicos`), mas esse dado nunca era usado em lugar nenhum.
- Nova função `calcularCargaAtual` (`lib/capacidade.ts`): conta quantos agendamentos não concluídos a oficina tem por tipo de serviço, e compara com a capacidade declarada.
- Nova tela **`/oficina/capacidade`** ("Capacidade e Produtividade"):
  - Barra de progresso por tipo de serviço (capacidade configurada × carga atual), com aviso visual quando está no limite.
  - **Tempo médio por etapa do reparo**: calculado a partir da tabela `manutencao_etapas` (que já existia, mas nunca tinha nenhuma tela de análise) — mostra em quais etapas (diagnóstico, aguardando peças, execução, etc.) os carros ficam parados por mais tempo, em média.
- **Roteamento de emergências consciente de capacidade** (`notificar-oficinas-emergencia`): oficinas já no limite de capacidade para o tipo "colisão" são despriorizadas na hora de notificar uma nova emergência — mas sempre com um fallback para garantir que nenhuma emergência fique sem nenhuma oficina notificada, mesmo que todas estejam no limite.
- Foi esse cálculo de capacidade x carga que motivou a pergunta "configure em Perfil" na tela de Capacidade, que estava com o bug de renderização (corrigido em 08/09, ver `docs/PROGRESSO_2026-09-08.md`).

### Fase 5 — Portal de peças (piloto)
*(commit `bb01ba3`, migration 017; bug de status corrigido no dia seguinte pelo commit `07f0d23`)*

A fase mais nova e mais isolada das demais: cria uma marketplace paralela dentro do BipFix, conectando **oficinas a lojas de peças**, sem processar pagamento pela plataforma (é combinado por fora entre oficina e loja, do mesmo jeito que o resto do fluxo oficina-cliente).

- Novo tipo de conta: **`loja_pecas`** — cadastro é a mesma tela de sempre (`/cadastro`), com uma terceira opção "Sou Loja de Peças" ao lado de cliente/oficina.
- Novas tabelas (migration 017):
  - `lojas_pecas` — dados cadastrais da loja.
  - `pecas_catalogo` — estoque/catálogo que a loja mantém (CRUD próprio).
  - `cotacoes_pecas` — pedido de cotação que uma oficina abre.
  - `cotacoes_pecas_respostas` — respostas das lojas a uma cotação. Row-Level Security modelada como **"lance fechado"**: cada loja só enxerga a própria resposta, mas a oficina que abriu a cotação vê todas as respostas recebidas (evita lojas verem o preço umas das outras).
  - `pedidos_pecas` — pedido confirmado depois que a oficina escolhe uma resposta.
- Fluxo completo:
  1. Oficina pede uma cotação de peça em `/oficina/pecas`.
  2. Lojas cadastradas respondem em `/loja/cotacoes` (cada uma só vê sua própria resposta às outras).
  3. Oficina vê todas as respostas e confirma um pedido com a loja escolhida.
  4. Loja acompanha o pedido em `/loja/pedidos`.
- Telas novas da loja: `/loja/dashboard`, `/loja/catalogo` (CRUD do estoque), `/loja/cotacoes` (responder pedidos), `/loja/pedidos`, `/loja/perfil`.
- Navbar, middleware de rotas e redirecionamento da home atualizados para reconhecer o novo tipo de conta `loja`.
- Pequeno ajuste junto: arredondamento da taxa de comissão calculada (fase 2), que às vezes gerava números tipo `0.09999999999999999` no banco por imprecisão de ponto flutuante.
- **Bug corrigido no dia seguinte (08/09, commit `07f0d23`)**: o status da cotação não virava "respondida" quando a loja respondia. Causa: a mesma causa raiz de um bug anterior de avaliação de oficina — a loja que responde não é "dona" da cotação, então a política de RLS de UPDATE bloqueava silenciosamente a atualização feita direto do navegador. Resolvido movendo essa atualização para uma rota de servidor (service role, que não é bloqueada por RLS). Testado o fluxo completo depois da correção: cadastro de loja → catálogo → cadastro de oficina → criar cotação → loja responde → oficina confirma pedido — tudo funcionando.

---

## Observação geral sobre o padrão de bugs de RLS

Dois bugs distintos (avaliação de oficina, e agora resposta de cotação de peça) tiveram a **mesma causa raiz**: uma política de Row-Level Security no Supabase bloqueando silenciosamente um `UPDATE` feito direto do navegador (client-side), porque quem está fazendo a alteração não é o "dono" da linha segundo a política de RLS — mesmo que a ação seja legítima (ex: a loja respondendo a uma cotação que não é dela, mas que ela tem permissão de responder).

**Padrão de correção usado nos dois casos**: mover a operação para uma rota de API no servidor (Next.js API route) que usa a `service role key` do Supabase, que ignora RLS. Vale ter esse padrão em mente para o próximo bug parecido: se um `update`/`insert` client-side falha "silenciosamente" (sem erro visível, mas o dado não muda), suspeitar de RLS primeiro.
