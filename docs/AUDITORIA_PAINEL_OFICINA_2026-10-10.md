# Auditoria e redesenho do painel da oficina — 10/10/2026

Documento de projeto (não é código). Responde ao retorno do dono em 09/10:

1. "Muitas funções deixaram tudo difícil de entender. Tem que ter FOCO: receber pedidos e mandar orçamento. O site deve ABRIR nessa página, com um contador do tempo sem resposta ao lado de cada pedido."
2. "O dashboard deve ser GRÁFICO, para a oficina ver o desempenho dela."
3. "Tem que ser mais organizado para ver pedidos aceitos, check-ins dos próximos dias, check-outs dos próximos dias, carros atrasados etc."
4. "Muita oficina não é boa com computador: tudo tem que ser muito fácil de entender."

Problema conhecido somado: as visões Mês/Dia/Lista da Agenda calculam o dia no fuso do **navegador** (`lib/turnos.ts`), enquanto o Quadro usa o fuso da **oficina** (`lib/fuso.ts`).

Base auditada: `apps/web/src/app/[locale]/oficina/*`, `components/oficina/*`, `components/layout/Navbar.tsx`, `messages/pt.oficina.json`, `supabase/migrations/001..058`.

---

## Resumo das decisões (uma linha cada)

| Tema | Decisão |
|---|---|
| Página inicial após login (dono) | **`/oficina/pedidos`** (caixa de entrada de pedidos com contador de espera). Mecânico continua em "Hoje" (seus carros). |
| Menu do dono | **Pedidos · Hoje · Agenda · Desempenho · Mais ▾** (Peças, Equipe, Avaliações, Comissão, Aprender, Perfil). 4 itens + Mais. |
| Menu do mecânico | **Hoje · Agenda · Aprender**. |
| `dashboard` atual | Some. Vira **Desempenho** (gráficos) em `/oficina/desempenho`; `/oficina/dashboard` redireciona para `/oficina/pedidos`. |
| `veiculos-em-servico` + Agenda Dia + tabela do dashboard | Fundem-se em **Hoje** (`/oficina/hoje`): uma tela, blocos por situação, UM botão por cartão. |
| Check-in manual | Deixa de ser item de menu; vira botão **"+ Carro sem pedido"** dentro de Hoje e da Agenda (mesma página `/oficina/checkin`, acessível pelo botão). |
| Agenda | Fica como ferramenta de planejamento (Quadro é a visão padrão para quem tem equipe/postos; Mês/Lista continuam). Visão **Dia** some (é a Hoje com outra data). |
| Fuso | Tudo no fuso da oficina (`diaNaOficina`/`horaLocalEmUtc` de `lib/fuso.ts`); `lib/turnos.ts` passa a receber `pais`. |
| Contador de espera | Verde < 1 h, âmbar 1–4 h, vermelho > 4 h; acidente ("[TIPO:…]" / `tipo = colisao`) e urgência alta sempre no topo. Para de contar quando a oficina manda o orçamento. |
| Gráficos | Sem biblioteca nova: componentes SVG próprios em `components/graficos/` (barras, linha, rosca). SSR-seguro, zero dependência. |
| Linguagem | "Pedido" (não "solicitação"), "Orçamento", "Carro", "Entregar", "Chegou" (check-in), "Mecânico". Botão = verbo. |

---

## A. Achados — página por página (ordem de impacto no usuário leigo)

### A1. Não há um lugar único que diga "o que eu tenho que fazer agora" (impacto: crítico)

O mesmo carro aparece em **quatro** telas com nomes e cores diferentes, e nenhuma delas é "a" lista de tarefas:

| Tela | Arquivo | O que mostra do mesmo carro | Rótulo |
|---|---|---|---|
| Dashboard | `oficina/dashboard/page.tsx` L147-196 | tabela "Check-in / Check-out – Próximos 7 dias" (só `tipo === 'plataforma'`, exclui carros de balcão) + "Solicitações aceitas" + "Próximos serviços" (3 primeiros eventos de qualquer data) | Agendado / Em andamento / Entregue |
| Oficina (veículos em serviço) | `oficina/veiculos-em-servico/page.tsx` | 4 cartões-contador (Aguardando check-in / Em serviço / Prontos p/ retirada / Agendados futuro) + abas Todos/Aguardando/Em Serviço/Prontos | Agendado / Em serviço / Pronto |
| Agenda › Dia | `oficina/agenda/page.tsx` L616-676 | 3-4 blocos (Pendente / Check-in feito / Entregue / Não compareceu) | Pendente / Feito / Entregue |
| Agenda › Quadro | `components/oficina/QuadroOficina.tsx` | barras por mecânico/posto com 9 estados (`quadro-util.ts` `Estado`) + faixa de alertas | Agendado / Check-in atrasado / Na oficina / Pronto para retirar / Prazo estourado… |

Consequência: a oficina não sabe onde clicar. "Aguardando" numa tela é "Pendente" noutra e "Agendado" na terceira. O botão de check-in existe em três lugares com três formulários diferentes (`veiculos-em-servico` sem mecânico/posto; `agenda` Dia com mecânico+posto; Quadro com arrasto).

### A2. O site abre no Dashboard, que não é a tarefa principal (impacto: crítico)

`Navbar.tsx` L33-39, `(auth)/definir-senha/page.tsx` L67, `(auth)/confirmar-email/page.tsx` L11 e `HomeClient.tsx` L36 mandam o dono para `/oficina/dashboard`. O dashboard (`dashboard/page.tsx`) mistura 4 contadores, tabela de check-ins, aceitos, faltas, 5 pedidos próximos, 3 eventos, avaliações e o banner de perfil — 8 blocos, nenhum é "o próximo passo". Os pedidos novos ficam no **sexto** bloco, abaixo da dobra no celular.

### A3. A lista de pedidos não prioriza nem mostra tempo de espera de forma útil (impacto: crítico)

`oficina/solicitacoes/page.tsx`:
- ordem = `created_at desc` do hook (`hooks/use-solicitacoes.ts` L32), ou seja, **o mais novo primeiro**; o pedido esquecido há 6 horas fica embaixo.
- `timeAgo(sol.created_at)` aparece em texto cinza 12 px ("há 3 horas"), sem cor nem destaque — não funciona como contador.
- dois `<select>` de filtro (tipo de serviço com 10 opções, status com 2) ocupam o topo; a oficina leiga raramente filtra.
- o cartão inteiro é um `<Link>` para o detalhe, e o botão "Enviar Orçamento" é só um `<span>` estilizado dentro dele: o toque leva ao detalhe (`solicitacoes/[id]`), de onde precisa clicar de novo em "Enviar orçamento" para chegar ao formulário (`enviar-orcamento/[id]`). Dois toques a mais.
- selos: StatusBadge ("Aberta"/"Orçamento Enviado") + urgência ("Média") + tipo ("Mecânica") + seguro + "Orçamento enviado" — até 5 selos por cartão.
- subtítulo "Solicitações de reparo próximas à sua oficina (raio de 30km)": "raio" é jargão.
- após o cliente aceitar outra oficina, o pedido simplesmente some (hook filtra `status in aberta/em_orcamento` só na tela dashboard; aqui aparece com status "Orçamento Aceito" sem dizer que **outra** oficina ganhou).

