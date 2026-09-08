# Auditoria de Segurança — Superfície de API do BipFix (2026-09-08)

## Contexto

Em 2026-09-08 foi corrigido um bug crítico: as 5 rotas em `apps/web/src/app/api/admin/*` usavam a **service role key** do Supabase (bypassa RLS) e não conferiam se quem chamava era um admin logado. Causa raiz: `apps/web/src/middleware.ts` só protege *páginas* (`matcher` cobre `/cliente`, `/oficina`, `/admin`, `/loja`, algumas rotas de auth) — **não cobre `/api/*` nenhuma**. Ou seja, qualquer rota de API que use a service role key é, por padrão, acessível por qualquer pessoa na internet sem login, a não ser que o próprio handler da rota faça a checagem manualmente. A correção foi criar `apps/web/src/lib/admin-auth.ts` (`requireAdmin()`) e chamar essa função no topo dos 5 handlers admin.

Esta auditoria varre as **outras 20 rotas** (`apps/web/src/app/api/**/route.ts`, fora de `/api/admin/*`) atrás do mesmo padrão de bug: rota usa service role (bypassa RLS) + não confere que o dono do recurso é quem está chamando.

**Total de rotas na API**: 25 (`Glob apps/web/src/app/api/**/route.ts`). 5 são admin (já corrigidas e confirmadas OK nesta auditoria). As 20 restantes estão detalhadas abaixo.

Nenhum arquivo de código foi alterado nesta auditoria — é só levantamento.

---

## Tabela resumo

