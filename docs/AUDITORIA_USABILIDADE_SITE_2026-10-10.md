# Auditoria de usabilidade e organização do site BipFix — 10/10/2026

> Documento de desenho (sem código). Cobre o site público, a área do motorista (web e app), a área da loja de peças e, de passagem, o admin. O painel da oficina é tratado em `docs/AUDITORIA_PAINEL_OFICINA_2026-10-10.md` (outro auditor); as regras transversais da seção D valem para os dois documentos.
>
> Objetivo do dono: "revisar a organização do site inteiro para melhorar a usabilidade e deixar MUITO fácil para o cliente". Público com pouca prática em computador. Foco do produto: **o motorista recebe orçamentos rápido e escolhe fácil; a oficina responde rápido.** A estrutura de endereços por mercado/idioma (`/ee/et`, `/ee/en`, `/ee/ru`, `/it/it`, `/pt/pt`, `/br/pt`, raiz = escolha de país) está decidida e **não** é redesenhada aqui.

## Como foi feito

Percorri cada jornada como uma pessoa usando o BipFix pela primeira vez, em tela de celular (390 px) e no computador, lendo o código real das páginas:

1. Motorista com carro quebrado: pede orçamentos, compara, aceita, acompanha, avalia.
2. Motorista que acabou de bater (com e sem conta).
3. Loja de peças: responde a um pedido de peça e cuida da encomenda.
4. Visitante decidindo se o BipFix é confiável (home, página pública da oficina).

Para cada passo anotei: a próxima ação é óbvia? quantas escolhas? jargão? entradas duplicadas? becos sem saída? falta de retorno? onde a pessoa se perde? As referências (Uber/Bolt, Booking, Airbnb, Wolt, Treatwell, NN/g, GOV.UK) estão no apêndice.

## Coerência com a auditoria do painel da oficina (`AUDITORIA_PAINEL_OFICINA_2026-10-10.md`)

Os dois documentos foram conferidos um contra o outro. Decisões iguais nos dois (e que devem ser implementadas uma vez só):

| Tema | Decisão comum |
|---|---|
| Palavra para o que o motorista cria | **Pedido** (pt/pt-PT), Request (en), Päring (et), Richiesta (it), Заявка (ru). "Solicitação" some de todo o site e do app. |
| Página após entrar | A tela em que há algo a fazer: oficina → `/oficina/pedidos`; motorista → `/cliente` (Início com cartão de ação); loja → `/loja/pedidos-de-peca`. Nenhum "Dashboard". |
| Menu | 4-5 itens + "Mais"; **barra inferior fixa no celular** (web e app). |
| Situação | sempre **cor + ícone + palavra**; uma única tabela de cores (`components/oficina/quadro-util.ts › COR`, conforme o outro documento) alimenta `getStatusColor`, o `StatusBadge` do motorista e o app. A função que traduz `status + orçamentos + etapas` para a situação do motorista (B6 abaixo) fica em `packages/shared` e usa essa tabela. |
| Confirmações | nunca `window.confirm`/`alert`; confirmação na própria página ou "Desfazer". |
| Redirecionamentos das URLs antigas | mesmo mecanismo do painel da oficina: `page.tsx` antigo com `redirect()` para a rota nova (como `oficina/capacidade/page.tsx`), preservando o prefixo de mercado/idioma. Os 301 de páginas **públicas** renomeadas (`escolher-tipo`) ficam no `middleware.ts`, onde já está a tabela de endereços antigos. |
| Check-in | a oficina usa "Chegou" (botão) e "Chega hoje"; o motorista nunca vê "check-in": vê "Dia de levar o carro". Mesma data, duas frases, cada uma na língua de quem lê. |
| Testes | mesma pasta e estilo (`apps/web/scripts/e2e`, `playwright-core`, contas temporárias apagadas no fim, 6 idiomas, 390 e 1280/1366 px); `site-redirecionamentos.mjs` e `site-varredura.mjs` são compartilhados e recebem as tabelas dos dois documentos. |

Arquivos lidos (principais): `apps/web/src/app/page.tsx`, `app/[locale]/HomeClient.tsx`, `components/layout/{Navbar,SiteFooter,LanguageSwitcher,SugestaoIdioma}.tsx`, `components/Analytics.tsx` (aviso de cookies), `app/[locale]/cliente/*`, `app/[locale]/loja/*`, `app/[locale]/emergencia/page.tsx`, `app/[locale]/oficinas/[id]/*`, `app/[locale]/(auth)/*`, `app/[locale]/docs/*`, `app/[locale]/guias/*`, `app/[locale]/para-oficinas`, `seja-parceiro`, `app/admin/layout.tsx`, `hooks/use-solicitacoes.ts`, `hooks/use-notificacoes.ts`, `lib/utils.ts`, `components/ui/StatusBadge.tsx`, `components/tutorial/*`, `messages/*.json` (6 idiomas), `content/guias/*.json`, `apps/mobile/app/*`, `apps/mobile/components/SolicitacaoCard.tsx`, `apps/mobile/i18n/locales/*.json`, `apps/web/scripts/e2e/*`.

---

## A. Os 15 problemas de maior impacto (em ordem)

Critério de ordem: quantas pessoas atinge x quanto atrapalha o objetivo central (orçamento rápido, escolha fácil, resposta rápida).

### A1. O pedido do motorista está partido em duas páginas, e uma não leva à outra
- **Jornada:** motorista (web), do aceite à entrega.
- **Onde:** `cliente/orcamentos/[id]/page.tsx` (pedido + orçamentos + aceite + avaliação) e `cliente/acompanhamento/[id]/page.tsx` (etapas do conserto). O painel (`cliente/dashboard/page.tsx`, linhas 229-242) mostra dois botões por carro agendado: "Acompanhar" e "Ver detalhes".
- **O que dá errado:** quando o carro está na oficina, a página do pedido mostra só um banner azul "Veículo na oficina" (linha 255) e **não tem link** para o acompanhamento. Quem entra pela notificação ou pelo histórico fica sem o andamento. A pessoa precisa saber que existem duas telas para a mesma coisa. No app, é **uma** tela só (`apps/mobile/app/solicitacao/[id].tsx` já mostra orçamentos, etapas e avaliação juntos).
- **Evidência:** `acompanhamento/[id]` linhas 388-407 tem "Enviar mensagem" + "Ver detalhes"; `orcamentos/[id]` não tem o caminho inverso.

### A2. Sete entradas de menu para o motorista, e o mesmo pedido aparece em três listas diferentes
- **Jornada:** motorista (web), qualquer momento.
- **Onde:** `Navbar.tsx` linhas 111-117 e 232-238: Dashboard, Veículos, Nova Solicitação, Orçamentos, Mensagens, Histórico, Perfil (+ Sair). `cliente/dashboard` lista "abertas" e "agendadas"; `cliente/orcamentos/page.tsx` lista "pedidos que têm orçamento"; `cliente/historico` lista concluídos, cancelados **e** "abertos com orçamento recusado" (linhas 14-21 do trecho lido).
- **O que dá errado:** não existe "meus pedidos". Um pedido com 2 orçamentos aparece no Dashboard (aberta), em Orçamentos e, se um foi recusado, também em Histórico. A pessoa não sabe onde "o pedido dela" mora. "Orçamentos" no menu abre uma lista de pedidos, não de orçamentos. Os dois cartões de estatística "Abertas" e "Orçamentos" do painel apontam para a mesma página (`dashboard/page.tsx` linhas 114 e 136); "Agendadas" não é clicável.
- **Comparação:** o app tem 5 abas (Início, Pedidos, Mensagens, Veículos, Perfil) e funciona. Uber/Bolt: Início, Atividade, Conta.

### A3. Vocabulário instável entre telas, entre web e app e entre idiomas
- **Jornada:** todas.
- **Onde:** `messages/*.json` (namespaces `nav`, `clienteDashboard`, `clienteOrcamentos`, `constants`), `apps/mobile/i18n/locales/*.json`.
- **O que dá errado (exemplos reais):**
  - A mesma coisa é "Solicitação" (pt, menu), "Pedido" (pt-PT, app pt-PT), "Orçamento" (URL `/cliente/orcamentos/[id]` é a página do **pedido**).
  - "Dashboard" aparece literalmente em pt, en e it (`nav.dashboard`); pt-PT diz "Painel", et "Töölaud", ru "Кабинет". Para quem não usa computador, "Dashboard" não quer dizer nada.
  - "Check-in" aparece cru em 5 dos 6 idiomas (`clienteDashboard.checkin`: "Check-in:" em pt, pt-PT, en, et, it). Jargão de hotel/aeroporto; a pessoa quer saber "que dia levo o carro".
  - Status do pedido do ponto de vista errado: `constants.statusSolicitacao.em_orcamento` = "Orçamento Enviado" (quem enviou foi a oficina; para o motorista é "orçamento **recebido**"). "Aberta" não diz nada.
  - "FIPE: R$ ..." e "Valor FIPE" aparecem para carros na Estônia (`cliente/nova-solicitacao` linha 386; `cliente/veiculos` linha 165/201). Tabela brasileira, sem sentido fora do Brasil.
  - Loja: "Cotações" (pt) / "Quotes" (en, igual ao termo do motorista) / "Запросы запчастей" (ru); "Pedidos" na loja são **encomendas** confirmadas, enquanto "Pedidos" no app do motorista são **solicitações**.
