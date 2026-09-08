# BipFix — Lado do Cliente (Motorista)

> Documentação de varredura de código para servir de base a um portal educativo (sandbox/tutorial) que ensine oficinas a entenderem o que o **cliente** (motorista dono do carro) vê e faz na plataforma. Todo o conteúdo abaixo foi extraído lendo o código-fonte real (páginas, hooks, APIs e tipos), não é suposição de produto.

Arquivos-fonte principais cobertos:
- `apps/web/src/app/(auth)/cadastro/page.tsx`, `login/page.tsx`, `escolher-tipo/page.tsx`, `definir-senha/page.tsx`, `reset-password/page.tsx`
- `apps/web/src/app/emergencia/page.tsx`, `apps/web/src/app/emergencia/acidente/[id]/page.tsx`
- `apps/web/src/app/cliente/*` (dashboard, veiculos, nova-solicitacao, orcamentos, orcamentos/[id], mensagens, mensagens/[id], historico, perfil, reagendar/[id], acompanhamento/[id])
- `apps/web/src/app/oficinas/[id]/page.tsx`
- `apps/web/src/app/docs/cliente/page.tsx`
- Hooks: `use-solicitacoes.ts`, `use-orcamentos.ts`, `use-veiculos.ts`, `use-notificacoes.ts`, `use-avaliacoes.ts`
- APIs: `criar-solicitacao-emergencia`, `aceitar-orcamento`, `upload-emergencia`, `notificar-oficinas-emergencia`, `notificar-acidente`, `notificar-orcamento`, `analisar-dano`, `transcrever-audio`, `consultar-placa`, `fipe`, `atualizar-avaliacao-oficina`, `esqueci-senha`, `confirmar-entrega`, `registrar-no-show`
- `apps/web/src/lib/auth-context.tsx`, `apps/web/src/lib/utils.ts`
- `packages/shared/types/index.ts`, `packages/shared/constants/index.ts`

---

## 0. Conceitos e dados-base (para entender tudo o resto)

- **Tipos de serviço** (`TIPOS_SERVICO`): `colisao` 💥, `funilaria` 🎨, `revisao` 🔧, `mecanica` ⚙️, `eletrica` ⚡, `pneu` 🔴, `outro` 📋. Cada tipo tem a flag `needsPhoto`: `colisao`, `funilaria` e `outro` pedem fotos do dano; `revisao`, `mecanica`, `eletrica`, `pneu` pedem uma lista de checkboxes de serviços específicos (ex.: "Troca de óleo e filtro", "Bateria - não liga" etc.) em vez de fotos.
- **Status da solicitação** (`StatusSolicitacao`): `aberta` → `em_orcamento` → `aceita` → `em_andamento` → `concluida`, com desvios possíveis para `cancelada` ou `no_show`.
- **Status do orçamento** (`StatusOrcamento`): `enviado`, `visualizado` (não usado ativamente no código lido), `aceito`, `recusado`, `expirado` (não há job que expire automaticamente — é só um valor possível).
- **Urgência**: `baixa`, `media`, `alta` (cores verde/amarelo/vermelho).
- O cliente é identificado no app por `useAuth()` → `user` (tabela `profiles`, tipo `cliente`), que expõe `id, nome, email, telefone, avatar_url, ativo`.

---

## 1. Cadastro (`/cadastro`)

**O que é:** formulário único usado por motoristas, oficinas e lojas de peças (com passos diferentes conforme o tipo). Se a URL vier com `?tipo=cliente` (ex.: vindo do botão "Sou Motorista" da home), pula direto para o passo 2.

**Passo a passo (motorista):**
1. **Passo 1 — Escolher perfil** (só aparece se não veio `?tipo=` na URL): "Sou Motorista", "Sou Oficina" ou "Sou Loja de Peças".
2. **Passo 2 — Dados pessoais**: Nome completo* (obrigatório), Email* (obrigatório), Telefone (opcional), Senha* (obrigatório, mínimo 6 caracteres, `minLength={6}`). Para motorista, o botão do formulário já cria a conta ("Criar conta"); para oficina/loja, o botão passa para o passo 3 ("Próximo").
3. Ao submeter: chama `signUp(email, password, nome, telefone, 'cliente')` do `auth-context`, que faz `supabase.auth.signUp` e insere uma linha em `profiles` com `tipo: 'cliente'`. **Não há confirmação de e-mail no fluxo** (nenhuma tela de "verifique seu e-mail" — o Supabase pode ou não exigir confirmação dependendo da configuração do projeto, mas a UI assume login imediato).
4. Sucesso: `router.push('/cliente/dashboard')`.
5. Erro: mensagem vermelha acima do formulário (ex.: "Preencha todos os campos obrigatórios" se nome/email/senha vazios, ou a mensagem de erro crua do Supabase).

**Link inferior:** "Já tem conta? Entrar" → `/login`.

---

## 2. Login (`/login`)

**Campos:** Email, Senha. Botão "Entrar".

**Validações:** se algum campo vazio → "Preencha email e senha". Se a conta foi desativada (`profiles.ativo = false`), o `signIn()` do auth-context faz logout automático e devolve "Esta conta foi desativada. Entre em contato com o suporte." Também existe um parâmetro de URL `?desativado=1` que, se presente ao carregar a página, mostra a mesma mensagem (usado quando o usuário é redirecionado para cá após ser desativado em outro lugar do app).

**Sucesso:** `router.push('/')` (não vai direto para `/cliente/dashboard` — cai na home, que decide o destino).

### 2.1 "Esqueci minha senha" (dentro da própria tela de login)

Isto **não** é o fluxo padrão de recuperação por e-mail do Supabase. É um fluxo próprio:
1. Cliente clica "Esqueci minha senha" → troca para modo `forgotMode`, pede só o e-mail.
2. Ao enviar, chama `POST /api/esqueci-senha`.
3. A API (`apps/web/src/app/api/esqueci-senha/route.ts`):
   - Busca o perfil pelo e-mail. Se não existir, **retorna sucesso mesmo assim** (para não revelar quais e-mails estão cadastrados).
   - Se existir, gera uma **senha temporária aleatória de 8 caracteres**, atualiza a senha do usuário via `supabase.auth.admin.updateUserById` e marca `user_metadata.primeiro_login = true`.
   - Envia um e-mail (via Resend, remetente `BipFix <noreply@bipfix.com>`) com a senha temporária em texto puro.
4. Tela de sucesso: "Senha temporária enviada! Enviamos uma senha temporária para **email**. Use-a para fazer login e depois escolha uma nova senha." com botão "Voltar para login".

**Observação importante:** o e-mail de senha temporária não redireciona automaticamente para trocar a senha — ver bug listado ao final sobre `primeiro_login` nunca ser checado no login normal.

---

## 3. `/escolher-tipo` (página órfã / desatualizada)

