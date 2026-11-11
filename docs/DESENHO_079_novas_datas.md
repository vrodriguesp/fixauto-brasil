# 079 — Orçamento com datas vencidas: "Tenho interesse, mande novas datas"

Pedido do dono (11/11/2026). Backlog local 002. Este documento traz o desenho, o mapa do código e o plano de testes.
Atualizado em 11/11 com as decisões do dono (sem aviso preventivo; orçamento vencido) e a revisão Fable (`docs/REVISAO_FABLE_079.md`).

## Problema
A oficina manda o orçamento com datas de entrada (`orcamento_disponibilidade`). Quando o motorista abre o orçamento, todas as datas já passaram. Antes:
- a página do cliente (web e app) mostrava só "Os horários oferecidos já passaram. Peça novas datas à oficina por mensagem";
- o `aceitar-orcamento` recusava a escolha (`HORARIO_VENCIDO`);
- a oficina não recebia nenhum aviso e o orçamento morria.

## Fluxo
1. **Motorista**: quando todas as datas do orçamento passaram, o lugar de "Aceitar e agendar" mostra o cartão "As datas desta oficina já passaram".
   - Botão **"Tenho interesse, peça novas datas"**.
   - Opcional: escolher **até 3 sugestões** (dia + manhã/tarde) numa grade dos próximos 14 dias **a partir de amanhã**, no fuso da oficina. Domingo fica fora, e também os dias em que a oficina está fechada pelo horário do perfil, quando ele existe.
   - Opcional: uma mensagem curta, de até 300 caracteres.
   - Texto que avisa o motorista: "Se a oficina confirmar uma das suas datas, o agendamento fica feito com este orçamento".
   - Com pedido pendente: "Pedido enviado em …, aguardando a oficina".
2. **Oficina**: recebe aviso no app/painel, push, e-mail (link curto `/r/<numero>?o=<idioma>&p=1`) e uma linha no chat do pedido. A página do pedido mostra o cartão "O cliente pediu novas datas", com as sugestões. A oficina pode:
   - **a) confirmar uma sugestão do motorista** (só se o turno começa daqui a 2 h ou mais e o orçamento é o mesmo que o cliente viu): a data vira um horário do orçamento (`origem='cliente'`) e o orçamento é **aceito e agendado** automaticamente (mesma lógica do `aceitar-orcamento`). O motorista recebe a confirmação (aviso + e-mail do agendamento).
   - **b) mandar outras datas**: 1 a 3 horários novos (dia, turno e previsão de entrega, que começa em data + prazo do orçamento). O orçamento continua igual: mesmo preço, sem nova revisão e sem afetar a comissão. O motorista recebe aviso, e-mail e linha no chat e escolhe normalmente.
   - O cartão **só aparece com pedido pendente do cliente**: a oficina não é chamada a propor datas sem o cliente pedir (decisão do dono).
3. **Motorista**: se a oficina mandou outras datas, ele vê as novas datas no painel e aceita como hoje.

### Regras
- Pedir novas datas só é possível quando:
  - o orçamento está `enviado` ou `visualizado` e **não venceu** (ver abaixo);
  - o pedido está `aberta`, `em_orcamento` ou `no_show` (pedido `expirada` → `PEDIDO_EXPIRADO`);
  - **todos** os horários já passaram (fuso da oficina) (senão `DATAS_AINDA_VALIDAS`).
- Só 1 pedido pendente por orçamento (`PEDIDO_DATAS_PENDENTE`). O motorista pode pedir para mais de uma oficina, um pedido por orçamento.
- Sugestões: de amanhã até 30 dias à frente, sem repetir, no máximo 3 (`SUGESTAO_INVALIDA`).
- O pedido guarda um retrato do orçamento (valor e número da revisão). A oficina só confirma uma sugestão se o orçamento continua igual (`ORCAMENTO_MUDOU`) e se o turno começa daqui a 2 h ou mais (`SUGESTAO_VENCIDA`). Fora isso, só pode mandar outras datas.
- Quando a oficina manda datas ou confirma uma data depois da validade do orçamento, a **validade é estendida** até a maior data nova (sem contar revisão).
- O pedido pendente é **cancelado** quando:
  - o pedido expira, é cancelado ou é aceito com outra oficina (as outras oficinas com pedido pendente recebem "o cliente fechou com outra oficina; não precisa responder");
  - a oficina revisa/modifica o orçamento (gatilho no banco em `valor_total`, `revisao_numero`, `revisado_em`);
  - o orçamento volta a ter datas futuras, é recusado ou vence (limpeza no cron de hora em hora);
  - a oficina manda outras datas ou confirma uma sugestão (nesse caso o status vira `atendido`).