- **Impacto:** cada palavra nova é uma pergunta a mais na cabeça de quem tem pouca prática. Isto também confunde os testes automáticos e as traduções.

### A4. Comparar orçamentos é ler cartões gigantes um embaixo do outro, sem resumo
- **Jornada:** motorista, "escolher fácil" (coração do produto).
- **Onde:** `cliente/orcamentos/[id]/page.tsx` linhas 451-793.
- **O que dá errado:** cada orçamento é um cartão com: avatar, nome (link), selo de seguradora, garantia, link "Ver oficina ›" (duplicado com o nome, linhas 485 e 498), link "Mensagem para oficina" (duplicado com o botão do topo, linhas 222 e 503), estrelas, selos de emoji (🏆, 📉/📈), número de revisão, preço, prazo, **três caixas coloridas** (tempo de execução, próximo check-in, datas disponíveis), tabela de itens, observações, validade, e dois botões ("Recusar" e "Aceitar e Agendar"). Em 390 px cada cartão ocupa mais de uma tela. Não há ordenação, não há marcação "mais barato / mais rápido / melhor avaliada", não há visão lado a lado. Com 3 orçamentos a pessoa rola 4 telas para decidir.
- **Comparação:** Booking.com e Treatwell mostram primeiro uma lista compacta (nome, nota, preço, data) e só depois o detalhe. Airbnb destaca "melhor avaliação" e "preço".

### A5. O aceite usa `confirm()` do navegador, recarrega a página e oferece "Recusar" como ação de mesmo peso
- **Jornada:** motorista, aceitar e agendar.
- **Onde:** `cliente/orcamentos/[id]/page.tsx` linhas 72-117 (`confirm(...)`, `window.location.reload()`), 232-239 (cancelar pedido com `confirm`), 761-787 (botões).
- **O que dá errado:** "Recusar" fica ao lado de "Aceitar e Agendar" com o mesmo tamanho. Escolher uma oficina já significa não escolher as outras; recusar uma a uma é trabalho extra. Ao recusar a última, aparece um **segundo** `confirm` perguntando se quer cancelar o pedido. `window.confirm` não é traduzido pelo sistema, não tem botão claro ("OK/Cancelar") e é bloqueado em alguns WebViews/apps. O `reload()` apaga a rolagem e o contexto. Após aceitar, a tela de sucesso só oferece "Voltar ao painel" — não há "Adicionar ao calendário", nem endereço com link para mapa, nem "o que acontece agora".
- **Comparação:** Treatwell/Booking: escolhe o horário em uma folha (bottom sheet), confirma em uma tela com resumo, recebe "adicionar ao calendário" e "como chegar".

### A6. O painel do motorista é uma vitrine de números e blocos, não um "o que eu faço agora"
- **Jornada:** motorista, cada visita.
- **Onde:** `cliente/dashboard/page.tsx`.
- **O que dá errado:** na ordem: saudação + botão "+ Nova Solicitação"; carrossel horizontal de notificações; 4 cartões de números (para um novo usuário: 0, 0, 0, 0); `AvaliacaoPendente`; `GarantiasAtivas`; `AccidenteEnvolvido`; cartões de agendados; lista de abertas; coluna de veículos. Para uma pessoa com um único pedido, a informação que importa ("chegaram 2 orçamentos, compare") fica abaixo de 4 zeros e de um carrossel. Quem nunca pediu nada vê estatísticas vazias antes do botão "Criar primeira solicitação".
- **Comparação:** Uber: uma tela, um campo "Para onde?". Wolt: pedido em andamento fixo no topo com status.

### A7. O pedido novo começa pela parte errada, tem 5 passos e termina longe do pedido
- **Jornada:** motorista, pedir orçamentos.
- **Onde:** `cliente/nova-solicitacao/page.tsx`.
- **O que dá errado:**
  - Passo 1 é "Selecione o veículo" (cadastro de carro com marca/modelo/ano/placa/cor/apelido) antes de a pessoa dizer o que aconteceu. Quem chegou com o carro quebrado quer contar o problema primeiro.
  - Passo 2 "Tipo de serviço" com 7 categorias (Colisão, Funilaria e Pintura, Revisões, Mecânica, Elétrico, Pneu, Outro). "Funilaria e Pintura" e "Revisões" são jargão; a maioria não sabe se um barulho é "Mecânica" ou "Elétrico".
  - Passo 3 muda de natureza conforme o tipo (fotos ou lista de 10-20 checkboxes com `max-h-[400px] overflow-y-auto`, linha 497: lista rolável dentro de página rolável, armadilha no celular).
  - Passo 4 pede texto **e** urgência (3 opções com descrição). Passo 5 pede endereço e mostra resumo.
  - Coordenada padrão é São Paulo (linha 50) e país padrão "BR" (linha 54) se o navegador negar localização e a geocodificação falhar: na Estônia, a moeda das estimativas sai em real.
  - Ao enviar: tela verde "Solicitação enviada!" e **redirecionamento automático em 2 s para o painel** (linha 257), em vez de abrir o pedido com o estado "Aguardando orçamentos". A pessoa perde o pedido de vista logo que o cria.
  - O app faz tudo num formulário só e rolável (`apps/mobile/app/nova-solicitacao.tsx`): melhor, mas com outra ordem (carro primeiro também).
- **Comparação:** GOV.UK "one thing per page" + "check your answers"; Uber pede destino primeiro, carro depois.

### A8. Orçamentos novos não aparecem sozinhos na web: a pessoa tem de recarregar
- **Jornada:** motorista, esperar orçamentos (o momento de maior ansiedade).
- **Onde:** `hooks/use-solicitacoes.ts` (só `fetch` sob demanda, sem `channel`/`subscribe`); `cliente/orcamentos/[id]` usa `window.location.reload()` para refletir mudanças; só `acompanhamento/[id]` (linhas 140-169) e `use-notificacoes.ts` têm tempo real.
- **O que dá errado:** a home promete "acompanhe cada etapa em tempo real". Na prática, quem deixa a página do pedido aberta não vê o orçamento chegar; o sino atualiza (tempo real), mas a lista não. No app o `useAvisos().chegou` dispara recarga (bom); na web não há equivalente nas listas.

### A9. "Acabei de bater" exige foto para avançar e, sem conta, termina num cadastro completo
- **Jornada:** motorista que acabou de bater (sem conta).
- **Onde:** `app/[locale]/emergencia/page.tsx`.
- **O que dá errado:**
  - Botão "Próximo" do passo 1 fica desativado até haver foto (linha 461). À noite, na chuva, com o carro já guinchado ou com a câmera negada, é beco sem saída. A foto deve ser fortemente recomendada, não obrigatória.
  - O passo 1 já pede foto + placa (consulta só para placa brasileira, linha 65; na Estônia nunca encontra, e mostra campo "não encontrada") + descrição + "o que aconteceu" (3 opções). Depois ainda vêm dados pessoais (passo 2) e localização + seguro + resumo (passo 3). Para uma pessoa em choque, é muito.
  - Tela final (linhas 213-257): três blocos — "próximos passos do seguro", "registrar outro veículo", e, sem conta, "Criar minha conta" que leva ao **cadastro completo** (`/cadastro?tipo=cliente`) com confirmação de e-mail. O servidor já criou a conta (`/api/emergencia` cria "conta (se nao estiver logado)", linhas 175-176) — então o cadastro vai responder "conta existente". A promessa "receba orçamentos em minutos" não se cumpre sem um passo claro "defina uma senha / abra o link do e-mail para ver os orçamentos".
- **Comparação:** Bolt/Uber: pedir primeiro, confirmar identidade depois com o mínimo (telefone + código).

