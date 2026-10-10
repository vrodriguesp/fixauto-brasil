# Projeto: Quadro da oficina (planner de postos + monitoramento do carro)

Data: 2026-10-09 · Escopo: web (`apps/web`), painel da oficina · Status: proposta para implementação

Este documento responde aos cinco pedidos do dono e os transforma num plano fechado:

1. No Quadro, o que já aconteceu é pintado sobre o tempo em que **realmente** aconteceu (entrou e saiu hoje = pintado só hoje).
2. Nova visão **Dia, hora a hora**: do clique de check-in até a entrega, por elevador, com reserva de intervalo livre.
3. Tornar isso um **monitoramento do carro** que a oficina liga se quiser, sem pesar para oficinas pequenas.
4. "Box" e "Vaga" não são claros: vocabulário novo e explicação na tela.
5. Capacidade por serviço **e** limite geral da oficina.

Convenção: identificadores de código e banco ficam em `código`. Onde havia escolha, há uma recomendação só.

---

## 0. O que já existe (verificado no código em 09/10)

| Peça | Onde | O que guarda hoje |
|---|---|---|
| `agenda` | `001` + `011` + `046` + `053` | `data_inicio` (entrada prevista; **sobrescrita por "agora" no check-in antecipado**), `data_fim` (entrega prevista; **sobrescrita por "agora" na entrega** em `lib/entrega.ts`), `data_fim_prevista` (cópia da previsão, migração 011), `status` (`agendado/em_andamento/concluido/cancelado`), `funcionario_id`, `box_id` (elevador atual, 053), `no_show`, `tipo` (`plataforma/externo`) |
| `manutencao_etapas` | `008` | uma linha por etapa com `created_at`: `recebido` (gravada pelo check-in em `/api/servico`), `diagnostico`, `aguardando_pecas`, `em_execucao`, `pausa_cliente`, `pausa_pecas`, `pausa_geral`, `teste_final`, `concluido`, `entregue` (gravada por `entregarServico`) |
| `agenda_historico` | `041` + `054` | `acao` em `checkin, checkin_antecipado, atribuido, etapa, entregue, retirado_revisao_recusada, elevador`, com `created_at`, `funcionario_id`, `por_profile_id`, `detalhe` JSONB (`elevador` guarda `{anterior, novo}`) |
| `oficina_boxes` | `053` | `nome`, `tipo` (`elevador/box/vaga`), `ativo`, `ordem`; RLS: equipe lê, só o dono grava |
| `oficinas.capacidade_servicos` | `008` | JSONB `{tipo: maxCarros}`; **não há limite geral** |
| `funcionarios.capacidade_maxima` | `018` | carros simultâneos por mecânico |
| `oficinas.horario_funcionamento` | `006` | JSONB por dia `{aberto, inicio, fim}` |
| Fuso | `lib/fuso.ts` | `fusoDoPais(pais)` (EE→`Europe/Tallinn`, IT→`Europe/Rome`...). O Quadro atual usa `dataLocalDe` = fuso do **navegador** |
| Tempo real | `052`, `053`, `008` | `agenda`, `oficina_boxes`, `manutencao_etapas` publicadas; `use-agenda.ts` recarrega com debounce de 400 ms |
| Quadro | `components/oficina/QuadroOficina.tsx` | 14 dias × linha por mecânico ou por elevador; barra = `data_inicio`→`data_fim` (forçada até hoje se atrasada); conflito = dois carros com `box_id` igual e dias sobrepostos; arrastar = `atribuir` / `elevador` |
| Visões | `oficina/agenda/page.tsx` | `quadro / month / day / list` em `localStorage bipfix_agenda_vista`; o "Dia" atual é uma lista (check-in pendente / feito / entregue), não é hora a hora |
| Check-in "manual" | `oficina/checkin/page.tsx` | cria evento `externo` **agendado** (não é um check-in de verdade: o carro ainda precisa do botão Check-in) |

Conclusões que guiam o projeto:

- **Já existem carimbos reais** de entrada e saída: `manutencao_etapas.recebido.created_at` e `agenda_historico.checkin*.created_at` (entrada), `agenda.data_fim` após `concluido` / `manutencao_etapas.entregue` (saída). Faltam colunas diretas na `agenda` para consultar sem juntar tabelas, e falta guardar a **entrada prevista** quando o check-in antecipado sobrescreve `data_inicio`.
- **O elevador hoje é um campo único por carro (`box_id`)**: não guarda intervalos. Um carro de 3 dias "ocupa" o elevador os 3 dias no Quadro, mesmo que fique 2 h em cima dele. Isso é a causa do pedido 2 e precisa de uma tabela de intervalos.
- Os estados "aguardando peças / cliente" já existem como etapas; o Quadro mostra só `aguardandoPecas`. Falta `pausa_cliente` como estado próprio.

---

## A. O que uma oficina de 1–10 mecânicos e 1–6 elevadores precisa (prioridade)

Base: planners de oficina (Garage Hive, Mitchell1 Manager SE, Tekmetric, AutoVitals, One AM/eMotori na Itália, AutoFutur nos países nórdicos/Estônia) e os mapas de hotel (tape chart). Fontes no Apêndice.

1. **Saber agora, numa olhada, onde está cada carro e o que o segura** (no elevador X, esperando peça, pronto, esperando o cliente aprovar). É o "quadro de fluxo" dos sistemas americanos e o "planning ponti" dos italianos. Prioridade 1.
2. **Saber se o elevador está livre e até quando** (hora a hora). O elevador é o recurso escasso; o mecânico pode trabalhar no chão, mas não levanta dois carros. Prioridade 1.
3. **Promessa ao cliente vs. realidade**: previsto (quando prometemos) e real (quando entrou/saiu). Mostrar os dois sem poluir. Prioridade 1.
4. **Não aceitar mais do que cabe**: limite por tipo de serviço (já existe) e limite geral de carros na oficina (não existe). Prioridade 1.
5. **Avisos**: carro parado em elevador enquanto espera peça (desperdício), prazo estourado, check-in atrasado, elevador reservado e ninguém colocou o carro. Prioridade 2.
6. **Tempos**: tempo na oficina, tempo em elevador, tempo parado (idle), tempo por etapa. Os sistemas grandes fazem isso com relógio por técnico; para 1–10 mecânicos, o essencial sai **de graça** dos carimbos que já gravamos. Prioridade 2 (modo Monitoramento).
7. **Relógio por mecânico** (clock on/off em cada carro, eficiência = horas pagas / horas marcadas): valor real só em oficinas que pagam por hora produtiva. Prioridade 3.
8. **Capacidade em horas** (horas de mão de obra disponíveis × horas previstas por serviço): depende de ter tempo padrão por serviço (Autodata/HaynesPro). Não temos tempos padrão nem orçamento por hora. Prioridade 3, ver D.9.