- Respostas da oficina em corrida: pedido já cancelado → `ORCAMENTO_INDISPONIVEL`; já respondido → `PEDIDO_DATAS_RESPONDIDO`.
- **Lembrete**: se a oficina não responde em 24 h, recebe um novo aviso (uma vez só).
- **Sem aviso preventivo** quando um orçamento fica sem datas (decisão do dono 11/11).
- **Um aceito por pedido**: índice único parcial `orcamentos(solicitacao_id) WHERE status='aceito'`; o núcleo do aceite trata `23505` como `ORCAMENTO_INDISPONIVEL` (cliente e oficina podem aceitar ao mesmo tempo).

### Orçamento vencido (decisão do dono 11/11)
- `orcamentos.validade` é a data máxima do orçamento. Se ela é anterior a hoje **no fuso da oficina**, o orçamento venceu (sem validade = não vence; a validade de hoje ainda vale).
- Cliente (site e app): no lugar de aceitar/pedir datas, a mensagem "Este orçamento venceu em <data>; escolha outro orçamento ativo ou refaça o pedido", com link para outro orçamento ativo do mesmo pedido (se houver) e para um pedido novo.
- Servidor: `aceitar-orcamento` (e o núcleo comum), `pedir-datas` e `novas-datas` recusam com `ORCAMENTO_VENCIDO`. A oficina revisa o orçamento (nova validade) em vez de mandar datas; o cartão some na página dela.
- O 077 (`cancelarAgendamento`, orçamentos que voltam) passou a comparar a validade no fuso da oficina também.

## Mapa do código

### Banco (migração `supabase/migrations/079_pedido_novas_datas.sql`)
- Nova tabela `orcamento_pedido_datas`:
  - colunas: id, orcamento_id (FK cascade), solicitacao_id, oficina_id, cliente_id, status (`pendente|atendido|cancelado`), sugestoes jsonb `[{data, turno}]`, mensagem, resposta (`confirmou|novas_datas`), created_at, atendido_em, lembrete_em, valor_total_pedido, revisao_numero_pedido;
  - índice único "um pendente por orçamento";
  - RLS: SELECT para o cliente do pedido, a equipe da oficina e o admin; escrita só pelo servidor (revoke em authenticated);
  - na publicação `supabase_realtime` (selo da lista em tempo real).
- `orcamento_disponibilidade.origem text default 'oficina' check in ('oficina','cliente')`.
- Gatilho `orcamentos_cancela_pedido_datas` (revisão do orçamento cancela o pendente).
- Índice único `orcamentos_um_aceito_por_pedido` (conferir na produção antes: nenhum pedido com dois aceitos).
- Policy de DELETE em `orcamento_disponibilidade` versionada (antes só existia no legado), igual à do legado.

### API (web, servem também o app)
- `POST /api/orcamento/[id]/pedir-datas` (cliente): valida, cria o pedido, avisa a oficina (notificação 6 línguas + e-mail + chat).
- `POST /api/orcamento/[id]/novas-datas` (oficina: dono ou equipe que não seja mecânico), em dois modos:
  - `{confirmar: índice da sugestão}` → insere o horário (`origem='cliente'`) e aceita/agenda pelo núcleo comum;
  - `{horarios: [...]}` → insere de 1 a 3 horários, marca o pedido como `atendido` e avisa o cliente (notificação + e-mail + chat).
- `lib/aceitar-orcamento.ts`: o núcleo do `aceitar-orcamento/route.ts` virou função reutilizável; a rota só delega (mesmas respostas), mais `ORCAMENTO_VENCIDO` e o `23505`.
- `lib/orcamento-validade.ts` (site) e `apps/mobile/lib/orcamento-validade.ts` (app): `orcamentoVencido`.
- `lib/pedido-datas.ts`: regras, pedir, responder, cancelamento dos pendentes, cron.
- `lib/notif-novas-datas.ts`: textos das notificações, do chat e dos e-mails em 6 línguas (RU com "Автосервис «…»" para não depender do gênero do nome).
- Cron de hora em hora (`tarefas/limpar-pendentes`): lembrete de 24 h e limpeza dos pendentes que perderam o sentido.
- `lib/expirar-pedidos.ts`, aceite e `solicitacoes/[id]/cancelar`: cancelam os pedidos pendentes.
- `/r/[numero]?o=<idioma>&p=1`: link curto do e-mail da oficina para a página do pedido.

### Web
- **Cliente**: `cliente/orcamentos/[id]/page.tsx` usa `components/cliente/PedirNovasDatas.tsx` no lugar de "Aceitar e agendar" quando todas as datas passaram (o painel de agendamento não abre sem datas futuras); orçamento vencido mostra a mensagem com os links.
- **Oficina**: `oficina/pedidos/[id]/page.tsx` com `components/oficina/NovasDatasPedidas.tsx` (só com pedido pendente e orçamento não vencido); `oficina/pedidos/page.tsx` com o selo "Novas datas pedidas" (tempo real); `oficina/orcamento/[id]` mostra a dica "para só mandar datas, use o cartão no pedido (não conta como revisão)".
- i18n: `novasDatas` (`*.cliente.json`), `oficinaNovasDatas` (`*.oficina.json`), `erros.*`.