Página estática com dois cartões ("Sou Motorista" e "Sou Oficina" — nem menciona loja de peças), mas **ambos os links apontam para `/login`**, não para `/cadastro?tipo=...`. Não há nenhuma referência a essa rota em outras páginas do app (não é linkada de lugar nenhum encontrado na varredura). Provavelmente uma tela antiga de um fluxo de onboarding que foi substituído pelo cadastro em etapas.

---

## 4. Definir senha no primeiro acesso (`/definir-senha`)

**Quando aparece:** para contas criadas automaticamente pelo sistema (ex.: fluxo de emergência que cria conta para o motorista ou para o "outro envolvido" no acidente, ou após recuperação de senha) — nesses casos `user_metadata.primeiro_login = true` é setado. **Só que, pela leitura do código, nenhuma página redireciona automaticamente para `/definir-senha` com base nesse metadata** (ver bug ao final).

**Campos:** Nova senha (mín. 6), Confirmar senha. Validações: tamanho mínimo e senhas coincidentes.

**Ao salvar:** `supabase.auth.updateUser({ password })`; se o usuário for `funcionario` de oficina, também faz `PATCH /api/funcionarios` para marcar `primeiro_login: false`; sempre limpa `user_metadata.primeiro_login`. Depois redireciona por tipo: oficina+funcionário → `/oficina/veiculos-em-servico`; oficina sem funcionário → `/oficina/dashboard`; qualquer outro (inclui cliente) → `/cliente/dashboard`.

---

## 5. Reset de senha via link do Supabase (`/reset-password`)

Fluxo **paralelo e diferente** do "Esqueci minha senha" acima — usa o evento nativo `PASSWORD_RECOVERY` do Supabase Auth (`supabase.auth.onAuthStateChange`). Mostra "Verificando link..." até a sessão de recuperação ser detectada; depois pede Nova senha / Confirmar senha; ao salvar, `supabase.auth.updateUser({ password })` e depois de 3s redireciona para `/login`.

**Este fluxo não é acionado por nenhum botão visível da aplicação** (o botão "Esqueci minha senha" do login usa a API customizada de senha temporária, não o `resetPasswordForEmail` do Supabase). Ou seja, `/reset-password` só funcionaria se algum e-mail/link externo (não encontrado no código) apontasse para essa URL com o token de recovery do Supabase.

---

## 6. Emergência — "Acabei de bater!" (`/emergencia`)

**O que é:** fluxo de urgência acessível **sem precisar estar logado**, para quem acabou de sofrer uma colisão. Cria conta automaticamente se necessário. Header vermelho com ícone de alerta.

**Passo a passo (usuário NÃO logado — 3 etapas):**

**Etapa 1 — Fotos do acidente:**
- Botões "Tirar foto agora" (usa `<input capture="environment">`, abre a câmera do celular) e "Escolher da galeria" (`multiple`).
- Fotos são comprimidas no navegador (`compressImage`) antes de ficarem em memória como preview.
- Cada foto pode ser removida (botão "x" ao passar o mouse).
- **Campo "Placa do seu veículo"**: ao digitar 7 caracteres, chama automaticamente `POST /api/consultar-placa`. Se encontrar, mostra marca/modelo/ano/cor num card verde. Se não encontrar, mostra aviso laranja "Placa não encontrada" e um campo livre para digitar "Marca Modelo" manualmente (o texto é dividido ingenuamente: primeira palavra = marca, resto = modelo).
- Campo "Descreva o que aconteceu" (opcional, textarea).
- **"O que aconteceu?"** (obrigatório escolher um, rádio, pré-selecionado em "outro_causou"):
  - `eu_causei` — "Eu causei o acidente" → você é responsável pelo reparo do outro veículo.
  - `outro_causou` — "O outro motorista causou" → você é a vítima, vai receber orçamentos.
  - `sem_outro` — "Sem outro envolvido" (ex.: bateu no poste/muro).
- Botão "Próximo" só habilita depois de pelo menos 1 foto.

**Etapa 2 — Seus dados** (só aparece se **não** estiver logado): Nome, Email, Telefone/WhatsApp — todos exigidos para avançar (botão desabilitado até os 3 preenchidos). Se já logado, essa etapa é pulada (`isLoggedIn && step===1` pula direto para a etapa 3).

**Etapa 3 — Localização:**
- Campo "Endereço / Região" (texto livre).
- Botão "Usar minha localização atual" (Geolocation API do navegador); se negado, cai em "São Paulo, SP" como texto (mas as coordenadas internas ficam nas coordenadas padrão -23.5505/-46.6333 se a geolocalização falhar).
- Resumo da solicitação (nº de fotos, nome, telefone, descrição).
- Botão "Enviar para oficinas!" (desabilitado sem endereço).

**O que acontece ao enviar (`handleSubmit`):**
1. Insere direto no Supabase uma linha em `emergencias` (`profile_id` = usuário logado ou `null`, prioridade `urgente`, descrição prefixada com `[TIPO:eu_causei|outro_causou|sem_outro]`).
2. Faz upload das fotos via `POST /api/upload-emergencia` (bucket `damage-photos`, salva também em `emergencia_fotos`).
3. Chama `POST /api/criar-solicitacao-emergencia`, que:
   - Se não há usuário logado, procura por um `profiles` com aquele e-mail; se não existir, **cria uma conta nova automaticamente** via `supabase.auth.admin.createUser` com **senha temporária de 8 caracteres gerada no servidor**, `email_confirm: true` e `user_metadata.primeiro_login: true`, e envia por e-mail (Resend) as credenciais de acesso.
   - Cria (ou reaproveita) um veículo na tabela `veiculos` para esse cliente, usando os dados da placa consultada (ou "A definir").
   - Cria a `solicitacao` de verdade (`tipo: 'colisao'`, `urgencia: 'alta'`).
   - Vincula `emergencias.solicitacao_id`.
   - Insere as fotos em `solicitacao_fotos`.
   - Notifica (tabela `notificacoes`) todas as oficinas ativas cujas especialidades incluam `colisao` ou `funilaria` (ou que não tenham especialidades cadastradas).
4. Chama `POST /api/notificar-oficinas-emergencia`, que faz uma segunda notificação — busca oficinas num raio de **50 km** (mais amplo que o normal) ao redor das coordenadas informadas; se nenhuma oficina cair no raio, notifica **todas** as oficinas ativas (até 20) como fallback; filtra por especialidade (`colisao`, `funilaria`, `pintura`, `geral`) e depois filtra novamente por **capacidade** (`oficinaTemCapacidade`, ver seção de regras de negócio) — mas nunca deixa a emergência sem nenhuma oficina notificada por causa da capacidade (se todas estiverem cheias, notifica todas mesmo assim). Registra cada notificação em `emergencia_oficinas_notificadas`.