### A4. Menu com 11 destinos e palavras de sistema (impacto: alto)

`Navbar.tsx` L83-97: Dashboard · Solicitações · Oficina · Agenda · Mais ▾ (Peças, Equipe, Check-in Manual, Comissão, Avaliações, Aprender) + Perfil no avatar. Problemas:
- "Dashboard" (pt e it mantêm a palavra inglesa; et "Töölaud", ru "Кабинет"): palavra de software.
- "Oficina" como nome de página dentro do painel da oficina não diz nada ("Oficina" leva a carros em serviço).
- "Solicitações" (pt-BR) vs "Pedidos" (pt-PT): o cliente também "pede"; "Pedido" é a palavra do balcão.
- "Check-in Manual": "manual" é visão do programador; para a oficina é "carro que chegou sem pedido".
- celular (`xl:hidden`, abaixo de 1280 px): menu ☰ com **12 links** empilhados, sem agrupamento.

### A5. Agenda: 4 visões + 3 sub-visões + "+ Evento" (impacto: alto)

`agenda/page.tsx`: Quadro | Mês | Dia | Lista, e dentro do Quadro Mecânico | Posto | Hora, mais "Mostrar previsto", "Postos da oficina", "Capacidade e tempo médio por etapa" (details). São 7 modos para uma oficina de 1-3 pessoas. "+ Evento" abre um formulário com 12 campos (cliente, placa, FIPE, tipo, mecânico, 4 datas/horas, descrição, cor) para o que a oficina chama de "anotar um carro".
Dia e Lista repetem `veiculos-em-servico` (ver A1). Mês mostra só contagens ("2 Pendente / 1 Feito") e exige clicar no dia.

### A6. Fuso horário inconsistente (impacto: alto — mostra o carro no dia errado)

- `lib/turnos.ts` `dataLocalDe`/`localParaIso`/`hojeLocal` usam `Date` local do **navegador**; usados em `agenda/page.tsx` (`getGroups`, L163-169; `startEdit`; `handleAddEvent`), `checkin/page.tsx` (L38, 46, 71-72), `enviar-orcamento/[id]/page.tsx` (turnos de check-in, `hojeLocal`/`turnoDisponivel`).
- `dashboard/page.tsx` L58-61 `formatTime` usa `getHours()` do navegador.
- `veiculos-em-servico/page.tsx` L101-111 compara `new Date(e.data_inicio) <= new Date()` (instante, OK) mas `formatDate` usa `toLocaleDateString` sem `timeZone`.
- O Quadro (`QuadroOficina.tsx`, `QuadroHora.tsx`, `quadro-util.ts`) usa `diaNaOficina(…, oficina.pais)`.
Caso real: dono em Tallinn vendo a oficina no celular com fuso errado, ou dono brasileiro com oficina na Estônia: Mês/Dia mostram o check-in das 08:00 no dia anterior; o Quadro mostra certo.

### A7. "Veículos em serviço" tem informação demais por linha (impacto: médio-alto)

`veiculos-em-servico/page.tsx` L398-497: por carro — marca/modelo, placa, selo de status, cliente, "Check-in: dd/mm", "Entrega: dd/mm", "Xd restantes", bolinha+etapa, "Resp: nome", e dois botões pequenos (`text-xs !py-1.5`) "+ Etapa" e "Entrega", mais a seta de expandir. O botão principal mede ~26 px de altura (abaixo dos 44 px recomendados). Ao expandir aparecem: serviço, cliente, mecânico, linha do tempo das etapas, histórico, Mensagem, Notas internas. A seleção de etapa é um `<select>` com 10 opções com emoji + descrição ("⏸️ Pausa - contato cliente - Aguardando retorno do cliente").

### A8. Dashboard "gráfico" não existe (impacto: médio)

Os únicos números são 4 contadores absolutos (Novas/Aceitas/Concluídas/Na agenda) calculados sobre `useSolicitacoes({nearby:true})` — "Concluídas" conta **todas** as solicitações concluídas na região, não as da oficina (`dashboard/page.tsx` L29: filtra só por status). Não há evolução no tempo, taxa de conversão nem tempo de resposta. `CapacidadeResumo.tsx` já calcula tempo médio por etapa, mas escondido num `<details>` abaixo do Quadro.

### A9. Palavras difíceis espalhadas (impacto: médio)

Levantamento em `messages/pt.oficina.json` e `pt.json › constants`:
"Solicitação", "Dashboard", "Plataforma / Externo" (tipo de evento), "Check-in pendente", "Check-out", "Posto", "Elevador / box", "Etapa", "Em diagnóstico", "Pausa – contato cliente", "Teste final", "Orçamento Aceito" (status de pedido, confunde com o selo do orçamento), "Raio", "Capacidade", "Comissão", "Status", "Evento", "Histórico de ações", "Previsto × Real", "Validade do orçamento", "FIPE".

### A10. Sem caixa de entrada de mensagens (impacto: médio)

Existe só `oficina/mensagens/[id]` (conversa de um pedido). A oficina só chega a uma conversa pela notificação ou pelo detalhe do pedido. Não é foco desta rodada, mas Hoje e Pedidos devem mostrar "1 mensagem nova" no cartão.

### A11. Pequenos

- `oficina/avaliacoes` é só lista; a nota média está no cabeçalho do dashboard (vai para Desempenho).
- `oficina/comissao` e `oficina/equipe`: adequados para "Mais".
- `oficina/pecas` (Comprar / Vender): fora do fluxo principal; fica em "Mais".
- `oficina/capacidade` e `oficina/distribuicao` já redirecionam (`redirect(...agenda?vista=quadro)`) — modelo a reutilizar.
- Emoji "🎓" no item de menu Aprender: tirar (ícone ≠ emoji; quebra em algumas fontes do Windows).
- `TutorialBanner` + `PerfilCompleto` + aviso "cadastro em análise" empilhados no topo do dashboard: três faixas antes do conteúdo.

---

## B. Nova arquitetura de informação

### B1. Menu

**Dono / administrativo (desktop ≥ 1280 px, uma linha):**

```
[logo] Pedidos (3)   Hoje (2)   Agenda   Desempenho   Mais ▾        [idioma] [🔔] [avatar] Sair
                                                       ├ Peças
                                                       ├ Equipe
                                                       ├ Avaliações
                                                       ├ Comissão
                                                       ├ Aprender
                                                       └ Perfil
```

- "(3)" em Pedidos = pedidos **sem orçamento meu** (contador vermelho se algum > 4 h). "(2)" em Hoje = ações pendentes hoje (check-ins de hoje não feitos + prontos não entregues + atrasados).
- Celular (< 1280 px): **barra inferior fixa** com 4 ícones+texto (Pedidos · Hoje · Agenda · Mais), 56 px de altura, texto 12 px. O ☰ atual some; "Mais" abre a lista (Desempenho, Peças, Equipe, Avaliações, Comissão, Aprender, Perfil, Sair). Padrão de Airbnb/Wolt/Fresha: a navegação principal cabe no polegar.