| Rota | Método | Usa service role? | Valida dono do recurso? | Problema | Severidade |
|---|---|---|---|---|---|
| `/api/admin/usuarios` | PATCH/DELETE | Sim | Sim (`requireAdmin()`) | Nenhum — já corrigido | OK |
| `/api/admin/comissao` | GET/PATCH | Sim | Sim (`requireAdmin()`) | Nenhum — já corrigido | OK |
| `/api/admin/metricas` | GET | Sim | Sim (`requireAdmin()`) | Nenhum — já corrigido | OK |
| `/api/admin/monitoramento` | GET | Sim | Sim (`requireAdmin()`) | Nenhum — já corrigido | OK |
| `/api/admin/pecas-fornecedores` | GET | Sim | Sim (`requireAdmin()`) | Nenhum — já corrigido | OK |
| `/api/funcionarios` | POST | Sim | **Não** | Cria/edita/apaga funcionário de **qualquer** oficina, sem checar quem chama | **CRÍTICO** |
| `/api/funcionarios` | PATCH | Sim | **Não** | Idem — inclui reset de senha e edição de dados pessoais de qualquer funcionário | **CRÍTICO** |
| `/api/funcionarios` | DELETE | Sim | **Não** | Apaga funcionário e, se não for dono de oficina, **apaga a conta inteira** (auth user) | **CRÍTICO** |
| `/api/confirmar-entrega` | POST | Sim | **Não** | Conclui qualquer solicitação e **lança comissão financeira** para a oficina, sem checar quem chama | **CRÍTICO** |
| `/api/aceitar-orcamento` | POST | Sim | **Não** | Aceita qualquer orçamento em nome do cliente, agenda o serviço, recusa os concorrentes | **CRÍTICO** |
| `/api/marcar-pedido-peca-entregue` | POST | Sim | **Não** | Marca qualquer pedido de peça como entregue e **lança comissão** | **ALTO/CRÍTICO** |
| `/api/registrar-no-show` | POST | Sim | **Não** | Marca falta em qualquer agendamento, cancela a solicitação do cliente | **MÉDIO/ALTO** |
| `/api/marcar-cotacao-respondida` | POST | Sim | **Não** | Marca qualquer cotação de peça aberta como "respondida" (esconde de outros fornecedores) | **MÉDIO** |
| `/api/notificar-orcamento` | POST | Sim | **Não** | Dispara email/WhatsApp pro cliente de qualquer orçamento, quantas vezes quiser | **MÉDIO** |
| `/api/notificar-acidente` | POST | Sim | **Não** | Cria conta de usuário e envia senha temporária por email pra qualquer endereço vinculado a um `emergencia_outro_veiculo` existente | **MÉDIO** |
| `/api/notificar-oficinas-emergencia` | POST | Sim | **Não** (mas não há "dono" real — é broadcast) | Gera notificação de emergência falsa pra todas as oficinas de uma região, quantas vezes quiser | **MÉDIO (spam)** |
| `/api/notificar-fornecedores-cotacao-peca` | POST | Sim | **Não** (idem) | Gera notificação de cotação de peça falsa pra fornecedores de uma região | **BAIXO/MÉDIO (spam)** |
| `/api/comissao-atual` | GET | Sim | **Não** | Vaza a taxa de comissão efetiva de qualquer oficina (dado comercial sensível) pra quem souber o `oficinaId` | **BAIXO (leitura)** |
| `/api/recalcular-comissao` | POST | Sim | **Não** | Recalcula a taxa de uma oficina a partir de dados reais (não injeta dado falso) — pior caso é gasto de recursos/DoS leve | **BAIXO** |
| `/api/atualizar-avaliacao-oficina` | POST | Sim | **Não** | Recalcula média de avaliação a partir de dados reais — mesmo raciocínio acima | **BAIXO** |
| `/api/consultar-placa` | POST | Sim | Não se aplica (rota de consulta pública) | Vaza marca/modelo/ano/cor de qualquer veículo já cadastrado no BipFix a partir da placa; também gasta cota de API paga externa | **BAIXO** |
| `/api/esqueci-senha` | POST | Sim | Não se aplica (fluxo de recuperação de senha é inerentemente público) | Gera senha temporária nova pra qualquer email cadastrado sempre que chamada (sem rate limit) — nega acesso ao dono real até ele checar o email de novo | **BAIXO/MÉDIO (DoS de conta)** |
| `/api/criar-solicitacao-emergencia` | POST | Sim | Não se aplica (fluxo público de emergência) | Cria conta de usuário e envia senha por email; sem rate limit pode ser usado pra spam de criação de contas/emails | **BAIXO** |
| `/api/upload-emergencia` | POST | Sim | Não se aplica (fluxo público) | Aceita upload de arquivo pra qualquer `emergenciaId` existente, sem checar dono; sem validação de tipo/tamanho de arquivo visível no handler | **BAIXO** |
| `/api/analisar-dano` | POST | Sim | Não se aplica (chamada durante fluxo de solicitação, mas sem checar dono) | Roda análise de IA (Gemini, custo por chamada) pra qualquer `solicitacao_id`, sem checar quem está chamando | **BAIXO (custo/abuso de API paga)** |
| `/api/transcrever-audio` | POST | Sim | Não se aplica | Transcreve (custo por chamada) qualquer mensagem de áudio por `mensagemId`, sem checar dono | **BAIXO (custo/abuso de API paga)** |
| `/api/log-error` | POST | Sim | Não se aplica — **intencionalmente público** (comentário no código confirma) | Nenhum problema real; inputs truncados defensivamente | **COSMÉTICO** |
| `/api/fipe` | GET | Não | Não se aplica (proxy de API pública, sem dado sensível) | Nenhum | OK |

---

## Detalhamento das rotas críticas/altas (cenário de exploração)

