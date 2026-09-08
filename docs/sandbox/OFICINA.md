# Portal da Oficina — Documentação Completa (para construir o Sandbox/Tutorial)

Este documento mapeia, tela por tela, tudo que uma **oficina mecânica/funilaria** pode fazer no BipFix. Foi escrito para quem vai montar um tutorial/sandbox para donos de oficina que não são técnicos — por isso cada seção explica o "pra quê", o passo a passo exato, o que aparece quando não há nada ainda (estado vazio), as regras de negócio por trás dos números, e o que muda quando quem está usando é um **funcionário** (mecânico ou administrativo) em vez do **dono da oficina**.

Fontes lidas: todas as páginas em `apps/web/src/app/oficina/**`, os hooks em `apps/web/src/hooks/`, as libs de regra de negócio em `apps/web/src/lib/`, as rotas de API relevantes em `apps/web/src/app/api/`, as migrations `008`, `012`, `014`, `016`, `017`, `018`, os tipos/constantes em `packages/shared`, e os docs `docs/NOVIDADES_RETENCAO_OFICINAS.md` e `docs/NOVIDADES_PORTAL_PECAS_V2.md` (validados contra o código atual).

---

## 0. Conceitos-chave antes de tudo

### 0.1 Dono da oficina vs. Funcionário (mecânico / administrativo)

Quando uma oficina se cadastra (`/cadastro`, tipo "oficina"), esse profile vira o **dono**: existe uma linha em `oficinas` com `profile_id` apontando pra ele. É o dono quem:
- Configura o perfil, horário, especialidades, capacidade;
- Cadastra/gerencia a equipe;
- Vê a comissão e o extrato financeiro;
- Aparece como "dono" nas políticas de segurança do banco (RLS) — ou seja, várias ações só funcionam de fato se vierem dele (ou de uma rota de servidor, ver seção de bugs).

Um **funcionário** é criado pelo dono em `/oficina/equipe` (rota de servidor `POST /api/funcionarios`). Ele ganha:
- Uma conta de login própria (email + senha temporária, tipo de perfil `oficina` também — o sistema não distingue "funcionário" no `profiles.tipo`, só na tabela `funcionarios`);
- Um **cargo**: `mecanico` ou `admin` (`CARGOS_FUNCIONARIO` em `packages/shared/constants/index.ts`):
  - **Mecânico**: "Acesso à página de veículos em serviço" — a intenção de produto é um acesso restrito, só pra ver e trabalhar nos carros que estão sob sua responsabilidade.
  - **Admin** (funcionário administrativo, diferente do dono): "Acesso completo ao portal da oficina" — a intenção é dar acesso igual ao dono para uma pessoa de confiança (ex: gerente).
- Opcionalmente uma **especialidade** (texto livre, ex: "Motor", "Funilaria") e uma **capacidade máxima** de veículos simultâneos (ver seção Capacidade).

Como o app decide o que mostrar: em várias telas existe a variável `isMecanico = funcionario?.cargo === 'mecanico'`. Quando `true`, a Navbar (`components/layout/Navbar.tsx`) mostra só o link **"Oficina"** (que aponta pra `/oficina/veiculos-em-servico`) — some Dashboard, Solicitações, Agenda, Capacidade, Peças, Equipe, Comissão, Avaliações e Perfil do menu. O funcionário mecânico, ao logar, já cai direto em `/oficina/veiculos-em-servico` em vez de `/oficina/dashboard` (ver `src/app/page.tsx` e `Navbar.tsx`).

**Importante**: essa restrição hoje é só de **interface** (o link não aparece) e, dentro da própria tela de Veículos em Serviço, algumas ações somem para o mecânico (ver seção 5). As páginas de Dashboard, Comissão, Perfil e Equipe **não verificam** o cargo do funcionário internamente — ver "Bugs e inconsistências" no final.

Um funcionário `admin` tem exatamente a mesma navegação e as mesmas telas que o dono (a Navbar só distingue por `isMecanico`, não existe um terceiro caminho para "funcionário admin"). Na prática, hoje, "funcionário admin" e "dono" veem o portal de forma idêntica.

### 0.2 A oficina PODE operar sozinha, sem nenhum funcionário

Confirmado em todas as telas lidas: nenhuma funcionalidade obriga o cadastro de funcionários.
- `/oficina/equipe` mostra um estado vazio amigável ("Nenhum funcionário cadastrado... Adicione mecânicos e administradores para gerenciar os serviços") mas nada é bloqueado por isso.
- `/oficina/veiculos-em-servico`: o dono (não-mecânico) faz check-in, registra etapa e faz a entrega sozinho; o campo "Atribuir mecânico" é opcional (dropdown com opção "Nenhum").
- `/oficina/capacidade`: a seção "Capacidade por funcionário" mostra explicitamente, quando não há mecânicos: *"Nenhum mecânico cadastrado ainda... isso é opcional - você pode operar sozinho também."*
- `funcionarios.capacidade_maxima` é opcional e `NULL` por padrão — "sem limite definido", não trava nada.
- A comissão, os orçamentos, a agenda e o check-in funcionam 100% com o dono sozinho, sem nenhuma linha na tabela `funcionarios`.

---

## 1. Dashboard (`/oficina/dashboard`)

**Pra que serve**: painel inicial do dono ao logar — visão rápida do que precisa de atenção agora (novas solicitações, veículos aceitos, agenda, avaliações).

**Quem vê esta tela**: só o dono (ou funcionário `admin`). Funcionário `mecanico` nunca chega aqui — ao logar, é levado direto para `/oficina/veiculos-em-servico`.

### O que aparece
- **Cabeçalho**: nome fantasia, endereço/cidade/estado, média de estrelas calculada na hora a partir de todas as avaliações (`avaliacoes.reduce(...)`) e contagem total.
- **4 cartões de estatística**, cada um clicável levando para a tela correspondente:
  - **Novas** — solicitações com status `aberta` ou `em_orcamento` dentro do raio de atendimento → leva a `/oficina/solicitacoes`.
  - **Aceitas** — status `aceita` ou `em_andamento` → leva a `/oficina/veiculos-em-servico`.
  - **Concluídas** — status `concluida` → leva a `/oficina/veiculos-em-servico`.
  - **Na agenda** — contagem de eventos na agenda → leva a `/oficina/agenda`.