Fora de escopo: TV de sala de espera para clientes (temos notificações ao cliente), integração com dados técnicos de tempos de reparo.

---

## B. Conceitos e vocabulário

Problema: "Box" e "Vaga" não dizem o que são. Solução: um nome de grupo (**Postos**), três tipos com explicação de uma linha, e a regra de ocupação de cada tipo escrita na tela. Os valores no banco (`elevador`, `box`, `vaga`) **não mudam**; só os rótulos.

| Valor no banco | Rótulo pt (BR) | Explicação de uma linha (aparece ao cadastrar e no `title` da linha) | Regra |
|---|---|---|---|
| grupo | **Postos da oficina** | "Elevadores, postos de trabalho no chão e vagas de espera. Cada carro pode estar em um posto por vez." | — |
| `elevador` | **Elevador** | "Levanta o carro. Um carro por vez; é o recurso que a visão por hora controla." | 1 carro por vez, por hora |
| `box` | **Posto no chão** | "Lugar de trabalho sem elevador (diagnóstico, elétrica, pneus). Um carro por vez." | 1 carro por vez, por hora |
| `vaga` | **Vaga de espera** | "Onde o carro fica parado: esperando peça, aprovação do cliente ou retirada. Pode ter vários carros." | sem limite (capacidade configurável, padrão 1 não — padrão "muitos") |

Sugestões que traduzem bem (já verificados os rótulos atuais em `et/it/en/ru.oficina.json`):

| chave | pt | pt-PT | en | et | it | ru |
|---|---|---|---|---|---|---|
| `quadroPostos` | Postos da oficina | Postos da oficina | Workshop bays | Töökoja kohad | Postazioni dell'officina | Рабочие места |
| `quadroTipoBox.elevador` | Elevador | Elevador | Lift | Tõstuk | Ponte | Подъёмник |
| `quadroTipoBox.box` | Posto no chão | Posto no chão | Floor bay (no lift) | Töökoht (ilma tõstukita) | Postazione a terra | Место без подъёмника |
| `quadroTipoBox.vaga` | Vaga de espera | Lugar de espera | Waiting space | Ootekoht | Posto di sosta | Место ожидания |
| `quadroTipoBoxExplica.elevador` | Levanta o carro. Um carro por vez. | … | Lifts the car. One car at a time. | Tõstab auto üles. Üks auto korraga. | Solleva l'auto. Un'auto alla volta. | Поднимает автомобиль. Один автомобиль за раз. |
| `quadroTipoBoxExplica.box` | Trabalho sem elevador. Um carro por vez. | … | Work without a lift. One car at a time. | Töö ilma tõstukita. Üks auto korraga. | Lavoro senza ponte. Un'auto alla volta. | Работа без подъёмника. Один автомобиль за раз. |
| `quadroTipoBoxExplica.vaga` | Carro parado esperando peça, cliente ou retirada. | … | Car parked waiting for parts, the customer or pick-up. | Auto ootab varuosa, klienti või kättesaamist. | Auto ferma in attesa di ricambi, del cliente o del ritiro. | Автомобиль ждёт запчасти, клиента или выдачи. |

Outros termos usados neste projeto (nomes de tela, pt):

- **Previsto** = o que foi combinado (entrada e entrega prometidas). **Real** = o que aconteceu (clique de check-in e de entrega).
- **Ocupação** = intervalo em que um carro está num posto (`inicio`→`fim`). **Reserva** = ocupação futura ainda não iniciada.
- **Hoje / linha de agora** = linha vertical no instante atual, no fuso da oficina.
- **Parado** (idle) = carro na oficina, sem estar em elevador/posto e sem etapa "aguardando" registrada (ninguém está mexendo nele e ninguém sabe por quê).

---

## C. Modelo de dados

Princípio: reaproveitar `agenda`, `manutencao_etapas`, `agenda_historico` e `oficina_boxes`; acrescentar **uma** tabela nova (ocupações de posto) e poucas colunas. Tudo compatível com as linhas existentes (backfill na migração).

### C.1 `agenda`: carimbos reais e entrada prevista

```sql
-- 057_quadro_tempos_reais.sql
ALTER TABLE agenda
  ADD COLUMN IF NOT EXISTS data_inicio_prevista timestamptz,  -- entrada combinada (data_inicio e sobrescrita no check-in antecipado)
  ADD COLUMN IF NOT EXISTS checkin_em  timestamptz,           -- clique de check-in (real)
  ADD COLUMN IF NOT EXISTS entregue_em timestamptz;           -- clique de entrega (real)

-- backfill: previsto = o que esta la; real = historico/etapas quando existirem
UPDATE agenda SET data_inicio_prevista = data_inicio WHERE data_inicio_prevista IS NULL;
UPDATE agenda a SET checkin_em = h.t FROM (
  SELECT agenda_id, min(created_at) t FROM agenda_historico WHERE acao IN ('checkin','checkin_antecipado') GROUP BY agenda_id
) h WHERE h.agenda_id = a.id AND a.checkin_em IS NULL;
UPDATE agenda a SET checkin_em = e.t FROM (
  SELECT agenda_id, min(created_at) t FROM manutencao_etapas WHERE status = 'recebido' GROUP BY agenda_id
) e WHERE e.agenda_id = a.id AND a.checkin_em IS NULL;
-- em andamento sem nenhum carimbo (dados antigos): assume a entrada prevista
UPDATE agenda SET checkin_em = data_inicio WHERE checkin_em IS NULL AND status IN ('em_andamento','concluido');
UPDATE agenda SET entregue_em = data_fim WHERE entregue_em IS NULL AND status = 'concluido';

-- quem grava: so o servidor (/api/servico e lib/entrega.ts). A RLS de UPDATE da
-- equipe (010) continua; o trigger abaixo impede que a tela mude os carimbos.
CREATE OR REPLACE FUNCTION agenda_carimbos_so_servidor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.role() = 'authenticated' AND (
     NEW.checkin_em IS DISTINCT FROM OLD.checkin_em OR NEW.entregue_em IS DISTINCT FROM OLD.entregue_em) THEN
    RAISE EXCEPTION 'carimbos reais so pelo servidor' USING ERRCODE = '42501';
  END IF;
  -- entrada prevista nasce da primeira data_inicio e nao muda por check-in
  IF TG_OP = 'INSERT' AND NEW.data_inicio_prevista IS NULL THEN NEW.data_inicio_prevista := NEW.data_inicio; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agenda_carimbos BEFORE INSERT OR UPDATE ON agenda FOR EACH ROW EXECUTE FUNCTION agenda_carimbos_so_servidor();
CREATE INDEX IF NOT EXISTS agenda_oficina_checkin_idx ON agenda (oficina_id, checkin_em) WHERE checkin_em IS NOT NULL;
```

