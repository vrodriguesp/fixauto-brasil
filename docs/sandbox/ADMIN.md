# Painel Admin do BipFix — Documentação Completa

Este documento descreve, tela por tela, tudo que existe hoje no painel administrativo do BipFix (`/admin/*`). Serve de base para o portal educativo e para qualquer pessoa nova que for operar o painel.

## Visão geral

- **Quem acessa**: só usuários com `profiles.tipo = 'admin'`. Não existe hoje uma tela de "convidar admin" — a promoção a admin é feita direto no banco.
- **Onde fica**: `apps/web/src/app/admin/*`. Layout comum em `apps/web/src/app/admin/layout.tsx`.
- **Camadas de proteção** (duas, independentes):
  1. `apps/web/src/middleware.ts` — bloqueia o *acesso à página* `/admin/*` no servidor: se não há sessão, redireciona pro login; se a sessão existe mas `profiles.tipo !== 'admin'`, redireciona pra home. Também desloga automaticamente contas que o admin desativou (`profiles.ativo === false`).
  2. `apps/web/src/app/admin/layout.tsx` — proteção extra no cliente (React): enquanto carrega o usuário mostra "Carregando...", e se `user.tipo !== 'admin'` mostra "Acesso negado" em vez do conteúdo.
  3. **Importante**: nenhuma dessas duas camadas protege as *APIs* (`/api/admin/*`) — o middleware só cobre páginas (ver seção de segurança abaixo, hoje já corrigido com `requireAdmin()` em `apps/web/src/lib/admin-auth.ts`).

## Navegação (sidebar)

Definida em `admin/layout.tsx`, sempre visível à esquerda:

| Item | Rota |
|---|---|
| Dashboard | `/admin/dashboard` |
| Usuarios | `/admin/usuarios` |
| Oficinas | `/admin/oficinas` |
| Comissoes | `/admin/comissoes` |
| Performance Ruim | `/admin/oficinas/performance-ruim` |
| Peças | `/admin/pecas` |
| Monitoramento | `/admin/monitoramento` |

No rodapé da sidebar aparece o nome e email do admin logado.

---

## 1. Dashboard (`/admin/dashboard`)

**Para que serve**: visão geral (KPIs) da saúde do negócio no mês corrente.

**Como funciona**: ao carregar, chama `GET /api/admin/metricas`, que calcula (sempre "ao vivo", sem cache — rota marcada `force-dynamic`/`force-no-store`):

- **Total Clientes**: contagem de `profiles` com `tipo = 'cliente'`.
- **Total Oficinas**: contagem de linhas em `oficinas` (não conta funcionários, só o negócio em si).
- **Solicitações (mês)**: contagem de `solicitacoes` criadas desde o dia 1 do mês corrente.
- **Serviços Concluídos (mês)**: `solicitacoes` com `status = 'concluida'` criadas no mês (nota: filtra por `created_at`, não por data de conclusão — uma solicitação criada dia 2 e concluída dia 20 do mesmo mês conta; uma criada no mês passado e concluída agora não conta neste card).
- **GMV (mês)**: soma de `orcamentos.valor_total` dos orçamentos com `status = 'aceito'` criados no mês.
- **Comissão Total (mês)**: soma de `comissao_lancamento.valor_comissao` lançada no mês (gerada automaticamente quando uma entrega é confirmada — ver seção "Confirmar Entrega" na auditoria).

Não tem nenhum botão de ação nesta tela — é só leitura.

---

## 2. Usuários (`/admin/usuarios`)

**Para que serve**: gerenciar todas as contas da plataforma (clientes, oficinas, admins) — editar dados, ativar/desativar, ou apagar permanentemente.

**Como funciona a listagem**: busca direto no Supabase (client-side, com RLS — o admin tem policy de leitura ampla) a tabela `profiles`, com busca por nome/email (`ilike`), até 100 resultados, ordenado por mais recente. Pra cada perfil, cruza com `oficinas` (se é dono) e `funcionarios` (se é empregado de uma oficina) pra mostrar a coluna "Oficina" (ex: "Dono de Oficina X" ou "Pertence à Oficina Y").

**Colunas da tabela**: Nome, Email, Tipo (badge colorido: cliente=azul, oficina=verde, admin=vermelho), Oficina vinculada, Status (Ativo/Desativado), Data de cadastro, Ações.

**Ações disponíveis** (não aparecem pra contas `tipo = 'admin'`, por segurança — um admin não consegue desativar/apagar outro admin por essa tela):

