# Progresso — 08/09/2026

Log passo a passo do que foi feito nesta sessão, para retomar caso algo interrompa (ex: reinício do PC). Cada item marcado ao ser concluído.

## Tarefas pedidas
1. [x] Melhorar layout do header/menu da área da oficina (estava "espremido")
2. [x] Investigar e corrigir erro ao clicar em "Configurar perfil" a partir da página de Capacidade e Produtividade
3. [x] Testar tudo no navegador (produção, conta real "Oficina Bona")
4. [x] Deploy na VM (git pull + build + restart PM2)
5. [x] Criar documento detalhado explicando tudo que foi implementado na sessão anterior (retenção de oficinas, fases 1-5, etc.) → `docs/NOVIDADES_RETENCAO_OFICINAS.md`

**Commit**: `d1a0f10` — já commitado, enviado ao GitHub (`git push`) e implantado na VM (build + `pm2 restart fixauto-brasil`), confirmado rodando em produção.

## Passo a passo

### 1. Bug do "Configurar perfil" (RESOLVIDO)
- **Causa raiz**: em `apps/web/src/app/oficina/perfil/page.tsx`, o hook `const [copied, setCopied] = useState(false)` estava declarado **depois** de um `return` condicional (`if (loading || !user) return (...)`). Isso viola as Rules of Hooks do React (hooks não podem ser condicionais) — no primeiro render (`loading=true`) esse hook não era chamado, mas assim que os dados carregavam e `loading` virava `false`, o número de hooks mudava entre renders, e o React lança um erro fatal ("Rendered more hooks than during the previous render"), quebrando a página.
- **Correção**: movido o `useState(false)` do `copied` para junto dos outros `useState` no topo do componente (antes de qualquer `return`). A variável `publicUrl` (que usa `window.location.origin`) continua calculada depois do `return` de loading, só que agora é uma constante normal (não hook), então não tem problema — só adicionei uma guarda `typeof window !== 'undefined'` por segurança.
- Arquivo alterado: `apps/web/src/app/oficina/perfil/page.tsx`

### 2. Layout do header/navbar da oficina (RESOLVIDO)
- **Causa raiz**: o menu desktop da oficina tinha 10 itens de topo (Dashboard, Solicitações, Oficina, Agenda, Capacidade, Peças, Equipe, Comissão, Avaliações, Perfil) espremidos dentro do container `max-w-7xl`, mais logo e bloco de perfil/sair — não cabia confortavelmente em telas de notebook (~1280-1440px).
- **Correção** (`apps/web/src/components/layout/Navbar.tsx`):
  - Itens menos usados (Capacidade, Peças, Equipe, Comissão, Avaliações) agrupados num dropdown "Mais ▾" — reduz de 10 para 6 itens visíveis no topo (Dashboard, Solicitações, Oficina, Agenda, Mais, Perfil). Padrão comum em SaaS (GitHub, Stripe) para overflow de navegação.
  - Dropdown fecha ao clicar fora, ao apertar Esc, ou ao navegar (acessível via `aria-expanded`).
  - Adicionado **destaque visual do link ativo** (fundo/texto na cor primária) em `NavLink`, `MobileNavLink` e no dropdown — usando `usePathname()` — melhoria de usabilidade geral que faltava em todo o navbar (cliente, admin, loja também se beneficiam).
  - Menu mobile (hambúrguer) não foi alterado — já lista tudo verticalmente, sem problema de espaço.
- Build (`npm run build`) e `tsc --noEmit` passaram sem erros.

### 3. Testes no navegador (CONCLUÍDO)
- Testado direto em produção (`https://www.bipfix.com`), usando a conta já logada da oficina real "Bona Car Repair" no Chrome do usuário (nenhum dado foi alterado, apenas navegação e cliques de leitura/abrir menus).
- Confirmado: menu com dropdown "Mais" abre/fecha corretamente, item ativo fica destacado, `/oficina/capacidade` → clicar em "Perfil" no texto → `/oficina/perfil` carrega sem erro, botão "Compartilhar" (usa o hook corrigido) não quebra a página. Console do navegador sem erros.

### 4. Deploy na VM (CONCLUÍDO)
- `git push origin master` (commit `d1a0f10`) → na VM: `git pull`, `npm run build` (passou sem erros) e `pm2 restart fixauto-brasil`. Confirmado processo online e servindo a versão nova.