### A10. Entrar e cadastrar têm desvios inúteis
- **Jornada:** todos, primeiro acesso.
- **Onde:** `(auth)/login/page.tsx` linha 68 (`router.push('/')` após entrar → `HomeClient` detecta usuário e redireciona ao painel, linhas 24-55, mostrando "Carregando..." no meio); `(auth)/escolher-tipo/page.tsx` (os dois cartões "Sou Motorista" e "Sou Oficina" apontam para o **mesmo** `/login`, linhas 16 e 33); `(auth)/cadastro/page.tsx` sem `?tipo` oferece **três** perfis (Motorista, Oficina, Loja de peças).
- **O que dá errado:** duas navegações e um flash para entrar; uma página que não decide nada; motorista tendo de entender "loja de peças" na tela de criar conta; confirmação de e-mail obrigatória antes do primeiro login (pessoas com pouca prática perdem-se entre o site e o e-mail).

### A11. A home fala mais com oficinas do que com motoristas, e o botão principal leva ao cadastro
- **Jornada:** visitante decidindo se confia.
- **Onde:** `app/[locale]/HomeClient.tsx`.
- **O que dá errado:** sequência: herói (2 botões) → faixa vermelha "Acabei de bater" → "Como funciona" (4 passos) → seção inteira "Para oficinas" com 4 benefícios + "Quero ser parceiro fundador" + "Saiba mais" → "Por que agora" (também para parceiros) → "Chamada para parceiros" (de novo "Quero ser parceiro fundador") → guias → FAQ. O botão "Quero ser parceiro fundador" aparece 3 vezes; o motorista tem 1 botão, que vai para **criar conta** (`/cadastro?tipo=cliente`), não para pedir orçamento. Faltam provas de confiança perto do botão (gratuito para o motorista, oficinas verificadas, quantas oficinas em Tallinn, avaliações reais). A lista pública `/oficinas` só aparece no rodapé quando há oficina ativa (`SiteFooter` linha 44).
- **Comparação:** Airbnb/Booking: a busca é o herói; "anuncie seu espaço" é um link discreto no topo. Wolt: "Entregamos em X" + endereço.

### A12. Status = só cor + texto, com 22 estados diferentes e nomes do ponto de vista do sistema
- **Jornada:** motorista e loja.
- **Onde:** `components/ui/StatusBadge.tsx` (cor + texto, sem ícone), `lib/utils.ts getStatusColor` (azul para "aberta", amarelo para "em_orcamento", roxo para "em_andamento"), `constants.statusSolicitacao` (7), `statusOrcamento` (5), `statusManutencao` (10).
- **O que dá errado:** cores sem significado estável (azul = aberta, mas também = orçamento "enviado"; amarelo = "em orçamento" e também "visualizado"); nenhum ícone (daltonismo, telas pequenas). O motorista não precisa saber que o orçamento foi "visualizado" nem que a oficina está em "pausa_geral". No app os mesmos estados têm **outras** cores (`SolicitacaoCard.tsx`: aberta cinza, aceita âmbar).

### A13. A loja de peças tem 6 menus para um trabalho de duas telas
- **Jornada:** loja responde e entrega.
- **Onde:** `Navbar.tsx` linhas 101-108 (Dashboard, Cotações, Catálogo, Pedidos, Comissão, Aprender + Perfil); `loja/dashboard` (3 números + "como funciona" em lista); `loja/cotacoes` (caixa de entrada real); `loja/pedidos`.
- **O que dá errado:** a loja entra num "Dashboard" com números e precisa clicar em "Cotações" para trabalhar. Na caixa de entrada, depois de responder, não há estado "aguardando a oficina decidir" vs "a oficina escolheu outra" — a resposta fica verde para sempre. "Tirar dúvida" aparece antes de responder e "Conversar" depois (duas palavras para a mesma conversa). Em "Pedidos", "Marcar entregue" é um link de texto pequeno (`loja/pedidos` linha ~96), sem confirmação nem desfazer. "Comissão" e "Aprender" ocupam o menu principal; "Catálogo" é opcional (o próprio tutorial diz `opcional: true`) mas está no menu.

### A14. Mensagens: três portas para a mesma conversa e uma tela intermediária "escolha a oficina"
- **Jornada:** motorista.
- **Onde:** botão "Mensagem para oficina" no topo do pedido (sem `?oficina`, cai na tela "escolherOficinaTitulo" de `cliente/mensagens/[id]` linhas 349-360), link por orçamento (com `?oficina`), botão no acompanhamento, e o menu "Mensagens".
- **O que dá errado:** o botão mais visível é o que leva à tela intermediária. Antes de haver orçamento, "Mensagem para oficina" não tem destinatário (quem é "a oficina"?). Não é bloqueante, mas gera cliques perdidos.

### A15. Página pública da oficina não tem chamada para ação e usa selos em emoji
- **Jornada:** visitante avaliando confiança; motorista comparando.
- **Onde:** `oficinas/[id]/OficinaPerfilClient.tsx` linhas 54-105 (volta para "/", selos "🏆", "⚡", "🔧", "% de ajuste de preço").
- **O que dá errado:** quem chega pelo Google ou pelo link "Ver oficina" do orçamento não tem "Pedir orçamento a esta oficina" nem "Voltar ao meu pedido" (o link "Voltar" vai para a home). "Ajuste médio de preço -3,2 %" é métrica interna, não ajuda a decidir. Emojis variam por sistema (no Windows alguns não renderizam, como já descoberto nas bandeiras).

Outros achados menores (não entram no top 15, mas entram no plano): `cliente/veiculos` e `loja/catalogo` apagam com `confirm()`; o seletor de idioma compacto mostra "BR" para pt e "PT" para pt-PT (códigos de país, embora o menu seja por idioma); a raiz "/" para quem já está logado mostra a escolha de país em vez de levar ao painel; `cliente/notificacoes` duplica o sino; o admin tem a barra lateral própria e o título "Dashboard da Plataforma" fixo em português (coerente, já que o admin é só o dono).

---

## B. Estrutura recomendada por público

Regra geral: **no máximo 5 itens de menu**, nomes iguais no site, no app e nos 6 idiomas (lista de palavras no fim desta seção), **uma** página por objeto (um pedido = uma URL), e a pessoa cai, depois de entrar, na tela em que tem algo a fazer.

### B1. Visitante (site público)

**Barra do topo (deslogado):** logo · [Pedir orçamentos] (botão principal) · Acabei de bater (vermelho, só ícone + texto curto) · Entrar · idioma. "Cadastrar" sai da barra (o cadastro acontece dentro do pedido; ver B2).

**Home (`HomeClient.tsx`), nova ordem:**
1. Herói: título + 1 frase + botão **"Pedir orçamentos"** (leva a `/pedir`, ver B2) + 3 provas em linha: "Grátis para o motorista" · "Oficinas verificadas em Tallinn" · "Você escolhe; nada é cobrado sem o seu OK".
2. Faixa vermelha "Acabei de bater" (manter; já é boa).
3. Como funciona (4 passos; manter, com os nomes da lista de palavras).
4. Oficinas na sua cidade (3 cartões reais de `/oficinas` quando houver; antes disso, esconder a seção).
5. Perguntas frequentes (manter; é lida por buscadores).
6. **Uma** faixa curta "Tem uma oficina ou loja de peças?" → `/para-oficinas`. Remover as seções "Por que agora" e "Chamada para parceiros" da home (mover texto para `/para-oficinas`, que já existe para isso). O botão "Quero ser parceiro fundador" fica só em `/para-oficinas` e `/seja-parceiro`.
7. Guias (manter no fim; é SEO).

**Rodapé:** manter. Trocar "Como funciona" (que aponta para `/docs/cliente`) por "Ajuda para motoristas" e deixar "Como funciona" apontando para a âncora da home.

**Página pública da oficina (`/oficinas/[id]`):** acrescentar no topo, fixo no celular, o botão **"Pedir orçamento a esta oficina"** (abre `/pedir?oficina=<id>`; o pedido vai para todas do raio, mas com a oficina marcada como "você viu esta") e, quando se chega de um pedido (`?de=<pedidoId>`), o link "Voltar ao meu pedido". Selos: trocar emoji por ícone SVG + texto ("Bem avaliada", "Responde rápido"). Remover "ajuste médio de preço" da versão pública (manter no admin).

**Escolha de país (`app/page.tsx`):** manter. Única mudança: se houver sessão, mostrar no topo um cartão "Você já está entrado como {nome} — ir ao meu painel".