- **Editar**: abre um formulário inline na própria linha pra mudar nome e telefone. Salva via `PATCH /api/admin/usuarios` com `{ id, nome, telefone }`.
- **Desativar/Ativar** (toggle): pede confirmação (`confirm()` do navegador). Chama `PATCH /api/admin/usuarios` com `{ id, ativo: true/false }`.
  - **Regra de negócio importante**: se o usuário desativado for dono de uma oficina, a rota **também desativa a oficina** (`oficinas.ativa = false` via `profile_id`) — a oficina some da busca de clientes automaticamente. O aviso de confirmação já avisa disso ("Isso também desativa a oficina X").
  - Um usuário desativado é deslogado automaticamente na próxima vez que o middleware processar uma requisição dele (`profiles.ativo === false` → signOut + redirect pro login).
- **Remover** (delete permanente): pede confirmação reforçada ("não pode ser desfeita"). Chama `DELETE /api/admin/usuarios` com `{ id }`, que executa `supabaseAdmin.auth.admin.deleteUser(id)`. Isso apaga o usuário no Supabase Auth e, por CASCADE no banco, tudo que depende dele (perfil, oficina se for dono, veículos, solicitações, etc.). **Não tem como desfazer.**

---

## 3. Oficinas (`/admin/oficinas`)

**Para que serve**: listar e gerenciar todas as oficinas cadastradas (visão de negócio, não de conta de usuário).

**Listagem**: direto do Supabase, tabela `oficinas`, busca por nome fantasia (`ilike`), até 100, mais recentes primeiro. Colunas: Nome Fantasia, Cidade/Estado, Avaliação (estrela + média), Nº de avaliações, Status (Ativa/Inativa), Ações.

**Ações**:
- **Ver detalhes**: leva pra `/admin/oficinas/[id]` (seção 4).
- **Ativar/Desativar**: mesmo endpoint que a tela de Usuários (`PATCH /api/admin/usuarios`), mas passando o `profile_id` da oficina (não o `id` da oficina em si — atenção a essa diferença de IDs). Uma oficina inativa some do resultado de busca dos clientes.
- **Remover**: mesmo endpoint (`DELETE /api/admin/usuarios`) usando o `profile_id` do dono. Apaga a conta do dono e, em cascata, a oficina inteira, funcionários, orçamentos e agenda ligados a ela.

---

## 4. Detalhe da Oficina (`/admin/oficinas/[id]`)

**Para que serve**: tela central de gestão de uma oficina específica — dados cadastrais, configuração de comissão, lançamentos financeiros e histórico de atividade.

### Bloco "Informações"
Somente leitura: endereço, cidade/estado/CEP, especialidades (tags), avaliação média, CNPJ, raio de atendimento em km.

### Bloco "Configuração de Comissão"
Mostra a **taxa padrão da plataforma** (calculada automaticamente — ver abaixo) e permite ao admin **sobrescrever manualmente**:

- Toggle "Usar taxa fixa personalizada para esta oficina".
- Se ligado, aparece um campo numérico (0% a 50%, passo de 0.5) pra digitar a taxa fixa.
- Botão "Salvar" chama `PATCH /api/admin/comissao` com `{ oficina_id, taxa_fixa_override, usa_override }`, que faz um *upsert* na tabela `comissao_config`.

**Regra de negócio — como funciona a taxa quando NÃO há override** (lógica em `apps/web/src/lib/comissao.ts`): a plataforma calcula automaticamente uma taxa por oficina, partindo de uma taxa base, com **descontos** (bônus) conforme o desempenho nos últimos 90 dias:
  - Tempo médio de resposta a solicitações: desconto maior se responde em menos de 2h, menor se entre 2h e 4h.
  - Média de revisões por orçamento: desconto se a oficina normalmente manda orçamento certo de primeira (poucas revisões).
  - Avaliação média dos clientes: desconto se ≥ 4.5 estrelas, desconto menor se ≥ 4.0.
  - Volume de serviços nos últimos 90 dias: desconto extra a partir de 10 serviços, maior ainda a partir de 25.
  - A taxa final é sempre limitada entre um mínimo e um máximo definidos em `COMISSAO_CONFIG` (pacote `@fixauto/shared`).
  - Esse recálculo roda automaticamente (chamando `/api/recalcular-comissao` internamente) sempre que algo relevante muda: orçamento enviado/revisado, avaliação nova, serviço concluído.

**O que acontece quando o admin liga o override**: a partir daí, a lógica de recálculo automático (`recalcularComissaoConfig`) **para de mexer na taxa dessa oficina** — ela sempre olha `usa_override` primeiro e, se `true`, devolve direto `taxa_fixa_override`, ignorando toda a conta de performance/volume. É útil pra casos especiais negociados manualmente (ex: parceria com condição comercial diferente) ou pra punir/recompensar uma oficina fora da fórmula padrão.