### 5. Documento de novidades implementadas (CONCLUÍDO)
- Criado `docs/NOVIDADES_RETENCAO_OFICINAS.md` com a explicação detalhada de tudo que foi implementado na feature de retenção de oficinas (fases 1-5).

---

## Rodada 2 (mesmo dia, continuação): expansão do portal de peças

Pedido do usuário: comissão sobre venda de peças (começando em 3%, variando por critério de resposta rápida como na comissão de serviço), canal de chat entre oficina e fornecedor de peça (texto + foto), oficinas também poderem se cadastrar como fornecedoras de peças (vendendo excedente, roteado por proximidade), gestão de capacidade por funcionário (não só da oficina como um todo), e uma visão admin de rastreabilidade do portal de peças (quem está ativo, último login). A funcionalidade de consulta de reparos por placa (concessionária) foi **explicitamente adiada a pedido do usuário** — não foi implementada.

**Decisão de arquitetura**: generalizei "fornecedor de peça" pra ser `loja_pecas` OU `oficina` desde a migration (campo `fornecedor_tipo` + `oficina_fornecedora_id` nullable ao lado do `loja_id` que já existia), em vez de duplicar tabelas/lógica pra cada caso. Portal criado ontem, sem dados reais em produção ainda, então era o momento certo pra isso — teria sido bem mais caro depois.

### Tarefas
1. [x] Migration 018: `oficinas.vende_pecas`, generalização fornecedor (loja/oficina) em `cotacoes_pecas_respostas`/`pedidos_pecas`, tabelas `comissao_pecas_config`/`comissao_pecas_lancamento`, tabela `cotacoes_pecas_mensagens` (chat), `funcionarios.capacidade_maxima`.
2. [x] `lib/comissao-pecas.ts` — cálculo da taxa (base 3%, mín 1%, máx 3%, bônus por resposta rápida + volume/fidelidade), espelhando `lib/comissao.ts`.
3. [x] `/api/marcar-pedido-peca-entregue` — rota server-side que marca entregue + lança comissão (evita o mesmo bug de RLS já visto 2x antes).
4. [x] Chat de peças: componente `ChatCotacaoPeca` (texto + foto, realtime) + páginas `/oficina/pecas/conversa/[respostaId]` e `/loja/conversa/[respostaId]`.
5. [x] Oficina como fornecedora: aba "Vender excedente" em `/oficina/pecas` — toggle `vende_pecas`, lista cotações de oficinas vizinhas filtradas por `raio_atendimento_km` (reaproveitado, sem campo novo), responde, vê seus pedidos como fornecedora, comissão. `/api/notificar-fornecedores-cotacao-peca` avisa oficinas vizinhas quando uma nova cotação é aberta (lojas continuam no modelo pull, sem mudança).
6. [x] Capacidade por funcionário: `funcionarios.capacidade_maxima` (editável em Equipe) + seção nova em `/oficina/capacidade` mostrando carga atual x limite por mecânico (`calcularCargaPorFuncionario`).
7. [x] Admin: página `/admin/pecas` + rota `/api/admin/pecas-fornecedores` — lista lojas e oficinas-fornecedoras com status ativo/inativo e **último login** (via `supabaseAdmin.auth.admin.listUsers()`, já que isso não fica em `profiles`), mais contadores de uso real do canal (cotações, pedidos, comissão pendente/paga) pra decidir se o canal compensa.
8. [x] `npm run build` e `tsc --noEmit` passaram sem erros.
9. [x] Aplicar migration 018 no Postgres self-hosted da VM (rodou sem erros, tabelas/colunas confirmadas).
10. [x] Deploy na VM (git pull + build + restart PM2) — commit `2ce495a` rodando em produção.
11. [x] Testar fluxo completo no navegador (produção, conta real "Oficina Bona"): tab Comprar/Vender, toggle vende_pecas, chat (mensagem enviada e recebida em tempo real), capacidade por funcionário (editado em Equipe, refletiu em Capacidade), `/api/admin/pecas-fornecedores` validado via curl direto na VM (retornou dados reais: 1 loja, 2 cotações, 1 pedido confirmado). Sem erros no console em nenhuma tela.
12. [x] Documento detalhado em `docs/NOVIDADES_PORTAL_PECAS_V2.md`.