**Aviso de cookies:** manter, mas no celular ele não pode cobrir a faixa vermelha "Acabei de bater" nem o botão principal: posição no topo em telas < 640 px, ou atrasar 3 s na página `/emergencia`.

### B2. Motorista — site (área `/cliente`)

**Menu (web, 5 itens; no celular vira barra inferior fixa, igual ao app):**

| Item | Rota | Conteúdo |
|---|---|---|
| Início | `/cliente` | "O que fazer agora" (ver C1) |
| Pedidos | `/cliente/pedidos` | Lista única, abas "Em andamento" / "Concluídos" |
| Mensagens | `/cliente/mensagens` | Lista de conversas |
| Veículos | `/cliente/veiculos` | Igual ao atual |
| Perfil | `/cliente/perfil` | Dados, idioma, notificações, sair, excluir conta |

O botão **"Pedir orçamentos"** não é item de menu: é o botão principal de Início e um "+" flutuante na lista de Pedidos (como "Novo pedido" no Wolt/Uber). O sino continua na barra do topo; `/cliente/notificacoes` continua existindo (é a lista completa do sino).

**Página após entrar:** `/cliente` (Início). Se há exatamente um pedido com ação pendente (orçamentos para comparar, horário para escolher após falta, avaliação), Início abre com esse cartão em primeiro.

**Fusões e remoções:**
- `/cliente/orcamentos/[id]` + `/cliente/acompanhamento/[id]` → **`/cliente/pedidos/[id]`** (uma página, seções por estado; ver C2-C4).
- `/cliente/orcamentos` (lista) + `/cliente/historico` + bloco "abertas" do dashboard → **`/cliente/pedidos`** com duas abas (`?aba=andamento|concluidos`, aba na URL).
- `/cliente/dashboard` → `/cliente` (Início).
- `/cliente/nova-solicitacao` → **`/pedir`** (público; ver "Pedido antes da conta" abaixo) e `/cliente/pedir` (atalho logado).
- `/cliente/reagendar/[id]`: continua, mas acessível só pelo cartão "Faltou / Remarcar" dentro de `/cliente/pedidos/[id]`.
- `(auth)/escolher-tipo`: **remover** (301 para `/login`).
- Cadastro: `/cadastro` passa a ser só de motorista. Oficina e loja entram por `/seja-parceiro` (já existe) → `/cadastro?tipo=oficina|loja_pecas` (link direto continua funcionando, mas sem o seletor de 3 perfis na tela).

**Pedido antes da conta (decisão principal desta auditoria):** o fluxo `/pedir` é público, igual ao `/emergencia`: a pessoa descreve o problema, o carro e o local; **só no último passo** informa nome, e-mail e telefone (ou entra, se já tem conta). O servidor cria a conta como já faz em `/api/emergencia` e envia o link de confirmação; a tela final diz "Pedido enviado. Para ver os orçamentos, abra o link que mandamos para {e-mail}" com botão "Reenviar". Isto é exatamente o que o `/emergencia` já faz; a diferença é só generalizar. (Confirmação de e-mail continua obrigatória: regra atual de segurança; a melhoria de "entrar por link" fica para a Fase 2.)

**Redirecionamentos (área logada: `page.tsx` antigo com `redirect()`, como no painel da oficina; página pública `escolher-tipo`: 301 no `middleware.ts`; sempre preservando o prefixo de mercado/idioma):**

| De | Para |
|---|---|
| `/cliente/dashboard` | `/cliente` |
| `/cliente/orcamentos` | `/cliente/pedidos` |
| `/cliente/orcamentos/[id]` | `/cliente/pedidos/[id]` |
| `/cliente/acompanhamento/[id]` | `/cliente/pedidos/[id]#andamento` |
| `/cliente/historico` | `/cliente/pedidos?aba=concluidos` |
| `/cliente/nova-solicitacao` | `/cliente/pedir` |
| `/escolher-tipo` (e traduções) | `/login` |

Links de notificação (`lib/link-notificacao.ts`) e e-mails passam a usar as rotas novas; os antigos continuam funcionando pelo 301.

### B3. Motorista — app (Expo)

Manter as 5 abas (Início, Pedidos, Mensagens, Veículos, Perfil): o site passa a copiar o app, não o contrário. Mudanças no app (detalhe na seção F):
- Início: mesmo "cartão de ação" de C1 (hoje mostra lista de ativos + avisos; falta o cartão com a próxima ação em destaque).
- `nova-solicitacao`: mesma ordem de perguntas do site (problema → carro → local → confirmar), formulário contínuo como já é.
- `solicitacao/[id]`: já é a tela única; aplicar o cabeçalho de estado de C2 e a comparação compacta.
- Vocabulário: `tabs.solicitacoes` pt "Solicitações" → "Pedidos" (pt-PT já é "Pedidos"); `orcamentos.aceitar` "Aceitar orçamento" → "Escolher esta oficina".

### B4. Loja de peças (área `/loja`)

**Menu (4 itens):**

| Item | Rota | Conteúdo |
|---|---|---|
| Pedidos de peça | `/loja/pedidos-de-peca` | Caixa de entrada (ver C5); abas "Para responder" / "Respondidos" |
| Encomendas | `/loja/encomendas` | Confirmadas pela oficina; "Marcar como entregue" |
| Mensagens | `/loja/mensagens` | Lista das conversas (hoje só se chega pela cotação) |
| Perfil | `/loja/perfil` | Dados da loja, **Catálogo** (seção), **Comissão** (seção), Aprender (link), sair |

**Página após entrar:** `/loja/pedidos-de-peca` (a caixa de entrada). O "dashboard" com 3 números vira o cabeçalho dessa página ("3 para responder · 1 encomenda a entregar").

**Fusões e remoções:** `/loja/dashboard` → caixa de entrada; `/loja/cotacoes` → `/loja/pedidos-de-peca`; `/loja/pedidos` → `/loja/encomendas`; `/loja/catalogo` e `/loja/comissao` continuam como páginas (links a partir do Perfil), saem do menu; `/loja/aprender` continua, acessível pelo Perfil e pelo banner do tutorial. Rotas antigas: `page.tsx` com `redirect()` (mesmo mecanismo da oficina). O nome do menu "Comissão" segue a decisão do painel da oficina (en "Fees", et "Tasud", it "Commissioni", ru "Комиссия"); o Perfil da loja chama-se "Minha loja" (en "My store", et "Minu pood", it "Il mio negozio", ru "Мой магазин", pt-PT "A minha loja"), em paralelo ao "Minha oficina" do outro documento.

### B5. Admin (só o dono) — breve

Está coerente para uso próprio (barra lateral, português fixo). Três ajustes pequenos: (1) o rótulo "Interessados" da barra não bate com a URL `leads-parceiros` nem com o título da página — usar "Interessados (leads)" nos dois; (2) "Comissões" e "Comissões de peças" são duas páginas para a mesma pergunta ("quanto a plataforma tem a receber") — uma página com duas abas; (3) na Navbar do site o admin tem links que não existem na barra lateral do admin e vice-versa (`Navbar.tsx` linhas 68-72 vs `admin/layout.tsx sidebarLinks`) — a Navbar deve mostrar só "Painel admin".

### B6. Lista de palavras (uma palavra por conceito, nos 6 idiomas)

Usar nas mensagens do site (`messages/*.json`), do app (`apps/mobile/i18n/locales/*.json`), nos e-mails e nos textos de ajuda. Onde a coluna "hoje" mostra variação, é o que deve ser unificado.