- **Tabela "Check-in / Check-out - Próximos 7 dias"** (só aparece se houver algo): eventos de agenda tipo `plataforma`, não concluídos, com check-in nos próximos 7 dias. Colunas: Serviço, Check-in, Previsão de entrega, Status.
- **"Solicitações aceitas"** (só aparece se houver): cartões com carro, cliente, status e o valor do orçamento aceito (fundo verde).
- **"Não compareceu"** (só aparece se houver clientes com status `no_show` nos últimos 30 dias E a oficina ainda tiver orçamento ativo naquela solicitação): mostra o valor do orçamento e dois botões:
  - **"Enviar novas datas"** → vai para `/oficina/enviar-orcamento/[id]` para reagendar.
  - **"Retirar orçamento"** → pede confirmação ("O cliente não verá mais sua oferta") e muda o orçamento para `recusado`.
- **"Solicitações próximas"** (até 5, com link "Ver todas"): lista de solicitações abertas/em orçamento próximas, com tipo, urgência, distância em km, tempo desde a criação e quantidade de fotos.
  - **Estado vazio**: "Nenhuma solicitação nova na sua região."
- **Barra lateral**: "Próximos serviços" (até 3 eventos de agenda, com estado vazio "Nenhum serviço agendado") e "Avaliações recentes" (com estado vazio "Nenhuma avaliação ainda").

### Regra de negócio embutida
A distância exibida usa a fórmula de haversine (`calcDistance`, `lib/utils.ts`) entre a latitude/longitude da oficina e da solicitação.

---

## 2. Solicitações (`/oficina/solicitacoes` e `/oficina/solicitacoes/[id]`)

**Pra que serve**: é a "vitrine" de pedidos de reparo de clientes na região — o equivalente a uma lista de "novos clientes batendo na porta". Aqui a oficina decide se quer orçar ou não.

### 2.1 Lista (`/oficina/solicitacoes`)
- Cabeçalho explica o raio configurado: "Solicitações de reparo próximas à sua oficina (raio de Xkm)".
- **Filtros**: por tipo de serviço (`TIPOS_SERVICO`: Colisão, Funilaria e Pintura, Revisões, Mecânica, Elétrico, Pneu, Outro) e por status (Todos / Aberta / Em Orçamento).
- **Cada card** mostra: veículo (marca/modelo/ano), status, urgência, tipo, descrição (limpa de metadados internos via `cleanDescricao`), distância + endereço, tempo desde a criação, quantidade de fotos, e um botão "Enviar Orçamento".
- **Estado vazio**: "Nenhuma solicitação encontrada com esses filtros."

**Regra de proximidade/especialidade** (em `use-solicitacoes.ts`, aplicada quando `nearby: true`): a lista mostra uma solicitação para a oficina se **qualquer uma** for verdadeira:
1. A oficina já tem um orçamento com status `aceito` para essa solicitação (aparece sempre, mesmo fora do raio); OU
2. A solicitação está dentro do raio de atendimento (calculado por uma caixa de latitude/longitude, não haversine exato) **E** o tipo do serviço bate com as especialidades cadastradas da oficina (ou a oficina não configurou nenhuma especialidade, caso em que tudo aparece).
- Solicitações com status `cancelada` nunca aparecem para oficinas.

### 2.2 Detalhe (`/oficina/solicitacoes/[id]`)
- Mostra: descrição do problema, fotos do dano (em grade, clicáveis para abrir em nova aba), dados do veículo (marca, modelo, ano, placa, cor, valor FIPE), **cliente — só nome e um círculo com a inicial do nome** (sem telefone/e-mail nesta fase pré-aceite), data da solicitação.
- **Aviso de faltas** (`NoShowWarning`): se o cliente já tiver faltado em outro agendamento e não tiver sido reagendado, mostra um aviso amarelo "Este cliente tem N falta(s) registrada(s)".
- **Análise de dano por IA** (`DamageAnalysis`): botão "Analisar com IA" que roda um diagnóstico automático das fotos (severidade, peças afetadas, estimativa de custo, checklist de inspeção). Se já tiver sido analisada antes, mostra o resultado direto.
- **Botões no topo**: "Mensagem" (abre o chat com o cliente) e um botão dinâmico:
  - Se ainda não orçou: **"Enviar Orçamento"**.
  - Se já orçou mas não foi aceito: **"Revisar Orçamento"**.
  - Se o orçamento foi aceito ou o serviço já está em andamento: **"Refazer Orçamento"**.
  - Some completamente se a solicitação estiver `concluida` ou `cancelada`.

**Por que o cliente não tem telefone/e-mail aqui**: propositalmente, a consulta que busca as solicitações (`use-solicitacoes.ts`) só traz `id, nome, avatar_url, tipo` do cliente. É a "Fase 1" da retenção de oficinas (ver `docs/NOVIDADES_RETENCAO_OFICINAS.md`): evitar que a oficina feche o negócio "por fora" antes de formalizar pela plataforma. Depois que o orçamento é aceito, a solicitação passa a aparecer também via `use-agenda.ts`, cuja consulta traz o perfil completo do cliente (`profiles(*)`, incluindo telefone) — por isso em Agenda e Veículos em Serviço o telefone aparece normalmente.

---

## 3. Enviar/Revisar Orçamento (`/oficina/enviar-orcamento/[id]`)

**Pra que serve**: montar e enviar a proposta de preço e prazo para o cliente.

### Passo a passo
1. A tela mostra um resumo da solicitação e, se existir, uma caixa "Análise IA" com severidade, resumo, peças afetadas e faixa de custo estimado pela IA (referência, não obrigatório usar).
2. **Itens do orçamento**: lista dinâmica de linhas, cada uma com Descrição, Tipo (`Mão de obra` / `Peça` / `Material` / `Outro`), Valor unitário (R$) e Quantidade. Botão "+ Adicionar item" e "Remover" por linha (não remove se só sobrar 1 item). O subtotal de cada item aparece abaixo dela; o **Total** geral aparece no rodapé do bloco.
3. **Comissão BipFix** (só aparece se o total > 0): mostra a taxa efetiva da oficina (buscada via `GET /api/comissao-atual?oficinaId=...`, com fallback de 10% enquanto a chamada não retorna) e o valor em R$. Duas opções em rádio:
   - **Absorver comissão**: a oficina paga a comissão; o cliente vê o valor total normal.
   - **Repassar ao cliente**: a comissão é somada ao valor mostrado ao cliente (mostra o cálculo: valor + comissão = preço final).
   - Essa escolha é gravada como um prefixo escondido no campo de observações (`[COMISSAO:absorver:12]` ou `[COMISSAO:repassar:12]`), removido visualmente ao reabrir a tela.