**Nota de segurança pré-existente (RESOLVIDA no mesmo dia, commit `e69e213`)**: as 5 rotas `/api/admin/*` (`usuarios`, `comissao`, `metricas`, `monitoramento`, `pecas-fornecedores`) não validavam sessão/role no servidor — o `middleware.ts` só protege páginas (`matcher` não cobre `/api/*`), então qualquer um na internet, sem login nenhum, conseguia chamar essas rotas direto. Duas eram graves de verdade: `DELETE /api/admin/usuarios` apagava qualquer conta só com `{id}` no corpo, e `PATCH /api/admin/comissao` deixava mudar a taxa de qualquer oficina. Corrigido com um helper novo `lib/admin-auth.ts` (`requireAdmin()`, mesmo padrão de leitura de sessão do `middleware.ts`), aplicado no topo de todas as 5 rotas. Testado em produção: `curl` sem login agora recebe `401 {"error":"Não autenticado"}` em ambas (leitura e a rota destrutiva).

---

## Rodada 3 (mesmo dia): varredura completa + auditoria de segurança

Pedido do usuário: dividir em agentes e testar massivamente todas as funcionalidades do site, documentando tudo em detalhe como material-base para um futuro "portal educativo" para oficinas e lojas de peças (próximo passo do projeto, ainda não construído).

**Ressalva técnica explicada ao usuário**: as ferramentas de navegador compartilham a mesma sessão/cookies do Chrome real — agentes em paralelo clicando na UI simultaneamente derrubariam a sessão uns dos outros (login de um desloga o outro). Por isso os 4 agentes trabalharam só por leitura de código (sem tocar no navegador, sem editar nada), e a validação ao vivo ficou comigo, sequencial, depois.

### Tarefas
1. [x] 4 agentes em paralelo, cada um documentando uma área a fundo: `docs/sandbox/CLIENTE.md`, `OFICINA.md`, `LOJA_PECAS.md`, `ADMIN.md` (+ `docs/sandbox/README.md` como índice e backlog consolidado).
2. [x] O agente do Admin também fez uma auditoria de segurança de toda a superfície de API (25 rotas) — `docs/AUDITORIA_SEGURANCA_API_2026-09-08.md`.
3. [x] Corrigidas todas as vulnerabilidades críticas/médias encontradas (mesmo padrão do bug admin da rodada 2, espalhado por rotas normais): `/api/funcionarios` (POST/PATCH/DELETE), `/api/confirmar-entrega`, `/api/aceitar-orcamento`, `/api/marcar-pedido-peca-entregue`, `/api/registrar-no-show`, `/api/marcar-cotacao-respondida`, `/api/notificar-orcamento`, `/api/comissao-atual`. Novo helper `lib/api-auth.ts`.
4. [x] Corrigidos 2 bugs que eu mesmo introduzi na rodada 2, achados por dois agentes independentes: policy de UPDATE de `cotacoes_pecas_mensagens` estava `USING (true)` (migration 019), e o raio de notificação de fornecedores usava 50km fixo em vez do raio de cada oficina.
5. [x] `npm run build` e `tsc --noEmit` sem erros. Migration 019 aplicada na VM. Deploy feito (commit `f2729d2`). Testado em produção: rotas corrigidas recusam chamada sem login (`401`), e o dono legítimo (conta "Oficina Bona") continua conseguindo usar normalmente (testado editando funcionário via `/oficina/equipe`).
6. [ ] Itens de menor severidade da auditoria (rotas de broadcast/emergência sem rate limit, custo de API paga sem checagem) ficaram documentados como pendentes — precisam de rate limiting, não só checagem de dono, e foram deixados pra uma rodada dedicada.
7. [ ] Backlog de bugs funcionais/UX (não-segurança) de cada área consolidado em `docs/sandbox/README.md`, aguardando priorização do usuário.

---

## Rodada 4 (mesmo dia): portal educativo (sandbox) construído

Pedido do usuário: construir de fato o portal educativo pra oficinas e lojas de peças, dividido por funcionalidade, com casos guiados e autônomos, simples e rápido.