| Conceito | pt (BR) | pt-PT | en | et | it | ru | Hoje (variações a eliminar) |
|---|---|---|---|---|---|---|---|
| O que o motorista cria | Pedido | Pedido | Request | Päring | Richiesta | Заявка | Solicitação, Nova Solicitação, "orçamentos" na URL |
| O que a oficina envia | Orçamento | Orçamento | Quote | Hinnapakkumine | Preventivo | Смета | ok |
| Ação principal | Pedir orçamentos | Pedir orçamentos | Get quotes | Küsi hinnapakkumisi | Chiedi preventivi | Получить сметы | "Preciso de um reparo", "+ Nova Solicitação", "Criar primeira solicitação" |
| Escolher um orçamento | Escolher esta oficina | Escolher esta oficina | Choose this shop | Vali see töökoda | Scegli questa officina | Выбрать этот автосервис | "Aceitar e Agendar", "Aceitar orçamento" |
| Tela inicial logada | Início | Início | Home | Avaleht | Inizio | Главная | Dashboard, Painel, Töölaud, Кабинет |
| Dia de levar o carro | Dia de levar o carro | Dia de entregar o carro | Drop-off day | Auto toomise päev | Giorno di consegna | День сдачи авто | Check-in (em 5 idiomas) |
| Previsão de pegar o carro | Previsão de retirada | Previsão de levantamento | Pick-up estimate | Eeldatav kättesaamine | Ritiro previsto | Ожидаемая выдача | "Previsão entrega", "Entrega prevista" |
| Acompanhar | Andamento do conserto | Andamento da reparação | Repair progress | Remondi käik | Stato della riparazione | Ход ремонта | "Acompanhamento da Manutenção", "Acompanhar", "Track" |
| Oficina | Oficina | Oficina | Repair shop | Töökoda | Officina | Автосервис | "Workshop", "Shop" (en varia) |
| Loja de peças | Loja de peças | Loja de peças | Parts store | Varuosapood | Negozio di ricambi | Магазин запчастей | "parts supplier", "fornecedor" |
| O que a oficina pede à loja | Pedido de peça | Pedido de peça | Parts request | Varuosa päring | Richiesta di ricambio | Запрос запчасти | Cotação, Quote (igual ao do motorista), Hinnapäring |
| Pedido fechado com a loja | Encomenda | Encomenda | Order | Tellimus | Ordine | Заказ | "Pedidos" (colide com Pedido do motorista) |
| Acidente | Acabei de bater | Acabei de bater | I've just crashed | Sain just avarii | Ho appena avuto un incidente | Я попал в ДТП | "I just crashed" / "I've just crashed" (en varia) |
| Mensagens | Mensagens | Mensagens | Messages | Sõnumid | Messaggi | Сообщения | ok |
| Veículos | Veículos | Veículos | Vehicles | Sõidukid | Veicoli | Автомобили | ok |
| Entrar / Sair | Entrar / Sair | Entrar / Sair | Log in / Log out | Logi sisse / Logi välja | Accedi / Esci | Войти / Выйти | pt-PT "Iniciar sessão/Terminar sessão" (longo demais para a barra; já quebrou o layout) |
| Avaliar | Avaliar a oficina | Avaliar a oficina | Rate the shop | Hinda töökoda | Valuta l'officina | Оценить автосервис | "Avaliar", "rate" |
| Garantia | Garantia | Garantia | Warranty | Garantii | Garanzia | Гарантия | ok |

Palavras **proibidas** nas telas do motorista: Dashboard, Check-in, FIPE (fora do Brasil), Solicitação, Cotação, Revisão (de orçamento — usar "a oficina mudou o preço"), Manutenção (usar "conserto"/"reparação"), Status (usar "Situação" quando precisar de rótulo), "visualizado", "expirado" (usar "venceu").

**Situação do pedido (o que o motorista vê), com ícone + cor fixos:**

| Chave interna (derivada) | pt | en | et | it | ru | pt-PT | Ícone / cor |
|---|---|---|---|---|---|---|---|
| aguardando (aberta/em_orcamento sem orçamento) | Aguardando orçamentos | Waiting for quotes | Ootan hinnapakkumisi | In attesa di preventivi | Ждём сметы | À espera de orçamentos | relógio / cinza |
| recebidos (n orçamentos "enviado/visualizado") | {n} orçamentos para comparar | {n} quotes to compare | {n} hinnapakkumist võrdlemiseks | {n} preventivi da confrontare | {n} смет для сравнения | {n} orçamentos para comparar | lista / azul (**pede ação**) |
| agendado (aceita) | Agendado: {dia} | Booked: {day} | Broneeritud: {day} | Prenotato: {day} | Записано: {day} | Marcado: {day} | calendário / verde |
| na_oficina (em_andamento) | Carro na oficina | Car at the shop | Auto töökojas | Auto in officina | Авто в сервисе | Carro na oficina | chave inglesa / roxo |
| pronto (em_andamento + etapa concluido) | Pronto para retirar | Ready for pick-up | Valmis kättesaamiseks | Pronta per il ritiro | Готов к выдаче | Pronto para levantar | sino / verde (**pede ação**) |
| concluido (concluida) | Concluído | Done | Valmis | Completata | Завершён | Concluído | check / cinza |
| faltou (no_show) | Você não foi: escolha outro dia | Missed: pick a new day | Ei tulnud: vali uus päev | Mancato: scegli un altro giorno | Не пришли: выберите день | Faltou: escolha outro dia | alerta / laranja (**pede ação**) |
| cancelado | Cancelado | Cancelled | Tühistatud | Annullata | Отменена | Cancelado | x / cinza |
| mudou_preco (revisão pendente) | A oficina mudou o preço: responda | Price changed: reply | Hind muutus: vasta | Prezzo cambiato: rispondi | Цена изменилась: ответьте | Preço alterado: responda | alerta / laranja (**pede ação**) |

Os status do banco não mudam; muda só a função que traduz `status + orçamentos + etapas` para uma destas 9 situações (uma função compartilhada em `packages/shared`, usada por web e app).

---

## C. Notas de redesenho das telas principais

Cada tela: **uma** ação principal (botão cheio), ações secundárias em links; estado vazio que diz o que fazer; layout de celular descrito primeiro.

### C1. Início do motorista (`/cliente`, substitui o dashboard)

**Celular (390 px), de cima para baixo:**
1. "Olá, {nome}" + sino.
2. **Cartão de ação** (só um; escolhido nesta ordem de prioridade): (a) avaliação pendente; (b) "a oficina mudou o preço"; (c) "você faltou, escolha outro dia"; (d) "{n} orçamentos para comparar" → botão "Comparar"; (e) "Pronto para retirar" com endereço e telefone; (f) "Carro na oficina: {etapa atual}" → "Ver andamento"; (g) "Agendado: sáb 12/10, 08-12h em {oficina}" → "Ver detalhes" + "Como chegar"; (h) "Aguardando orçamentos (enviado há 20 min)". Esse cartão é o mesmo componente do topo de C2.
3. Dois botões grandes lado a lado: **"Pedir orçamentos"** (azul, principal) e "Acabei de bater" (vermelho). Igual ao app.
4. "Outros pedidos em andamento" (lista compacta: carro, situação, 1 linha) só se houver mais de um.
5. Garantias ativas (bloco existente), compactado em uma linha por garantia.
- **Some:** os 4 cartões de números, o carrossel de notificações (o sino já faz isso), a coluna de veículos (está no menu).
- **Estado vazio (nenhum pedido):** ilustração simples + "Conte o que o carro tem e receba orçamentos de oficinas perto de você. Grátis." + botão "Pedir orçamentos". Nada de zeros.
- **Desktop:** mesma ordem numa coluna de 720 px; não há segunda coluna.

### C2. Página do pedido com comparação de orçamentos (`/cliente/pedidos/[id]`)

Uma página, com cabeçalho fixo de situação e seções que aparecem conforme o estado.

**Cabeçalho (sempre):** carro (apelido ou marca modelo), placa pequena, **situação** (ícone + cor + texto da tabela B6), e uma linha "o que acontece agora" ("As oficinas perto de você estão vendo seu pedido. Costumam responder em algumas horas. Avisamos por e-mail e aqui.").

**Seção "Seu pedido" (recolhida por padrão):** descrição, fotos, endereço, data. Botão "Editar" (já existe `EditarPedido`) e link discreto "Cancelar pedido" (confirmação dentro da página, não `confirm()`).

**Seção "Orçamentos" (estado recebidos):**
- Linha de resumo acima da lista: "3 orçamentos · de 180 € a 260 € · prazos de 1 a 3 dias". Chips de ordenação: "Menor preço" (padrão) · "Melhor avaliada" · "Mais cedo".
- **Lista compacta**, um cartão por orçamento de 3 linhas, na ordem escolhida:
  - linha 1: nome da oficina + estrelas (nota, n avaliações) + selo "Bem avaliada"/"Responde rápido" se houver;
  - linha 2: **preço grande** à direita; à esquerda "Pronto em {n} dias · dia mais cedo: sáb 12/10";
  - linha 3: garantia ({n} dias) · "Ver detalhes" (expande itens, observações, validade, revisão de preço) · "Mensagem".
  - Marcadores automáticos: "Mais barato", "Melhor avaliada", "Mais cedo" (um por cartão, no canto).
  - Botão principal por cartão: **"Escolher esta oficina"** (cheio). Não há botão "Recusar"; dentro de "Ver detalhes" existe o link "Não me interessa" (esconde o cartão, mantém o pedido aberto; não dispara cancelamento).