Mudanças de código:
- `/api/servico` `checkin`: gravar `checkin_em = agora` (além do que já faz). Continuar sobrescrevendo `data_inicio` no antecipado (as telas Dia/Lista agrupam por `data_inicio`), mas agora a previsão fica em `data_inicio_prevista`. Quando o dono **reagenda** (edição do evento), `data_inicio_prevista` acompanha `data_inicio` enquanto `status = 'agendado'` (é a nova promessa); depois do check-in, não muda mais.
- `lib/entrega.ts`: `entregue_em = agora` junto com `data_fim`.
- `oficina/checkin/page.tsx` ("Check-in manual" de carro de balcão): acrescentar a opção **"O carro já está aqui"** (marcada por padrão quando a data é hoje) que, depois de criar o evento, chama `/api/servico` `checkin`. Hoje essa tela cria um "agendado" e confunde: o carro está na porta mas o Quadro mostra "check-in pendente".
- `agenda_historico`: nada a mudar; continua sendo a trilha de auditoria. As colunas novas são o **cache de consulta**.

### C.2 `oficina_boxes`: capacidade da vaga e explicação

```sql
ALTER TABLE oficina_boxes ADD COLUMN IF NOT EXISTS capacidade integer NOT NULL DEFAULT 1 CHECK (capacidade BETWEEN 1 AND 50);
-- vaga de espera cabe "varios" por padrao
UPDATE oficina_boxes SET capacidade = 20 WHERE tipo = 'vaga' AND capacidade = 1;
```

Não cria tipos novos. Quem quiser "pátio" cadastra uma `vaga` chamada "Pátio" com capacidade 20.

### C.3 Nova tabela: ocupações de posto (intervalos, inclusive reservas)

```sql
-- 058_posto_ocupacoes.sql
CREATE TABLE IF NOT EXISTS posto_ocupacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oficina_id uuid NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  box_id uuid NOT NULL REFERENCES oficina_boxes(id) ON DELETE CASCADE,
  agenda_id uuid NOT NULL REFERENCES agenda(id) ON DELETE CASCADE,
  inicio timestamptz NOT NULL,
  fim timestamptz,                               -- NULL = carro ainda no posto (so quando real = true)
  real boolean NOT NULL DEFAULT false,           -- false = reserva (planejada); true = o carro esta/esteve la
  funcionario_id uuid REFERENCES funcionarios(id) ON DELETE SET NULL,
  por_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fim IS NULL OR fim > inicio),
  CHECK (real OR fim IS NOT NULL)                -- reserva sempre tem fim
);
CREATE INDEX posto_ocupacoes_box_idx ON posto_ocupacoes (box_id, inicio);
CREATE INDEX posto_ocupacoes_agenda_idx ON posto_ocupacoes (agenda_id);
CREATE INDEX posto_ocupacoes_abertas_idx ON posto_ocupacoes (oficina_id) WHERE fim IS NULL;

ALTER TABLE posto_ocupacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY posto_ocupacoes_select ON posto_ocupacoes FOR SELECT TO authenticated
  USING (oficina_id IN (SELECT minhas_oficinas()) OR eh_admin());
-- grava so o servidor (/api/servico), como agenda_historico
REVOKE ALL ON posto_ocupacoes FROM anon;
GRANT SELECT ON posto_ocupacoes TO authenticated;

-- mesma oficina e posto ativo (igual ao trigger agenda_box_da_oficina de 053)
CREATE OR REPLACE FUNCTION posto_ocupacao_valida() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM oficina_boxes b WHERE b.id = NEW.box_id AND b.oficina_id = NEW.oficina_id AND b.ativo)
     OR NOT EXISTS (SELECT 1 FROM agenda a WHERE a.id = NEW.agenda_id AND a.oficina_id = NEW.oficina_id) THEN
    RAISE EXCEPTION 'posto ou agendamento de outra oficina' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER posto_ocupacao_valida BEFORE INSERT OR UPDATE ON posto_ocupacoes FOR EACH ROW EXECUTE FUNCTION posto_ocupacao_valida();

-- agenda.box_id passa a ser CACHE do "posto atual" (ocupacao real aberta):
-- as telas antigas (Dia, veiculos-em-servico, app) continuam lendo box_id.
CREATE OR REPLACE FUNCTION posto_ocupacao_sincroniza_box() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE aid uuid := COALESCE(NEW.agenda_id, OLD.agenda_id);
BEGIN
  UPDATE agenda SET box_id = (
    SELECT box_id FROM posto_ocupacoes WHERE agenda_id = aid AND real AND fim IS NULL ORDER BY inicio DESC LIMIT 1
  ) WHERE id = aid;
  RETURN NULL;
END $$;
CREATE TRIGGER posto_ocupacao_sincroniza AFTER INSERT OR UPDATE OR DELETE ON posto_ocupacoes
  FOR EACH ROW EXECUTE FUNCTION posto_ocupacao_sincroniza_box();

-- backfill: todo carro com box_id hoje vira uma ocupacao real aberta
INSERT INTO posto_ocupacoes (oficina_id, box_id, agenda_id, inicio, real)
SELECT a.oficina_id, a.box_id, a.id, GREATEST(COALESCE(a.checkin_em, a.data_inicio), now() - interval '1 day'), true
FROM agenda a WHERE a.box_id IS NOT NULL AND a.status = 'em_andamento';

-- tempo real: a visao por hora precisa ver reservas feitas em outro aparelho
ALTER PUBLICATION supabase_realtime ADD TABLE public.posto_ocupacoes;
```

Decisões:
- **Sem exclusion constraint no banco na Fase 1.** O código atual tolera dois carros no mesmo elevador (o conflito é avisado, não bloqueado — comentário da 053) e o backfill poderia falhar. O servidor recusa sobreposição com `409 CONFLITO_POSTO` (vagas com `capacidade > 1` contam ocupações simultâneas). Na Fase 2, depois de limpar os dados, acrescentar `EXCLUDE USING gist (box_id WITH =, tstzrange(inicio, COALESCE(fim,'infinity')) WITH &&) WHERE (…capacidade = 1)` via `btree_gist`.
- `agenda.box_id` **continua existindo** como cache: zero quebra em `veiculos-em-servico`, no cartão do Dia e no app.
- O `agenda_historico` continua recebendo `acao = 'elevador'` com `detalhe {anterior, novo, ocupacao_id}`; acrescentar `'posto_reserva'` ao CHECK (054) para reservas feitas/canceladas.