### O que foi construído
- `/oficina/aprender` e `/loja/aprender` — tutorial real dentro do site (não um mockup separado), reaproveitando o levantamento de `docs/sandbox/OFICINA.md` e `LOJA_PECAS.md`.
- Componente `TutorialHub.tsx`: sidebar de módulos + barra de progresso, cada módulo com toggle **Guiado** (passo a passo clicável) / **Autônomo** (só o desafio, sem entregar a resposta), e um botão **"Já fiz — verificar"** que confere de verdade no banco (via RLS existente, sem rota nova) se a ação foi concluída — ex: tem especialidade marcada, enviou orçamento, fez check-in, cadastrou catálogo, respondeu cotação, marcou pedido entregue.
- Progresso salvo em `localStorage` (por navegador/dispositivo, não sincroniza entre aparelhos — decisão consciente pra manter simples; pode virar tabela no banco depois se quiserem ver conclusão no admin).
- Banner dispensável nos dashboards (`TutorialBanner.tsx`) + link no menu ("Mais" da oficina, direto na loja) pra descoberta.
- **Decisão sobre GIFs/vídeos**: em vez de gravar telas reais (frágil — depende de dados existirem na conta de teste, cria efeitos colaterais em conta de produção), optei por passo a passo textual claro por módulo. Testado ao vivo e funcionando; GIFs de fluxos específicos podem ser adicionados depois como reforço visual se fizer falta na prática.
- De brinde: corrigido bug do dashboard da loja (card "Pedidos confirmados" contava qualquer status).

### Testado em produção (conta real "Oficina Bona")
- Banner aparece no dashboard e leva ao tutorial.
- Toggle Guiado/Autônomo funciona.
- "Já fiz — verificar" detectou corretamente que a oficina já tinha especialidade marcada e já tinha enviado orçamento (2/6 módulos concluídos automaticamente, sem eu fingir nada).
- Progresso persiste depois de recarregar a página.
- Sem erros no console.

Commit `e2d08a4`, migration não necessária (só leitura via RLS existente), build e deploy feitos.

---

## Rodada 5 (mesmo dia): mecânico com formação/agenda própria + bug do cliente sem veículo

Feedback do usuário: (1) mecânico não tinha o menu "Aprender"; (2) mecânico deveria ter formação só da parte dele, não a do dono; (3) mecânico também não tinha uma "agenda" própria com os carros designados a ele; (4) bug real: cliente sem veículo cadastrado, ao tentar criar uma nova solicitação, era mandado pra tela de veículos e ficava travado lá, sem voltar pro fluxo.

### O que foi feito
1. [x] Link "Aprender" adicionado ao menu do mecânico (antes só tinha "Oficina").
2. [x] `/oficina/aprender` agora detecta `isMecanico` e mostra uma trilha própria e curta (Meus Veículos + Minha Agenda), sem os módulos do dono (Perfil, Comissão, Equipe, Peças) que não fazem sentido pro papel dele.
3. [x] `/oficina/agenda` ganhou consciência de mecânico: título vira "Minha Agenda", eventos filtrados só pros dele (mesma lógica de "Meus Veículos"), check-in de um clique (sem dropdown pra atribuir outro mecânico), e as ações administrativas (+Evento, Editar/Excluir evento externo, Entrega, Marcar Falta) ficam escondidas pra ele — mesma restrição de privilégio mínimo que já existia em Veículos em Serviço. Nav do mecânico ganhou o link "Agenda".
4. [x] **Bug corrigido**: `/cliente/nova-solicitacao`, passo 1, quando o cliente não tem veículo — antes linkava pra `/cliente/veiculos?add=true` (saía do fluxo e não voltava). Agora o cadastro de veículo acontece inline no próprio passo 1 (mesmo componente de busca FIPE), sem sair da página — ao salvar, o veículo novo já fica selecionado e o cliente segue direto. Também disponível pra quem já tem carro ("+ Cadastrar outro veículo").
5. [x] `npm run build`/`tsc` sem erros, deploy feito (commits `972ef68` e `dfe9927`).

**Nota**: durante o teste ao vivo da rodada 5, percebi que o navegador compartilhado (mesma sessão/cookies do Chrome real do usuário) mudou de conta no meio do teste (provavelmente o usuário testando em paralelo) — parei o teste na hora pra não interferir, sem completar a verificação visual do lado do mecânico. A lógica foi validada por revisão de código (mesmo padrão já comprovado em Veículos em Serviço) mas vale um teste visual dedicado depois.