### 1. `POST /api/funcionarios` — CRÍTICO
**Arquivo**: `apps/web/src/app/api/funcionarios/route.ts`
**Cenário**: um atacante qualquer, sem estar logado, envia `POST /api/funcionarios` com `{ nome, email: "atacante@mail.com", senha: "SenhaForte123!", cargo: "mecanico", oficina_id: "<uuid de qualquer oficina concorrente>" }`. A rota usa a service role key, cria (ou reaproveita) uma conta com esse email, e insere uma linha em `funcionarios` vinculando essa conta à oficina alvo. A partir daí o atacante faz login normal com o email/senha que ele mesmo escolheu e, como agora é um `funcionario` legítimo daquela oficina (RLS libera baseado nessa linha), **passa a enxergar e operar dados reais da oficina vítima**: orçamentos, agenda, mensagens de clientes, dependendo do que as policies de `funcionarios` liberam. É essencialmente uma escalada de privilégio/account takeover de qualquer oficina da plataforma, sem precisar de nenhuma credencial prévia.

### 2. `PATCH /api/funcionarios` — CRÍTICO
Mesma rota, mesmo problema: aceita `{ id, resetSenha: true, ... }` pra **qualquer** `funcionario.id` e troca a senha da conta dele, além de poder editar `nome`/`telefone` do perfil e campos como `cargo`/`ativo`/`especialidade`. Um atacante que descubra (ou adivinhe sequencialmente, se os IDs não forem UUID aleatório — aqui são UUID, mas mesmo assim, qualquer vazamento de ID em outro lugar do sistema basta) o `id` de um funcionário de uma oficina consegue sequestrar a conta dele resetando a senha, sem provar que é o dono da oficina.

### 3. `DELETE /api/funcionarios` — CRÍTICO
Mesma rota: `{ id }` de qualquer funcionário apaga o vínculo e, se essa pessoa não for dona de nenhuma oficina, **apaga a conta inteira dela** (`auth.admin.deleteUser`), com cascade pra tudo ligado ao perfil. Um atacante pode demitir/apagar funcionários de oficinas concorrentes só sabendo o `id` do registro em `funcionarios`.

### 4. `POST /api/confirmar-entrega` — CRÍTICO
**Arquivo**: `apps/web/src/app/api/confirmar-entrega/route.ts`
**Cenário**: um atacante que descubra (ou tente por força bruta/enumeração) um `solicitacaoId` de qualquer cliente chama `POST /api/confirmar-entrega` com `{ eventoId, solicitacaoId }`. A rota, sem checar se quem chama é o cliente dono daquela solicitação: marca o evento de agenda como `concluido`, marca a `solicitacao` como `concluida`, notifica o cliente pedindo avaliação, **e lança uma comissão real** (`comissao_lancamento`) contra a oficina, calculada sobre o valor do orçamento aceito. Isso é dano financeiro direto: a oficina passa a "dever" comissão de um serviço que talvez nem tenha terminado de fato (o fluxo de confirmação de entrega deveria ser exclusividade do cliente real). Também pode ser abusado pra fechar/"resolver" solicitações de terceiros artificialmente.

### 5. `POST /api/aceitar-orcamento` — CRÍTICO
**Arquivo**: `apps/web/src/app/api/aceitar-orcamento/route.ts`
**Cenário**: com apenas `{ orcamentoId, slotId }`, sem checar se quem chama é o cliente dono da solicitação associada, a rota: marca o orçamento como `aceito`, marca a solicitação como `aceita`, **recusa automaticamente todos os outros orçamentos concorrentes** daquela solicitação, cria um evento de agenda pra oficina, e dispara notificações/emails (inclusive fluxo de "responsável por pagamento" em casos de acidente, com dados pessoais do envolvido). Um atacante pode: (a) forçar a aceitação de um orçamento specific em nome de um cliente sem consentimento, prejudicando o cliente que talvez preferisse outro orçamento; (b) sabotar concorrência entre oficinas ao aceitar orçamentos indevidamente e reprovar os demais; (c) disparar spam de notificação/email em massa reaproveitando o mesmo `orcamentoId` (a rota não impede reprocessamento idempotente completo — reenviar emails de novo é possível se o status já mudou de volta ou mesmo sem mudar, dependendo do fluxo).