### App (Expo)
- `app/solicitacao/[id].tsx`: o mesmo cartão do motorista (`components/PedirNovasDatas.tsx`, `apiFetch`) e a mensagem do orçamento vencido (com "ver outro orçamento ativo" que rola até ele).
- `lib/turnos.ts` com o fuso da oficina (`pais`), igual ao site.
- i18n nos 6 `locales/*.json` (`novasDatas`, `erros`).
- Vai por **OTA** (só JS). Quem não atualizar vê o texto antigo e, ao aceitar orçamento vencido, recebe `ORCAMENTO_VENCIDO` (texto já existe). A publicação depende do OK do dono.
- O app não tem telas de oficina. A oficina usa o site, as notificações e o push.

## Impacto
- Fluxos existentes sem mudança: aceitar normal, revisão de valor, mudança de data (077), reagendar e no-show. Mudança de comportamento: orçamento vencido não é mais aceito (`ORCAMENTO_VENCIDO`).
- A mudança mais arriscada é o núcleo do `aceitar-orcamento` virar uma lib e o índice "um aceito por pedido". Os testes do 073 a 078 e o `agenda-mudanca.mjs` cobrem esse caminho.
- Comissão: adicionar datas não conta como revisão.

## Testes
- `scripts/e2e/novas-datas.mjs` (`SITE=http://localhost:3101 node novas-datas.mjs <.env.local>`):
  - motorista pede com e sem sugestões, pela web, pela API e pelo app;
  - regras: datas não vencidas, pedido duplicado, sugestão no passado/hoje/longe/repetida, outro cliente, pedido expirado, orçamento vencido;
  - oficina confirma a sugestão (agenda criada, outros orçamentos recusados) ou manda novas datas (validade estendida) e o cliente aceita;
  - revisão do orçamento cancela o pendente, `ORCAMENTO_MUDOU`, corrida confirmar × aceitar, aviso à outra oficina, 2 h de antecedência;
  - lembrete pelo cron e limpeza;
  - textos ET e RU (sem chave crua, sem estouro de largura) no site e no build web do app.
- Regressão: `agenda-mudanca.mjs`, `site-expirado.mjs`, `app-traducao-expirado.mjs`, testes de aceite, verificadores de tradução web e app, `tsc`.

## Checklist de deploy 079 (da auditoria Fable, `docs/AUDITORIA_FABLE_079.md`, em ordem)
1. **Local**: terminar a regressão do aceite (`cancelar-pedido`, `site-estonia`, `site-garantia`, `privacidade-agenda`, `site-conclusao`, `correcoes-0811`, `feedback-0711`, `fotos-geral`, `site-servico`, um por vez) e o `novas-datas.mjs` completo; `tsc` web e app e `checar-traducoes` web e app. Se nenhum e2e cobrir o aceite com acidente (`outro_causou`), teste manual local.
2. **Aparelho**: emulador Android (Hermes) e iPhone: tela do pedido com orçamento com data de hoje, com todas as datas vencidas (cartão de pedir datas) e com orçamento vencido.
3. **Backup** do banco de produção.
4. **Conferir os dados**: `SELECT solicitacao_id, count(*) FROM orcamentos WHERE status='aceito' GROUP BY 1 HAVING count(*)>1;` (deve vir vazio; se vier linha, o mais antigo vira `recusado` à mão). Conferir `pg_policies` de `orcamento_disponibilidade` (uma policy de DELETE só).
5. **Migração 079 em uma transação** (`BEGIN; … COMMIT;`).
6. **Recarregar o esquema**: `NOTIFY pgrst, 'reload schema';` e conferir `SELECT * FROM pg_publication_tables WHERE tablename='orcamento_pedido_datas';`.
7. **Deploy da API/site** (antes do OTA: o app novo chama `/api/orcamento/[id]/pedir-datas`), `pm2 restart`.
8. **Smoke**: `/r/<numero>?o=et&p=1` → 302 para `/ee/et/oficina/pedidos/<id>`; `POST /api/orcamento/<uuid>/pedir-datas` sem login → 401; `limpar-pendentes` com a chave → `novasDatas: {lembretes, cancelados}` no JSON.
9. **OTA do app no mesmo dia**, logo depois da API (o app publicado não tem o texto `erros.ORCAMENTO_VENCIDO`: até o OTA, quem tocar "Aceitar" em orçamento vencido vê erro genérico). Conferir num aparelho que o bundle novo subiu.
10. **Avisar o dono**: orçamento vencido (validade antes de hoje) **não pode mais ser aceito**; as oficinas passam a receber aviso/push/e-mail quando o cliente pede datas.
11. Registrar em `docs/PROGRESSO_*.md` e marcar o backlog 002.