4. **Prazo e Execução**: Prazo total em dias, Tempo de execução em horas (com conversão automática para "~N dia(s) útil(eis)", dividindo por 8), e Validade do orçamento (data, padrão 30 dias à frente).
5. **Disponibilidade para check-in**: se a solicitação **ainda não está** `em_andamento`, a oficina oferece uma ou mais datas + turno (manhã 8-12h / tarde 13-17h) para o cliente escolher onde deixar o carro; a previsão de entrega de cada slot é calculada automaticamente (data + prazo em dias). Se a solicitação **já está** `em_andamento` (veículo já na oficina — ex: reorçamento durante o serviço), essa seção vira um aviso azul e não pede novas datas.
6. **Observações** (texto livre, opcional): garantia, condições etc.
7. Botão final: **"Enviar Orçamento"** (ou **"Atualizar Orçamento"** se for revisão) mostrando o valor final considerando a comissão repassada, se aplicável. Desabilitado enquanto o total for R$ 0.

### O que acontece ao enviar
- Cria (ou atualiza, se já existia um orçamento desta oficina para a solicitação) a linha em `orcamentos` + os itens em `orcamento_itens` + as datas em `orcamento_disponibilidade`.
- Muda o status da solicitação para `em_orcamento`.
- Cria uma notificação in-app para o cliente.
- Chama `POST /api/notificar-orcamento` (fire-and-forget) que envia e-mail + WhatsApp ao cliente, e, se a solicitação vier de um acidente registrado como emergência, também notifica o outro envolvido e registra uma mensagem no chat da emergência.
- Chama `POST /api/recalcular-comissao` (fire-and-forget) — o tempo de resposta da oficina (desde a criação da solicitação até o envio do orçamento) entra na fórmula de comissão (ver seção 11).
- Numa **revisão**, além disso: incrementa `revisao_numero`, reseta o slot escolhido (`disponibilidade_escolhida_id = null`), volta o status da solicitação para `em_orcamento` (o cliente precisa aceitar de novo) e insere uma mensagem-resumo automática no chat.
- Tela de sucesso: "Orçamento enviado!" ou "Orçamento revisado!", com redirecionamento automático para `/oficina/solicitacoes` em 2 segundos.

### Estados especiais
- Se a solicitação não existe/não é encontrada: "Solicitação não encontrada".
- Se já existe orçamento desta oficina: a tela pré-preenche todos os campos com os dados existentes (itens, prazo, comissão escolhida, observações, datas) e mostra um aviso amarelo "Você já enviou um orçamento... Ao submeter, o orçamento anterior será atualizado (revisão #N)".

**Dono vs. funcionário**: nenhuma distinção nesta tela — qualquer perfil "oficina" logado consegue enviar orçamento (a única trava real é a de RLS do banco no insert de `orcamentos`, que exige que o `profile_id` seja o dono — funcionários passam pela mesma sessão de navegador então herdam a mesma permissão de cliente; não há bloqueio de UI aqui).

---

## 4. Veículos em Serviço / "Oficina" (`/oficina/veiculos-em-servico`)

**Pra que serve**: é o painel operacional do dia a dia — onde a oficina controla check-in, etapas do reparo e entrega dos carros. É a tela que o **mecânico** vê como página principal (rótulo muda para "Meus Veículos").

### Cartões-resumo (clicáveis, filtram a lista abaixo)
- **Aguardando check-in**: eventos agendados cuja data de início já chegou (cliente ainda não trouxe o carro).
- **Em Serviço**: eventos com status `em_andamento`.
- **Prontos p/ retirada**: eventos concluídos nos últimos 3 dias.
- **Agendados (futuro)**: eventos agendados com data ainda no futuro.

### Abas de filtro
Todos / Aguardando / Em Serviço / Prontos (aba inicial: "Em Serviço").

### Cada linha da lista mostra
Veículo + placa, status, cliente, data de check-in, data de entrega prevista, dias restantes (ou "Xd atrasado" em vermelho se passou do prazo), a etapa de manutenção mais recente (ícone colorido + rótulo) e o mecânico responsável, se houver.

### Ações por linha
- **Check-in** (aparece quando o evento está `agendado` e a data já chegou): muda o status para `em_andamento` e cria automaticamente a primeira etapa de manutenção `recebido` ("Veículo recebido na oficina").
- **+ Etapa** (aparece quando `em_andamento`): abre um formulário inline para registrar uma nova etapa (ver lista completa abaixo) com observação opcional.
- **Entrega** (aparece quando `em_andamento`, **só para quem não é mecânico**): chama `POST /api/confirmar-entrega`, insere a etapa final `entregue` e muda o evento para `concluido`. Desde 08/09/2026, isso também avisa o cliente que o carro está pronto por **3 canais ao mesmo tempo**: notificação in-app, e-mail e WhatsApp (antes só existia a notificação in-app) — reduz o risco do cliente não perceber que o carro já pode ser retirado.
- Clicar na linha expande os detalhes: descrição do serviço, contato do cliente (nome + telefone clicável), **"Mecânico Responsável"** com dropdown para atribuir/trocar (só visível para quem não é mecânico), a **linha do tempo completa** de etapas (com ícone, hora e quem registrou), e um botão "Mensagem" para o chat com o cliente.

### Etapas de manutenção disponíveis (`STATUS_MANUTENCAO`)
Recebido 📥 → Em diagnóstico 🔍 → Aguardando peças 📦 → Em execução 🔧 → Pausa (contato cliente) 📞 → Pausa (peças em falta) ⏳ → Pausado (geral) ⏸️ → Teste final ✅ → Concluído 🏁 → Entregue 🚗. Cada uma tem uma descrição amigável mostrada no seletor.

### Estado vazio
"Nenhum veículo encontrado nesta categoria."

### Diferença dono vs. mecânico (`isMecanico = funcionario?.cargo === 'mecanico'`)
- Título muda: "Oficina" (dono) vs. "Meus Veículos" (mecânico).
- O mecânico só vê os eventos **atribuídos a ele** (`evento.funcionario_id === funcionario.id`) — o dono vê todos.
- O mecânico **não vê** o link "Ver agenda" no topo.
- O mecânico **não pode** atribuir/trocar o mecânico responsável (o bloco some).
- O mecânico **não vê o botão "Entrega"** — só quem não é mecânico pode finalizar a entrega do veículo. O mecânico pode fazer check-in e registrar etapas normalmente.

---

## 5. Agenda (`/oficina/agenda`)

**Pra que serve**: calendário de check-ins e entregas, e onde a oficina também pode lançar manualmente compromissos que não vieram da plataforma (ex: cliente antigo, indicação).

**Quem vê**: só dono/admin (não aparece no menu do mecânico, embora a URL não seja tecnicamente bloqueada — ver Bugs).

### Visões
- **Mês**: calendário tradicional; cada dia mostra badges com contagem de "Pendente" (check-in ainda não feito), "Feito" (check-in já realizado) e "Entregue". Clicar num dia muda para a visão "Dia".
- **Dia**: 4 cartões-resumo (Pendente / Check-in feito / Entregue / Não compareceu) e listas detalhadas por grupo.
- **Lista**: agrupa todos os eventos futuros (não concluídos) por data.