**Tela de sucesso:**
- "Emergência registrada! Oficinas próximas foram notificadas e enviarão orçamentos em breve."
- Se `tipoAcidente !== 'sem_outro'`: card "Próximo passo" com botão "Registrar outro veículo envolvido" → vai para `/emergencia/acidente/[id]`.
- Se logado: botão "Ir para o Dashboard".
- Se não logado: "Crie uma conta para acompanhar os orçamentos..." + botão "Criar minha conta" (`/cadastro?tipo=cliente`) — **nota:** mesmo que uma conta já tenha sido criada automaticamente no backend com senha temporária enviada por e-mail, a tela não avisa isso claramente ao usuário não-logado (ele só recebe o e-mail separadamente).

---

## 7. Registro do acidente / chat / orçamentos do acidente (`/emergencia/acidente/[id]`)

Três abas: **Envolvidos**, **Mensagens**, **Orçamentos**.

### 7.1 Aba "Envolvidos"
Se ainda não registrado, formulário para os dados do outro motorista:
- Nome* (obrigatório), Telefone, Email, **Placa*** (obrigatório) — com a mesma busca automática por placa (`/api/consultar-placa`) usada na etapa 1 do fluxo de emergência —, Veículo (marca/modelo, texto livre), Fotos do outro veículo (upload direto pro bucket `damage-photos`), Observações.
- Se um e-mail for informado, mostra aviso azul: "O outro motorista receberá uma notificação por email para acompanhar o acidente e os orçamentos."
- Botão "Registrar outro veículo" (desabilitado sem nome+placa). Ao confirmar:
  1. Insere em `emergencia_outro_veiculo`.
  2. Sobe as fotos do outro veículo.
  3. Chama `POST /api/notificar-acidente`, que:
     - Se o e-mail do outro motorista não tiver conta, **cria uma conta automaticamente** (mesma lógica de senha temporária) e um veículo básico para ele.
     - Envia e-mail e WhatsApp de notificação (`sendAccidentNotificationEmail`, `sendAccidentWhatsApp`, em `apps/web/src/lib/notifications.ts`).
     - Marca `emergencia_outro_veiculo.notificado = true`.
     - Cria notificação in-app para o outro motorista (se tiver profile).

Depois de registrado, mostra dois cartões lado a lado com rótulos dinâmicos conforme `tipoAcidente`:
- `eu_causei`: quem registrou = "Responsável" (vermelho), o outro = "Vítima" (verde).
- `outro_causou`: quem registrou = "Vítima" (verde), o outro = "Responsável" (vermelho).
- Sem tipo definido (dados legados): "Motorista 1" / "Motorista 2".
Cada cartão mostra nome, veículo (marca/modelo/ano/placa/cor, se disponíveis) e telefone (link `tel:`).

### 7.2 Aba "Mensagens"
Chat simples entre o "proprietário" (quem registrou a emergência) e o "outro" envolvido, tempo real via Supabase Realtime (`emergencia_mensagens`). Quem é "proprietário" é decidido comparando `user.id === emergData.profile_id`. Mensagens otimistas (aparecem antes da confirmação do servidor).

### 7.3 Aba "Orçamentos"
Lista os orçamentos da solicitação vinculada à emergência (join `orcamentos` → `oficinas`).
- Estado vazio: "Nenhum orçamento ainda. Oficinas próximas estão avaliando os danos. Você receberá orçamentos por email assim que estiverem prontos."
- Aviso amarelo contextual: se `eu_causei`/`outro_causou`, explica que "a vítima decide qual orçamento aceitar"; se `sem_outro`, pede para compartilhar os orçamentos com o outro motorista.
- **Regra de quem pode aceitar** (`isVitima`): calculada a partir do tipo de acidente e de quem está logado:
  - `outro_causou`: vítima = quem registrou (`user.id === emergData.profile_id`).
  - `eu_causei`: vítima = quem **não** registrou.
  - Dado legado sem tipo: cai de volta em `isProprietario`.
- Cada card de orçamento mostra oficina, valor, prazo, dados de contato da oficina. Botão "Enviar ao responsável"/"Enviar ao outro envolvido" pré-preenche uma mensagem de chat com o resumo do orçamento. Se `isVitima` e o orçamento ainda não foi aceito, aparece botão "Aceitar orçamento" que **leva para `/cliente/orcamentos/[solicitacao_id]`** (a aceitação de fato acontece lá, não nesta tela).

---

## 8. Dashboard do cliente (`/cliente/dashboard`)

**Cabeçalho:** "Olá, {primeiro nome}!" + botão "+ Nova Solicitação" (`/cliente/nova-solicitacao`).

**Banner de notificações não lidas** (até 3, roláveis horizontalmente): cada card usa `getNotificationHref()` para decidir o destino ao clicar:
- `tipo === 'acidente'` com `emergencia_id` nos dados → `/cliente/mensagens`.
- `tipo === 'nova_mensagem'` → `/cliente/mensagens/[solicitacao_id]` (ou lista geral se não tiver `solicitacao_id`).
- `tipo === 'servico_concluido'` com `solicitacao_id` → `/cliente/orcamentos/[id]` (card com destaque amarelo/verde e badge "Avaliar").
- Qualquer outro com `solicitacao_id` → `/cliente/orcamentos/[id]`.
- Fallback → `/cliente/mensagens`.
Clicar num card marca a notificação como lida (`markAsRead`). Se houver mais de 3 não lidas, aparece link "Ver todas (N)" apontando para **`/cliente/notificacoes`** — **essa rota não existe no código** (ver bugs).

**Cards de estatística (topo):**
- "Abertas" (status `aberta`/`em_orcamento`) → link para `/cliente/orcamentos`.
- "Agendadas" (status `aceita`/`em_andamento`) — não é link.
- "Orçamentos" (contagem de orçamentos com status `enviado` em todas as solicitações) → link para `/cliente/orcamentos`.
- "Concluídas" → link para `/cliente/historico`.

**Seção "Acidentes envolvidos"** (só aparece se o e-mail do usuário logado tiver algum registro em `emergencia_outro_veiculo` — ou seja, ele foi registrado como "outro motorista" por alguém): mostra cartões com "Acidente registrado por {nome}" e a placa do próprio veículo, com botões "Ver detalhes" (`/emergencia/acidente/[id]`) e "Mensagens" (`/cliente/mensagens`).

**Seção "Agendamentos"** (solicitações com status `aceita`/`em_andamento`): mostra veículo, orçamento aceito, dados da oficina (nome, endereço, cidade/estado, telefone), e o slot de check-in/entrega escolhido (turno "manhã" = 08:00–12:00, "tarde" = 13:00–17:00). Botões "Acompanhar" (`/cliente/acompanhamento/[id]`) e "Ver detalhes" (`/cliente/orcamentos/[id]`).

**"Solicitações abertas"** (status `aberta`/`em_orcamento`): lista com veículo, status, descrição (limpa de marcadores internos via `cleanDescricao`), endereço, tempo relativo (`timeAgo`), contagem de orçamentos e o menor valor recebido ("A partir de R$ X"). Clique leva para `/cliente/orcamentos/[id]`.