### C.4 `oficinas`: limite geral e modo Monitoramento

```sql
ALTER TABLE oficinas
  ADD COLUMN IF NOT EXISTS capacidade_total integer CHECK (capacidade_total IS NULL OR capacidade_total BETWEEN 1 AND 500),
  ADD COLUMN IF NOT EXISTS monitoramento_ativo boolean NOT NULL DEFAULT false;
```

- `capacidade_total` = carros simultâneos na oficina (`agendado` do dia + `em_andamento`), contando todos os tipos. `NULL` = sem limite (igual ao comportamento atual). Vale junto com `capacidade_servicos`: o primeiro limite que estourar avisa/bloqueia (ver D.8).
- `monitoramento_ativo` liga a seção E.

### C.5 Fase 3 (não criar agora): tempo por mecânico

```sql
-- 06x_tempos_mecanico.sql (fase 3)
CREATE TABLE agenda_tempos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id uuid NOT NULL REFERENCES agenda(id) ON DELETE CASCADE,
  funcionario_id uuid NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  inicio timestamptz NOT NULL, fim timestamptz, CHECK (fim IS NULL OR fim > inicio)
);
```
Um mecânico tem no máximo um `agenda_tempos` aberto (índice único parcial em `funcionario_id WHERE fim IS NULL`). Fica documentado para não desenhar a Fase 1 de um jeito que bloqueie isso.

### C.6 Tempo real e carga de dados

- `use-agenda.ts` passa a selecionar também `ocupacoes:posto_ocupacoes(*)` e a assinar `posto_ocupacoes` (filtro `oficina_id`). Mesmo debounce.
- Para o Quadro de 14 dias, as ocupações já vêm junto. Para a visão hora a hora, filtrar no cliente pelo dia (volume pequeno: ≤ 6 postos × ≤ 20 ocupações/dia).
- A "linha de agora" e os contadores de tempo (E) avançam com `setInterval` de 60 s, sem consultar o banco.

---

## D. Comportamento do Quadro

### D.1 Instante, dia e fuso

Tudo que é "dia" no Quadro é calculado **no fuso da oficina** (`fusoDoPais(oficina.pais)`), não no do navegador. Novo helper em `lib/fuso.ts`:

```ts
export function diaNaOficina(iso: string | Date, pais?: string | null): string // 'YYYY-MM-DD'
export function horaNaOficina(iso: string | Date, pais?: string | null): { h: number; m: number }
export function inicioDoDiaNaOficina(ymd: string, pais?: string | null): string // ISO UTC
```

Motivo: o dono pode olhar a oficina da Estônia a partir do Brasil (−5 h/−6 h); um check-in às 23:30 em Tallinn é "amanhã" no navegador brasileiro. O `dataLocalDe` continua nas telas antigas até migrarem.

### D.2 Barra prevista × barra real (visão 14 dias)

Para cada carro calcular quatro instantes:

| | fonte | quando falta |
|---|---|---|
| `prevIni` | `data_inicio_prevista` | `data_inicio` |
| `prevFim` | `data_fim_prevista` | `data_fim` |
| `realIni` | `checkin_em` | — (ainda não entrou) |
| `realFim` | `entregue_em` | — (ainda não saiu; usar "agora") |

Desenho (uma faixa por carro, duas camadas):

- **Barra real (sólida, com a cor do estado)**: de `realIni` até `realFim` ou hoje. Só existe depois do check-in. É **a** barra: é nela que se clica e arrasta.
- **Barra prevista (fina, cinza tracejada, por baixo, 6 px de altura no rodapé da faixa)**: de `prevIni` a `prevFim`. Mostrada **somente quando difere** da real em pelo menos um dia (entrou antes/depois, saiu antes/depois, ou ainda não entrou e já passou). Carro que entrou e saiu no dia previsto: só a barra sólida — tela limpa.
- **Carro ainda agendado** (sem check-in): barra sólida azul de `prevIni` a `prevFim` (é a única informação). Se `prevIni < hoje` e sem check-in: barra vermelha "check-in atrasado" de `prevIni` até hoje (comportamento atual, mantido).
- **Carro entregue**: só a real, cinza (`entregue`). Exemplo do dono: entrou hoje 09:10, saiu 16:40 → um bloco cinza só na coluna de hoje; se estava previsto de ontem até amanhã, aparece o tracejado fino de ontem a amanhã por baixo, e no `title`: "Previsto 08/10–10/10 · Real 09/10".
- **Prazo estourado**: real sólida vai até hoje em vermelho a partir do dia seguinte a `prevFim` (a parte dentro do prazo mantém a cor do estado; a parte além fica vermelha — duas cores na mesma barra, como fazem os planners de Gantt com "slack negativo").
- Toggle **"Mostrar previsto"** (padrão ligado) no cabeçalho, salvo em `localStorage bipfix_quadro_previsto`.

Linha de hoje: já existe (`bg-primary-300` no meio da coluna). Passa a ser **a linha de agora** com posição proporcional à hora dentro da coluna do dia (no fuso da oficina) e um rótulo "14:32" no cabeçalho. Dias passados recebem fundo `bg-gray-50`.

### D.3 Estados e cores (legenda única, usada nas três visões)

| estado (`Estado`) | quando | cor | mantém? |
|---|---|---|---|
| `agendado` | `status=agendado`, `prevIni ≥ hoje` | azul `bg-blue-600` | sim |
| `checkinAtrasado` | `status=agendado`, `prevIni < hoje`, sem `no_show` | vermelho `bg-red-600` | sim |
| `naOficina` | `em_andamento`, etapa atual em `recebido/diagnostico/em_execucao/teste_final` | verde `bg-green-600` | sim |
| `aguardandoPecas` | etapa atual `aguardando_pecas` ou `pausa_pecas` | âmbar `bg-amber-500` | sim |
| `aguardandoCliente` | etapa atual `pausa_cliente` (aprovação de orçamento/revisão) | roxo claro `bg-violet-400` | **novo** |
| `pausado` | etapa atual `pausa_geral` | cinza-azulado `bg-slate-400` | **novo** |
| `pronto` | etapa atual `concluido` (esperando retirada) | roxo `bg-purple-600` | sim |
| `atrasado` | `em_andamento` e `agora > prevFim` | vermelho só na parte além do prazo | ajustado (D.2) |
| `falta` | `no_show` | laranja `bg-orange-400` | sim |
| `entregue` | `status=concluido` | cinza `bg-gray-300` | sim |
| `interno` | `tipo=externo` (serviço de balcão) | ardósia `bg-slate-500` | sim; passa a ser um **contorno** (borda tracejada) sobre a cor do estado, não uma cor própria — hoje um carro de balcão perde a informação de estado |