---

## Rodada 6 (mesmo dia): distribuição de trabalho antecipada + notificação de carro pronto por e-mail/WhatsApp

Pedido do usuário: (1) poder designar o responsável por um veículo antes dele chegar, numa "vista bem interessante" pra gestão de trabalho entre a equipe; (2) quando o serviço termina, o cliente tem que ser avisado que o carro está pronto pra retirada.

### O que foi feito
1. [x] **Notificação de carro pronto reforçada**: já existia uma notificação in-app (`/api/confirmar-entrega`), mas só isso — agora também dispara e-mail e WhatsApp pro cliente (novo `sendServicoConcluidoEmail`/`sendServicoConcluidoWhatsApp` em `lib/notifications.ts`, mesmo padrão já usado pra "novo orçamento").
2. [x] **Nova tela `/oficina/distribuicao`** ("Distribuição de Trabalho"): quadro com uma coluna por funcionário ativo + uma coluna "Não atribuído", mostrando veículos agendados (inclusive os que ainda não chegaram) e em serviço, com indicador de carga/limite por mecânico e um seletor em cada card pra mudar o responsável na hora, sem sair da tela. Não precisou de migration — reaproveita `agenda.funcionario_id` que já existia.
3. [x] Link adicionado ao menu (Mais → Distribuição de Trabalho) e cross-link a partir de `/oficina/capacidade`.
4. [x] Módulo novo adicionado ao tutorial (`/oficina/aprender`), com verificação real (checa se algum evento de agenda já tem `funcionario_id` preenchido).
5. [x] `docs/sandbox/OFICINA.md` atualizado com a nova seção 8.1 e a nota sobre a notificação reforçada.
6. [x] `npm run build`/`tsc` sem erros.
7. [x] Deploy feito (commit `e4b144b`), testado ao vivo em produção — página renderiza corretamente, sem erros no console. **Nota**: notificação por e-mail está ativa na VM (RESEND_API_KEY configurado); WhatsApp ainda não (TWILIO_ACCOUNT_SID não configurado na VM) — mesma limitação que já existia pra notificação de "novo orçamento", não é regressão desta rodada.

---

## Rodada 7 (mesmo dia): preenchimento automático de endereço por CEP

Pedido do usuário: otimizar os campos de endereço/CEP/rua pra evitar erro de digitação.