**Estado vazio de solicitações abertas:** se não há nenhuma agendada nem aberta → "Você ainda não tem solicitações" + botão "Criar primeira solicitação"; se há agendadas mas nenhuma aberta → "Nenhuma solicitação aberta no momento" + "Criar nova solicitação".

**Sidebar "Meus Veículos":** lista resumida (apelido ou marca/modelo, ano, placa) + link "Ver todos" (`/cliente/veiculos`) + atalho "+ Adicionar veículo" (`/cliente/veiculos?add=true`).

---

## 9. Meus veículos (`/cliente/veiculos`)

**O que é:** CRUD simples da garagem do cliente. Se a URL tiver `?add=true`, o formulário já abre automaticamente.

**Formulário:** usa o componente `FipeAutocomplete` para tipo/marca/modelo/ano (integrado com a Tabela FIPE via `/api/fipe`, que faz proxy cacheado por 24h para `parallelum.com.br/fipe/api/v2`). Campos extras opcionais: Placa, Cor, Apelido. Se a FIPE retornar um valor de mercado, mostra "Valor FIPE: R$ X" em destaque verde.

**Botões:** "Adicionar Veículo" (abre form), "Cancelar", "Adicionar"/"Salvar" (varia se está editando). Cada veículo listado tem ícones de editar (lápis) e excluir (lixeira) — exclusão é **imediata, sem confirmação** (`handleDelete` chama `remove(id)` direto, sem `window.confirm`).

**Estado vazio:** ícone de carro + "Nenhum veículo cadastrado".

**Validação de salvar:** exige `fipe_marca`, `fipe_modelo` e `fipe_ano` preenchidos (silenciosamente não faz nada se faltar — não mostra mensagem de erro).

---

## 10. Nova solicitação (`/cliente/nova-solicitacao`)

Wizard de **5 passos** (barra de progresso no topo):

1. **Selecionar veículo** — lista os veículos cadastrados do cliente; se não houver nenhum, mostra "Nenhum veículo cadastrado" + botão "Cadastrar veículo" (`/cliente/veiculos?add=true`). Botão "Próximo" desabilitado sem seleção.
2. **Tipo de serviço** — grade com os 7 `TIPOS_SERVICO`. Trocar o tipo limpa os serviços já selecionados do passo 3.
3. **Fotos OU checklist de serviços**, dependendo do tipo escolhido (`needsPhoto`):
   - `colisao`, `funilaria`, `outro` → upload múltiplo de fotos (sem compressão aqui, diferente do fluxo de emergência — ver bug).
   - `revisao`, `mecanica`, `eletrica`, `pneu` → checklist de serviços específicos por categoria (ex.: revisão tem 15 opções como "Troca de óleo e filtro", "Alinhamento e balanceamento"; mecânica tem 17 opções como "Motor - barulho estranho"; elétrica 13 opções; pneu 7 opções). Múltipla escolha.
4. **Detalhes e urgência** — Textarea de descrição (obrigatória apenas se `needsPhoto`; opcional para os tipos com checklist) + seleção de urgência (baixa/média/alta, com bolinha colorida e descrição). Botão "Próximo" desabilitado se `needsPhoto` e descrição vazia.
5. **Localização e confirmação** — campo de endereço/região (texto livre, **sem** geolocalização automática nesta tela, diferente do fluxo de emergência) + resumo completo (veículo, tipo, urgência, nº de fotos ou lista de serviços, descrição). Botão "Enviar Solicitação" desabilitado sem endereço.

**Ao enviar (`handleSubmit`):**
- Monta a descrição final: se houver serviços selecionados, vira `"Serviços: item1, item2. <descricao>"`; senão usa a descrição livre ou `"Solicitação de serviço"`.
- Cria a solicitação via `useSolicitacoes().create(...)` — **as coordenadas são fixas em `latitude: -23.5505, longitude: -46.6333` (São Paulo), independentemente do endereço digitado pelo cliente** (ver bug crítico ao final — afeta o matching por proximidade).
- Sobe as fotos (se houver) direto pro bucket `damage-photos` em `solicitacoes/{id}/{timestamp}.{ext}`, sem compressão.
- **Notifica oficinas diretamente do navegador do cliente**: busca todas as `oficinas` ativas e, para cada uma cuja lista de `especialidades` inclua o tipo escolhido (ou que não tenha especialidades cadastradas = aceita qualquer coisa), insere uma linha em `notificacoes` — isso roda como escrita direta do cliente na tabela de notificações da oficina (depende de política de RLS permitir insert cross-user).
- Tela de sucesso: "Solicitação enviada! Oficinas próximas a você foram notificadas..." e redireciona para o dashboard após 2s.

---

## 11. Orçamentos — lista (`/cliente/orcamentos`)

Lista apenas solicitações que já têm pelo menos 1 orçamento. Cada card agrupa por solicitação (veículo, status, descrição) e lista os orçamentos recebidos (nome da oficina, prazo, nº de itens, valor total, status). Clicar em qualquer orçamento leva para o detalhe da solicitação (`/cliente/orcamentos/[id]`) — não existe uma página de detalhe por orçamento individual, o clique sempre abre a solicitação inteira.

**Estado vazio:** "Nenhum orçamento recebido ainda" + botão "Criar solicitação".

---

## 12. Detalhe da solicitação / orçamentos recebidos (`/cliente/orcamentos/[id]`)

Esta é a tela mais rica do lado do cliente. Por seção:

### 12.1 Cabeçalho
- Veículo, `StatusBadge` do status da solicitação, badge de urgência.
- Botão "Mensagem para oficina" (`/cliente/mensagens/[id]`).
- Botão "Cancelar solicitação" — só aparece se status é `aberta` ou `em_orcamento`; pede confirmação (`window.confirm`) e muda status para `cancelada`.

### 12.2 Banners de estado
- Se `em_andamento`: banner azul "Veículo na oficina. Use o chat para acompanhar."
- Se `concluida`: banner verde "Serviço concluído" + **formulário de avaliação** (ver 12.5).

### 12.3 Descrição e fotos
Descrição (limpa de marcadores internos), endereço, data de criação, galeria de fotos anexadas (abre em nova aba ao clicar).