**Mecânico:** Hoje (= meus carros) · Agenda · Aprender. Sem Pedidos/Desempenho.

### B2. Nomes por idioma (chave `nav.*`)

| chave | pt (BR) | pt-PT | en | et | it | ru |
|---|---|---|---|---|---|---|
| `pedidos` | Pedidos | Pedidos | Requests | Päringud | Richieste | Заявки |
| `hoje` | Hoje | Hoje | Today | Täna | Oggi | Сегодня |
| `agenda` | Agenda | Agenda | Calendar | Kalender | Calendario | Календарь |
| `desempenho` | Desempenho | Desempenho | Results | Tulemused | Risultati | Результаты |
| `mais` | Mais | Mais | More | Rohkem | Altro | Ещё |
| `pecas` | Peças | Peças | Parts | Varuosad | Ricambi | Запчасти |
| `equipe` | Equipe | Equipa | Team | Meeskond | Squadra | Команда |
| `avaliacoes` | Avaliações | Avaliações | Reviews | Hinnangud | Recensioni | Отзывы |
| `comissao` | Comissão | Comissão | Fees | Tasud | Commissioni | Комиссия |
| `aprender` | Aprender | Aprender | Learn | Õpi | Impara | Обучение |
| `perfil` | Minha oficina | A minha oficina | My workshop | Minu töökoda | La mia officina | Моя мастерская |
| `carroSemPedido` (botão) | + Carro sem pedido | + Carro sem pedido | + Walk-in car | + Ilma päringuta auto | + Auto senza richiesta | + Авто без заявки |

Notas: "Agenda" em en vira "Calendar" (hoje "Schedule"); "Desempenho" em en/et/it/ru usa "Resultados" (mais simples que "Performance"); "Perfil" vira "Minha oficina" porque é onde se cadastram fotos, horário, serviços e postos. A tradução et deve ser conferida com o parceiro de Tallinn (regra da memória: declinação estoniana é correta, não re-marcar).

### B3. Mapa de páginas (o que fica, o que funde, o que some)

| URL nova | Conteúdo | Vem de |
|---|---|---|
| `/oficina/pedidos` | caixa de entrada (seção C) | `solicitacoes/page.tsx` + bloco "Solicitações próximas" e "Não compareceu" do dashboard |
| `/oficina/pedidos/[id]` | detalhe do pedido (mantém `solicitacoes/[id]/page.tsx`, com botão primário único "Fazer orçamento") | `solicitacoes/[id]` |
| `/oficina/orcamento/[id]` | formulário de orçamento (mantém `enviar-orcamento/[id]`) | `enviar-orcamento/[id]` |
| `/oficina/hoje` | operação do dia e próximos dias (seção D) | `veiculos-em-servico`, Agenda›Dia, tabela e "aceitas" do dashboard |
| `/oficina/agenda` | Quadro (padrão) · Mês · Lista. Visão Dia some. | `agenda/page.tsx` |
| `/oficina/checkin` | mantém a página, sem item de menu; abre pelo botão "+ Carro sem pedido" (Hoje e Agenda) | `checkin` |
| `/oficina/desempenho` | gráficos (seção E) | novo; absorve nota média/avaliações recentes do dashboard e `CapacidadeResumo` |
| `/oficina/perfil` | igual (título "Minha oficina") | `perfil` |
| `/oficina/pecas`, `equipe`, `avaliacoes`, `comissao`, `aprender`, `mensagens/[id]` | iguais | — |

**Some:** `/oficina/dashboard` (página), `/oficina/veiculos-em-servico` (página), aba "Dia" da Agenda, item de menu "Check-in Manual", item "Oficina".

### B4. Redirecionamentos (arquivos `page.tsx` com `redirect()`, igual a `capacidade/page.tsx`)

| De | Para |
|---|---|
| `/oficina/dashboard` | `/oficina/pedidos` (dono) · `/oficina/hoje` (mecânico — resolvido no cliente pelo `useAuth`, como hoje no Navbar) |
| `/oficina/solicitacoes` | `/oficina/pedidos` |
| `/oficina/solicitacoes/[id]` | `/oficina/pedidos/[id]` |
| `/oficina/enviar-orcamento/[id]` | `/oficina/orcamento/[id]` |
| `/oficina/veiculos-em-servico` (+ `?ev=&etapa=`) | `/oficina/hoje` (mesmos parâmetros; Hoje abre o cartão expandido) |
| `/oficina/agenda?vista=day` | `/oficina/hoje` |
| `/oficina/capacidade`, `/oficina/distribuicao` | já redirecionam para `agenda?vista=quadro` — manter |

Atualizar os destinos fixos: `Navbar.tsx` (`dashboardPath`), `HomeClient.tsx` L36, `(auth)/definir-senha` L65-67, `(auth)/confirmar-email` L11, `middleware.ts` (lista de caminhos protegidos já cobre `/oficina`), links em `aprender/page.tsx` (`linkReal`), `notif-i18n`/`NotificationBell` (links das notificações `nova_solicitacao`, `orcamento_aceito`, `nova_mensagem`), e-mails em `lib/notifications` que apontam para `/oficina/solicitacoes/...`, e o script `scripts/e2e/site-varredura.mjs` (lista `AREAS.oficina`).

As notificações já gravadas no banco com `dados.solicitacao_id` não têm URL fixa, então basta o `NotificationBell` montar o link novo.

---

## C. Página inicial "Pedidos" (`/oficina/pedidos`)

Modelo: fila de pedidos do Wolt Merchant (colunas Novo → Em preparo → Pronto, com cronômetro) e caixa de entrada do Airbnb (pedidos que exigem resposta primeiro).

### C1. Layout

```
Pedidos                                           [+ Carro sem pedido]
Responda rápido: quem responde em menos de 1 hora ganha mais pedidos.

[ Para responder (3) ]  [ Respondidos (5) ]  [ Encerrados ]

┌────────────────────────────────────────────────────────────┐
│ 🚨 ACIDENTE · BMW 320d 2019                    ⏱ 2 h 15 min│  ← contador vermelho/âmbar/verde
│ Bateu a frente, não liga. 3 fotos · 4,2 km · Tallinn       │
│                                     [ Fazer orçamento  ▶ ] │  ← botão 48 px, largura total no celular
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ Mecânica · Toyota Corolla 2016                 ⏱ 35 min    │
│ Barulho na suspensão. Sem fotos · 7,8 km                   │
│ 💬 1 mensagem nova                  [ Fazer orçamento  ▶ ] │
└────────────────────────────────────────────────────────────┘
```