- Recusados/vencidos ficam num grupo recolhido "Outros (2)" no fim.
- Estado vazio (aguardando): "Ainda sem orçamentos. Enviado há {tempo}. As oficinas costumam responder em até {X} h." + "Enquanto espera: confira as fotos / adicione detalhes" (abre a seção "Seu pedido"). Nada de spinner infinito.
- Quando um orçamento novo chega (tempo real): o cartão entra com destaque amarelo 3 s e o resumo atualiza.

**Seção "Agendamento" (estado agendado):** cartão verde com dia e turno, oficina, endereço com botão "Como chegar" (Google Maps, já existe no perfil público), telefone (`tel:`), **"Adicionar ao calendário"** (arquivo .ics gerado no cliente), "Remarcar" (vai a `/cliente/reagendar/[id]`), "Mensagem".

**Seção "Andamento" (estado na_oficina/pronto):** conteúdo atual de `acompanhamento/[id]` (barra de 6 passos + linha do tempo), já com tempo real. Simplificar os rótulos da barra para 4 passos visíveis ao motorista: Recebido → Em conserto → Pronto → Entregue (diagnóstico e teste final viram linhas na linha do tempo, não passos).

**Seção "Avaliar" (estado concluído):** o bloco atual de estrelas, no topo da página (acima de tudo) enquanto não avaliado.

**Mensagens:** um único botão "Mensagem para {oficina}" aparece **só** quando há uma oficina determinada (orçamento escolhido) — no topo. Enquanto há vários orçamentos, a mensagem fica dentro de cada cartão. Some o botão de topo sem destinatário.

**Celular:** tudo em coluna; o cabeçalho de situação fica `sticky`. **Desktop:** coluna de 760 px; a lista de orçamentos pode virar tabela comparativa (colunas: oficina, nota, preço, prazo, dia mais cedo, garantia, botão) com a mesma ordenação.

### C3. Escolher e agendar (dentro de C2)

1. Toca "Escolher esta oficina" → abre **folha inferior** (bottom sheet no celular; modal no desktop) com título "Que dia você leva o carro à {oficina}?" e a lista de dias/turnos oferecidos (os passados já filtrados; se todos venceram, texto "Os horários oferecidos passaram. Peça novos horários" + botão "Pedir novos horários" que manda mensagem padrão à oficina).
2. Escolhe um dia → o botão do fundo da folha vira "Confirmar: sáb 12/10, 08-12h" (texto completo no botão; GOV.UK "check your answers").
3. Confirmação em página (não é alerta): "Pronto! Leve o carro à {oficina} no sábado 12/10 entre 8h e 12h." + endereço + "Como chegar" + "Adicionar ao calendário" + "O que acontece agora: a oficina confirma a entrada do carro e você acompanha cada etapa aqui." + botão único "Ver meu pedido". Os outros orçamentos são marcados como não escolhidos automaticamente (sem perguntas).
4. Erros (horário já tomado, orçamento vencido): mensagem dentro da folha, com o que fazer ("Escolha outro dia" / "Peça novos horários"), sem `alert`.

### C4. Acompanhar o conserto (seção de C2; também `#andamento`)

- Topo: situação grande (ícone + texto, ex.: "Em conserto · motor") + "atualizado há 5 min".
- Barra de 4 passos (Recebido → Em conserto → Pronto → Entregue). Pausas (peças, cliente) aparecem como aviso laranja abaixo da barra, com o que o motorista deve fazer, se houver ("A oficina espera sua resposta sobre o preço" → botão).
- Linha do tempo (existente), cada item com hora e, se houver, foto/observação.
- Rodapé fixo no celular: "Mensagem para {oficina}" (principal) · telefone.
- Quando chega "pronto": o cartão vira verde, "Retire o carro: {endereço}, horário {h}".
- Estado vazio: "A oficina ainda não registrou a entrada do carro. Dia combinado: sáb 12/10." — sem o ponto pulsante "atualização em tempo real ativa" (a pessoa não precisa saber disso).

### C5. Caixa de entrada da loja de peças (`/loja/pedidos-de-peca`)

- Cabeçalho: "{n} para responder · {m} encomendas a entregar" (clicáveis).
- Abas na URL: **Para responder** (padrão) · Respondidos · Encerrados.
- Cada item (lista compacta): peça (negrito) · carro (marca modelo ano) · quantidade · oficina e cidade · "há 12 min" · miniaturas das fotos. Botão principal: **"Responder"**. Link secundário: "Perguntar à oficina".
- "Responder" abre folha inferior com 3 campos: preço (com a moeda do país da **oficina**, não da loja, se forem diferentes), prazo em dias (botões rápidos: Hoje · 1 · 2 · 3+), observação. Botão "Enviar resposta: 85 € · 2 dias" (texto completo no botão).
- Depois de responder, o item vai para "Respondidos" com situação: "Aguardando a oficina" (relógio) → "Encomenda confirmada" (verde, com link para Encomendas) ou "A oficina escolheu outra loja" (cinza; requer que a API marque as respostas não escolhidas quando a cotação fecha — já existe o estado `fechada` na cotação). Permitir "Editar resposta" enquanto "Aguardando".
- Estado vazio: "Nenhum pedido de peça aberto na sua região. Avisamos por e-mail quando chegar um. Enquanto isso: complete o perfil da loja (endereço e telefone) para as oficinas confiarem em você." + botão "Completar perfil".
- Encomendas (`/loja/encomendas`): cada item com botão cheio **"Marcar como entregue"** que pede confirmação dentro da página ("Entregue à {oficina}? [Sim, entregue] [Ainda não]") e permite "Desfazer" por 10 s (toast).
- Tempo real: nova cotação entra na lista sem recarregar (assinatura em `cotacoes_pecas` filtrada por país da oficina) + som/badge.

---

## D. Regras transversais (valem para site, app e painel da oficina)

1. **Linguagem simples.** Frases curtas, verbo no imperativo no botão ("Pedir orçamentos", "Escolher esta oficina"), nunca substantivo de sistema ("Nova Solicitação", "Dashboard"). Um conceito = uma palavra (tabela B6). Sem siglas (FIPE, CNPJ fora do Brasil, RLS, ID). Sem "check-in". Texto de ajuda de uma linha abaixo do campo, nunca em tooltip.
2. **Uma ação principal por tela.** Um único botão cheio (azul; vermelho só para "Acabei de bater" e para confirmar exclusão). O resto é link ou botão vazado. Se duas ações têm o mesmo peso, a tela está errada.
3. **Situação = ícone + cor + texto**, sempre os três, sempre a mesma cor para a mesma situação (tabela B6), no site e no app. Cinza = nada a fazer; azul/laranja = **a pessoa precisa agir**; verde = confirmado/pronto; roxo = a oficina está trabalhando.
4. **Retorno após toda ação.** Botão mostra estado "Enviando..." (já é feito em vários lugares) e, ao terminar, uma **tela ou faixa de confirmação** que diz o que aconteceu e o que vem depois. Nunca redirecionar sozinho (`setTimeout` + `router.push`) e nunca `window.location.reload()`.
5. **Tempo real, não F5.** Listas e detalhes do motorista (`solicitacoes`, `orcamentos`, `manutencao_etapas`, `mensagens`) e da loja (`cotacoes_pecas`, `pedidos_pecas`) assinam mudanças (Supabase Realtime) ou, no mínimo, recarregam ao receber uma notificação (padrão já usado no app `useAvisos().chegou`). Mostrar "atualizado há X" só quando a assinatura cair.
6. **Voltar mantém o contexto.** Abas, filtros e ordenação ficam na URL (`?aba=`, `?ordem=`); a seta "Voltar" leva à lista de onde a pessoa veio (não ao Início); dentro de um pedido, âncoras `#orcamentos`, `#andamento`, `#avaliar` para links de notificação e e-mail.
7. **Confirmação para o destrutivo, dentro da página.** Cancelar pedido, apagar veículo, apagar peça do catálogo, marcar entregue, sair: caixa de confirmação própria (traduzida, com dois botões nomeados: "Sim, cancelar o pedido" / "Manter"), nunca `window.confirm`/`alert`. Onde der, "Desfazer" por alguns segundos em vez de confirmação prévia (marcar entregue, dispensar orçamento).
8. **Tudo o que a pessoa criou pode ser editado ou cancelado**, com regra clara de quando não pode mais (pedido: editar/cancelar até escolher oficina; depois "Remarcar" ou "Mensagem"; avaliação: editar por 60 dias, já existe; resposta da loja: editar até a oficina fechar).
9. **Estados vazios ensinam.** Toda lista vazia tem uma frase do que fazer e o botão para fazer. Nunca "Nenhum registro".
10. **Celular primeiro.** Barra inferior de 5 abas nas áreas logadas (web e app); botão principal alcançável com o polegar (rodapé fixo em formulários longos); nada de lista rolável dentro de página rolável; alvos de toque de 44 px; preço e botão nunca quebram em duas linhas em 390 px (já medido nos 6 idiomas para a barra do topo; estender para os cartões de orçamento).
11. **Mesmo nome, mesma tela, mesmo lugar** em web e app. O app é a referência de estrutura (5 abas, pedido em uma tela); o site copia.
12. **Fotos e localização nunca bloqueiam.** Recomendar com força, explicar o porquê, mas permitir seguir sem.
13. **Mensagem só com destinatário certo.** Botões "Mensagem" sempre nomeiam a oficina ("Mensagem para AutoFix"); sem oficina definida, o botão não aparece.