Ícones na barra (texto, sem depender de cor): `⚠` prazo/atrasos (já existe), `🛗` carro no elevador agora, `⏸` esperando peça/cliente, `✓` pronto. Legenda no rodapé ganha esses ícones.

### D.4 Visão **Dia por hora** (nova; pedido 2)

Onde: dentro de `QuadroOficina`, um terceiro botão em "Ver por": **Mecânico · Posto · Hora** (`Por = 'mecanico' | 'elevador' | 'hora'`). Mantém `bipfix_quadro_por`. Não é uma quinta visão da agenda: o "Dia" atual (lista de cartões com botões de check-in/etapas/entrega) continua como está.

Layout:

- Cabeçalho: ‹ dia › · "Hoje" · data por extenso; colunas de hora do `horario_funcionamento` do dia (ex.: 08:00–18:00) com 1 h de folga antes e depois; se há ocupação fora disso, estende. Largura: 96 px por hora no computador (grade de 15 min), 64 px no celular com rolagem horizontal e a coluna de rótulos fixa (`sticky left-0`, como hoje).
- Linhas: um **posto** por linha (elevadores primeiro, depois postos no chão, depois vagas), com nome, tipo em cinza e, na célula fixa, o **status agora**: "Livre até 11:30", "Ocupado · ABC-123 desde 09:10", "Reservado 14:00–16:00".
- Última linha: **"Na oficina, sem posto"**: carros com check-in feito e sem ocupação real aberta, desenhados do `checkin_em` (ou do início do dia) até agora como barra fina na cor do estado. É a lista de quem está "esperando lugar".
- Barras na linha do posto = `posto_ocupacoes` do dia: **real** (sólida, cor do estado do carro, aberta = vai até a linha de agora e continua com borda "em andamento"); **reserva** (contorno tracejado azul, interior branco, rótulo "Reserva · placa"). Reserva vencida (fim < agora e sem ocupação real) fica em laranja com `⚠ Reserva não usada`.
- **Linha de agora** vertical em toda a altura, rótulo com a hora; atualiza a cada minuto.
- Faixa de **disponibilidade** por hora no topo (como a de hoje por dia): elevadores livres naquela hora; vermelho = 0.

Ações (todas via `/api/servico`, gravadas em `posto_ocupacoes` + `agenda_historico`):

| ação | quem | como na tela | API |
|---|---|---|---|
| Colocar no posto agora | dono; mecânico nos carros dele | arrastar barra de "sem posto" para a linha do posto, ou botão "Colocar agora" na folha do carro | `acao:'posto_entrar', eventoId, boxId` → fecha ocupação real aberta anterior (se houver), abre nova com `inicio=agora`; se há reserva do mesmo carro cobrindo agora, converte a reserva (`real=true`) em vez de criar outra |
| Tirar do posto | idem | botão "Tirar do elevador" na folha; arrastar para "sem posto" | `acao:'posto_sair', eventoId` → `fim=agora` na ocupação aberta |
| Reservar intervalo | idem | clicar/arrastar num trecho **livre** da linha do posto abre a folha "Reservar": carro (lista: na oficina, agendados do dia), início, duração (15 min a 8 h, padrão 1 h), observação | `acao:'posto_reservar', eventoId, boxId, inicio, fim` → `409 CONFLITO_POSTO` com a lista de quem ocupa; a tela destaca o trecho em vermelho antes de enviar |
| Mover / esticar reserva | idem | arrastar a barra na horizontal (início) ou pela borda direita (fim); entre linhas = trocar de posto | `acao:'posto_mover', ocupacaoId, boxId?, inicio?, fim?` (só reservas; ocupação real só muda `fim` se ainda aberta — não se reescreve passado) |
| Cancelar reserva | idem | "×" na barra | `acao:'posto_cancelar', ocupacaoId` |

Regras:
- Reservar só **hoje ou futuro** (até 14 dias; coincide com a janela do Quadro). Passado não se edita: é monitoramento.
- Sobreposição em elevador/posto (`capacidade = 1`) é recusada pelo servidor; em vaga com capacidade N, a (N+1)-ésima é recusada.
- Carro que entra no posto "agora" mas tem reserva de outro carro começando em < 30 min: aviso amarelo na folha ("Reservado para XYZ às 14:00"), não bloqueia.
- Entrega (`entregarServico`) fecha todas as ocupações reais abertas do carro e cancela (apaga) reservas futuras dele. Cancelamento do evento (`status=cancelado` / no-show) idem.
- Desativar um posto (`desativarBox`) continua chamando `posto_sair` para cada carro nele e apaga as reservas futuras do posto, com aviso na tela de quantas foram apagadas.
- Mecânico: o botão "Check-in" (Dia/Lista/veículos-em-serviço) ganha, quando a oficina tem postos, um seletor opcional **"Colocar em: — / Elevador 1 / …"**. Check-in + posto num clique só é o fluxo normal da oficina pequena.

### D.5 Visão por mecânico (14 dias)

Mantida. Ganha: barras previstas/reais (D.2), estados novos (D.3), e no rótulo da barra o posto atual (`· Elevador 1`) já existe. Carga na célula fixa passa a mostrar `2 na oficina / 3` **e**, se o monitoramento estiver ligado, "1 parado há 3 h" em vermelho.

### D.6 Visão por posto (14 dias)

Mantida como panorama, mas a ocupação passa a vir de `posto_ocupacoes` (não do `box_id` × dias do carro): o dia fica "ocupado" no elevador só se houve/há ocupação real ou reserva nesse dia. Conflito de dois carros no mesmo dia **deixa de ser erro** (podem ter sido 2 h cada); o erro passa a ser sobreposição de intervalo, que a visão por hora mostra e o servidor recusa. Clicar num dia desta visão abre a visão Hora naquele dia.

### D.7 O que acontece em cada evento