### Novo Evento Externo
Botão "+ Evento" abre um formulário: nome do cliente, placa, veículo (autocomplete FIPE), tipo de serviço, mecânico responsável (opcional), data/hora de check-in, data/hora de previsão de entrega, descrição opcional, e uma cor para identificar no calendário (`CORES_AGENDA`). Usado para registrar serviços que não vieram de uma solicitação da plataforma.

### Ações em cada card de evento
- **Check-in**: ao clicar, abre um seletor de mecânico (opcional, "Sem mecânico" por padrão) e confirma — muda o evento para `em_andamento` e cria a etapa `recebido`.
- **Marcar Falta** (só aparece se a data já passou e ainda não fez check-in): pede confirmação e chama `POST /api/registrar-no-show`.
- **Entrega**: chama `POST /api/confirmar-entrega` e registra a etapa `entregue`.
- Clicar no card expande detalhes (cliente, veículo, datas, mecânico, descrição) e, para eventos externos, permite **Editar** (todos os campos) ou **Excluir**.
- Para eventos vindos da plataforma: links "Mensagem" e "Ver solicitação".
- Nota de prazo em eventos entregues: compara a data real de entrega com a prevista e mostra "No prazo", "Xd antes do previsto" ou "Xd depois do previsto".

### Regra de negócio: no-show (falta do cliente)
Ao marcar falta (`POST /api/registrar-no-show`):
1. O evento de agenda vira `no_show = true` e status `cancelado`.
2. A solicitação vinculada vira status `no_show`.
3. O orçamento que estava `aceito` volta para `enviado` e perde o slot escolhido — **permitindo que o cliente aceite de novo com uma nova data**, sem a oficina precisar recriar o orçamento do zero.
4. Grava um registro em `no_show_historico` (usado depois pelo aviso amarelo em Solicitações, seção 2.2).
5. Notifica o cliente: "Você não compareceu ao agendamento... O orçamento continua disponível para reagendamento."

### Estado vazio
Visão Lista: "Nenhum evento agendado." Visão Dia sem nada: "Nenhum evento neste dia."

---

## 6. Check-in Manual (`/oficina/checkin`)

**Pra que serve**: registrar a entrada de um veículo que **não passou pelo fluxo normal da plataforma** — por exemplo, um cliente que chegou direto na oficina sem nunca ter feito uma solicitação pelo site. É uma forma de a oficina começar a usar a agenda do BipFix mesmo com clientes "de fora".

### Passo a passo
1. **Dados do cliente**: nome (obrigatório), telefone, e-mail.
2. **Dados do veículo**: marca (obrigatório), modelo (obrigatório), ano, placa, cor.
3. **Serviço**: escolha visual do tipo de serviço (mesmos ícones de `TIPOS_SERVICO`), descrição livre, valor estimado (texto livre, não obrigatório).
4. **Agendamento**: data de check-in, turno (manhã 08-12h / tarde 13-17h), prazo em dias — a previsão de entrega é calculada e mostrada automaticamente (campo travado), e uma cor para o calendário.
5. Botão **"Registrar Check-in"**.

### O que acontece
- Cria um evento na agenda do tipo `externo` (não vinculado a uma `solicitacao_id`), com um resumo dos dados do cliente embutido na descrição (nome, placa, telefone, serviço, valor).
- **Se o e-mail informado já existir** como uma conta de cliente no BipFix, cria uma notificação in-app pra essa pessoa avisando que a oficina registrou a entrada do veículo dela — mas **não** cria uma solicitação/orçamento formal nem vincula ao histórico do cliente além dessa notificação.
- Tela de sucesso com dois botões: "Ver na Agenda" ou "Registrar outro" (limpa o formulário).

### Validação
Só bloqueia o envio se faltar nome do cliente, marca, modelo ou tipo de serviço ("Preencha os campos obrigatórios").

---

## 7. Capacidade e Produtividade (`/oficina/capacidade`)

**Pra que serve**: ajuda o dono a enxergar se está sobrecarregado (por tipo de serviço e por mecânico) e onde os carros ficam mais tempo parados no processo.

### Seção 1 — Capacidade por tipo de serviço
- Para cada tipo de serviço com um limite configurado em Perfil, mostra uma barra: **carga atual / limite** (ex: "3 / 5"), ficando vermelha e com o aviso "(no limite)" quando `atual >= limite`.
- **Como a carga atual é calculada** (`calcularCargaAtual`, `lib/capacidade.ts`): conta quantos eventos de agenda com status `agendado` ou `em_andamento` (ou seja, ainda não concluídos) existem, agrupados pelo `tipo` da solicitação vinculada. Eventos externos sem solicitação, ou concluídos/cancelados, não entram na conta.
- **Estado vazio**: se a oficina nunca configurou capacidade por tipo em Perfil, mostra: "Você ainda não configurou sua capacidade por tipo de serviço. Configure em Perfil para receber solicitações de forma mais equilibrada e evitar sobrecarga."
- Nota fixa abaixo: "Quando um tipo está no limite, novas emergências desse tipo priorizam outras oficinas com capacidade livre." (ver seção 12 sobre roteamento).

### Seção 2 — Capacidade por funcionário
- Lista cada mecânico ativo da oficina com uma barra: veículos `em_andamento` atribuídos a ele agora vs. o limite definido em Equipe (`funcionarios.capacidade_maxima`).
- Se o mecânico **não tem** limite definido, mostra "(sem limite definido)" e a barra usa uma escala arbitrária (`atual * 20`%) só para dar uma ideia visual, sem "vermelho de sobrecarga".
- **Estado vazio**: "Nenhum mecânico cadastrado ainda. Adicione sua equipe em Equipe pra distribuir a carga entre eles **(isso é opcional - você pode operar sozinho também)**."

### Seção 3 — Tempo médio por etapa do reparo
- Calcula, a partir do histórico de `manutencao_etapas`, quanto tempo em média um carro fica em cada etapa (a duração de uma etapa = tempo até a etapa seguinte do mesmo evento). Ordenado da etapa mais demorada para a mais rápida, mostrando também quantas vezes (`ocorrências`) aquele padrão foi observado.
- **Estado vazio**: "Ainda não há dados suficientes (precisa de check-ins com etapas registradas)."

**Dono vs. funcionário**: a tela em si não distingue — mas como não aparece no menu do mecânico, na prática só o dono/admin chega até ela.

---

## 8. Peças (`/oficina/pecas`) — Comprar e Vender excedente

**Pra que serve**: um mercado paralelo dentro do BipFix para a oficina cotar peças com lojas parceiras — e, como novidade, também vender peças excedentes de estoque para outras oficinas vizinhas.