- Cabeçalho: título + 1 frase de incentivo (texto fixo, sem número do raio).
- **3 abas** (não filtros): *Para responder* (padrão) · *Respondidos* · *Encerrados*. Nenhum `<select>`. O filtro por tipo de serviço some (a oficina já só recebe os tipos que atende — `tipoCompativel`, migração 056).
- Cartão: linha 1 = tipo (com ícone) + carro; linha 2 = descrição em 1 linha + fotos + distância; linha 3 = **um** botão primário. Sem StatusBadge, sem selo de urgência textual (a urgência está na cor/ícone do contador e na ordem).
- Clicar no corpo do cartão abre o detalhe (`/oficina/pedidos/[id]`); clicar no botão vai direto ao formulário de orçamento (`/oficina/orcamento/[id]`). São elementos separados (hoje o botão é um `<span>` dentro do `<Link>`).
- Seguro: selo pequeno "🛡 Seguro" permanece (muda o fluxo do orçamento).

### C2. Ordem (aba *Para responder*)

1. Acidente (descrição com `[TIPO:…]` ou `tipo === 'colisao'`) — sempre no topo, ordenado por espera.
2. Urgência `alta`.
3. Demais, por **tempo de espera decrescente** (o mais antigo primeiro).

Implementação: `chave = (acidente ? 0 : urgencia === 'alta' ? 1 : 2) * 1e13 - created_at`. Sem controle de ordenação para o usuário.

### C3. Contador de espera

- Base: `solicitacoes.created_at` (TIMESTAMPTZ, migração 001). Fim: `orcamentos.created_at` da linha com `oficina_id = minha` (UNIQUE `(solicitacao_id, oficina_id)`).
- Enquanto não há orçamento meu: mostra `⏱ 35 min` / `⏱ 2 h 15 min` / `⏱ 1 dia 3 h`, atualizado a cada 60 s (`setInterval`, como o `agora` do `QuadroOficina.tsx`).
- Cores (fundo + ícone + texto, nunca só cor):

| Espera | Cor | Ícone | Texto auxiliar (title/aria) |
|---|---|---|---|
| < 1 h | verde `bg-emerald-100 text-emerald-800` | ⏱ | "Chegou há 35 min" |
| 1–4 h | âmbar `bg-amber-100 text-amber-900` | ⏱ | "Esperando há 2 h" |
| > 4 h | vermelho `bg-red-100 text-red-800` + borda esquerda vermelha no cartão | ⚠ | "Esperando há 6 h — responda ou o cliente escolhe outra oficina" |
| > 48 h | cinza, cartão vai para o fim | ⏱ | "Pedido antigo" |

Acidente: cartão sempre com borda vermelha e selo "🚨 Acidente" independentemente do tempo.

- Depois de orçado: substitui o contador por "✔ Respondido em 42 min" (calculado `orcamento.created_at − solicitacao.created_at`) — reforço positivo e dado do gráfico de tempo de resposta.
- Mecânicos não veem a página.

### C4. Estados do pedido (do ponto de vista desta oficina) e abas

| Estado | Como calcular (dados existentes) | Aba | Texto no cartão | Botão |
|---|---|---|---|---|
| **Novo** | `sol.status in (aberta, em_orcamento)` e nenhum `orcamentos` meu; nunca aberto | Para responder | contador | Fazer orçamento |
| **Visto** | idem, mas já aberto por alguém da oficina | Para responder (título sem negrito) | contador | Fazer orçamento |
| **Orçado** | `orcamentos.status in (enviado, visualizado)` meu | Respondidos | "✔ Respondido em 42 min" + "Cliente ainda não decidiu" (ou "Cliente viu seu orçamento" se `visualizado`) | Ver orçamento (secundário) |
| **Aceito** | `orcamentos.status = aceito` meu | Respondidos, no topo, faixa verde "Cliente aceitou — chega dia 14/10 de manhã" | — | Ver em Hoje |
| **Perdido** | `sol.status in (aceita, em_andamento, concluida)` e meu orçamento não é `aceito` | Encerrados | "Cliente escolheu outra oficina" | — |
| **Recusado** | `orcamentos.status = recusado` | Encerrados | "Cliente recusou" | Fazer novo orçamento (se pedido ainda `aberta`) |
| **Expirado** | `orcamentos.validade < hoje` ou `status = expirado` | Encerrados | "Orçamento venceu em dd/mm" | Fazer novo orçamento |
| **Não compareceu** | `sol.status = no_show` com meu orçamento ativo (regra atual do dashboard, 30 dias) | Para responder, com selo "Não veio" | — | Mandar novas datas |
| **Cancelado** | o hook já exclui `cancelada` | — | — | — |

**"Visto" — dado que falta.** Nada guarda hoje "a oficina abriu o pedido" (`status_orcamento` tem `visualizado`, mas é o cliente vendo o orçamento). Decisão: migração **059** com tabela mínima:

```sql
CREATE TABLE pedido_vistos (
  solicitacao_id uuid REFERENCES solicitacoes(id) ON DELETE CASCADE,
  oficina_id     uuid REFERENCES oficinas(id) ON DELETE CASCADE,
  visto_em       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (solicitacao_id, oficina_id)
);  -- RLS: insert/select pela oficina (dono e funcionarios), mesma regra de agenda_historico
```

Gravada no `useEffect` do detalhe `/oficina/pedidos/[id]` (upsert). Serve ao gráfico "tempo até abrir" e ao negrito do cartão. Alternativa descartada: marcar `notificacoes.lida` — a notificação é por perfil (dono) e não cobre equipe nem pedidos abertos pelo link direto.

**"Perdido".** `hooks/use-solicitacoes.ts` com `nearby:true` já traz pedidos `aceita/em_andamento/concluida` da região (filtra só por raio/tipo). Para não mostrar pedidos que a oficina nunca orçou e outra ganhou, a aba Encerrados lista só pedidos **com** orçamento meu. Pedidos sem orçamento meu que saíram de `aberta/em_orcamento` somem silenciosamente (correto: a oficina não respondeu).

**Expirado.** Não há job que mude `status` para `expirado`; calcular no cliente por `validade < hoje` (campo DATE, migração 001). Opcional na fase 3: cron no servidor.

### C5. Estado vazio

- *Para responder* vazio: ilustração simples + "Nenhum pedido esperando resposta. Quando um cliente pedir um orçamento perto de você, ele aparece aqui e você recebe um aviso." + botão secundário "Ver pedidos respondidos". Se `oficina.ativa === false`: faixa âmbar "Seu cadastro está em análise…" (texto já existe: `oficinaDashboard.cadastroEmAnalise`).
- Perfil incompleto (`PerfilCompleto.tsx`): continua, mas como **uma** linha compacta acima da lista ("Perfil 60% completo — completar"), não um card.
- `TutorialBanner`: só na primeira visita (já usa `localStorage`), abaixo do estado vazio.

### C6. Celular (390 px)

- Abas em `grid grid-cols-3` (como as 4 visões da agenda hoje).
- Cartão: contador no canto superior direito, botão de largura total `min-h-[48px]` na última linha.
- Barra inferior de navegação (B1) — a lista tem `pb-20` para não ficar atrás.
- Nenhum texto `text-xs` abaixo de 14 px exceto o rótulo da distância.

### C7. Dados e consulta

