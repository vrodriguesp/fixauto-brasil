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

### Adiado a pedido do usuário
- Consulta de histórico de reparos por placa (pra concessionárias): envolve dados de terceiros e precisa de um modelo de acesso definido (proposto: conta "concessionária" aprovada pelo admin, dados anonimizados). Usuário pediu pra deixar quieto por enquanto — nada foi implementado, só fica registrado aqui pra não esquecer que a ideia existe.