| evento | `agenda` | `manutencao_etapas` / `agenda_historico` | `posto_ocupacoes` | Quadro |
|---|---|---|---|---|
| Check-in | `status=em_andamento`, `checkin_em=agora` (+ `data_inicio=agora` se antecipado) | `recebido` + `checkin` (como hoje) | se veio `boxId`: ocupação real aberta | barra real começa agora; sai de "check-in pendente" |
| Etapa `aguardando_pecas` / `pausa_pecas` / `pausa_cliente` | — | etapa + histórico | **não mexe**, mas se o carro está em elevador a folha pergunta "Tirar do elevador e mover para a vaga de espera?" (um clique; aviso persistente na barra `⚠ no elevador esperando`) | cor muda |
| Etapa `em_execucao` | — | idem | se há reserva do carro cobrindo agora e sem ocupação real: pergunta "Colocar no Elevador 1 agora?" | cor verde |
| Etapa `concluido` (pronto) | — | idem; cliente avisado (já) | sugere tirar do elevador | roxo; entra no alerta "prontos esperando retirada" |
| Entrega | `status=concluido`, `data_fim=agora`, `entregue_em=agora` | `entregue` + histórico (já) | fecha abertas, apaga reservas | barra real termina agora, vira cinza |
| No-show | `no_show=true` | — | apaga reservas | laranja |
| Reagendar (edição) | `data_inicio/fim` e, se `agendado`, `data_inicio_prevista/data_fim_prevista` | histórico `reagendado` (acrescentar ao CHECK) | reservas fora do novo intervalo são apagadas com aviso | barra prevista muda |

### D.8 Capacidade (pedido 5)

Dois limites, em **carros**, ambos no Perfil (seção "Capacidade"):

1. **Por tipo de serviço** (`capacidade_servicos`, existe): "Mecânica: 4, Elétrica: 2…". Vazio = sem limite.
2. **Geral da oficina** (`capacidade_total`, novo): "Carros ao mesmo tempo na oficina: 8". Vazio = sem limite. Texto de ajuda: "Conte elevadores, postos e vagas de espera. Se não souber, deixe vazio." Sugestão automática ao lado: "Você tem 3 elevadores, 1 posto e 1 vaga (20) = 24" — só sugestão, não impõe.

Onde valem:
- **Roteamento de emergências** (`oficinaTemCapacidade`): passa a checar os dois (tipo **e** total). Carga total = `agendado` (hoje ou atrasado) + `em_andamento`.
- **Quadro**: faixa de disponibilidade por dia mostra `ocupados / capacidade_total` e fica laranja ao atingir e vermelha ao passar; alerta no topo "Oficina acima do limite: 9 / 8". Mecânico acima de `capacidade_maxima`: já existe.
- **Aceite de pedido / novo evento externo**: aviso (não bloqueio) "Neste dia a oficina já tem 8 / 8 carros". Bloquear seria perigoso em piloto (o dono pode querer aceitar mesmo assim). Decisão: **avisar, nunca bloquear** fora do roteamento automático.

Capacidade em **horas** (horas-mecânico disponíveis vs. previstas): não agora. Exigiria tempo previsto por serviço (não temos; orçamentos são por valor) e jornada por mecânico. Reavaliar na Fase 3 quando houver `agenda_tempos` (C.5) e dados reais de duração por tipo (o `CapacidadeResumo` já calcula tempo médio por etapa; com 3 meses de dados dá para sugerir horas por tipo automaticamente). Em carros é o que oficinas de 1–10 mecânicos realmente usam ("cabem 6 carros").

### D.9 Números de utilização (barra de indicadores, abaixo do Quadro, no `CapacidadeResumo`)

- Hoje: elevadores ocupados agora `2 / 3`; horas de elevador usadas hoje `5,5 h de 30 h (18 %)` (soma das ocupações reais do dia ÷ (nº elevadores × horas de funcionamento)).
- Semana: utilização média de cada elevador (%), carros entregues no prazo (%), tempo médio na oficina por tipo.
- Lista "Elevadores livres agora" com "livre até HH:MM" (próxima reserva).

### D.10 Celular (390 px)

- 14 dias: igual ao atual (rolagem horizontal, rótulo fixo). As barras previstas finas somem abaixo de 640 px (só `title`/folha mostram o previsto) para não encher.
- Hora: 64 px/hora, 15-min grid, toque na barra abre a folha; **sem arrastar** no celular — a folha tem "Mover para…", "Início", "Fim" com `<input type=time>`; reserva por toque longo no trecho livre (ou botão "+ Reservar" na célula fixa do posto). Hoje o Quadro já é "toque para escolher" no celular.
- Linha "Na oficina, sem posto" vira a primeira linha no celular (é a mais consultada).

---

## E. Modo Monitoramento (liga/desliga no Perfil: `oficinas.monitoramento_ativo`)

Desligado (padrão): o Quadro mostra só estados e postos. Ligado: aparecem tempos, sem nenhum dado a mais para digitar — tudo vem dos carimbos já gravados.

O que mostra:

| medida | cálculo | onde |
|---|---|---|
| Tempo na oficina | `agora (ou entregue_em) − checkin_em` | folha do carro; barra (`3d 4h`); linha do mecânico |
| Tempo em elevador/posto | soma de `posto_ocupacoes` reais do carro | folha; relatório |
| Tempo por etapa | `created_at` da etapa seguinte − da atual (já calculado em `CapacidadeResumo`), por carro e média por oficina | folha (linha do tempo com durações) |
| Esperando peça / cliente | soma das etapas `aguardando_pecas`, `pausa_pecas` / `pausa_cliente` | folha; indicador "tempo que não depende de nós" |
| **Parado** (idle) | carro `em_andamento`, sem ocupação real aberta, etapa atual não é "aguardando/pausa/concluido", há mais de X min (padrão 120, configurável) | `⏳` na barra, alerta no topo "2 carros parados sem motivo", célula do mecânico |
| Previsto × real | `entregue_em − data_fim_prevista` (atraso) e `checkin_em − data_inicio_prevista` | folha ("Entregue 1 dia depois do previsto"); % no prazo na semana |
| Reserva não usada | reserva com `fim < agora` sem ocupação real do mesmo carro no posto nesse intervalo | laranja na visão Hora; contador |
| Elevador ocupado por carro parado | ocupação real aberta e etapa atual em `aguardando_*`/`pausa_*`/`concluido` há > 30 min | `⚠` na linha do posto; alerta "elevador preso" |

Alertas ligados ao monitoramento aparecem na faixa roxa do topo (já existe `alertas`), nunca como notificação push — o dono olha o Quadro.

Leve para oficina pequena: nenhuma tela nova obrigatória; um interruptor; os números aparecem na folha e no rodapé. Oficina com um mecânico e um elevador pode deixar desligado e nada muda.

Relatório (Fase 2): "Semana" com tabela por carro (placa, entrada real, saída real, previsto, horas em elevador, horas esperando, parado) e CSV. Fase 3: por mecânico, com `agenda_tempos`.

---

## F. Plano por fases

### Fase 1 — agora (pedidos 1, 2, 4, 5)