### O que foi feito
1. [x] Novo `lib/cep.ts` usando a **API pública do ViaCEP** (gratuita, sem chave, sem CORS) — usuário digita só o CEP (com máscara automática `00000-000`) e rua/cidade/estado são preenchidos sozinhos.
2. [x] Aplicado em 4 lugares: cadastro de oficina, cadastro de loja de peças (campos compartilhados no formulário — unificados numa função só, `renderEnderecoFields`), `/oficina/perfil`, `/loja/perfil`.
3. [x] De brinde, corrigida a inconsistência que a auditoria de hoje achou (bug #8 de `LOJA_PECAS.md`): Estado era texto livre no cadastro mas `<select>` fechado no perfil — agora é `<select>` nos dois lugares, e sempre correto porque vem do CEP.
4. [x] Validado o formato de resposta da API ViaCEP direto via curl (CEP válido e inválido) — bate exatamente com o que o código espera.
5. [x] `npm run build`/`tsc` sem erros, deploy feito (commit `58a9b1d`).
6. [ ] Teste visual ao vivo não foi possível (sessão do navegador compartilhado estava logada como o mecânico Marcio, e o cadastro é uma página pública que desloga sessão ativa — não quis me deslogar da sua sessão pra testar). Validado por: build limpo + verificação direta da API + revisão de código.

**Não fiz** (fora do pedido, mas relacionado): as coordenadas de latitude/longitude continuam fixas em São Paulo em alguns fluxos (bug já documentado em `docs/sandbox/CLIENTE.md` e `LOJA_PECAS.md`) — corrigir isso de verdade precisaria de geocodificação (Nominatim/Google Maps), escopo maior que "evitar erro de digitação".

---

## Rodada 8 (mesmo dia): notas internas por veículo + sino de notificações (e bug crítico de RLS achado no caminho)

Pedido do usuário: comunicação interna entre mecânico e administrativo, sempre ligada a um veículo específico — ou pelo menos uma nota que não vá pro cliente. Melhorar a ideia e implementar, com notificação real na tela das pessoas.

### Melhoria sobre o pedido original
Em vez de só "uma nota" (sem resposta), implementei uma **thread de mensagens** por veículo — permite ida e volta entre mecânico e dono, não só uma anotação estática. Mesmo padrão de chat já usado no portal de peças (`ChatCotacaoPeca`), mas simplificado (só texto, sem foto) porque o pedido era mais leve.

### Descoberta importante no caminho
Pra fazer a notificação "chegar na tela das pessoas" de verdade, teria que inserir na tabela `notificacoes` — e ao investigar isso, descobri que **a tabela nunca teve permissão de INSERT nas migrations numeradas** (só existia num arquivo antigo não usado). Ou seja, **7+ fluxos diferentes já existentes** (novo orçamento, nova solicitação, cotação de peça respondida, check-in manual, nova mensagem, pedido de peça confirmado, avaliação) estavam silenciosamente falhando ao tentar notificar em produção. Além disso, **oficina e loja nunca tiveram nenhuma interface pra ver notificação nenhuma** (só o cliente tinha uma lista solta no dashboard, com um link morto pra `/cliente/notificacoes` que nem existe).

### O que foi feito
1. [x] Migration 020: policy `notificacoes_insert` (corrige o bug de 7+ fluxos quebrados) + nova tabela `veiculo_notas_internas` (RLS: visível/gravável só pela equipe da oficina — dono ou funcionário ativo — nunca pelo cliente).
2. [x] Componente `NotasInternas.tsx`: thread de mensagens por veículo, tempo real, dentro do card expandido de `/oficina/veiculos-em-servico`. Ao enviar, notifica automaticamente o dono e o mecânico responsável (quem não for o remetente).
3. [x] Componente `NotificationBell.tsx`: sino no Navbar (agora visível pra **qualquer** usuário logado — oficina, loja, cliente, admin), com contador de não lidas, dropdown, marcar como lida, e navegação pro contexto certo ao clicar.
4. [x] Módulos novos no tutorial (`/oficina/aprender`), tanto na trilha do dono quanto na do mecânico, com verificação real.
5. [x] `docs/sandbox/OFICINA.md` atualizado (seções 0.3 e 4.1).
6. [x] `npm run build`/`tsc` sem erros. Migration aplicada na VM (policy confirmada via `pg_policies`). Deploy feito (commit `7bde071`).
7. [x] Testado ao vivo em produção (conta real, mecânico "Marcio"): sino aparece, nota enviada e exibida em tempo real, notificação real confirmada no banco pro dono (`select * from notificacoes where tipo='nota_interna_veiculo'` retornou a linha esperada) — prova que o fix do RLS funcionou de verdade, não só na teoria.

---

## Rodada 9 (mesmo dia): crash pós-login causado pelo sino de notificações (rodada 8)

Usuário reportou "Application error: a client-side exception has occurred" ao tentar logar com uma conta cliente de teste ("tadey"). Investigação inicial (logs de servidor, `app_errors`) não achou nada — erro de render não passa pelo `ErrorReporter` (limitação já documentada). Testei o fluxo de nova-solicitação a fundo sem reproduzir; o usuário então informou que era especificamente no login, e colou o erro exato do console assim que apareceu de novo:

```
Error: cannot add `postgres_changes` callbacks for realtime:notificacoes after `subscribe()`.
```

### Causa raiz
Bug que eu mesmo introduzi na rodada 8: `useNotificacoes()` cria um canal Supabase Realtime com nome fixo (`'notificacoes'`). Até hoje só era usado em um lugar (`cliente/dashboard`). Ao adicionar o sino global (`NotificationBell`, montado sempre via `Navbar`), o hook passou a rodar em duas instâncias ao mesmo tempo pro mesmo usuário — a segunda tentativa de `.on(...)` num canal com nome já inscrito pela primeira lança um erro **síncrono**, que o React captura como exceção de render e derruba a página inteira. Como o Navbar (e portanto o sino) já aparece na tela de redirect pós-login, **todo cliente que logasse via essa tela quebrava a página na hora**.

### Correção
`use-notificacoes.ts`: nome do canal agora é único por instância (`useRef` com sufixo aleatório), já que múltiplas instâncias simultâneas do hook passaram a ser esperadas.

### O que foi feito
1. [x] Causa raiz confirmada pelo erro de console colado pelo usuário.
2. [x] Fix aplicado, `npm run build`/`tsc` sem erros.
3. [x] Deploy feito (commit `60b9a17`).
4. [ ] Aguardando confirmação do usuário de que o login com "tadey" funciona agora.

**Lição para não repetir**: ao reutilizar um hook que já existia em produção (como `useNotificacoes`) num componente novo montado globalmente (como um item de `Navbar`), verificar se ele assume implicitamente ser a única instância ativa (nomes de canal/recursos fixos) antes de multiplicar onde ele roda.

### Adiado a pedido do usuário
- Consulta de histórico de reparos por placa (pra concessionárias): envolve dados de terceiros e precisa de um modelo de acesso definido (proposto: conta "concessionária" aprovada pelo admin, dados anonimizados). Usuário pediu pra deixar quieto por enquanto — nada foi implementado, só fica registrado aqui pra não esquecer que a ideia existe.

---

## Rodada 10 (mesmo dia): erro de layout raiz não era monitorado

Depois de resolver o crash da Rodada 9, o usuário fez uma pergunta legítima: "este erro tem que ser sempre monitorado, como tinha no console e vc nao sabia nada?". Ele está certo — o `ErrorReporter.tsx` (montado no layout raiz) só escuta `window.onerror`/`unhandledrejection`, que **não disparam** quando o React intercepta um erro de render/effect com um Error Boundary — exatamente o que produz a tela "Application error: a client-side exception has occurred". Ou seja, o pipeline de monitoramento (`/api/log-error` → `app_errors` → `/admin/monitoramento`) já existia, mas tinha um buraco estrutural: esse tipo específico de erro nunca chegava lá.

### O que foi feito
1. [x] `lib/report-client-error.ts`: função compartilhada (`sendBeacon` com fallback `fetch keepalive`) extraída do `ErrorReporter`, reaproveitável pelos error boundaries do Next.js.
2. [x] `app/error.tsx` (novo): Error Boundary de página/rota — captura, reporta via `reportClientError`, mostra fallback com "Tentar novamente" e "Ir para o início".
3. [x] `app/global-error.tsx` (novo): Error Boundary do **layout raiz** — cobre exatamente a categoria de erro que causou o crash da Rodada 9 (erro dentro do Navbar/AuthProvider, fora do alcance de um `error.tsx` de página). Precisa renderizar seu próprio `<html>/<body>`.
4. [x] `npm run build`/`tsc` sem erros.

**Lição**: o `ErrorReporter` (window.onerror) e os Error Boundaries do Next.js (`error.tsx`/`global-error.tsx`) cobrem categorias de erro diferentes e complementares — um crash "Application error" só é pego pelos boundaries, nunca pelo listener global. Os dois precisam coexistir para o `/admin/monitoramento` ter cobertura completa.

---

## Rodada 11 (2026-09-08): pivô para aquisição — SEO, Termos/Privacidade e pesquisa de cidade-piloto

Usuário decidiu pausar features de produto e focar em três frentes de negócio: (1) SEO para a plataforma ser encontrada por oficinas buscando sistema de gestão/visibilidade, (2) Termos de Uso e Política de Privacidade formais entre BipFix, parceiros e clientes, (3) análise com dados reais para escolher uma cidade-piloto e estratégia de lançamento local.

*(Feature de chat pré-orçamento entre lojas/oficinas fornecedoras e a oficina compradora ficou pausada no meio, sem commit — `apps/web/src/app/loja/conversa/nova/page.tsx` criada, `loja/cotacoes/page.tsx` com link "Tirar dúvida" adicionado. Falta: réplica do lado oficina (`comprar`/`vender excedente`) e página `/oficina/pecas/conversa/nova`. Retomar quando o usuário voltar a pedir.)*

### 1. SEO para aquisição de oficinas
- Site já tinha uma base de SEO decente (metadata, Open Graph, `sitemap.ts`/`robots.ts`, JSON-LD de `AutoRepair`/`FAQPage` nos perfis públicos de oficina), mas **nenhuma página** era otimizada para a intenção de busca do *dono de oficina* (ex: "sistema de gestão para oficina mecânica", "como conseguir mais clientes oficina mecânica") — a home é 100% focada no motorista.
- [x] Nova página `/para-oficinas` (Server Component, com `metadata` própria): título/descrição/keywords voltados a dono de oficina, seções de dor→solução, "como funciona a visibilidade", transparência sobre comissão (linkando os Termos), FAQ com `FAQPage` JSON-LD e `SoftwareApplication` JSON-LD.
- [x] `sitemap.ts`: adicionadas `/para-oficinas` (prioridade 0.9), `/termos` e `/privacidade`.
- [x] Home (`page.tsx`) e footer: link "Saiba mais →" pra `/para-oficinas` na seção "Para oficinas mecânicas", e links de Termos/Privacidade no rodapé.

### 2. Termos de Uso e Política de Privacidade
- [x] `/termos` (novo): papel de intermediário (não presta o serviço, não é parte no contrato), uso gratuito pro cliente, **política de comissão exatamente como o usuário pediu** — hoje sem cobrança para os parceiros iniciais, direito de cobrar no futuro com **aviso prévio mínimo de 30 dias**, conduta esperada de parceiros, e **desligamento sem aviso prévio** para fraude na comissão, notas baixas reiteradas ou práticas desleais (proporcional à gravidade — infração leve gera aviso e prazo, infração grave gera corte imediato). Referências ao CDC (Lei 8.078/90): direito à informação, garantia legal de 90 dias, responsabilidade do fornecedor, vedação a práticas abusivas, direito de acionar Procon/Judiciário.
- [x] `/privacidade` (novo): LGPD (Lei 13.709/2018) — dados coletados, base legal de cada tratamento, com quem compartilha, retenção (citando Marco Civil da Internet, Lei 12.965/2014, pra logs), direitos do titular (art. 18), contato do encarregado.
- [x] Migration `021_termos_aceite.sql`: `profiles.termos_aceitos_em` + `termos_versao`, pra ter registro de aceite (importante pra exigibilidade das cláusulas de comissão/desligamento).
- [x] `auth-context.tsx`: `signUp` grava `termos_aceitos_em`/`termos_versao` no cadastro.
- [x] `cadastro/page.tsx`: checkbox obrigatório "Li e aceito os Termos de Uso e a Política de Privacidade" antes de criar qualquer conta (cliente, oficina ou loja) — não existia nenhum aceite de termos até agora.
- [ ] **Aviso**: os textos foram escritos com base no CDC/LGPD/Marco Civil, mas **não substituem revisão por advogado** especializado em direito do consumidor/digital antes de operar comercialmente em escala — isso está registrado como aviso no rodapé de ambas as páginas.

### 3. Pesquisa de cidade-piloto (dados reais)
- Disparados 2 agentes de pesquisa em paralelo: (a) dados duros — frota de veículos por cidade, acidentes de trânsito, densidade de oficinas (CNAE 4520-0/01 e /02), renda local, pra um shortlist de cidades médias (200k–1,2M hab.) fora das capitais; (b) penetração digital por região (CETIC.br/IBGE), concorrentes existentes (marketplaces ou softwares de gestão pra oficina), e playbook de go-to-market local (Sindirepa, autopeças, guinchos, seguradoras, custo de mídia paga local).
- [x] Ambos os agentes retornaram. Síntese entregue em `docs/ESTRATEGIA_CIDADE_PILOTO_2026-09-08.md` + artifact interativo (link no próprio doc). **Recomendação: Ribeirão Preto (SP)** como cidade-piloto, com São José do Rio Preto como alternativa; plano de lançamento de 90 dias, orçamento estimado e lacunas de dado a fechar (contato Sindirepa-SP e INFOSIGA SP) documentados lá.

### Status
- [x] Build e `tsc` sem erros com as mudanças de SEO/Termos.
- [x] Deploy feito na VM (`/para-oficinas`, `/termos`, `/privacidade` confirmados no ar via curl, HTTP 200) e migration 021 aplicada no Postgres self-hosted.