### Bloco "Lançamentos de Comissão"
Lista todo o histórico de `comissao_lancamento` dessa oficina — cada linha é uma comissão gerada quando um serviço foi concluído e a entrega confirmada (ver rota `/api/confirmar-entrega` na auditoria). Mostra: data, valor do serviço, taxa aplicada naquele momento, valor da comissão, status (`pendente`/`pago`).

- **Botão "Marcar como pago" / "Marcar pendente"**: chama `PATCH /api/admin/comissao` com `{ lancamento_id, status }`. Ao marcar como pago, grava `pago_em = agora`; ao voltar pra pendente, zera `pago_em`. **Isso é só o registro contábil** — a rota não processa nenhum pagamento real (não tem integração de pagamento/PIX/etc automatizada aqui, é controle manual de "a oficina já me pagou a comissão desse mês ou não").
- Também mostra dois totais no topo: total pendente e total pago (somados no cliente a partir da lista já carregada).

### Blocos "Solicitações Recentes" e "Orçamentos Recentes"
Somente leitura — as últimas 10 solicitações (via orçamentos) e os últimos 10 orçamentos dessa oficina, com status coloridos.

---

## 5. Comissões (`/admin/comissoes`)

**Para que serve**: visão agregada de comissão de **todas** as oficinas de uma vez (a tela de detalhe da oficina mostra uma por vez).

**Como funciona**: `GET /api/admin/comissao` retorna, pra cada oficina cadastrada (mesmo as que nunca tiveram override), a taxa atual (padrão ou override), se está personalizada, e o total pendente/pago somado de `comissao_lancamento`.

Nota técnica registrada no código: a tabela `comissao_config` só tem linha pra oficinas que já foram overridadas ou já tiveram a taxa recalculada alguma vez — por isso a rota parte da tabela `oficinas` (todas) e faz *left join* manual com `comissao_config` e `comissao_lancamento`, pra nenhuma oficina sumir da lista mesmo estando na taxa padrão.

**Ações**: só um link "Gerenciar" por linha, que leva pro detalhe da oficina (seção 4) — não há edição direto nesta tela.

---

## 6. Performance Ruim (`/admin/oficinas/performance-ruim`)

**Para que serve**: lista de oficinas candidatas a contato ou desativação por causa de avaliações ruins — ferramenta de curadoria de qualidade da marketplace.

**Critério** (client-side, direto no Supabase): oficinas com **mais de 3 avaliações** (`total_avaliacoes > 3`, constante `MIN_AVALIACOES`) **e** nota média **abaixo de um limite escolhido pelo admin** num seletor (2.0 / 2.5 / 3.0 / 3.5 estrelas — default 3.0).

**O que mostra por oficina**: nome, cidade/estado, status (ativa/desativada), contato do dono (email/telefone, buscado via join com `profiles`), nota média em destaque, e os **3 comentários mais recentes** de avaliações que têm comentário escrito (pra dar contexto rápido do que está sendo reclamado).

**Ações**:
- **Ver detalhes**: leva pro detalhe da oficina.
- **Contatar por e-mail**: abre o cliente de email padrão (`mailto:`) — não é envio automático, é atalho manual.
- **Desativar oficina / Reativar oficina**: mesmo endpoint de sempre (`PATCH /api/admin/usuarios` com `profile_id` e `ativo`).

---

## 7. Peças (`/admin/pecas`) — "Portal de Peças"

**Para que serve**: acompanhar a saúde e adoção do canal de venda de peças (lojas de peças e oficinas que também vendem peças excedentes) — descrito no próprio código como ferramenta de "rastreabilidade de quem está usando o canal e se a comissão está de fato rendendo" (fase 5 do projeto de retenção de oficinas).

**Como funciona**: `GET /api/admin/pecas-fornecedores` junta:
- Todas as `lojas_pecas` e todas as `oficinas` com `vende_pecas = true` (chamados coletivamente de "fornecedores").
- Para cada fornecedor, o **último login** (`auth.users.last_sign_in_at`, obtido via API admin do GoTrue paginando até 20 páginas de 200 — não fica salvo em `profiles`, só existe no lado do Supabase Auth).
- Contagens gerais: total de cotações de peça abertas, quantas já foram respondidas, pedidos confirmados, pedidos entregues.
- Soma de `comissao_pecas_lancamento` pendente e paga.