Tudo já vem do `useSolicitacoes({ nearby: true })`: `solicitacoes.*` (`created_at`, `tipo`, `urgencia`, `descricao`, `status`, `pagamento_reparo`), `veiculo`, `fotos`, `orcamentos(*)` (filtrar `oficina_id`), `cliente`. Acrescentar ao `select`: `vistos:pedido_vistos!inner(...)` (left join via `pedido_vistos(visto_em)` filtrado por `oficina_id` no cliente) e contagem de mensagens não lidas (tabela `mensagens`/`conversas` — conferir nome em migração 035; se custoso, fase 3).

Assinatura em tempo real: canal `postgres_changes` em `solicitacoes` e `orcamentos` (padrão de `use-agenda.ts`), para o contador e as abas mudarem sem recarregar.

---

## D. Página "Hoje" (`/oficina/hoje`)

Modelo: aba *Today* do Airbnb (chegadas, saídas, hospedados agora) e home do extranet da Booking (chegadas/partidas do dia); colunas do Tekmetric (Estimates → Work in progress → Completed) para o estado do carro. Uma tela, blocos em ordem de urgência, **um botão por cartão**.

### D1. Blocos (na ordem; bloco vazio não aparece)

| # | Bloco | Regra (fuso da oficina, `diaNaOficina(…, oficina.pais)`) | Cor/ícone | Botão único |
|---|---|---|---|---|
| 1 | **Atrasados** | (a) `status = agendado` e `diaNaOficina(data_inicio) < hoje` e não `no_show` → "Devia ter chegado dia 08/10"; (b) `status = em_andamento` e `(data_fim_prevista ?? data_fim) < agora` e última etapa ≠ `concluido` → "Entrega prevista era 09/10". Mesma lógica de `quadro-util.ts` (`checkinAtrasado`, `atrasoDesde`). | vermelho ⚠ | (a) **Chegou** (check-in) + link "Não veio"; (b) **Ligar** (`tel:`) — secundário "Mensagem" |
| 2 | **Prontos para entregar** | `em_andamento` e última etapa `concluido` | verde ✔ | **Entregar** (confirmação inline já existente) |
| 3 | **Chegam hoje** | `agendado`, `diaNaOficina(data_inicio) === hoje` | azul 📥 | **Chegou** |
| 4 | **Na oficina** | `em_andamento`, última etapa ≠ `concluido`; sub-rótulo com a etapa em palavras simples e há quanto tempo (`temposDoCarro`) | amarelo 🔧 | **Etapa** (abre lista de 6 botões grandes, ver D3) |
| 5 | **Saem hoje** (entregas previstas) | `em_andamento` e `diaNaOficina(data_fim_prevista ?? data_fim) === hoje` (sem duplicar o bloco 2: se já pronto fica só em 2) | cinza-azul 📤 | **Etapa** / **Entregar** conforme estado |
| 6 | **Aceitos, ainda sem carro aqui** | `orcamentos.status = aceito` meu e agenda `agendado` com `data_inicio > hoje` → "Chega qua 14/10, manhã" — agrupado por dia nos próximos 7 dias | roxo 📅 | **Ver pedido** (secundário) — e "Mensagem" |
| 7 | **Entregues hoje** | `concluido` e `diaNaOficina(entregue_em ?? data_fim) === hoje` | cinza ✔ | — (link "Ver") |
| 8 | **Não vieram** | `no_show` nos últimos 30 dias | laranja | **Mandar novas datas** (já existe no dashboard) |

Topo da página: 3 números grandes clicáveis (rolam até o bloco): **Para fazer agora** (1+2+3) · **Na oficina** (4) · **Próximos 7 dias** (6). Nada mais.

Rodapé/cabeçalho: botão **"+ Carro sem pedido"** (leva a `/oficina/checkin`, já com `jaAqui = true`).

Seletor de dia: setas ‹ Hoje › (padrão: hoje). Isso substitui a visão Dia da Agenda — o `onAbrirDia` do Quadro passa a navegar para `/oficina/hoje?dia=2026-10-14&ev=…`.

### D2. Cartão

```
┌───────────────────────────────────────────────┐
│ Toyota Corolla · 123 ABC            [⚠ 1 dia] │
│ Mari Tamm · Mecânica · mecânico: Jaan         │
│ 🔧 Esperando peça há 3 h                       │
│ [ Etapa ▾ ]                       Mensagem ›  │
└───────────────────────────────────────────────┘
```
- 3 linhas + 1 botão (48 px) + 1 link secundário. Placa em destaque (é como a oficina identifica o carro).
- Tocar no cartão expande o detalhe atual de `veiculos-em-servico` (linha do tempo, notas internas, trocar mecânico, histórico) — mantém a função, esconde a complexidade.
- Mecânico: vê só cartões com `funcionario_id = seu` (regra atual) e não vê "Entregar" (regra atual).

### D3. Botão "Etapa" (substitui o `<select>` de 10 opções)

Folha inferior (celular) / popover (desktop) com **6 botões grandes** em 2 colunas, cada um com ícone + 2-3 palavras:

| Botão | Grava `manutencao_etapas.status` |
|---|---|
| 🔍 Vendo o problema | `diagnostico` |
| 🔧 Consertando | `em_execucao` |
| 📦 Esperando peça | `aguardando_pecas` (une `pausa_pecas`) |
| 📞 Esperando o cliente | `pausa_cliente` |
| ⏸ Parado | `pausa_geral` |
| ✅ Pronto para entregar | `concluido` (mantém a confirmação) |

`recebido` é gravado pelo check-in; `teste_final` e `entregue` ficam acessíveis em "Mais opções" dentro do cartão expandido (não somem do enum). Campo "observação" opcional abaixo dos botões. Mesma API `/api/servico` (`acao: 'etapa'`).

### D4. Check-in ("Chegou")

Um botão. Se a oficina tem mecânicos ou postos ativos, abre a mesma folha com duas listas de botões (mecânico; posto) e "Confirmar" — hoje isso é dois `<select>` pequenos em `agenda/page.tsx` L321-336. Se não tem, faz direto. Confirmação de check-in antecipado continua (`CHECKIN_FUTURO`).

### D5. Relação com a Agenda

- **Hoje** = operação (o que fazer agora e nos próximos 7 dias). **Agenda** = planejamento (Quadro: quem faz o quê, postos, 14 dias; Mês: visão geral; Lista: tudo por data).
- Nada é removido do Quadro. A faixa de alertas do Quadro (`QuadroOficina.tsx` L187-195) passa a linkar para os blocos de Hoje.
- O formulário "+ Evento" da Agenda vira "+ Carro sem pedido" (mesmo `/oficina/checkin`), e o formulário de 12 campos da agenda some (o de `checkin/page.tsx` tem os mesmos dados com texto melhor; acrescentar nele "hora de chegada" e "cor" opcionais numa seção "Mais detalhes" recolhida).

### D6. Fuso (unificação — faz parte da fase 1)