### 12.4 Cartões de orçamento (um por oficina que respondeu)
Cada cartão mostra:
- Nome da oficina (link para `/oficinas/[id]`, o perfil público), estrelas + nota média + total de avaliações.
- **Selos**: 🏆 "Qualidade" se nota média ≥ 4; selo de variação percentual se o orçamento foi revisado (comparando `valor_original` vs `valor_total` — "📉 X% menor" ou "📈 X% maior"); "Revisão #N" se `revisao_numero > 0`.
- Valor total, prazo em dias, valor original riscado se diferente do atual.
- 3 mini-cards: tempo de execução (formatado em horas se < 8h, senão em "dias úteis" arredondando pra cima de 8h/dia), próximo check-in disponível, quantidade de datas disponíveis.
- Se for uma revisão, uma barra comparando valor original → valor revisado.
- Tabela de itens do orçamento (descrição, tipo, valor) com total.
- Observações da oficina (limpa de marcadores internos).
- **Ações, dependendo do estado:**
  - Se está no meio da escolha de data (`schedulingOrcId === orc.id`): mostra as `disponibilidade` (slots) do orçamento como cards clicáveis (data + turno + previsão de entrega), com botões "Cancelar" e "Confirmar Agendamento".
  - Se a solicitação já está `em_andamento` e o orçamento é `aceito`: banner azul "Veículo já na oficina".
  - Se o orçamento está `aceito` (mas ainda não em andamento): banner verde com dados completos da oficina e o slot escolhido.
  - Se `recusado`: banner vermelho com valor/prazo riscados + possibilidade de avaliar a oficina mesmo assim (fluxo de avaliação "orçamento recusado", ver 12.6).
  - Caso padrão (orçamento pendente, `enviado`): "Válido até {data}" + botões **"Recusar"** e **"Aceitar e Agendar"**.

### 12.5 Aceitar um orçamento (agendamento)
1. Clique em "Aceitar e Agendar" → abre a lista de `disponibilidade` (datas que a oficina cadastrou).
2. Cliente escolhe uma data/turno → "Confirmar Agendamento" → chama `useOrcamentos().accept(orcamentoId, slotId)`, que bate em `POST /api/aceitar-orcamento` (rota server-side com `service_role`, porque o cliente não tem permissão de RLS para escrever na agenda da oficina). Essa API:
   - Marca o orçamento como `aceito` e grava `disponibilidade_escolhida_id`.
   - Muda a solicitação para `aceita`.
   - **Recusa automaticamente todos os outros orçamentos** que ainda estavam `enviado` para essa mesma solicitação.
   - Cria um evento em `agenda` para a oficina (removendo qualquer agenda `agendado` duplicada da mesma solicitação/oficina antes).
   - Notifica a oficina in-app ("Orçamento aceito!").
   - Se a solicitação está ligada a uma emergência (acidente): posta um resumo no chat da emergência; se o tipo é `eu_causei`/`outro_causou`, identifica quem é o **responsável pelo pagamento** e abre uma conversa dedicada com a oficina para ele (mensagem de sistema em `mensagens` + notificação + e-mail com dados completos da oficina); sempre envia e-mail ao "outro envolvido" avisando que o orçamento foi aceito.
3. Tela de sucesso local (sem navegação): "Agendamento confirmado! Seu veículo está agendado na {oficina}." com data de check-in/turno e previsão de entrega, e aviso amarelo "Leve seu veículo no horário marcado."

### 12.6 Recusar um orçamento
- Se a solicitação **não** está `em_andamento`: confirmação simples → `refuse(orcamentoId)` (`UPDATE orcamentos SET status='recusado'`). Se, depois disso, não sobrar nenhum orçamento `enviado`, pergunta se quer **cancelar a solicitação inteira** (se sim, `status: 'cancelada'` e volta ao dashboard).
- Se a solicitação **está** `em_andamento` (ou seja, o carro já está na oficina e um orçamento revisado foi recusado): mensagem de confirmação diferente, avisando que "o veículo precisa ser retirado da oficina antes de encerrar"; ao confirmar, recusa o orçamento, notifica a oficina para fazer o check-out, e **não cancela a solicitação** (ela permanece `em_andamento` até a oficina agir).
- Em ambos os casos a tela recarrega (`window.location.reload()`).
- Um orçamento recusado ainda pode ser avaliado pelo cliente (estrelas 1–5 + comentário opcional), mesmo sem ter sido aceito.

### 12.7 Avaliar o serviço (quando `concluida`)
- Estrelas (1–5, obrigatório) + comentário opcional.
- Se já existe avaliação, mostra em modo leitura com opção **"Editar"** — só disponível se a avaliação tiver menos de **2 meses** (`canEdit`). Ao editar, guarda a nota antiga em `nota_anterior` e mostra uma seta ↑/↓ ao lado da nota indicando se subiu ou desceu.
- Ao salvar (criar ou editar), o hook `useAvaliacoes` também:
  - Notifica a oficina in-app com as estrelas em texto (`★★★★☆`) e o comentário (truncado a 80 caracteres).
  - Chama `POST /api/atualizar-avaliacao-oficina` (server-side, `service_role`) para recalcular `avaliacao_media`/`total_avaliacoes` da oficina — o cliente não pode escrever direto nessa tabela por RLS. Essa rota também recalcula a configuração de comissão da oficina (a nota média entra na fórmula de comissão — ver seção de regras de negócio).

---

## 13. Mensagens — lista de conversas (`/cliente/mensagens`)

Agrega, por solicitação, duas fontes de conversa possíveis:
- **Conversa com oficina** (tabela `mensagens`, vinculada por `solicitacao_id`) — ícone laranja.
- **Conversa de emergência** (tabela `emergencia_mensagens`, com o outro motorista envolvido) — ícone vermelho, com "(outro motorista)" ao lado do nome, e o link leva para `/emergencia/acidente/[emergencia_id]` (não para a tela de mensagens simples).

Também mostra conversas onde o usuário **não é o dono da solicitação**, mas foi registrado como "outro envolvido" em algum acidente (busca por `emergencia_outro_veiculo.email = user.email`). Se nesse caso ele for o responsável pelo pagamento (`tipo === 'outro_causou'`) e já existir uma conversa com a oficina sobre o orçamento aceito, ela aparece marcada com a tag "(pagamento)" em vermelho.

Cada linha de conversa mostra: nome (oficina ou outro motorista), badge de não lidas (só implementado para conversas com oficina — mensagens de emergência sempre mostram 0 não lidas porque a tabela não rastreia leitura por usuário), prévia da última mensagem (ou "Mensagem de áudio" se for um áudio), tempo relativo.

**Estado vazio:** ícone de balão + "Nenhuma conversa" / "Suas conversas com oficinas e outros motoristas aparecerão aqui."

---

## 14. Mensagens — chat com a oficina (`/cliente/mensagens/[id]`)

Chat 1:1 com a oficina responsável pela solicitação `id` (busca a oficina do orçamento `aceito`; se não houver nenhum aceito ainda, usa a primeira oficina que enviou qualquer orçamento).