Entregas:
1. Migrações `057` (carimbos + `capacidade_total` + `monitoramento_ativo` + `capacidade` do posto) e `058` (`posto_ocupacoes`), com backfill.
2. `/api/servico`: `checkin` grava `checkin_em` e aceita `boxId`; novas ações `posto_entrar`, `posto_sair`, `posto_reservar`, `posto_mover`, `posto_cancelar`; `elevador` (antiga) passa a ser alias de `posto_entrar`/`posto_sair` (o app e testes antigos continuam funcionando). `lib/entrega.ts` grava `entregue_em` e fecha ocupações.
3. `lib/fuso.ts`: `diaNaOficina`, `horaNaOficina`; o Quadro usa o fuso da oficina.
4. `QuadroOficina.tsx`: barras real/prevista, linha de agora, estados `aguardandoCliente`/`pausado`, `interno` como contorno, toggle "Mostrar previsto", visão **Hora** completa (D.4) com folha de reserva, linha "sem posto".
5. Vocabulário B em 6 idiomas (`quadroPostos`, `quadroTipoBox.*`, `quadroTipoBoxExplica.*`, textos da visão Hora, erros `CONFLITO_POSTO`).
6. Perfil: campo "Carros ao mesmo tempo na oficina"; `oficinaTemCapacidade` checa os dois limites; Quadro mostra `ocupados / total`.
7. `oficina/checkin/page.tsx`: opção "O carro já está aqui" → check-in real.
8. Botão Check-in (Dia/Lista/veículos-em-serviço): seletor "Colocar em".

Critérios de aceite:
- Carro com previsão 08/10–10/10, check-in 09/10 09:10, entrega 09/10 16:40: Quadro mostra bloco cinza só em 09/10; tracejado fino 08–10 só com "Mostrar previsto" ligado; `title` traz previsto e real.
- Carro em andamento, previsto até ontem: parte até ontem na cor do estado, de ontem até agora em vermelho; alerta "Prazos estourados: 1".
- Visão Hora: dois carros, elevador 1; A entra 09:00 (ocupação aberta até a linha de agora); reservar B 09:30–10:30 → `409 CONFLITO_POSTO` e trecho vermelho; reservar 11:00–12:00 → barra tracejada; tirar A 10:40 → ocupação fecha; mover B para 10:45 ok.
- Reserva e ocupação feitas num aparelho aparecem no outro sem recarregar (realtime).
- Mecânico com acesso só mexe nos carros dele; `atribuir` continua só do dono; `posto_*` com `eventoId` de outra oficina → 404/403.
- `agenda.box_id` fica igual ao posto da ocupação real aberta (lido pelo app e pelo Dia).
- Perfil com total 2 e dois carros em andamento: faixa do Quadro vermelha "2 / 2", alerta; emergência nova prioriza outra oficina (`oficinaTemCapacidade` false) mesmo com `capacidade_servicos` vazio.
- Dono no Brasil (navegador −6 h) vendo oficina EE: check-in registrado 23:30 Tallinn aparece no dia de Tallinn.
- 6 idiomas: nenhum `??chave` cru, nenhuma rolagem horizontal da página (só do Quadro) em 360–1920 px.

Testes e2e (Playwright, padrão de `scripts/e2e/site-quadro.mjs`; produção com dados `TESTE` e limpeza no `finally`):
- `site-quadro-real.mjs`: cenários de barra real × prevista (entrou/saiu hoje; atrasado; agendado futuro; check-in antecipado), toggle, `title`, nos 6 idiomas (um idioma completo + varredura de chaves cruas nos outros 5).
- `site-quadro-hora.mjs`: visão Hora no computador (arrastar, reservar, conflito, mover, cancelar) e no celular (folha com horários), realtime em dois contextos, permissões do mecânico, desativar posto com reservas.
- `site-capacidade-total.mjs`: perfil → Quadro → roteamento de emergência (reusa `site-atendimento.mjs` para quem recebe).
- `seguranca-rls.mjs`: acrescentar `posto_ocupacoes` (anon sem acesso; oficina B não lê A; `authenticated` não grava direto; `checkin_em` não pode ser alterado pela tela).
- Atualizar `site-quadro.mjs` passo 4: "conflito" agora é por intervalo, não por dia.

### Fase 2 — monitoramento e proteção (2–4 semanas depois)

1. Interruptor "Monitoramento" no Perfil; medidas de E na folha, na barra e nos alertas; "parado há X" com limiar configurável.
2. Relatório "Semana" + CSV; utilização por elevador em %; % no prazo.
3. Exclusion constraint em `posto_ocupacoes` (`btree_gist`) depois de verificar que não há sobreposições.
4. Aviso de capacidade no aceite de pedido e no evento externo.
5. **Quadro de parede (TV)**: `/oficina/quadro-tv?token=` — página sem menu, fonte grande, só leitura, visão Hora de hoje + lista "pronto para retirar"; token por oficina em `oficinas.tv_token` (regenerável), sem sessão, `noindex`. É o que AutoVitals/Tekmetric fazem com o monitor no chão da oficina.
6. Cliente (app): "seu carro está no elevador / esperando peça desde HH:MM" **só** se a oficina ligou "mostrar ao cliente" (interruptor separado; padrão desligado).

Aceite: medidas conferidas contra dados semeados (carimbos conhecidos → números esperados ao minuto); TV abre sem login e não vaza outra oficina; teste `site-monitoramento.mjs`.

### Fase 3 — tempo por mecânico e capacidade em horas (quando houver pedido real)

1. `agenda_tempos` (C.5): botão "Começar / Pausar" por carro na tela do mecânico (celular); eficiência por mecânico (horas trabalhadas ÷ horas na oficina) — é o "Time Manager" do Mitchell1 reduzido ao essencial.
2. Horas previstas por tipo de serviço (sugeridas pelo tempo médio real) e faixa "horas disponíveis × horas previstas" no Quadro.
3. Folgas/ausências do mecânico como bloco cinza na linha dele (como Garage Hive faz com férias/doença).

---

## G. Riscos e casos de borda