1. `lib/turnos.ts`: `hojeLocal(agora, pais)`, `dataLocalDe(iso, pais)`, `horaLocalDe(iso, pais)`, `localParaIso(data, hora, pais)` passam a delegar a `lib/fuso.ts` (`diaNaOficina`, `minutoNaOficina`, `horaLocalEmUtc`). `turnoDisponivel`/`primeiroTurnoLivre` recebem `pais` e usam `minutoNaOficina(agora, pais)` em vez de `getHours()`.
2. Trocar as chamadas em `agenda/page.tsx` (`getGroups`, `startEdit`, `handleAddEvent`, `monthlyStats` que usa `data_inicio.slice(0,7)` — UTC!), `checkin/page.tsx` (L38 `new Date().toISOString().split('T')[0]` e L46), `enviar-orcamento/[id]/page.tsx` (turnos e `validade`), `dashboard` (some).
3. Toda formatação de data/hora com `Intl.DateTimeFormat(intl, { timeZone: fusoDoPais(oficina.pais) })` — criar `lib/fuso.ts › formatadorDaOficina(locale, pais)` e usar em Hoje, Pedidos, Agenda.
4. "Hoje" no calendário Mês: `diaNaOficina(new Date(), pais)` e não `new Date().getDate()`.
5. Teste: conta com `pais: 'EE'` e navegador em `America/Sao_Paulo` (Playwright `timezoneId`), check-in às 08:00 de Tallinn: deve aparecer em Hoje, Mês e Quadro no mesmo dia.

---

## E. Página "Desempenho" (`/oficina/desempenho`)

Modelo: "Shop Dashboard" do Tekmetric (poucos números com tendência) e Analytics do extranet Booking. Regra: cada gráfico tem **um título em pergunta**, **um número grande** e **uma frase** explicando o que fazer com ele.

### E1. Seletor de período

Três botões: **4 semanas** (padrão) · **3 meses** · **12 meses**. Agrupamento: por semana (4 sem), por semana (3 meses) ou por mês (12 meses). Comparação com o período anterior em texto ("+3 vs. 4 semanas antes"), sem segunda série no gráfico.

### E2. Blocos (ordem) e cálculo

| # | Bloco | Gráfico | Fonte (existente) | Frase sob o gráfico |
|---|---|---|---|---|
| 1 | **Quantos pedidos você recebeu, respondeu e ganhou?** | barras agrupadas por semana: recebidos / respondidos / ganhos | recebidos = `notificacoes` do dono com `tipo='nova_solicitacao'` (`lib/avisar-oficinas-pedido.ts`, idempotente por pedido) — melhor proxy do que a oficina viu; respondidos = `orcamentos` com `oficina_id` por `created_at`; ganhos = `orcamentos.status='aceito'` (data do aceite não existe — usar `agenda.created_at` do evento plataforma, criado em `api/aceitar-orcamento`) | "De cada 10 pedidos, você respondeu 7 e ganhou 2. Responder a todos é o jeito mais fácil de ganhar mais." |
| 2 | **Em quanto tempo você responde?** | linha (mediana por semana) + número grande "1 h 20 min" com selo verde/âmbar/vermelho (mesmos limites do contador) | mediana de `orcamentos.created_at − solicitacoes.created_at` | "Oficinas que respondem em menos de 1 hora ganham mais pedidos." |
| 3 | **Quanto entrou de serviço pelo BipFix?** | barras por mês (moeda do país, `currencyForCountry`) | soma de `orcamentos.valor_total` com `status='aceito'` + `orcamento_revisoes.valor_novo − valor_anterior` aprovadas (migração 049), por mês do aceite; marcar "entregue" (`agenda.status='concluido'`) vs "em andamento" com duas tonalidades | "Valor dos orçamentos aceitos. A comissão aparece em Comissão." |
| 4 | **Sua nota** | rosca 0–5 com número grande + últimas 3 avaliações | `avaliacoes.nota` (média já existe no banco, migração 048) | "Clientes avaliam depois da entrega. Peça para avaliarem." |
| 5 | **Você entrega no prazo?** | barra única "8 de 10 no prazo" (80 %) | `agenda` concluídos: `entregue_em` (057) ou `data_fim` ≤ `data_fim_prevista` (011) | "Carros entregues até a data combinada." |
| 6 | **Quanto tempo o carro fica em cada etapa?** | barras horizontais (horas médias por etapa: Vendo o problema / Consertando / Esperando peça / Esperando o cliente / Parado) | `manutencao_etapas` — cálculo já feito em `CapacidadeResumo.tsx` L31-45 (mover para `lib/desempenho.ts`) | "Onde o carro mais espera é onde dá para ganhar tempo." |
| 7 | **Clientes que não vieram** | número + lista curta | `solicitacoes.status='no_show'` com orçamento meu | — |

Ocupação dos postos e carga por mecânico ficam no Quadro (já estão lá).

### E3. Biblioteca de gráficos — decisão

`package.json` não tem nenhuma biblioteca de gráficos; o painel é client-side (`'use client'`) com Tailwind. **Decisão: sem dependência nova.** Criar `src/components/graficos/` com 4 componentes SVG puros (≈ 300 linhas no total):

- `Barras.tsx` (agrupadas/empilhadas, rótulo de valor em cima, eixo Y com 3 linhas-guia),
- `Linha.tsx` (uma série, pontos com `<title>`),
- `Rosca.tsx` (um valor de 0–100 %),
- `BarraHorizontal.tsx` (lista categórica).

Motivos: SSR-seguro por natureza (SVG inline, sem `window`), zero custo de bundle (Recharts ≈ 100 kB gz; Chart.js precisa `dynamic(..., {ssr:false})`), controle total de cor+padrão+rótulo (acessibilidade), e os dados são pequenos (≤ 12 pontos). Cada gráfico tem uma tabela `<table class="sr-only">` equivalente para leitores de tela e um `aria-label` com o resumo.

Paleta (sempre com rótulo de texto, nunca só cor): recebidos cinza `#94a3b8`, respondidos azul `#0284c7` (primária da oficina), ganhos verde `#059669`; alertas âmbar `#d97706`, vermelho `#dc2626`.

### E4. Consulta

Uma função `lib/desempenho.ts › carregarDesempenho(oficinaId, periodo)` com 5 consultas Supabase em paralelo (`orcamentos` + `solicitacoes(created_at)`, `notificacoes` do dono, `agenda` concluídos, `avaliacoes`, `manutencao_etapas`) limitadas ao período + 1 período anterior. Volume por oficina é pequeno (centenas de linhas); sem view nova. Fase 3: materializar em `oficina_desempenho_semana` se passar de ~5 k orçamentos.

### E5. Estado vazio (oficina nova)

Em vez de gráficos vazios: cartão único "Seus números aparecem depois do primeiro orçamento. Enquanto isso: ✔ perfil 60 % — completar · ✔ 0 pedidos respondidos — ver pedidos". Quando houver < 3 pontos, mostrar só o número grande e a frase, sem gráfico (gráfico de 1 barra confunde).

---

## F. Regras de linguagem simples e acessibilidade (todo o painel)

Base: NN/g "Writing for Lower-Literacy Users" (texto curto, uma coluna, menu linear, próxima ação óbvia) e "Touch Targets" (mín. 1 cm ≈ 44–48 px); WCAG 1.4.1 (não depender só de cor).