### Aba "Comprar"
1. Botão **"+ Nova Cotação"**: formulário com descrição da peça (obrigatório), marca/modelo/ano do veículo (opcionais) e quantidade.
2. Ao enviar: cria a cotação (`cotacoes_pecas`, status inicial `aberta`) e, se a oficina tiver latitude/longitude, chama `POST /api/notificar-fornecedores-cotacao-peca` para avisar oficinas vizinhas cadastradas como fornecedoras (ver seção "Vender excedente" abaixo). **Lojas de peças não são notificadas por push** — elas navegam manualmente cotações abertas em `/loja/cotacoes` (modelo "pull").
3. Lista de cotações da própria oficina, cada uma com status colorido: **Aguardando respostas** (aberta) / **Respondida** / **Pedido confirmado** (fechada) / **Cancelada**.
4. Cada resposta recebida mostra: nome do fornecedor (com uma etiqueta "OFICINA" se for outra oficina fornecedora, para diferenciar de loja), preço (com total se quantidade > 1), prazo em dias, observação, um link **"Conversar"** (chat dedicado) e um botão **"Confirmar pedido"** (se a cotação ainda não estiver fechada).
5. Ao confirmar um pedido: pede confirmação explícita ("O pagamento e entrega são combinados diretamente com quem vende" — o BipFix não processa pagamento nessa etapa), cria a linha em `pedidos_pecas`, fecha a cotação (`status: fechada`) e notifica o fornecedor escolhido.
6. **Estado vazio**: "Nenhuma cotação de peça ainda."

### Aba "Vender excedente" (a oficina também pode ser fornecedora)
1. Um interruptor (toggle) **"Vender peças excedentes"**, controlado por `oficinas.vende_pecas` (desligado por padrão — não afeta quem nunca usa isso).
2. **Desligado**: mostra "Ative a opção acima pra começar a ver cotações de oficinas vizinhas."
3. **Ligado**: a oficina passa a ver cotações **abertas de outras oficinas** dentro do seu próprio raio de atendimento (`raio_atendimento_km`, mesmo campo usado para receber solicitações de clientes — reaproveitado, calculado por distância real/haversine via `distanciaKm`). Cada cotação mostra a oficina compradora, cidade/estado, distância em km, veículo e quantidade.
4. Responder uma cotação: botão "Responder cotação" abre preço (R$), prazo (dias) e observação opcional. Ao enviar:
   - Grava a resposta com `fornecedor_tipo: 'oficina'`;
   - Chama `POST /api/marcar-cotacao-respondida` (muda o status da cotação de `aberta` para `respondida` — precisa ser uma rota de servidor, ver nota técnica abaixo);
   - Notifica a oficina compradora.
   - Se a oficina já respondeu antes, mostra a resposta enviada em vez do formulário ("Você respondeu: R$ X - prazo Y dia(s)").
5. **"Meus pedidos como fornecedora"**: lista pedidos que outras oficinas confirmaram com você, com link "Conversar" e botão **"Marcar entregue"** quando o status é `confirmado` (chama `POST /api/marcar-pedido-peca-entregue`, que também lança a comissão — ver seção 11.2).
6. Um accordion **"Ver minha comissão como fornecedora"** mostra o componente `ComissaoPecasCard` (mesmo usado pelas lojas de peças) com a taxa atual e o extrato.
7. **Estado vazio** (ligado, sem cotações): "Nenhuma cotação aberta de oficinas próximas no momento."

### Chat de peça (`/oficina/pecas/conversa/[respostaId]`, componente `ChatCotacaoPeca`)
- Uma conversa **por par (cotação, fornecedor)** — se 3 lojas/oficinas responderam à mesma cotação, existem 3 conversas separadas, cada fornecedor só vê a própria (mesma lógica de "lance fechado" das respostas, para não vazar preço entre concorrentes).
- Suporta texto e fotos (comprimidas no navegador antes do upload). Tempo real via Supabase Realtime.
- A tela detecta automaticamente se "eu" (a oficina logada) sou o comprador ou o fornecedor dessa conversa, e mostra o nome da outra parte corretamente nos dois casos.

### Nota técnica sobre notificação de fornecedores
`POST /api/notificar-fornecedores-cotacao-peca` usa uma caixa de 50km fixa ao redor da oficina compradora — **não** usa o raio configurado de cada oficina fornecedora individualmente. Já a visibilidade real na aba "Vender excedente" usa o raio próprio de cada oficina fornecedora (`oficina.raio_atendimento_km`, padrão 30km) com distância haversine exata. Ou seja, uma oficina pode **receber a notificação push** (está dentro dos 50km fixos da compradora) mas, ao abrir a aba, **não ver a cotação listada** se o seu próprio raio configurado for menor que a distância real — ver "Bugs e inconsistências".

---

## 8.1 Distribuição de Trabalho (`/oficina/distribuicao`) — adicionado em 08/09/2026

**Pra que serve**: um quadro visual (colunas por mecânico + uma coluna "Não atribuído") pra decidir quem vai cuidar de cada veículo — inclusive **antes dele chegar** na oficina, não só depois do check-in. Resolve a necessidade de planejar a semana com antecedência e balancear a carga entre a equipe, complementando a visão retrospectiva de carga que já existia em `/oficina/capacidade`.

### O que aparece
- Uma coluna por funcionário ativo (mecânico ou admin), mostrando: nome, cargo, quantos veículos estão `em_andamento` agora vs. a capacidade máxima definida em Equipe (fica vermelho e "(no limite)" quando bate o limite), e o total de veículos no quadro (agendados + em serviço).
- Uma coluna fixa **"Não atribuído"** pra veículos que ainda não têm ninguém definido.
- Cada card mostra: veículo (marca/modelo/placa), cliente, status (Agendado/Em serviço), data prevista, e um seletor pra mudar o responsável na hora (sem sair da tela).
- Mostra tanto eventos `agendado` (incluindo os que ainda não chegaram, com check-in no futuro) quanto `em_andamento` — veículos entregues (`concluido`) saem do quadro.
- **Estado vazio**: se não há nenhum funcionário cadastrado, explica que essa tela é opcional pra quem trabalha sozinho.

### Como funciona por trás
Não precisou de tabela nova — reaproveita o campo `agenda.funcionario_id` que já existia (o mesmo usado no dropdown "Atribuir mecânico" de `/oficina/veiculos-em-servico`). A novidade é só a interface: antes, só dava pra atribuir um mecânico depois que o veículo já estava em andamento ou aparecendo na lista geral; agora há uma visão dedicada que junta agendados futuros e em andamento lado a lado, pensada pra planejamento, não só operação do dia.