**Cards de resumo**: lojas ativas/total, oficinas fornecedoras ativas/total, quantos fornecedores logaram nos últimos 7 dias, quantos nunca logaram — pensado pra identificar cadastros "mortos" (se inscreveram mas nunca usaram).

**Alerta automático**: se existem pedidos entregues mas comissão pendente e paga somam zero, aparece uma faixa amarela avisando "vale investigar antes de decidir se o canal compensa" — sinal de que algo no fluxo de lançamento de comissão de peças pode estar quebrado.

**Tabela de fornecedores**: filtrável por Todos / Lojas / Oficinas, mostra nome, email, tipo, cidade, status ativo/inativo, data de cadastro e "há quantos dias" logou pela última vez (colorido: verde ≤7 dias, âmbar ≤30, vermelho >30 ou nunca).

Não há ações de escrita nesta tela — é puramente um dashboard de acompanhamento.

---

## 8. Monitoramento (`/admin/monitoramento`)

**Para que serve**: observabilidade básica de infraestrutura e erros, direto do painel, sem precisar acessar a VM.

**Atualização**: automática a cada 30 segundos (`setInterval`).

**Fonte dos dados** (`GET /api/admin/monitoramento`, que roda comandos no servidor):
- **Acessos**: lê as últimas 20.000 linhas do log do Nginx (`/var/log/nginx/fixauto-access.log`) via `tail` e faz parsing manual do formato "combined" (regex). Calcula: requisições por dia (últimos 7 dias com dado), top 10 páginas mais acessadas (excluindo `/_next/*` e `/api/log-error`), contagem por classe de status HTTP (2xx/4xx/5xx), e quantidade de IPs únicos na janela.
- **Erros client-side**: últimos 30 registros da tabela `app_errors` (alimentada pela rota pública `/api/log-error`, chamada automaticamente quando o JS quebra no navegador de qualquer visitante).
- **Erros server-side**: últimas 40 linhas (mais recente primeiro) do log de erro do PM2 (`/root/.pm2/logs/fixauto-brasil-error.log`), filtrando uma linha de aviso conhecida e irrelevante do Supabase.

**Botão "Abrir infraestrutura da VM (Netdata)"**: link externo pra `https://netdata.bipfix.com`, ferramenta de monitoramento de servidor separada (CPU, memória, disco etc. da VM) — não é parte do BipFix, é outro serviço.

Não há ações de escrita — tudo é leitura de logs/dados.

---

## Resumo das regras de negócio mais importantes pro portal educativo

1. **Desativar um dono de oficina também desativa a oficina.** Sempre avisa isso na confirmação.
2. **Apagar um usuário é permanente e em cascata** — apaga tudo ligado a ele (oficina, funcionários, veículos, solicitações). Não existe "lixeira" ou desfazer.
3. **A taxa de comissão de uma oficina é calculada automaticamente** com base em performance (tempo de resposta, poucas revisões, boa avaliação) e volume dos últimos 90 dias — só é fixa se o admin explicitamente ligar o override manual naquela oficina.
4. **Marcar comissão como "paga" é só contábil** — não dispara nenhum pagamento real, é o admin registrando que já cobrou/recebeu por fora.
5. **A comissão em si só é lançada quando uma entrega é confirmada** (rota `/api/confirmar-entrega`, fora do admin) — o admin não lança comissão manualmente, só ajusta a taxa e marca status de pagamento.
6. **"Performance Ruim" é um filtro, não uma lista fixa** — o limite de nota é ajustável na hora pelo admin (2.0 a 3.5), e o critério de "avaliações suficientes" (>3) é fixo no código.
7. **O Portal de Peças é uma fase recente e ainda pequena** — o próprio dashboard foi desenhado pra alertar quando o canal não está gerando receita de comissão apesar de ter atividade, sinal de possível bug no fluxo.

---

## Nota de segurança (contexto para quem for editar este painel)

Até 2026-09-08, as 5 rotas em `apps/web/src/app/api/admin/*` (usuarios, comissao, metricas, monitoramento, pecas-fornecedores) **não verificavam autenticação nenhuma no servidor** — o `middleware.ts` só protege as *páginas* `/admin/*`, não as *rotas de API* `/api/admin/*` (o `matcher` do middleware não inclui `/api/*`). Isso foi corrigido criando `apps/web/src/lib/admin-auth.ts` (função `requireAdmin()`), que confere sessão + `profiles.tipo === 'admin'` + `profiles.ativo !== false`, e chamando essa função no topo de cada handler das 5 rotas. As 5 rotas hoje já chamam `requireAdmin()` corretamente (verificado nesta auditoria). Qualquer rota nova em `/api/admin/*` **precisa** repetir esse padrão.