### F1. Palavras — trocar em `pt.oficina.json` / `pt.json › constants` e nos outros 5 idiomas

| Hoje | Passa a | Onde |
|---|---|---|
| Solicitação | **Pedido** | tudo (`oficinaSolicitacoes`, `oficinaDashboard`, StatusBadge) |
| Dashboard / Painel | **Pedidos** (inicial) e **Desempenho** (números) | nav |
| Oficina (menu) | **Hoje** | nav |
| Check-in / Check-in pendente / Aguardando check-in | **Chegou** (botão) / **Chega hoje** / **Devia ter chegado** | Hoje, Agenda, Quadro |
| Check-out / Entrega / Concluído | **Entregar** (botão) / **Entregue** / **Pronto para entregar** | idem |
| Evento / Externo / Plataforma | **Carro** / **Carro sem pedido** / **Pedido do BipFix** | Agenda |
| Posto / Elevador / box | **Elevador** · **Lugar de trabalho** · **Vaga** (já existe `quadroTipoBox`; unificar) | Quadro |
| Etapa: Em diagnóstico / Em execução / Aguardando peças / Pausa – contato cliente / Pausa – peças em falta / Pausado / Teste final | **Vendo o problema / Consertando / Esperando peça / Esperando o cliente / Esperando peça / Parado / Testando** | constants.statusManutencao |
| Status de pedido "Orçamento Aceito" / "Em Orçamento" | **Cliente aceitou** / **Esperando o cliente** | StatusBadge |
| Raio de atendimento | **Até X km da oficina** | perfil, pedidos |
| Validade do orçamento | **Preço vale até** | orçamento |
| Prazo (dias) | **Dias para ficar pronto** | orçamento |
| Capacidade | **Quantos carros cabem** (já usado em `quadroCapacidadeVaga`) | perfil |
| Comissão | **Comissão** (manter; explicar "o que o BipFix cobra por serviço fechado" no subtítulo) | comissão |
| Status | **Situação** | tabelas |
| Histórico de ações | **O que aconteceu** | cartão expandido |
| Não compareceu / Falta | **Não veio** | tudo |
| FIPE | esconder a sigla; "Marca e modelo" | formulários |

Regras de escrita: frases ≤ 12 palavras; verbo no imperativo nos botões ("Fazer orçamento", "Chegou", "Entregar", "Mandar novas datas"); sem siglas; números com unidade ("2 h 15 min", não "2.25h"); datas "qua 14/10" (dia da semana sempre, a oficina pensa em dias da semana).

### F2. Layout e interação

1. **Uma ação primária por tela** e **uma por cartão** (botão azul `btn-primary`); o resto é link cinza ou fica no cartão expandido.
2. **Alvos ≥ 48 × 48 px** no celular (`min-h-[48px]`); botões de cartão com largura total abaixo de 640 px. Remover `!py-1.5 text-xs` dos botões de ação (`veiculos-em-servico` L461, L474, L482; `agenda` L313-351).
3. **Fonte**: corpo 16 px (`text-base`) no painel; rótulos secundários mínimo 14 px (`text-sm`); nada em `text-[10px]`/`text-xs` para informação necessária. Número grande dos contadores 32 px.
4. **Situação = cor + ícone + palavra**, sempre os três (ex.: `⚠ Atrasado` em vermelho; `✔ Pronto` em verde). Mesma tabela de cores em Pedidos, Hoje, Agenda e Quadro (`quadro-util.ts › COR` vira a fonte única; `getStatusColor` em `lib/utils.ts` passa a usá-la).
5. **Uma coluna** no celular; no desktop no máximo 2 colunas (lista + detalhe). Sem `grid-cols-4` de contadores no celular (hoje vira 2×2 com texto quebrado).
6. **Contraste** ≥ 4,5:1 (as combinações `bg-*-100 text-*-800` do Tailwind passam; evitar `text-gray-400` em texto informativo — hoje usado em "Resp:", "#id", horários).
7. **Confirmação inline**, nunca `window.confirm` (ainda usado em `dashboard` L256, `agenda` L239 e L303) — a Hoje reutiliza o padrão de faixa `role="alert"` que `veiculos-em-servico` já tem.
8. **Navegação linear**: barra inferior no celular; na página, ordem dos blocos = ordem de urgência; sem abas dentro de abas.
9. **Estado vazio sempre diz o que fazer** (um botão).
10. **Foco e teclado**: botões reais (`<button>`/`<Link>`), não `div onClick`; cartão expansível com `aria-expanded`. Tutoriais e e-mails não usam emoji como ícone de menu.
11. **Cronômetros e datas** sempre no fuso da oficina (D6).

---

## G. Plano por fases

### Fase 1 — foco e organização (agora)

Entregáveis:
1. **Navegação** (`Navbar.tsx`): menus do dono e do mecânico (B1), barra inferior no celular, contadores em Pedidos/Hoje; `dashboardPath` → `/oficina/pedidos` ou `/oficina/hoje`; chaves `nav.*` novas nos 6 idiomas.
2. **Pedidos** (`/oficina/pedidos` + `[id]`): abas, ordem, contador (C2-C4), migração 059 `pedido_vistos`, tempo real, estado vazio; `enviar-orcamento` renomeado para `orcamento`.
3. **Hoje** (`/oficina/hoje`): blocos D1, cartão D2, folha de etapas D3, check-in D4, seletor de dia, `?ev=`; mecânico vê os seus.
4. **Agenda**: remove visão Dia, Quadro como padrão quando há `funcionarios` ou `boxes` (senão Mês), "+ Evento" → "+ Carro sem pedido"; `onAbrirDia` → Hoje.
5. **Fuso** (D6) em `turnos.ts`, `agenda`, `checkin`, `enviar-orcamento`.
6. **Redirecionamentos** (B4) e atualização de links (notificações, e-mails, tutoriais, e2e).
7. **Textos** F1 nas 6 línguas (rodar `scripts/checar-traducoes.mjs`).

Critérios de aceite:
- Login de dono abre `/oficina/pedidos`; de mecânico abre `/oficina/hoje`. Em 6 idiomas o menu tem 4 itens + Mais (desktop) e barra inferior de 4 (390 px), sem sobreposição.
- Pedido criado há 5 h aparece acima de um criado há 10 min; acidente aparece acima de ambos; contador muda de verde→âmbar→vermelho nos limites; ao enviar orçamento o cartão muda para "Respondido em X" e vai para a aba Respondidos sem recarregar.
- Botão "Fazer orçamento" leva direto ao formulário (1 toque); mede ≥ 48 px de altura a 390 px.
- Hoje: carro agendado para ontem sem check-in aparece em "Atrasados" com botão "Chegou"; carro com etapa `concluido` aparece em "Prontos" com "Entregar"; mecânico não vê "Entregar" nem carros de outros.
- Mesmo carro (check-in 08:00 Tallinn, `pais='EE'`) aparece no mesmo dia em Hoje, Agenda›Mês e Quadro com o navegador em `America/Sao_Paulo` e em `Europe/Tallinn`.
- Todas as URLs antigas (`/oficina/dashboard`, `/solicitacoes`, `/solicitacoes/[id]`, `/enviar-orcamento/[id]`, `/veiculos-em-servico?ev=…`, `/agenda?vista=day`) respondem 200 na página nova, nos 6 prefixos de mercado.
- Nenhuma chave de tradução crua, nenhum `window.confirm`, zero erros de console (critério já usado em `site-varredura.mjs`).