---

## E. Impacto na parte educativa

Regra: tutorial e ajuda **seguem** a tela, não o contrário. Depois das mudanças, reescrever (não só traduzir) os textos abaixo nos 6 idiomas.

### E1. Central de Ajuda do motorista (`messages/*.json`, namespace `docsCliente`, 10 seções)
- Seção 1 "Criar sua conta" → **"Pedir orçamentos (sem conta)"**: explicar o fluxo `/pedir` (problema → carro → local → seus dados → link no e-mail). A conta nasce do pedido.
- Seção 2 "Pedir orçamentos" → juntar com a 1; passos: o que escrever (3 exemplos de descrição boa), fotos (quais ângulos), onde está o carro.
- Seção 3 "Comparar os orçamentos" (texto) → **reescrever com a lista compacta**: o que é cada linha (preço, prazo, dia mais cedo, garantia), os marcadores "Mais barato / Melhor avaliada / Mais cedo", "Ver detalhes" para os itens, e a regra "escolher uma já dispensa as outras".
- Seção 4 "Aceitar e agendar" → **"Escolher a oficina e o dia"**: folha de horários, botão "Confirmar: dia", "Adicionar ao calendário", "Como chegar", remarcar.
- Seção 5 "Acompanhar o reparo" → **"Acompanhar o conserto"**: 4 passos visíveis, avisos de pausa, "Pronto para retirar".
- Seção 6 "Se a oficina pedir para mudar o preço": manter, com a situação "A oficina mudou o preço: responda".
- Seção 7 "Avaliar": manter (editar por 60 dias).
- Seção 8 "Garantia e conversa depois": manter.
- Seção 9 "Acidente": atualizar: foto recomendada, não obrigatória; 2 telas; "abra o link do e-mail para ver os orçamentos".
- Seção 10 "Custos, conta e privacidade": manter.
- Trocar em todas as seções: "Solicitação" → "Pedido", "check-in" → "dia de levar o carro", "Dashboard/painel" → "Início".

### E2. Central de Ajuda da oficina (`docsOficina`, 10 seções)
Conteúdo é do outro auditor; aqui só o vocabulário: seção 2 "Receber pedidos" (não "solicitações"), seção 8 "Peças" → usar "pedido de peça" e "encomenda"; seção 5 "Agenda, check-in e faltas" → "Agenda, entrada do carro e faltas" (nas telas da oficina "check-in" pode continuar como termo interno, mas na ajuda do motorista nunca).

### E3. Tutorial da loja (`lojaAprender.modulos`, 6 módulos, `loja/aprender/page.tsx`)
- `como-funciona`: reescrever: "Você recebe pedidos de peça das oficinas da sua região, responde com preço e prazo, e, se a oficina escolher você, a encomenda aparece em Encomendas."
- `perfil`: manter.
- `catalogo`: continuar `opcional`, explicar que é atalho para responder mais rápido; link passa a ser `/loja/perfil#catalogo`.
- `cotacoes` → id `pedidos-de-peca`, título "Responder pedidos de peça", `linkReal: '/loja/pedidos-de-peca'`; passos: abrir "Para responder", "Responder", preço na moeda da oficina, prazo, o que acontece depois (Aguardando / Confirmada / Outra loja).
- `pedidos` → id `encomendas`, "Encomendas e entrega", `linkReal: '/loja/encomendas'`, incluir "Desfazer".
- `comissao`: manter, `linkReal: '/loja/perfil#comissao'`.
- `TutorialBanner` da loja continua no topo da caixa de entrada.

### E4. Tutorial da oficina (`oficinaAprender`, `oficina/aprender/page.tsx`)
Módulo `solicitacoes` → título "Responder pedidos"; módulo `peças` → "Pedir peças às lojas" (termos "pedido de peça"/"encomenda"); demais a cargo do outro auditor.

### E5. Home: "Como funciona" e FAQ (`home.step*`, `home.faqItems`)
- Passos: 1 "Conte o problema" · 2 "Oficinas perto de você respondem" · 3 "Compare e escolha" · 4 "Leve o carro e acompanhe".
- FAQ: acrescentar "Preciso criar conta para pedir?" ("Não para pedir; você confirma o e-mail para ver os orçamentos") e "Como escolho entre os orçamentos?" (apontar para a seção 3 da ajuda). Trocar "Como funciona o BipFix?" para usar as 4 frases acima.

### E6. Guias públicos (`content/guias/*.json`)
- `compare-car-repair-quotes` (6 idiomas): acrescentar uma seção "Como fica no BipFix" com os marcadores "Mais barato / Melhor avaliada / Mais cedo" e a frase de garantia; CTA "Pedir orçamentos" → `/pedir`.
- `car-accident-estonia-what-to-do` e `insurance-repair-after-accident-estonia`: ajustar o passo "registre no BipFix" (foto recomendada, 2 telas, link no e-mail).
- Novo guia curto (et, ru, en; depois it, pt, pt-PT): **"Como pedir orçamentos de conserto pela internet sem complicação"** — 5 passos com capturas de tela da versão nova; serve de ajuda e de SEO.
- Não criar tutorial "Aprender" para o motorista: a tela tem de bastar; a ajuda contextual (estados vazios + frase "o que acontece agora") substitui.

### E7. E-mails e notificações
Textos de `lib/notif-i18n.ts` e dos e-mails devem usar as 9 situações de B6 e apontar para `/cliente/pedidos/[id]#secao`. "Você recebeu um orçamento" → "Chegou 1 orçamento: 180 € da AutoFix. Compare agora."

---

## F. Plano por fases

### Fase 1 — agora (2 a 3 semanas de trabalho): o motorista escolhe fácil

Mudanças:
1. **Página única do pedido** `/cliente/pedidos/[id]` (C2 + C3 + C4) com lista compacta, ordenação, marcadores, folha de horários, confirmação em página, `.ics`, "Como chegar". 301 de `/cliente/orcamentos/[id]` e `/cliente/acompanhamento/[id]`.
2. **Função de situação compartilhada** (`packages/shared`) + `StatusBadge` com ícone + cores fixas (B6), lendo a tabela única de cores definida no documento da oficina (`quadro-util.ts › COR`); app usa a mesma função. Fazer junto com o item correspondente da Fase 1 da oficina para não haver duas tabelas.
3. **Menu do motorista com 5 itens** + barra inferior no celular; `/cliente` (Início, C1); `/cliente/pedidos` com abas na URL; 301 de dashboard/orcamentos/historico.
4. **Tempo real** nas listas e no pedido (assinatura `orcamentos`, `solicitacoes`, `manutencao_etapas`); remover `window.location.reload()` e `confirm()` da área do cliente (confirmação própria).
5. **Vocabulário** (B6) nos 6 idiomas do site e do app: `nav`, `clienteDashboard`, `clienteOrcamentoDetalhe`, `constants.statusSolicitacao`, `clienteAcompanhamento`, mobile `tabs`/`orcamentos`/`acompanhamento`. Rodar `scripts/checar-traducoes.mjs` (web e mobile).
6. **Login direto ao painel** (sem passar pela home); remover `escolher-tipo` (301); cadastro só de motorista em `/cadastro` (parceiros via `/seja-parceiro`).
7. **Emergência:** foto opcional com aviso forte; tela final com "abra o link do e-mail para ver os orçamentos" + "Reenviar"; remover o botão "Criar minha conta" quando a conta já foi criada.