| caso | decisão |
|---|---|
| **Fuso** (oficina EE vs IT vs BR; dono viajando) | tudo por `fusoDoPais(oficina.pais)`; nunca `getHours()` do navegador no Quadro. Horário de verão: `horaLocalEmUtc` já faz as duas passagens; a visão Hora de um dia com 23/25 h desenha as horas reais do dia (coluna a mais/a menos), sem pular |
| **Carro atravessa a meia-noite** no elevador (ocupação aberta de ontem) | na visão Hora de hoje a barra começa no início do dia com seta `←`; na de ontem termina no fim do dia com `→`; horas de elevador do dia contam só a parte dentro do dia |
| **Cancelamento** (`status=cancelado`, no-show, revisão recusada) | fecha ocupações abertas (`fim=agora`), apaga reservas futuras; barra some do Quadro (já é filtrado), fica no histórico |
| **Posto desativado** com ocupações abertas/reservas | `posto_sair` para cada carro + apagar reservas + aviso com contagem; histórico guarda `{anterior}`; linha some (ocupações passadas continuam no relatório com o nome do posto, lido por `box_id` mesmo inativo) |
| **Dois mecânicos no mesmo carro** | o modelo tem um `funcionario_id` responsável; ajuda de outro mecânico não é registrada na Fase 1. Na Fase 3, `agenda_tempos` aceita vários mecânicos por carro. Não criar "co-responsável" agora |
| **Mecânico (`cargo=mecanico`, acesso ao portal)** | vê só os carros dele (filtro atual em `allEventos`); na visão Hora vê todos os postos (precisa saber o que está livre) mas só move/reserva os carros dele; não troca mecânico; não edita capacidade; servidor valida (`posto_*` exige `ehDono` ou `ev.funcionario_id === euFunc.id`). A reserva de um carro sem mecânico só o dono faz |
| **RLS de UPDATE da equipe em `agenda`** (010 deixa qualquer funcionário ativo atualizar qualquer coluna) | o trigger de C.1 protege `checkin_em/entregue_em`; `posto_ocupacoes` só pelo servidor. Risco residual: funcionário mudar `box_id` direto — o trigger de sincronização reescreve `box_id` a cada mudança de ocupação, e o Quadro passa a ler ocupações, não `box_id`. Aceitável; anotar na auditoria |
| **Dados antigos sem carimbos** (eventos de antes da 041) | backfill assume `data_inicio`; a barra real coincide com a prevista: nada de errado aparece |
| **Check-in antecipado** sobrescreve `data_inicio` (hoje) | mantido por compatibilidade com Dia/Lista; `data_inicio_prevista` preserva a promessa. Teste: antecipado de +2 dias → previsto tracejado começa em +2, real começa hoje |
| **Reserva sem carro** ("bloquear o elevador para manutenção") | não na Fase 1. Fase 2: evento `externo` "Manutenção do elevador" com reserva, sem cliente |
| **Vaga com capacidade N** | contagem no servidor; na visão Hora a linha da vaga empilha barras (faixas, como já faz `faixas`) em vez de bloquear |
| **Relógio do servidor × do aparelho** | carimbos sempre `new Date()` no servidor (`/api/servico`), nunca enviados pela tela, exceto início/fim de **reserva** (futuro, escolhido pelo usuário) |
| **Volume** | ≤ 6 postos × 14 dias × poucas ocupações: tudo no cliente; sem paginação. Se uma oficina passar de 2.000 ocupações, filtrar a consulta por janela (`inicio >= hoje−30d`) no `use-agenda` |
| **Produção vazia / piloto** | nada quebra com zero postos: a visão Hora mostra só "Na oficina, sem posto" e o convite para cadastrar postos (texto `quadroSemElevadoresDono` reescrito com o vocabulário novo) |

---

## Apêndice — fontes consultadas (padrões extraídos)

- **Garage Hive** — agenda com arrastar/tocar; cor da alocação muda quando o técnico atualiza o jobsheet; pausa/almoço vira um bloco na agenda; férias/doença visíveis; atualizações ao vivo entre usuários. https://garagehive.co.uk/features/workshop-management-with-garage-hive/
- **Mitchell1 Manager SE (Time Manager)** — agenda gráfica por técnico, elevador e equipamento (dia/semana/mês); técnico faz clock in/out por item de mão de obra, pausa para almoço; produtividade = horas marcadas ÷ horas pagas. https://mitchell1.com/shopconnection/time-manager-brings-tools-for-managers-technicians/ · https://www.brakeandfrontend.com/mitchell-1-introduces-new-and-improved-scheduler-feature-in-the-latest-release-of-manager-se/
- **Tekmetric (Job Board / RO labels)** — colunas de fluxo + etiquetas "Waiting on Parts", "Waiting on Customer", "Waiting on Sublet"; monitor no box do técnico. https://support.tekmetric.com/hc/en-us/articles/360039292193-RO-Labels-and-Workflow-Statuses · https://www.tekmetric.com/post/repairs-management-software-job-board
- **AutoVitals (SmartFlow / Today's Vehicle Page)** — quadro com todos os carros e a etapa de cada um; barra de status do técnico; monitor na oficina mostrando o que o atendente vê. https://blog.autovitals.com/workflow-management-made-simple · https://support.autovitals.com/hc/en-us/articles/4404073491988-A-Step-by-Step-Guide-to-Understanding-the-Tech-View-on-the-TVP
- **One AM (Itália)** — "planning dei ponti": carga da oficina lida hora a hora; cada comanda ocupa um ponte e um técnico; mover o trabalho atualiza o compromisso do cliente. https://oneam.it/it/prodotti/gestionale-automotive/officina
- **eMotori (Itália)** — agenda com duração do intervento e recursos (funcionários, pontes, unidades móveis, carro de cortesia). https://www.emotori.com/blog/agenda-dofficina-con-il-gestionale-emotori/
- **Carsu (Itália)** — balanceia carga entre pontes e postazioni. https://www.carsu.com/it/software-per/officine-motocicli
- **AutoFutur (Vitec; ~2000 oficinas EE/FI/SE)** — calendário gráfico, reserva de horas de trabalho, pacotes de trabalho. https://www.autofutur.net/ · https://futursoft.fi/en/autofutur-software/
- **Autorsoft (Estônia)** — planejamento das horas da oficina e histórico do carro. https://autorsoft.eu/autoteenindus/
- **HaynesPro WorkshopData** — tempos de reparo padrão (11 M) usados para planejar; base para capacidade em horas (Fase 3). https://www.nexus-auto.net/products/haynespro-workshopdata-car
- **Bryntum Scheduler Pro — Planned vs Actual** — mesmo evento com datas planejadas e reais; baseline por baixo da barra; linha do tempo atual; histograma de utilização de recurso. https://bryntum.com/products/schedulerpro/examples/planned-vs-actual/ · https://bryntum.com/products/schedulerpro/docs/api/SchedulerPro/view/ResourceUtilization
- **Tape chart de hotel** (innRoad, RoomKey, LS Central, RezStream) — quartos nas linhas, dias nas colunas, uma barra por reserva; arrastar troca de quarto; bloqueios de manutenção; chegadas/partidas de hoje em destaque. https://support.innroad.com/support/solutions/articles/153000226394-tape-chart-overview · https://support.roomkeypms.com/a/421965-how-to-use-the-tape-chart-in-your-pms · https://help.lscentral.lsretail.com/Content/LS-Hospitality/LS-Hotels/Tape-Chart.htm