Testes Playwright (pasta `apps/web/scripts/e2e`, mesmo estilo `playwright-core` + conta temporária + limpeza):
- `site-painel-pedidos.mjs`: cria cliente + 3 pedidos (um acidente, um com `created_at` retroativo de 5 h via service role, um normal); loga como oficina em 6 idiomas × {390 px, 1366 px}; verifica ordem, cores (classe `bg-red-100`/`bg-amber-100`/`bg-emerald-100`), texto do contador, 1 toque até `/oficina/orcamento/[id]`, aba Respondidos após enviar, estado vazio.
- `site-painel-hoje.mjs`: cria eventos (`agendado` ontem, `agendado` hoje, `em_andamento` com etapa `concluido`, `em_andamento` com `data_fim_prevista` ontem, `agendado` +3 dias, `concluido` hoje); verifica blocos e botões, fluxo Chegou → Etapa (folha de 6 botões) → Pronto → Entregar; mecânico (conta em `funcionarios`) não vê Entregar; `?ev=` abre expandido.
- `site-fuso-agenda.mjs`: `browser.newContext({ timezoneId: 'America/Sao_Paulo' })` e `'Europe/Tallinn'`; mesmo evento no mesmo dia em Hoje/Mês/Quadro.
- `site-redirecionamentos.mjs`: tabela B4 × 6 prefixos.
- Atualizar `site-varredura.mjs` (`AREAS.oficina`), `site-fluxos.mjs` (caminho do orçamento) e `site-servico.mjs` (URL `veiculos-em-servico`).

Tutoriais (`oficina/aprender/page.tsx`, chaves `oficinaAprender.*` nas 6 línguas): módulos `solicitacoes` → "Pedidos: responder rápido" (`linkReal: '/oficina/pedidos'`, `verificar`: existe orçamento da oficina); `checkin` → "Hoje: chegou, etapas, entregar" (`/oficina/hoje`); `notas-internas` → link `/oficina/hoje`; `distribuicao` → "Agenda e Quadro" (`/oficina/agenda?vista=quadro`); mecânico: `meusVeiculos` → `/oficina/hoje`, texto "Abra Hoje no menu…". Passos guiados reescritos com os botões novos ("Chegou", "Etapa", "Entregar").

Guias (`messages/*.misc.json › docsOficina.secoes`, 10 seções): "2. Receber pedidos" (contador, abas), "3. Enviar orçamentos" (URL nova), "5. Agenda, check-in e faltas" → "5. Hoje: carros que chegam, estão aqui e saem" + "5b. Agenda e Quadro", "7. Etapas do reparo e entrega" (6 botões). Renovar as capturas de tela depois do deploy.

### Fase 2 — Desempenho (gráficos)

- `components/graficos/*`, `lib/desempenho.ts`, página `/oficina/desempenho` com blocos E2, seletor E1, estado vazio E5; item no menu.
- Aceite: com dados de teste (20 pedidos, 14 orçamentos, 5 aceitos, 3 entregues, 2 atrasados, 4 avaliações) os números batem com SQL de conferência; cada gráfico tem `aria-label` e tabela `sr-only`; página renderiza no servidor sem erro (`next build`); a 390 px nenhum gráfico ultrapassa a largura; oficina sem dados vê o cartão de estado vazio.
- Teste `site-desempenho.mjs`: semeia os dados via service role, compara os números da tela com os esperados, 6 idiomas × 2 larguras.
- Tutorial: módulo novo "Desempenho: entenda seus números"; guia seção "11. Seus resultados".

### Fase 3 — acabamento

- Caixa de entrada de mensagens (`/oficina/mensagens`) e contador de mensagens não lidas nos cartões (A10).
- Cron de expiração de orçamentos (`status='expirado'` quando `validade < hoje`).
- Unificar as três implementações de check-in (Hoje, Agenda›Lista, Quadro) num componente `components/oficina/FolhaCheckin.tsx`; unificar cores de status (`quadro-util.ts › COR` como fonte única).
- Notificação push/e-mail "pedido esperando há 2 h" (usa o mesmo cálculo do contador).
- Revisão com 2-3 oficinas de Tallinn (teste de 5 tarefas: achar pedido mais urgente, mandar orçamento, dar entrada no carro, marcar pronto, entregar) — meta: todas as tarefas sem ajuda em < 1 min.

---

## Apêndice — referências

- NN/g, *Lower-Literacy Users: Writing for a Broad Consumer Audience* — https://www.nngroup.com/articles/writing-for-lower-literacy-users/ (texto curto, uma coluna, menu linear; otimizar para baixa literacia quase dobrou a taxa de sucesso e também melhorou para usuários experientes).
- NN/g, *Touch Targets on Touchscreens* — https://www.nngroup.com/articles/touch-target-size/ (mínimo 1 × 1 cm; ação principal maior).
- NN/g, *Usability Guidelines for Accessible Web Design* (PDF) — https://media.nngroup.com/media/reports/free/Usability_Guidelines_for_Accesible_Web_Design.pdf
- W3C WCAG 2.2, 1.4.1 *Use of Color* — https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html (não transmitir informação só por cor).
- Airbnb, *Reservations, redesigned* (aba *Today*: chegando, saindo, hospedados agora) — https://www.airbnb.com/resources/hosting-homes/a/reservations-redesigned-765
- Booking.com extranet (página inicial com chegadas/partidas/no-shows do dia) — https://www.littlehotelier.com/blog/running-your-property/booking-com-extranet/ ; https://www.hotelminder.com/booking-com-extranet-guide-for-hoteliers
- Wolt Merchant App (fila Novo → Em preparo → Pronto, aceitar em 3 min, cronômetro) — https://merchant.wolt.com/en/deu/learning-center/use-wolt-merchant-app ; https://explore.wolt.com/en/geo/merchant/learning-center/manage-wolt-orders
- Tekmetric Job Board (colunas Estimates / Work-in-progress / Completed; Shop Dashboard) — https://www.tekmetric.com/post/repairs-management-software-job-board ; https://support.tekmetric.com/hc/en-us/articles/360039292193-RO-Labels-and-Workflow-Statuses ; https://support.tekmetric.com/hc/en-us/articles/360042280134-Shop-Dashboard-Real-Time-Reporting
- Garage Hive (tela inicial com as funções necessárias; agenda ao vivo com toque) — https://garagehive.co.uk/features/workshop-management-with-garage-hive/
- Fresha for business (calendário por profissional, cores, app móvel) — https://www.fresha.com/for-business/features/scheduling
- Projeto do Quadro (interno) — `docs/PROJETO_QUADRO_OFICINA_2026-10-09.md`.