- Mensagens em tempo real (Supabase Realtime), com placeholder otimista enquanto a mensagem real não chega.
- Marca como lidas automaticamente todas as mensagens não-próprias ao abrir a tela.
- Separadores de data ("Hoje", "Ontem", ou data completa).
- **Suporte a áudio**: botão de microfone grava um áudio (`AudioRecorder`), sobe via `useAudioRecorder().uploadAudio`, insere mensagem com `tipo: 'audio'`. O componente `AudioMessage` permite tocar e, se disponível, mostrar transcrição (feita sob demanda via `POST /api/transcrever-audio`, que usa Gemini para transcrever o áudio em português e cacheia o resultado na própria mensagem).
- Toda mensagem enviada pelo cliente gera uma notificação in-app para a oficina (`nova_mensagem`), inserida diretamente pelo navegador do cliente.
- Enter envia; Shift+Enter permite quebra de linha (tratado via `handleKeyDown`).

**Estado vazio:** "Nenhuma mensagem ainda. Envie a primeira mensagem para a oficina."

---

## 15. Histórico (`/cliente/historico`)

Três seções (a primeira sempre visível, as outras duas colapsáveis):

1. **Serviços concluídos** — todas as solicitações com status `concluida`. Cada uma mostra oficina, valor, descrição, data, e a mesma UI de avaliação (criar/editar/exibir) descrita na seção 12.7.
2. **Orçamentos recusados** (colapsável, fechado por padrão) — solicitações **ainda não concluídas nem canceladas** que têm pelo menos um orçamento `recusado`. Permite avaliar cada oficina recusada individualmente (uma avaliação por par solicitação+oficina).
3. **Canceladas** (colapsável, fechado por padrão) — solicitações com status `cancelada`, somente leitura.

**Estado vazio geral:** ícone de relógio + "Nenhum reparo concluído ainda" / "Quando seus reparos forem concluídos, eles aparecerão aqui" (aparece apenas se as três listas estiverem vazias).

---

## 16. Perfil (`/cliente/perfil`)

Formulário simples: Nome (editável), Email (**somente leitura**, campo desabilitado — não é possível trocar e-mail pela UI), Telefone (editável). Botão "Salvar Alterações" atualiza `profiles.nome`/`telefone` direto via Supabase e mostra banner verde "Alterações salvas com sucesso!" por 3 segundos. Não há campo de troca de senha aqui (isso só existe em `/definir-senha` e `/reset-password`).

---

## 17. Reagendar (`/cliente/reagendar/[id]`) — **página órfã, não referenciada**

Tela funcional (recebe um `agendaId` na URL, não um `solicitacao_id`) que permite ao cliente escolher uma **nova** data dentre as `disponibilidade` do orçamento aceito (excluindo datas passadas e a data atual do agendamento). Ao confirmar:
- Atualiza `agenda.data_inicio`/`data_fim` e limpa as flags de `no_show`.
- Marca o registro mais recente em `no_show_historico` como `reagendado: true`.
- Tela de sucesso: "Reagendamento confirmado!" com botão para voltar ao dashboard.

**Porém, na varredura completa do código-fonte não foi encontrado nenhum link, botão ou notificação que aponte para `/cliente/reagendar/[id]`** — nem no dashboard, nem na notificação de "falta registrada" (`no_show`, disparada por `POST /api/registrar-no-show`), nem na tela de detalhe do orçamento. Ou seja, hoje o cliente não tem como chegar nessa tela navegando pela interface (só digitando a URL manualmente, se souber o `agendaId`). Ver bugs.

---

## 18. Acompanhamento em tempo real (`/cliente/acompanhamento/[id]`)

`id` aqui é o **`solicitacao_id`**. Busca o evento de `agenda` mais recente vinculado e suas `manutencao_etapas`.

**Card de status atual:** ícone + label + descrição do último status registrado (`STATUS_MANUTENCAO`), por exemplo 🔍 "Em diagnóstico" — "Diagnosticando o problema".

**Barra de progresso (6 marcos simplificados):** Recebido → Diagnóstico → Em Execução → Teste Final → Concluído → Entregue. Os status "intermediários" da tabela real (`aguardando_pecas`, `pausa_cliente`, `pausa_pecas`, `pausa_geral`) são todos mapeados visualmente para o marco "Em Execução" (índice 2) — ou seja, o cliente não vê uma etapa própria na barra para "pausado" ou "aguardando peças", apenas no histórico detalhado abaixo.

**Card de informações:** check-in, previsão de entrega, mecânico responsável (se atribuído), tipo de serviço.

**Linha do tempo detalhada:** todas as `manutencao_etapas` em ordem cronológica, com ícone/cor por status, observação (se a oficina escreveu uma) e nome do mecânico responsável, atualizando em tempo real via Supabase Realtime. Indicador visual "Atualização em tempo real ativa" (bolinha pulsante) enquanto não há etapas ainda.

**Estado vazio de etapas:** "Aguardando início do serviço..." com indicador de tempo real ativo.

**Estado vazio de agendamento:** se não existir nenhum registro de `agenda` para essa solicitação, mostra "Nenhum agendamento encontrado para esta solicitação." + botão para voltar ao dashboard.

**Rodapé:** botões "Enviar Mensagem" (`/cliente/mensagens/[id]`) e "Ver Detalhes" (`/cliente/orcamentos/[id]`).

---

## 19. Perfil público da oficina, visto pelo cliente (`/oficinas/[id]`)

Página pública (não exige login) que o cliente acessa clicando no nome da oficina dentro de um orçamento. Mostra:

- Cabeçalho com nome, estrelas (nota **recalculada no cliente** a partir da lista de avaliações carregada, não direto do campo `avaliacao_media` da oficina), cidade/estado.
- **Selos automáticos** (todos calculados na hora, no navegador, a partir de dados públicos):
  - 🏆 "Oficina de Qualidade" — nota média ≥ 4.
  - ⚡ "Resposta Rápida" — tempo médio de resposta a orçamentos (`data orçamento - data solicitação`, média de todos os orçamentos históricos da oficina) menor que **2 horas**.
  - 🔧 "N+ serviços concluídos" — conta orçamentos `aceito` cuja solicitação está `concluida`, arredondado para baixo no maior "degrau" atingido entre `500, 100, 50, 10`.
  - "Parceira desde MM/AAAA" — data de criação do cadastro da oficina.
  - Selo de ajuste médio de preço: se a oficina tem histórico de revisões de orçamento, mostra a variação percentual média entre valor original e valor revisado ("Ajuste médio: -X% 📉" se baratearam, "+X% 📈" se encareceram); se nunca revisou nenhum orçamento, mostra "Sem ajustes de preço" (cinza, neutro).
- Serviços oferecidos (badges com ícone, a partir de `especialidades`).
- Galeria de fotos da oficina (`oficina_fotos`), se houver.
- Endereço com mapa incorporado do Google Maps (iframe) + link "Abrir no Google Maps".
- Telefone (link `tel:`) e horário de funcionamento — **este horário é fixo/hardcoded na tela** ("Seg a Sex: 08:00–18:00, Sáb: 08:00–12:00, Dom: Fechado") e não vem do banco de dados (ou seja, é igual para todas as oficinas, mesmo que o horário real seja diferente).
- Lista completa de avaliações (nome do cliente, estrelas, seta ↑/↓ se a nota foi alterada depois de publicada, comentário, data).