---

## 9. Equipe (`/oficina/equipe`)

**Pra que serve**: cadastrar e gerenciar os funcionários (mecânicos e administrativos) da oficina.

### Passo a passo — Adicionar funcionário
1. Botão **"+ Novo Funcionário"**.
2. Campos: Nome (opcional), E-mail (obrigatório), Senha temporária (obrigatória, mínimo 6 caracteres), Cargo (Mecânico ou Administrador — com a descrição de cada um exibida no próprio seletor), Especialidade (opcional, texto livre).
3. Ao salvar (`POST /api/funcionarios`):
   - Se já existir uma conta com esse e-mail, reaproveita o profile existente;
   - Senão, cria uma conta nova no Supabase Auth com a senha informada, e-mail já confirmado, e um profile tipo `oficina`;
   - Cria a linha em `funcionarios` vinculando esse profile a esta oficina, com `primeiro_login = true` (força trocar a senha no primeiro acesso).
   - Se a pessoa já for funcionária **desta mesma oficina**, dá erro "Este funcionário já está cadastrado nesta oficina".
4. A senha informada deve ser repassada manualmente ao funcionário pelo dono (a tela avisa: "Passe esta senha ao funcionário. No primeiro login, ele será solicitado a escolher uma nova senha.").

### Lista de funcionários — o que mostra e o que dá pra fazer em cada linha
- Avatar com inicial (cor diferente para admin/mecânico), nome, cargo (badge), status (Inativo, se desativado), e-mail, especialidade, capacidade configurada ("N carro(s) simultâneos" ou "sem limite definido").
- **Trocar cargo**: dropdown direto na linha (Mecânico ↔ Admin).
- **Ativar/Desativar**: alterna `funcionarios.ativo`.
- **Editar**: abre campos inline para nome, telefone, especialidade e **capacidade (carros simultâneos)** — campo numérico, vazio = sem limite.
- **Gerar nova senha**: pede confirmação ("A senha atual deixará de funcionar"), gera uma senha temporária aleatória de 8 caracteres, força `primeiro_login = true` de novo, tenta enviar por e-mail automaticamente e **também mostra na tela** num modal, para o dono repassar na hora se preferir.
- **Remover** (ícone de lixeira): pede confirmação. Se essa pessoa **não for dona de nenhuma oficina** (ou seja, é só funcionária), a conta de login inteira é excluída do Supabase Auth (e tudo em cascata). Se por algum motivo a pessoa também for dona de uma oficina própria, só o vínculo de funcionário é removido, a conta continua existindo.

### Estado vazio
"Nenhum funcionário cadastrado. Adicione mecânicos e administradores para gerenciar os serviços."

---

## 10. Comissão (`/oficina/comissao`)

**Pra que serve**: mostrar de forma transparente a taxa que o BipFix cobra da oficina por serviço concluído, como ela é calculada e o extrato de valores pendentes/pagos.

### O que aparece
- 3 cartões: **taxa atual** (verde se ≤ 8%, amarelo se ≤ 12%, vermelho acima disso), **total pendente** (R$) e **total pago** (R$).
- **"Como sua taxa é calculada"**: taxa base, e uma lista de critérios com barra visual e valor "-X%" quando o bônus se aplica (ou "-" cinza quando não se aplica), terminando na "Sua taxa final".
- Dica fixa: "Para reduzir sua comissão, responda solicitações rapidamente, evite revisões de orçamento e peça avaliações aos clientes." + o intervalo mín/máx possível.
- **Extrato de Comissões**: tabela com data, serviço (marca/modelo do veículo), valor do serviço, taxa aplicada, valor da comissão e status (Pendente/Pago).
- **Estado vazio do extrato**: "Nenhuma comissão registrada ainda."

### Fórmula exata da comissão de serviço (`lib/comissao.ts`, `COMISSAO_CONFIG`)
- **Taxa base**: 15%. **Limites**: nunca menos de 5%, nunca mais de 15%.
- Partindo de 15%, subtrai-se (cumulativo, cada grupo escolhe só o melhor bônus dele):
  1. **Tempo médio de resposta** às solicitações (desde a criação da solicitação até o envio do orçamento), nos últimos 90 dias:
     - `< 2h` → **-3%**
     - senão `< 4h` → **-2%**
  2. **Média de revisões por orçamento** (quantas vezes a oficina reeditou o valor de um orçamento), nos últimos 90 dias:
     - `< 1.0` → **-3%** (soma os dois bônus de revisão: 2% + 1%)
     - senão `< 1.5` → **-2%**
  3. **Média de avaliação dos clientes** (`oficinas.avaliacao_media`):
     - `≥ 4.5` → **-3%**
     - senão `≥ 4.0` → **-2%**
  4. **Volume/fidelidade** — quantos serviços a oficina concluiu (lançamentos de comissão) nos últimos 90 dias:
     - `≥ 25` → **-2%**
     - senão `≥ 10` → **-1%**
- O resultado é arredondado a 4 casas decimais e limitado entre 5% e 15%.
- **Quando recalcula**: sempre que um orçamento é enviado ou revisado (`POST /api/recalcular-comissao`, chamado por `use-orcamentos.ts`), sempre que uma avaliação é criada/editada (`POST /api/atualizar-avaliacao-oficina`, que chama `recalcularComissaoConfig` depois de atualizar a média), e sempre que um serviço é marcado como entregue (`POST /api/confirmar-entrega`).
- **Override manual**: se o admin do BipFix ativar `comissao_config.usa_override = true` e definir `taxa_fixa_override`, essa taxa fixa é usada e **ignora todo o cálculo acima** — pensado para acordos comerciais especiais tratados manualmente.
- **Quando a comissão é efetivamente cobrada**: só quando o serviço é entregue (`POST /api/confirmar-entrega`) — nesse momento, busca o orçamento aceito, calcula `valor_comissao = valor_total × taxa` (arredondado a 2 casas), grava em `comissao_lancamento` com status `pendente`, e tem uma trava para não lançar duas vezes a mesma comissão do mesmo orçamento.

**Dono vs. funcionário**: sem restrição na própria tela (não checa cargo), mas não está no menu do mecânico.

---

## 11. Avaliações (`/oficina/avaliacoes`)

**Pra que serve**: ver o que os clientes disseram sobre os serviços prestados.

### O que aparece
- Resumo: nota média (1 casa decimal), estrelas, contagem total, e um histograma de barras (5★ a 1★) com a porcentagem de cada nota.
- Lista de avaliações: avatar com inicial do cliente, nome, estrelas, data e comentário (se houver).
- **Estado vazio**: "Nenhuma avaliação recebida ainda" (e no resumo, nota "0" com 0 avaliações).