Critérios de aceite (todos nos 6 idiomas, 390 px e 1280 px):
- Do Início, com 3 orçamentos, a pessoa chega a "Pronto! Leve o carro..." em **no máximo 4 toques** (Comparar → Escolher esta oficina → dia → Confirmar).
- Em 390 px, cada orçamento na lista compacta ocupa no máximo 140 px de altura; preço e botão nunca quebram linha.
- Nenhum `window.confirm`, `alert` ou `location.reload()` em `app/[locale]/cliente/**`.
- Orçamento inserido no banco aparece na página do pedido aberta em até 5 s sem recarregar.
- Nenhuma tela do motorista contém "Dashboard", "Check-in", "FIPE" (fora de `/br/pt`), "Solicitação".
- URLs antigas respondem 301 para as novas, preservando `/ee/et` etc.
- Login leva ao `/cliente` em uma navegação (sem passar por `/`).
- Em `/emergencia`, é possível chegar ao envio sem foto; sem conta, a tela final mostra o e-mail e o botão "Reenviar".

Testes Playwright a escrever (`apps/web/scripts/e2e/`, mesmo padrão dos existentes: contas temporárias apagadas no fim; 6 idiomas; viewport 390 e 1280):
- `site-cliente-jornada.mjs`: cadastro → pedir → oficina de teste envia 3 orçamentos (via service key) → verificar ordenação/marcadores → escolher → dia → confirmação → andamento com etapa inserida em tempo real (sem `reload`) → avaliar. Conta toques e mede altura dos cartões.
- `site-situacoes.mjs`: para cada uma das 9 situações, cria o estado no banco e confere ícone (`data-situacao`), cor (classe) e texto nos 6 idiomas no Início, na lista e no pedido.
- `site-redirecionamentos.mjs` (compartilhado com a auditoria da oficina): acrescentar as tabelas B2 e B4 deste documento, nos 6 prefixos.
- `site-vocabulario.mjs`: varre o HTML das telas do motorista procurando as palavras proibidas por idioma.
- `site-emergencia-sem-conta.mjs`: estender `e2e-acidente.mjs`: sem foto, sem conta; tela final; reenvio; 2ª visita com link confirma e cai no pedido.
- Atualizar `site-varredura.mjs` (lista `AREAS.cliente`) e `site-fluxos.mjs` para as rotas novas.

App (Expo), separado:
- `apps/mobile/app/solicitacao/[id].tsx`: cabeçalho de situação (função compartilhada), lista compacta com ordenação e marcadores, folha de horários (modal) e tela de confirmação; botão "Escolher esta oficina".
- `components/SolicitacaoCard.tsx`: usar `StatusBadge` compartilhado (cores iguais às da web).
- `(tabs)/index.tsx`: cartão de ação (C1) acima dos dois botões.
- `i18n/locales/*.json`: vocabulário B6.
- Teste: `app-e2e.mjs` estendido com a jornada de escolha e `nativo-correcoes.mjs` com o cartão de ação.

### Fase 2 — em seguida (3 a 4 semanas): pedir é tão fácil quanto escolher; loja trabalha numa tela

1. **`/pedir` público** (B2): ordem problema → carro → local → seus dados; conta criada pelo servidor; tela final com link no e-mail. `/cliente/pedir` para logado (pula "seus dados"). Tipos de serviço reduzidos a 4 grandes botões com exemplos ("Bateu / amassou", "Barulho, luz ou falha", "Revisão ou troca de óleo", "Pneus") + "Não sei" (vai como "outro").
2. **Home para o motorista** (B1): herói com "Pedir orçamentos" + 3 provas; seções de parceiro reduzidas a uma faixa.
3. **Loja**: menu de 4 itens, caixa de entrada C5 com abas e estados "Aguardando / Confirmada / Outra loja", folha de resposta, "Marcar como entregue" com confirmação + desfazer, tempo real, `/loja/mensagens`. 301 das rotas antigas.
4. **Página pública da oficina**: CTA "Pedir orçamento a esta oficina", "Voltar ao meu pedido", selos sem emoji.
5. **Mensagens**: botão único com nome da oficina; remover a tela intermediária quando há uma só oficina.
6. Entrar por link no e-mail (magic link) como alternativa à senha — avaliar com o dono (toca em segurança e em custo de e-mail).

Critérios de aceite:
- Visitante sem conta chega a "Pedido enviado" em no máximo 4 telas, com fotos opcionais; no banco existe pedido + conta pendente de confirmação.
- A loja, ao entrar, cai na caixa de entrada; responde a um pedido de peça em 1 folha; vê a situação mudar para "Confirmada" ou "Outra loja" sem recarregar.
- Em 390 px, o aviso de cookies nunca cobre o botão principal nem a faixa vermelha.
- `/oficinas/[id]` tem exatamente um botão cheio.

Testes:
- `site-pedir-sem-conta.mjs` (novo), `site-pecas.mjs` (reescrever para C5), `site-home.mjs` (ordem das seções, 1 botão principal, provas visíveis, cookies não cobrem), `site-oficina-publica.mjs`.
- App: `nova-solicitacao.tsx` na nova ordem e com os 4 tipos; `app-e2e.mjs` ajustado.

### Fase 3 — depois (contínuo): polimento e medição

1. Tabela comparativa no desktop (C2) e "Mais barato / Melhor avaliada / Mais cedo" com explicação ao tocar.
2. Estimativa de preço antes dos orçamentos (já existe análise por IA) mostrada na tela "Aguardando" como faixa ("Consertos parecidos em Tallinn: 150-300 €").
3. Notificação push no app (depende de EAS Build, pendência conhecida) e SMS opcional para "chegou orçamento" (decisão de custo do dono).
4. Admin: "Comissões" com duas abas; rótulo "Interessados (leads)"; Navbar do admin só com "Painel admin".
5. Medição: eventos simples (pedido criado, 1º orçamento recebido, escolha, tempo entre eles) no `Analytics.tsx` já existente, para o dono ver "tempo até o 1º orçamento" e "% de pedidos com escolha".
6. Teste com 3 pessoas reais de pouca prática (Tallinn, et/ru) seguindo o roteiro de A; corrigir o que travar.

Critérios de aceite: tempo mediano "pedido → escolha" visível no admin; 3 de 3 pessoas do teste completam a jornada 1 sem ajuda.

Testes: `site-varredura.mjs` ampliado com checagem de **uma** `button.btn-primary` por tela nas áreas logadas; `site-admin.mjs` para as abas de comissão.

---

## Apêndice — Referências usadas

- NN/g, "Writing for Lower-Literacy Users": https://www.nngroup.com/articles/writing-for-lower-literacy-users/ (frases curtas, sem rolagem dentro de rolagem, uma ideia por tela).
- NN/g, "Lower-Literacy Users: Writing for a Broad Consumer Audience": https://www.nngroup.com/articles/lower-literacy-users/.
- NN/g, "10 Usability Heuristics": https://www.nngroup.com/articles/ten-usability-heuristics/ (visibilidade do estado do sistema; linguagem do usuário; consistência; prevenção de erro).
- NN/g, "Empty State Design": https://www.nngroup.com/articles/empty-state-interface-design/.
- NN/g, "Confirmation Dialogs Can Prevent User Errors — If Not Overused": https://www.nngroup.com/articles/confirmation-dialog/.
- GOV.UK Design Principles: https://www.gov.uk/guidance/government-design-principles ("Do less", "Design with data", "This is for everyone").
- GOV.UK Design System, "Question pages" (one thing per page): https://design-system.service.gov.uk/patterns/question-pages/.
- GOV.UK Design System, "Check answers": https://design-system.service.gov.uk/patterns/check-answers/ e "Confirmation pages": https://design-system.service.gov.uk/patterns/confirmation-pages/.
- Apple HIG, "Tab bars": https://developer.apple.com/design/human-interface-guidelines/tab-bars (3 a 5 abas).
- Material Design 3, "Navigation bar": https://m3.material.io/components/navigation-bar/overview.
- Uber (rider) e Bolt: uma pergunta na tela inicial ("Para onde?"), pedido fixo no topo com status; identidade mínima antes do primeiro pedido — https://www.uber.com/ e https://bolt.eu/.
- Booking.com: lista compacta com nota, preço e "o que você ganha", ordenação por preço/avaliação, detalhe em página própria — https://www.booking.com/.
- Airbnb (hóspede): busca como herói, "anuncie" discreto, marcadores "Preferido dos hóspedes" — https://www.airbnb.com/.
- Wolt: pedido em andamento fixo no topo com etapas e tempo estimado; https://wolt.com/.
- Treatwell: escolha de profissional → horário em folha → confirmação com "adicionar ao calendário" — https://www.treatwell.co.uk/.
- Baymard Institute, "Checkout usability" (menos campos, campos opcionais marcados): https://baymard.com/blog/checkout-flow-average-form-fields.