**Estado vazio de avaliações:** "Esta oficina ainda não possui avaliações."
**Estado de erro:** "Oficina não encontrada." + link para voltar à home.

---

## 20. Central de Ajuda — "Guia do Motorista" (`/docs/cliente`)

Página estática em formato de acordeão com 7 seções (Como se cadastrar, Como criar uma solicitação, Como comparar orçamentos, Como agendar, Acompanhamento em tempo real, Como avaliar, Emergência). **Importante para o portal educativo: este texto está desatualizado em vários pontos em relação ao comportamento real do código** — ver detalhes na seção de bugs abaixo. Ele é uma boa base de estrutura/tom para o novo portal, mas o conteúdo técnico precisa ser revisado item a item antes de reaproveitar.

---

## 21. Regras de negócio importantes (lógica exata, não suposição)

- **Matching oficina ↔ solicitação (fluxo normal, não-emergência):** feito no hook `use-solicitacoes.ts`, do lado da oficina, filtrando por um raio retangular simples (não é um círculo geodésico real) em graus de latitude/longitude convertidos aproximadamente (`raio_km / 111` para latitude, ajustado por `cos(latitude)` para longitude) ao redor de `oficina.latitude/longitude`, e por `especialidades` da oficina conter o `tipo` da solicitação (ou a oficina não ter especialidades cadastradas, o que a torna "aceita qualquer tipo"). Oficinas que já têm um orçamento `aceito` numa solicitação sempre a veem, independente de distância/especialidade.
- **Matching em emergência:** raio fixo de 50 km (mais amplo), com fallback para notificar todas as oficinas ativas se nenhuma estiver no raio, e um segundo filtro de **capacidade** (`oficinaTemCapacidade`, em `lib/capacidade.ts` — não lido em detalhe nesta varredura, mas referenciado) que despriorizada oficinas sobrecarregadas sem nunca zerar a lista de notificadas.
- **Análise de dano por IA (Gemini):** existe (`POST /api/analisar-dano`, usando `gemini-2.5-flash`) e usa as fotos que o **cliente** anexou à solicitação como entrada, mas é uma funcionalidade **do lado da oficina** (`apps/web/src/app/oficina/solicitacoes/[id]/page.tsx` + componente `DamageAnalysis`) — o cliente nunca vê o resultado dessa análise diretamente. Ela gera resumo, severidade (leve/moderado/grave/severo), checklist de inspeção, peças afetadas, estimativa de custo (min/max) e perguntas sugeridas para a oficina fazer ao cliente. Resultado é cacheado por solicitação (`analise_dano`, uma linha por `solicitacao_id`).
- **Transcrição de áudio (Gemini):** sob demanda, por mensagem, cacheada no próprio registro da mensagem (`transcricao_status`: `processando` → `concluida`/`erro`).
- **Consulta de placa:** primeiro tenta achar o veículo já cadastrado no próprio banco do BipFix (`veiculos.placa`); só chama a API externa `placas.app.br` se não achar localmente (ou se o registro local ainda estiver com marca "A definir"). Token da API externa é cacheado em memória do processo por 24h.
- **Comissão da oficina** (não é uma tela do cliente, mas o cliente **influencia** o valor): a taxa de comissão cobrada da oficina (`COMISSAO_CONFIG`, base 15%, entre 5% e 15%) recebe bônus por tempo de resposta a orçamentos (+3% se responde em até 2h, +2% se até 4h), por não precisar revisar o valor (+2% se a revisão for ≤1.5x, +1% se ≤1.0x — quanto menos ela mexe no preço, melhor a taxa) e pela **nota média de avaliação dos clientes** (+3% se média ≥4.5, +2% se ≥4.0). Ou seja, cada avaliação que o cliente deixa pode literalmente mudar quanto a oficina paga de comissão à plataforma. Isso é recalculado toda vez que: um orçamento é criado ou revisado, uma avaliação é criada/editada, ou um serviço é confirmado como entregue.
- **Aceitar um orçamento sempre recusa automaticamente os concorrentes** `enviado` da mesma solicitação (não fica pendente nenhum outro).
- **Reagendamento por falta (no-show):** se a oficina registra que o cliente não apareceu (`POST /api/registrar-no-show`, fora do escopo do cliente), a solicitação some do card "Agendamentos" (o status vira `no_show`) e o orçamento aceito volta para `enviado` (permitindo, em teoria, novo agendamento) — mas como visto na seção 17, não há caminho de UI para o cliente re-agendar a partir daí.
- **Edição de avaliação:** limitada a 2 meses após a criação (`canEditAvaliacao`), calculado sempre no cliente (JS `Date`), sem checagem equivalente no servidor além do que a RLS já garantir por `cliente_id`.
- **Criação de conta automática:** acontece em 3 fluxos diferentes de emergência (registrar emergência sem login, ser registrado como "outro envolvido", e reenvio de senha) sempre com senha temporária de 8 caracteres gerada no servidor e enviada por e-mail; a conta já nasce com `tipo: 'cliente'`.

---

## 22. Notificações disparadas pelo lado do cliente (quem recebe, quando)

| Ação do cliente | Quem recebe | Tipo (`notificacoes.tipo`) |
|---|---|---|
| Cria nova solicitação (`/cliente/nova-solicitacao`) | Todas as oficinas ativas compatíveis (especialidade) | `nova_solicitacao` |
| Registra emergência (`/emergencia`) | Oficinas de colisão/funilaria (via 2 rotas diferentes, ver seção 6) | `nova_solicitacao` e depois `emergencia` (raio 50km) |
| Aceita um orçamento | Oficina do orçamento aceito | `orcamento_aceito` |
| Aceita orçamento vinculado a acidente com responsável definido | O responsável pelo pagamento (in-app + e-mail) | `orcamento_aceito` |
| Envia mensagem de texto/áudio para oficina | Oficina (perfil dono do orçamento) | `nova_mensagem` |
| Recusa orçamento com veículo já na oficina (`em_andamento`) | Oficina | `orcamento_recusado` |
| Cria/edita avaliação | Oficina avaliada | `nova_avaliacao` |
| Registra outro veículo no acidente | Outro motorista (in-app, se tiver conta) + e-mail/WhatsApp | `acidente` |
| (Recebido pelo cliente) Oficina envia orçamento | Cliente | `novo_orcamento` |
| (Recebido pelo cliente) Oficina revisa orçamento | Cliente | `novo_orcamento` (mensagem "Orçamento revisado") |
| (Recebido pelo cliente) Serviço confirmado como entregue | Cliente | `servico_concluido` |
| (Recebido pelo cliente) Falta registrada pela oficina | Cliente | `no_show` |

---

## 23. Bugs e inconsistências encontrados

Listados apenas como observação de leitura de código — nada foi corrigido.