### 6. `POST /api/marcar-pedido-peca-entregue` — ALTO/CRÍTICO
**Arquivo**: `apps/web/src/app/api/marcar-pedido-peca-entregue/route.ts`
**Cenário**: mesmo padrão de `/api/confirmar-entrega`, mas pro canal de peças: `{ pedidoId }` de qualquer pedido, sem checar se quem chama é o fornecedor ou o comprador daquele pedido, marca como `entregue` e lança `comissao_pecas_lancamento` contra o fornecedor. Mesmo dano financeiro em escala menor (peças costumam ter ticket menor que serviço completo, mas o princípio é idêntico).

### 7. `POST /api/registrar-no-show` — MÉDIO/ALTO
**Arquivo**: `apps/web/src/app/api/registrar-no-show/route.ts`
**Cenário**: `{ agendaId, solicitacaoId }` sem checagem de dono. Um atacante pode marcar qualquer agendamento como falta do cliente (`no_show`), cancelar a solicitação dele, resetar o orçamento aceito de volta pra "enviado" (obrigando reagendamento), e disparar uma notificação real ao cliente dizendo que ele "não compareceu" — dano reputacional/operacional a um cliente que talvez tenha comparecido normalmente, além de bagunçar o funil de atendimento de uma oficina concorrente.

---

## Detalhamento das rotas médias/baixas

### `POST /api/marcar-cotacao-respondida` — MÉDIO
Sem checar se quem chama é de fato a loja/oficina que respondeu, qualquer `cotacaoId` aberto pode ser marcado como "respondida", escondendo a cotação de outros fornecedores que ainda não a viram (nega oportunidade de negócio a concorrentes de peças, sem gerar nenhuma resposta real).

### `POST /api/notificar-orcamento` — MÉDIO
Sem checar se quem chama é a oficina dona do orçamento, qualquer `orcamentoId` existente pode ser usado pra reenviar (repetidamente, sem limite) email e WhatsApp de "novo orçamento" pro cliente e pro "outro envolvido" de um acidente — vetor de spam/assédio usando a marca BipFix como remetente confiável.

### `POST /api/notificar-acidente` — MÉDIO
Cria conta de usuário (se o email do `emergencia_outro_veiculo` ainda não tiver perfil) e envia a senha temporária por email. Como o valor de `outroVeiculoId` precisa existir previamente (criado em outro fluxo), a superfície de abuso direto é menor, mas a rota pode ser chamada repetidamente pro mesmo registro pra reenviar o email de notificação de acidente e o WhatsApp várias vezes (spam), e não há confirmação de que quem chama é de fato o "proprietário" que registrou o acidente.

### `POST /api/notificar-oficinas-emergencia` e `POST /api/notificar-fornecedores-cotacao-peca` — BAIXO/MÉDIO
Ambas fazem broadcast de notificação (não há "dono" pra validar, são rotas de notificação em massa por natureza), mas por não terem nenhuma authenticação nem rate limit, um atacante pode chamar repetidamente com coordenadas arbitrárias e `emergenciaId`/`cotacaoId` inventados (mesmo que não existam de verdade, a notificação ainda é criada e entregue às oficinas na região, contendo mensagem fixa tipo "acidente próximo" ou "oficina precisa de peça") — gera alarme falso / fadiga de notificação nas oficinas reais da plataforma.

### `GET /api/comissao-atual` — BAIXO (vazamento de leitura)
Qualquer pessoa que descubra um `oficinaId` (não é segredo — aparece em URLs públicas de oficina) consegue ler a taxa de comissão efetiva daquela oficina e quantos serviços fez nos últimos 90 dias — dado comercial que provavelmente deveria ficar só entre a oficina e a plataforma (ex: concorrente descobre que oficina X está pagando taxa menor por ter bom desempenho).

### `POST /api/recalcular-comissao` e `POST /api/atualizar-avaliacao-oficina` — BAIXO
Ambas recalculam a partir de **dados reais já existentes no banco** (não aceitam valor arbitrário de taxa/nota do chamador) — não dá pra forjar uma taxa ou nota falsa via essas rotas. O único risco é chamar repetidamente sem necessidade (gasto de queries/CPU), um vetor de DoS leve, não de fraude de dados.