Não há nenhuma ação da oficina aqui (não dá para responder publicamente a uma avaliação nesta versão). A nota média que aparece nesta tela é recalculada em tempo real a partir da tabela `avaliacoes` (não depende de cache).

---

## 12. Perfil da Oficina (`/oficina/perfil`)

**Pra que serve**: é o "cadastro mestre" da oficina — dados que aparecem na página pública e que alimentam as regras de roteamento (raio, especialidades, capacidade, horário).

### Seções e campos
1. **Logo da Oficina**: upload de imagem (comprimida no navegador antes de subir), aparece na página pública e nas solicitações.
2. **Dados da oficina**: CEP (digitando o CEP, endereço/cidade/estado são preenchidos sozinhos via ViaCEP — desde 08/09/2026, ver `lib/cep.ts`; ainda dá pra editar manualmente depois), Nome fantasia, CNPJ, Endereço, Cidade, Estado (lista de UFs), **Raio de atendimento (km)** — este raio define até onde a oficina recebe solicitações de clientes e, hoje, também é reaproveitado como raio de "quem vê o quê" na aba "Vender excedente" de Peças.
3. **Especialidades**: checkboxes dos tipos de serviço (`TIPOS_SERVICO`). Texto explicativo: "Você só receberá solicitações compatíveis." Mostra contagem de quantas foram selecionadas.
4. **Capacidade por Serviço** (só aparece se houver ao menos uma especialidade marcada): campo numérico por tipo de serviço selecionado — "Defina o número máximo de carros que sua oficina pode atender simultaneamente por tipo de serviço." Vazio = sem limite (não bloqueia nada, ver seção 12 de bugs sobre o comportamento de "0").
5. **Dados pessoais** (do usuário dono, não da oficina): Nome, E-mail (bloqueado, não editável aqui), Telefone.
6. **Horário de Funcionamento**: checkbox "aberto" + horário de início/fim por dia da semana (segunda a domingo). Hoje esse dado é só informativo/cadastral — não vi nenhuma tela que valide agendamentos contra ele.
7. **Fotos da Oficina**: upload múltiplo, categorizado em Estrutura / Serviços realizados / Equipe; aparecem na página pública; cada foto pode ser removida (ícone de lixeira ao passar o mouse).
8. No topo: botões **"Ver página pública"** (abre `/oficinas/[id]` em nova aba) e **"Compartilhar"** (copia o link para a área de transferência, com feedback "Link copiado!").
9. Botão final **"Salvar Alterações"**, com mensagens de sucesso ("Alterações salvas com sucesso!") ou erro em caixas coloridas.

**Dono vs. funcionário**: a tela não verifica cargo — não aparece no menu do mecânico, mas tecnicamente, se alguém acessasse a URL diretamente, o formulário carregaria normalmente (ver Bugs, item sobre RLS bloquear silenciosamente o `UPDATE` de quem não é o dono).

---

## 13. Mensagens (`/oficina/mensagens/[id]`)

**Pra que serve**: chat direto entre a oficina e o cliente de uma solicitação específica.

### Funcionalidades
- Cabeçalho com nome do cliente e veículo (marca/modelo/ano/placa), botão para voltar à solicitação e um botão de atalho **"Fazer Orçamento"** / **"Refazer Orçamento"** (dependendo se já existe orçamento desta oficina).
- Mensagens de texto e de áudio (grava, comprime e sobe o áudio; mostra duração e, quando disponível, transcrição automática).
- Marca mensagens do cliente como lidas automaticamente ao abrir.
- Tempo real via Supabase Realtime (nova mensagem aparece sem recarregar a página), com substituição de mensagens "otimistas" (enviadas localmente antes da confirmação do servidor) pela versão real.
- Separadores de data ("Hoje", "Ontem", ou data completa).
- **Perguntas sugeridas por IA**: se a análise de dano gerou perguntas sugeridas e a oficina ainda não enviou orçamento, aparece uma faixa "🤖 Perguntas sugeridas pela IA" acima da caixa de digitação — clicar em uma preenche o campo de mensagem automaticamente.
- **Estado vazio**: "Nenhuma mensagem ainda. Envie a primeira mensagem para o cliente."
- Ao enviar qualquer mensagem, cria uma notificação in-app para o cliente.

---

## 14. Regras de negócio — Comissão sobre venda de peças (`lib/comissao-pecas.ts`)

Mesma filosofia da comissão de serviço, mas com números bem menores (a margem de peça é mais apertada) e é cobrada de **quem vende** (loja de peças **ou** oficina fornecedora — não de quem compra).

- **Taxa base**: 3%. **Limites**: entre 1% e 3%.
- Reduções (cumulativas, cada grupo escolhe só o melhor bônus):
  1. **Tempo médio de resposta** a cotações, últimos 90 dias: `< 2h` → **-1%**; senão `< 6h` → **-0,5%**.
  2. **Volume**: pedidos **entregues** nos últimos 90 dias: `≥ 15` → **-0,5%**; senão `≥ 5` → **-0,25%**.
- **Quando é cobrada**: só quando um pedido é marcado como **entregue** (`POST /api/marcar-pedido-peca-entregue`), nunca na confirmação do pedido.
- Mesmo suporte a override manual (`comissao_pecas_config.usa_override` + `taxa_fixa_override`).
- Cálculo e exibição: `ComissaoPecasCard.tsx`, usado tanto pela oficina-fornecedora (dentro de "Vender excedente") quanto pelas lojas de peças (`/loja/comissao`).

---

## 15. Regras de negócio — Capacidade e roteamento de emergências

- **`calcularCargaAtual`**: conta eventos de agenda `agendado`/`em_andamento` por tipo de serviço da solicitação vinculada.
- **`calcularCargaPorFuncionario`**: conta eventos `em_andamento` por `funcionario_id`.
- **`oficinaTemCapacidade(oficina, tipoServico)`**: se a oficina **não configurou** limite para aquele tipo (`0` ou ausente), a função retorna sempre `true` — **nunca bloqueia quem não mexeu na configuração**. Se configurou, compara a carga atual com o limite.
- **Uso em `POST /api/notificar-oficinas-emergencia`**: ao notificar oficinas próximas de um acidente (raio de 50km, com fallback para todas as oficinas ativas se nenhuma estiver no raio), primeiro filtra por especialidade compatível com colisão (`colisao`, `funilaria`, `pintura`, `geral`, ou nenhuma especialidade configurada). Depois, entre essas, **despriorização por capacidade**: só considera oficinas que ainda têm capacidade livre para o tipo `colisao`. **Mas nunca deixa a emergência sem nenhuma oficina notificada** — se todas estiverem no limite, notifica todas mesmo assim (fallback de segurança).

---