1. **Coordenadas fixas na "Nova Solicitação"** — `apps/web/src/app/cliente/nova-solicitacao/page.tsx` (função `handleSubmit`, campos `latitude: -23.5505, longitude: -46.6333`): a solicitação é sempre criada com as coordenadas de São Paulo, **ignorando completamente** o endereço digitado pelo cliente no passo 5. Isso quebra o matching por proximidade (`use-solicitacoes.ts`) para clientes fora de SP em fluxos que não sejam de emergência (o fluxo de emergência, em `apps/web/src/app/emergencia/page.tsx`, sim usa a geolocalização real do navegador).
2. **Link morto para `/cliente/notificacoes`** — `apps/web/src/app/cliente/dashboard/page.tsx` linha ~64 (`href="/cliente/notificacoes"`), exibido quando há mais de 3 notificações não lidas. Não existe nenhum arquivo de rota `cliente/notificacoes` no projeto.
3. **Página `/cliente/reagendar/[id]` órfã** — `apps/web/src/app/cliente/reagendar/[id]/page.tsx` é totalmente funcional, mas não há nenhum link, botão ou notificação no restante do código que leve o cliente até ela (nem a notificação de `no_show`, disparada por `apps/web/src/app/api/registrar-no-show/route.ts`, inclui esse link). Hoje é inacessível via navegação normal.
4. **`/escolher-tipo` desatualizada** — `apps/web/src/app/(auth)/escolher-tipo/page.tsx`: os dois cartões ("Sou Motorista"/"Sou Oficina") apontam ambos para `/login` em vez de `/cadastro?tipo=cliente`/`/cadastro?tipo=oficina`, e nem menciona "loja de peças" (que já existe como terceiro tipo de usuário). Também não parece ser referenciada por nenhuma outra página.
5. **Dois fluxos de "esqueci minha senha" divergentes** — o botão dentro de `/login` usa `POST /api/esqueci-senha` (senha temporária de 8 caracteres por e-mail, `apps/web/src/app/api/esqueci-senha/route.ts`), enquanto existe uma página `/reset-password` (`apps/web/src/app/(auth)/reset-password/page.tsx`) implementando o fluxo nativo de recovery do Supabase (evento `PASSWORD_RECOVERY`) que não é acionado por nenhum link/botão encontrado no código. Um dos dois fluxos parece morto ou incompleto.
6. **`primeiro_login` nunca é checado no login normal** — os fluxos de emergência e de recuperação de senha marcam `user_metadata.primeiro_login = true`, e a página `/definir-senha` (`apps/web/src/app/(auth)/definir-senha/page.tsx`) sabe zerar essa flag, mas `apps/web/src/app/(auth)/login/page.tsx` (`handleSubmit`) nunca lê `primeiro_login` para decidir se deve redirecionar para `/definir-senha` em vez de `/`. Ou seja, um cliente que recebeu senha temporária por e-mail pode logar normalmente e nunca ser levado a trocar a senha pela UI.
7. **Documentação `/docs/cliente` desatualizada em vários pontos** (`apps/web/src/app/docs/cliente/page.tsx`), comparado ao código real:
   - Seção 1 menciona "Confirme seu e-mail" como etapa obrigatória de cadastro; não há nenhuma tela de confirmação de e-mail no fluxo (`cadastro/page.tsx` loga o usuário imediatamente após `signUp`).
   - Seção 2 lista "vidros" como categoria de serviço; o enum real (`TIPOS_SERVICO` em `packages/shared/constants/index.ts`) não tem "vidros" — as categorias são colisão, funilaria e pintura, revisões, mecânica, elétrico, pneu, outro.
   - Seção 3 descreve o selo "Qualidade" como "nota acima de 4.5 e mais de 10 serviços concluídos"; no código (`apps/web/src/app/oficinas/[id]/page.tsx`) o selo aparece com nota **≥ 4** e não exige nenhum mínimo de serviços concluídos.
   - Seção 3 descreve "Resposta Rápida" como responder "em menos de 1 hora"; o código usa **menos de 2 horas de tempo médio histórico** de resposta, não da solicitação específica do cliente.
   - Seção 3 descreve o selo "Ajuste de Preço" como indicando que a oficina "está disposta a negociar"; na prática é a **variação percentual média** entre orçamento original e revisado (pode ser pra cima ou pra baixo).
   - Seção 5 descreve etapas de manutenção como "desmontagem, reparo, pintura, montagem, controle de qualidade"; os status reais (`STATUS_MANUTENCAO` em `packages/shared/constants/index.ts`, usados em `/cliente/acompanhamento/[id]`) são: recebido, diagnóstico, aguardando peças, em execução, pausas (cliente/peças/geral), teste final, concluído, entregue.
   - Seção 5 menciona um menu "Meus Serviços" no painel — não foi encontrada nenhuma referência a esse rótulo de menu no código lido.
8. **Compressão de imagem inconsistente entre fluxos** — o fluxo de emergência (`apps/web/src/app/emergencia/page.tsx` e `emergencia/acidente/[id]/page.tsx`) comprime as fotos no navegador antes do upload (`compressImage`), mas o fluxo normal de nova solicitação (`apps/web/src/app/cliente/nova-solicitacao/page.tsx`, função `handlePhotoUpload`) **não** comprime — sobe o arquivo original direto para o Storage.
9. **Exclusão de veículo sem confirmação** — `apps/web/src/app/cliente/veiculos/page.tsx`, `handleDelete`: clicar no ícone de lixeira remove o veículo imediatamente, sem `window.confirm` (diferente de outras ações destrutivas do app, como cancelar solicitação ou recusar orçamento, que pedem confirmação).
10. **Horário de funcionamento hardcoded no perfil público da oficina** — `apps/web/src/app/oficinas/[id]/page.tsx`: o bloco "Horário de funcionamento" mostra sempre o mesmo texto fixo (Seg-Sex 08h-18h, Sáb 08h-12h, Dom fechado) para todas as oficinas, não vem de nenhum campo do banco de dados.
11. **Notificações de emergência de acidente não distinguem não lidas** — em `/cliente/mensagens` (`apps/web/src/app/cliente/mensagens/page.tsx`), o contador `nao_lidas` para conversas de emergência (`emergencia_mensagens`) está sempre hardcoded em `0`, porque a tabela não guarda uma flag "lida" por usuário — diferente das conversas com oficina, que rastreiam leitura de verdade.
12. **`STATUS_SOLICITACAO` (constantes compartilhadas) não inclui `no_show`** — `packages/shared/constants/index.ts`: o objeto `STATUS_SOLICITACAO` mapeia todos os status exceto `no_show`, mesmo esse sendo um valor válido do tipo `StatusSolicitacao` e sendo de fato usado (`registrar-no-show`). Na prática o app não quebra porque a UI usa as funções equivalentes em `apps/web/src/lib/utils.ts` (que incluem `no_show`), mas as duas fontes de verdade de status divergem entre si.