### `POST /api/consultar-placa` — BAIXO
Consulta primeiro no próprio banco (`veiculos.placa`) e, se não achar, numa API paga externa. Qualquer pessoa pode digitar uma placa e descobrir marca/modelo/ano/cor de um veículo de terceiro **se ele já estiver cadastrado no BipFix** — vazamento de dado de baixo impacto (placas já são consultáveis publicamente em serviços de terceiros no Brasil), mas também expõe a rota a esgotar a cota paga da API de placas sem controle de uso.

### `POST /api/esqueci-senha` — BAIXO/MÉDIO
Não revela se o email existe (boa prática), mas não tem rate limiting: um atacante pode chamar repetidamente pro email de uma vítima, gerando uma senha temporária nova a cada chamada — isso não vaza a senha (só vai pro email da vítima), mas nega acesso a quem já tinha logado, obrigando a vítima a sempre usar a senha mais recente recebida (incômodo / DoS leve de conta, não comprometimento).

### `POST /api/criar-solicitacao-emergencia` — BAIXO
Fluxo intencionalmente público (emergência real precisa funcionar sem login prévio), mas sem rate limit visível: pode ser abusado pra criar contas em massa e gastar cota de envio de email transacional.

### `POST /api/upload-emergencia` — BAIXO
Aceita arquivos pra qualquer `emergenciaId` existente sem checar posse; não há validação visível de tipo MIME real ou tamanho máximo de arquivo no handler (fica a critério do bucket do Supabase Storage) — risco de abuso de armazenamento/custo, ou upload de arquivo malformado.

### `POST /api/analisar-dano` e `POST /api/transcrever-audio` — BAIXO (custo)
Ambas chamam a API paga do Gemini sem checar se quem pede é dono da `solicitacao`/`mensagem`. Não vazam dado de terceiro particularmente sensível (fotos/áudio já settam contexto do serviço), mas permitem que qualquer pessoa gere custo de API arbitrariamente reprocessando (ou processando pela primeira vez) qualquer registro existente só sabendo o ID.

### `POST /api/log-error` — COSMÉTICO
Intencionalmente público (loga erro de JS de qualquer visitante, mesmo anônimo) — o próprio código documenta isso. Inputs truncados. Sem problema de segurança real, só possível spam de linhas de log irrelevantes (baixo impacto).

### `GET /api/fipe` — OK
Só faz proxy de uma API pública de tabela FIPE, sem tocar Supabase nem dado sensível.

---

## Padrão comum encontrado

A grande maioria das rotas críticas segue exatamente o mesmo desenho: usam a service role key "porque o RLS bloqueia o client-side" (comentários no próprio código confirmam essa intenção, ex: em `aceitar-orcamento`, `marcar-cotacao-respondida`, `marcar-pedido-peca-entregue`) — o que é uma justificativa válida — **mas implementam a rota assumindo implicitamente que só quem tem o ID vai chamar de forma legítima**, sem nenhuma verificação de sessão nem de propriedade do recurso. Isso é o mesmo desenho de falha do bug admin corrigido hoje, só que espalhado pelas rotas de fluxo normal (oficina/cliente/loja), não só nas administrativas.

**Recomendação geral para a correção futura** (não aplicada nesta auditoria, apenas registrada): cada rota de escrita sensível deveria (1) exigir sessão válida (`supabase.auth.getSession()` via `createServerClient`, como em `requireAdmin()`), e (2) confirmar que o `profile_id`/`oficina_id` da sessão é de fato o dono do recurso referenciado no corpo da requisição (ex: em `/api/confirmar-entrega`, checar que `solicitacoes.cliente_id === session.user.id`; em `/api/funcionarios`, checar que `oficinas.profile_id === session.user.id` ou que o chamador já é funcionário daquela oficina com permissão de gestão).