## 16. A oficina pode operar 100% sozinha — confirmação final

Revalidado em cada tela lida neste levantamento: cadastro de funcionários é opcional em toda a jornada. Um dono sozinho consegue: receber e orçar solicitações, fazer check-in/etapas/entrega de veículos, usar a agenda e o check-in manual, ver sua comissão e avaliações, comprar e vender peças, e configurar o perfil — sem nunca abrir a tela Equipe. As únicas coisas que mudam com uma equipe cadastrada são: distribuir/visualizar carga por mecânico (`/oficina/capacidade` e o dropdown "Atribuir mecânico" em Veículos em Serviço) e dar um acesso mais restrito (cargo `mecanico`) a quem só deveria ver os carros atribuídos a ele.

---

## Bugs e inconsistências encontrados

1. **`apps/web/src/app/api/funcionarios/route.ts` (POST, PATCH, DELETE) não verifica quem está chamando.** As três rotas usam a `service_role key` (que ignora RLS) e confiam totalmente nos IDs enviados no corpo da requisição (`oficina_id`, `id` do funcionário), sem checar sessão/token do usuário nem se quem chama é realmente o dono (ou sequer um funcionário) daquela oficina. Na prática, qualquer requisição HTTP direta a essas rotas — feita fora da tela `/oficina/equipe`, por qualquer pessoa autenticada ou não — consegue criar funcionários em qualquer `oficina_id`, trocar cargo para `admin`, gerar/resetar senha de qualquer funcionário, ou excluir qualquer funcionário (inclusive excluindo a conta de login inteira via `DELETE`), bastando conhecer o UUID. É o problema de segurança mais sério encontrado nesta varredura.

2. **Restrição de acesso do cargo "mecânico" é só de interface, não de rota/dados.** `isMecanico` só esconde links na Navbar e alguns botões dentro de `veiculos-em-servico/page.tsx`. Páginas como `/oficina/dashboard`, `/oficina/perfil`, `/oficina/equipe`, `/oficina/comissao`, `/oficina/agenda` e `/oficina/capacidade` não verificam o cargo do funcionário logado — o `middleware.ts` só confere se `profile.tipo === 'oficina'` (verdadeiro tanto para dono quanto para qualquer funcionário). Um funcionário mecânico que digitasse a URL diretamente conseguiria abrir essas telas (embora ações de escrita specific do dono, como editar o Perfil, provavelmente falhem silenciosamente por RLS — ver item 3).

3. **Salvar o Perfil como funcionário (não-dono) provavelmente falha silenciosamente.** A política de RLS `oficinas_update` (migration 001) exige `auth.uid() = profile_id`, ou seja, só o dono cadastrado pode atualizar a linha da oficina. Como `perfil/page.tsx` não checa cargo antes de chamar `supabase.from('oficinas').update(...)` diretamente do navegador, um funcionário (mecânico ou admin) que abrisse essa tela e clicasse "Salvar Alterações" muito provavelmente veria a mensagem de sucesso "Alterações salvas com sucesso!" mesmo que **nada tenha sido gravado** (update do Supabase com RLS que não casa nenhuma linha não retorna erro, só afeta 0 linhas). Mesmo padrão preocupante já documentado para outros fluxos (avaliação, cotação de peça) em `docs/NOVIDADES_RETENCAO_OFICINAS.md`.

4. **Raio de notificação de fornecedores de peça (50km fixo) não bate com o raio real de visibilidade (raio próprio, padrão 30km).** `apps/web/src/app/api/notificar-fornecedores-cotacao-peca/route.ts` usa uma caixa fixa de 50km ao redor da oficina compradora para decidir quem notificar; já `pecas/page.tsx` (`fetchCotacoesVizinhas`) filtra o que aparece na aba "Vender excedente" pelo `raio_atendimento_km` **da própria oficina fornecedora** (padrão 30km) com distância haversine exata. Resultado possível: uma oficina recebe a notificação push mas, ao clicar, a cotação não aparece na lista (fora do seu próprio raio configurado) — comportamento confuso, sem mensagem explicando o porquê.

5. **Política de RLS `pecas_mensagens_update` (`migration 018`, linha 151) usa `USING (true)`** — qualquer usuário autenticado pode fazer UPDATE em qualquer linha de `cotacoes_pecas_mensagens` (a intenção provável era só marcar mensagens como lidas, mas a política não restringe por participante da conversa nem por campo alterado).

6. **Capacidade "por tipo de serviço" com valor `0` explícito é tratada como "sem limite".** Em `oficinaTemCapacidade` (`lib/capacidade.ts`) e na tela de Perfil, `capacidade[tipo] === 0` (campo deixado vazio, que o formulário converte para `0`) é indistinguível de "nunca configurado" — a função só bloqueia se `limite > 0`. Não chega a ser um bug funcional grave (o comportamento é sempre "não trava"), mas o dono não tem como configurar deliberadamente "capacidade zero" para pausar temporariamente um tipo de serviço.

7. **Horário de funcionamento cadastrado em Perfil parece ser só informativo.** Não foi encontrada nenhuma tela ou regra (agenda, check-in, roteamento) que valide agendamentos ou notificações contra o `horario_funcionamento` salvo — o campo existe e é editável, mas aparentemente não afeta nada além de ficar salvo no banco.

8. **Texto com capitalização inconsistente em `enviar-orcamento/[id]/page.tsx`** (linhas ~402, ~421, ~439, ~449-452): "Comissao BipFix", "Absorver comissao", "Repassar ao cliente... A comissao de...", "Preco final para o cliente" — sem os acentos que aparecem no resto da tela (ex.: "Comissão", "Você paga", "Adicionada"). Não quebra a funcionalidade, mas é uma inconsistência visual/ortográfica isolada nessa tela.

9. **`ComissaoPecasCard.tsx` (linha 61) tem um fallback pouco robusto**: `taxa` cai para `COMISSAO_PECAS_CONFIG.TAXA_BASE` (3%) sempre que `taxa_calculada` é `null` — o que acontece tanto para "fornecedor nunca configurado" quanto teoricamente para qualquer erro de leitura, sem diferenciar os dois casos na interface (mostra 3% como se fosse a taxa "real" já calculada).

10. **Padrão geral de falta de verificação de autoria em rotas de servidor**: além de `funcionarios`, rotas como `confirmar-entrega`, `registrar-no-show`, `marcar-cotacao-respondida`, `marcar-pedido-peca-entregue` e `recalcular-comissao` também usam `service_role` e aceitam qualquer ID enviado no corpo sem validar sessão/propriedade. O impacto é menor nessas (não criam/excluem contas nem trocam senha), mas o mesmo padrão de risco existe — vale revisão de segurança mais ampla antes de escalar o produto.

