# Revisão Fable — 079 "Tenho interesse, mande novas datas"

Data: 11/11/2026. Base: `docs/DESENHO_079_novas_datas.md` + código parcial no worktree `Documentos/_teste_local/site` (branch `novas-datas-079`, não commitado). Decisões do dono que valem acima do documento: (a) sem aviso preventivo à oficina; (b) orçamento vencido (`orcamentos.validade` passou) não aceita pedido de datas nem aceite, com `ORCAMENTO_VENCIDO` no servidor; (c) site e app; (d) a oficina confirmar uma sugestão = orçamento aceito e agendado.

## 1. Estado do que já existe no worktree

| Peça | Estado |
|---|---|
| Migração `079_pedido_novas_datas.sql` (tabela, índice "um pendente", RLS leitura, `origem` em `orcamento_disponibilidade`, policy DELETE versionada) | feita; **sem** `datas_vencidas_avisado_em` (coerente com (a)) |
| `lib/orcamento-validade.ts` (`orcamentoVencido`: validade < hoje no fuso da oficina) | feito |
| `lib/aceitar-orcamento.ts` (núcleo do aceite virou lib; rota só delega) | feito; já inclui `ORCAMENTO_VENCIDO` e cancela pendentes 079 |
| `lib/pedido-datas.ts` (regras puras, pedir, responder, cron) | feito |
| `lib/notif-novas-datas.ts` (6 línguas, avisos, chat, e-mail) | feito |
| Rotas `pedir-datas` (cliente) e `novas-datas` (oficina) | feitas, com rate limit |
| Web cliente: `PedirNovasDatas.tsx` + página do orçamento (cartão vencido + cartão pedir datas) | feito |
| Web oficina: `NovasDatasPedidas.tsx` + página do pedido + selo na lista | feito |
| `expirar-pedidos`, `cancelar`, `limpar-pendentes` cancelam/lembram | feito |
| i18n web (cliente/oficina/erros) e locales do app (6) | feitos |
| **App Expo**: componente `components/PedirNovasDatas.tsx` e uso em `app/solicitacao/[id].tsx` | **não feito** — a tela ainda mostra o texto antigo `horariosVencidos` (l.439) e não esconde "Aceitar" quando o orçamento venceu |
| `scripts/e2e/novas-datas.mjs` | não existe |
| Doc de desenho | ainda descreve o aviso preventivo (§Regras "Prevenção", `datas_vencidas_avisado_em`, cartão "mesmo sem pedido") — desatualizado em relação a (a) |

## 2. MUST — corrigir antes de deploy

### M1. Oficina revisa o orçamento com pedido pendente → confirma a sugestão e aceita um preço que o cliente nunca viu
`hooks/use-orcamentos.ts update()` (Modificar orçamento) apaga todos os horários, insere novos, põe `status='enviado'`, `revisao_numero+1`, nova `validade` — e **não toca em `orcamento_pedido_datas`**. Resultado:
- no site do cliente o cartão "aguardando a oficina" some (há datas futuras agora), mas o pedido continua `pendente` no banco;
- a oficina continua vendo o cartão "O cliente pediu novas datas" e pode **Confirmar** uma sugestão → `aceitarOrcamento` aceita o orçamento **com o valor revisado**, que o cliente não aprovou. O texto que o cliente leu ("o agendamento fica feito com este orçamento") deixa de ser verdade.
- O mesmo vale para a revisão de valor por `api/orcamento-revisao` em orçamento ainda não aceito, se existir esse caminho.

Correção (as três juntas):
1. Gravar no pedido um retrato do orçamento no momento do pedido: `valor_total`, `revisao_numero` (ou `revisado_em`). No modo **confirmar**, recusar com código novo (`ORCAMENTO_MUDOU`, 409) se `orc.valor_total`/`revisao_numero` mudaram desde o pedido; no modo **outras datas** pode seguir.
2. Cancelar os pendentes quando a oficina revisa/modifica o orçamento. Como `update()` roda no navegador com a chave do usuário (e a tabela só aceita escrita do servidor), fazer por **trigger** em `orcamentos` (`AFTER UPDATE` quando `revisao_numero` ou `valor_total` muda, ou `revisado_em` muda → `UPDATE orcamento_pedido_datas SET status='cancelado' WHERE orcamento_id=NEW.id AND status='pendente'`). Trigger resolve também o caminho do app e de scripts.
3. No cron `tarefasPedidoDatas`, cancelar também quando `!semDatasFuturas(orc.disponibilidade)` (o orçamento ganhou datas por outro caminho) — hoje o cron só olha status/validade.

### M2. Dois aceites no mesmo pedido (corrida real com 079)
`aceitarOrcamento` trava só o próprio orçamento (`UPDATE … WHERE status IN (enviado, visualizado)`); a conferência "nenhum outro aceito" é uma leitura antes do UPDATE. Antes só o cliente aceitava (um clique por vez). Com 079, **cada oficina** vira um ator que pode disparar o aceite: cliente aceita B enquanto A confirma a sugestão, ou A e B confirmam no mesmo minuto → dois `aceito`, duas agendas, `solicitacoes.status='aceita'` duas vezes, e o cliente recebe duas confirmações.

Correção: índice único parcial no banco — `CREATE UNIQUE INDEX orcamentos_um_aceito_por_pedido ON orcamentos (solicitacao_id) WHERE status = 'aceito'` — e tratar `23505` no passo 1 de `aceitarOrcamento` como `ORCAMENTO_INDISPONIVEL`. Conferir antes se há dados antigos com dois aceitos no mesmo pedido (no_show antigo reseta para `enviado`, então deve estar limpo). Alternativa menor: `UPDATE … WHERE NOT EXISTS (outro aceito)` via RPC; o índice é mais simples e protege todos os caminhos.

### M3. App não implementado e sem fuso da oficina
- (c) exige o app. Falta `apps/mobile/components/PedirNovasDatas.tsx` (grade de 14 dias, até 3 chips, mensagem, estado "pedido enviado") e trocar o aviso de `solicitacao/[id].tsx` l.439 por ele; esconder "Aceitar" e mostrar o cartão "orçamento vencido" quando `orcamentoVencido(validade, oficina.pais)`.
- `apps/mobile/lib/turnos.ts turnoDisponivel(data, turno, agora)` **não recebe `pais`**: usa o fuso do aparelho. Motorista fora da Estônia (ou com relógio em outro fuso) vê turnos "válidos" que o servidor recusa (`SUGESTAO_INVALIDA`) ou vice-versa. Portar a versão do site (`diaNaOficina`/`minutoNaOficina` com `pais`) para o app antes do componente; o `orc.oficina.pais` já vem no select da tela.
- OTA: `runtimeVersion.policy=appVersion`, só JS → vai por OTA. Quem não atualizou continua com o texto antigo e, ao aceitar orçamento vencido, recebe o erro `ORCAMENTO_VENCIDO` (texto já existe em `erros`). Aceitável, mas registrar.

### M4. Link do e-mail à oficina com slug em português e sem idioma
`pedido-datas.ts` l.170 monta `${site()}/oficina/pedidos/${id}`. Fere a regra do dono (nada de slug em português em link para usuário) e cai no middleware sem locale (idioma errado). Usar o link curto: estender `/r/[numero]` com um parâmetro para a página do pedido da oficina (ex.: `?o=<idioma>&p=1` → `/oficina/pedidos/<id>`), como já se faz com `?o=` para orçar.

### M5. Desenho desatualizado em relação às decisões do dono
Atualizar `DESENHO_079_novas_datas.md`: remover "Prevenção" e `datas_vencidas_avisado_em`, remover "o mesmo cartão aparece quando o orçamento ficou sem datas, mesmo sem pedido", acrescentar a regra do orçamento vencido (cliente e oficina), o código `ORCAMENTO_VENCIDO`, e os itens M1/M2 acima.

## 3. SHOULD — fazer no mesmo lote

### S1. Validade do orçamento × datas sugeridas/oferecidas
- O cliente sugere até 30 dias à frente e a oficina pode mandar datas até 120 dias (`MAX_DIAS_HORARIO`); nada compara com `validade`. Cenário: validade 15/11, oficina manda 25/11 em modo "outras datas"; dia 16/11 o cliente abre, vê a data futura e recebe `ORCAMENTO_VENCIDO`. Decidir uma das duas e implementar no servidor:
  - (recomendado) ao a oficina mandar datas/confirmar uma data **depois** da validade, estender `validade` para a maior `data_checkin` oferecida (mesma transação, sem contar revisão) — a oficina está dizendo explicitamente que o preço vale até lá;
  - ou limitar datas novas e sugestões a `<= validade` e dizer isso na tela da oficina ("o orçamento vale até X; para datas depois, revise-o").
- `cancelarAgendamento` (077) usa `.gte('validade', hoje)` com `hoje` em UTC; `orcamentoVencido` usa o dia no fuso da oficina. Entre 00:00 e 02:00 de Tallinn os dois discordam. Alinhar o 077 ao `orcamentoVencido`.

### S2. Confirmar sugestão cujo turno já começou
`turnoAindaVale` aceita até o **fim** do turno (12:00/17:00). A oficina confirmando "hoje de manhã" às 11:50 cria agenda às 08:00 de hoje, manda "agendamento confirmado" e o cliente precisaria estar lá agora. No aceite normal esse risco é do próprio cliente; aqui é a oficina decidindo pelo cliente. Regra sugerida para o modo **confirmar** (não para "outras datas"): só sugestão cujo **início** do turno esteja a pelo menos 2 h (ou que seja de outro dia); senão o botão vira "Já passou/muito em cima — mande outras datas" (`SUGESTAO_VENCIDA` já existe). Na grade do cliente, começar em **amanhã** (hoje só faz sentido se a oficina responder na hora) — ou manter hoje só se o turno começa em mais de 2 h.

### S3. Oficinas que ficaram de fora
Quando A confirma (ou o cliente aceita qualquer orçamento), os pedidos pendentes das outras oficinas são cancelados em silêncio; B recebeu push/e-mail pedindo ação e, ao abrir, o cartão simplesmente sumiu (orçamento `recusado`). Mandar à(s) oficina(s) com pendente cancelado por aceite um aviso curto ("O cliente fechou com outra oficina; não precisa responder ao pedido de datas") — em `cancelarPedidosDatasPendentes` quando chamado pelo aceite, devolvendo os `oficina_id` e notificando ali. Hoje nem o aceite normal avisa quem perdeu; para o 079 vale, porque a oficina foi chamada a agir.

### S4. Mensagens de erro à oficina na corrida
Em `responderNovasDatas`, se a trava falha porque o pedido já virou `cancelado` (cliente aceitou outro, pedido expirou/cancelado), a oficina recebe `PEDIDO_DATAS_RESPONDIDO` ("já foi respondido") — errado. Separar: ler o status atual depois da trava falhar e devolver `ORCAMENTO_INDISPONIVEL`/`PEDIDO_EXPIRADO` conforme o caso. Idem quando `aceitarOrcamento` devolve 409 dentro do confirmar: `desfazer()` volta o pedido para `pendente`, mas se o motivo foi "outro orçamento aceito" o correto é `cancelado`.

### S5. Aviso 24 h + fim de semana e equipe
Lembrete vai só ao `profile_id` da oficina (dono). O pedido pode ser respondido por funcionário não mecânico (`podeResponder`), mas o aviso e o e-mail só chegam ao dono — é o padrão atual, só confirmar que é o desejado. Sem repetir depois das 24 h (uma vez), ok.

### S6. RU: concordância de gênero com o nome da oficina
`{oficina} прислал новые даты` / `{oficina} подтвердил вашу дату`: com nome de oficina feminino/neutro (ex.: "Автомастерская Lux", "СТО Kalev") soa errado. Usar o substantivo portador: "Автосервис {oficina} прислал новые даты" e "Автосервис {oficina} подтвердил вашу дату" (em `notif-novas-datas.ts` e nos e-mails). ET não tem gênero — ok.

### S7. Tempo real e duplicidade no site
- Lista de pedidos da oficina só reage a mudanças em `solicitacoes`/`orcamentos`; um pedido de datas novo não acende o selo até recarregar. Adicionar `orcamento_pedido_datas` ao canal (e à publication `supabase_realtime`, com RLS de SELECT já cobrindo).
- Na página do cliente `PedirNovasDatas` aparece em dois lugares (painel de agendamento l.671 e bloco de ações l.823) com estados independentes; se o painel estava aberto quando o último turno venceu, aparecem dois cartões. Deixar só o do bloco de ações.

### S8. Oficina que usa "Modificar orçamento" só para pôr datas
Mesmo com o cartão 079, uma oficina pode ir em "Modificar orçamento" para acrescentar datas: isso conta `revisao_numero+1` (pesa na comissão via `comissao.ts mediaRevisoes`) e, com M1, cancela o pedido pendente. Na página `oficina/orcamento/[id]`, quando há pedido pendente, mostrar aviso "Para só mandar datas, use o cartão no pedido (não conta como revisão)".

## 4. NICE — depois

- N1. `desfazer(slotId)` apaga o horário com `DELETE`; se o aceite falhar **depois** do passo 1 (já gravou `disponibilidade_escolhida_id`), o DELETE viola a FK e o orçamento fica `aceito` sem agenda. Raro; pelo menos logar e não apagar o slot nesse caso.
- N2. Push para oficina: só chega se o dono tiver o app logado com a conta da oficina; e `destinoDoAviso` do app manda para `/solicitacao/<id>` (tela de cliente). Pré-existente, mas 079 gera mais avisos para oficinas — considerar `tipo` começando com `pedido_novas_datas` → abrir o site.
- N3. Sugestões e domingo/horário do perfil: só o cliente filtra; o servidor aceita domingo. Ok por desenho (a oficina decide), registrar nos testes.
- N4. Copy ET menor: selo "Küsitakse uusi aegu" → "Klient küsib uusi aegu" (igual ao título) ou "Uute aegade soov"; "uut muudatust ei teki" → "see ei lähe muudatusena kirja" (a ideia é "não conta como revisão"). Turno "Aeg" na coluna da oficina → "Kellaaeg" evita confusão com o campo de data. RU "День (13:00–17:00)" segue o padrão já usado no app ("день"), manter.
- N5. `MAX_DIAS_HORARIO = 120` para datas da oficina é generoso frente a 30 dias de validade padrão do orçamento e 30 de expiração do pedido; se S1 for a opção "estender validade", ok; senão baixar para 60.
- N6. Na página da oficina, quando o orçamento venceu e há pedido pendente, o cartão some sem explicação (até o cron cancelar). Mostrar "O orçamento venceu em X; atualize a validade em Modificar orçamento para o cliente poder aceitar".
- N7. Página do cliente com `vencidoOutro` aponta para o primeiro outro orçamento ativo; se houver vários, listar ou só rolar para o topo da lista.

## 5. Pontos conferidos que estão certos

- Triggers `proteger_orcamento` / `proteger_orcamento_encerrado` / `orcamento_encerrado`: não interferem (o servidor usa service role, `chamada_de_usuario()` falso); o orçamento aceito via 079 fica travado para a oficina como no aceite normal.
- RLS da tabela nova: leitura por cliente do pedido, equipe (`minhas_oficinas()`) e admin; escrita só servidor. Os componentes leem direto pelo cliente Supabase — ok.
- Policy de DELETE em `orcamento_disponibilidade` versionada: igual à legada; necessária para `update()` continuar apagando horários.
- Comissão: nenhum caminho do 079 altera `revisao_numero`/`valor_total`; `recalcularComissaoConfig` não é chamado — correto.
- Um pendente por orçamento (índice parcial) + `23505` → `PEDIDO_DATAS_PENDENTE`: duplo toque do cliente resolvido. Trava `status='pendente'` na resposta: duplo clique/duas pessoas da equipe resolvidos.
- `turnoAindaVale`/`fimDoTurno` iguais ao `HORARIO_VENCIDO` do aceite (12:00/17:00 no fuso da oficina) — coerente entre pedir, confirmar, mandar datas e aceitar.
- Expirar (072), cancelar (078) e aceitar cancelam pendentes; `no_show` devolve o orçamento a `enviado` com datas velhas → o cartão 079 aparece naturalmente (é o caso de uso bom). Cron cancela pendentes de pedido fora de `aberta/em_orcamento/no_show` e de orçamento vencido.
- Chat: linha do pedido no idioma do cliente com `remetente_id` = cliente; respostas no idioma da oficina — segue o padrão do 077.
- Texto ao motorista sem promessa de preço/prazo; aviso "se a oficina confirmar, o agendamento fica feito" presente em ET/RU.
- `validarSugestoes` ordena e deduplica; `validarHorariosNovos` descarta repetidos já existentes e exige previsão ≥ data.

## 6. Testes a acrescentar em `scripts/e2e/novas-datas.mjs` (além do plano do desenho)

1. Oficina modifica o orçamento com pedido pendente → pendente cancelado (trigger) e `confirmar` devolve `ORCAMENTO_MUDOU`.
2. Dois `confirmar` simultâneos (A e B) e `confirmar` × `aceitar-orcamento` do cliente em paralelo → exatamente um `aceito`, uma agenda.
3. Validade: sugestão/data depois da validade (regra escolhida em S1); aceite no dia da validade (ainda vale) e no dia seguinte (`ORCAMENTO_VENCIDO`), com relógio às 00:30 de Tallinn.
4. Confirmar sugestão "hoje" com turno já começado → `SUGESTAO_VENCIDA` (S2).
5. Cliente pede a A e B; A confirma → B recebe aviso de cancelamento (S3) e `novas-datas` de B devolve código coerente (S4).
6. App (build web do Expo): cartão nas 6 línguas, chips no fuso da oficina com aparelho em outro fuso, "Aceitar" oculto em orçamento vencido.
7. E-mail da oficina: link curto `/r/<numero>?o=<idioma>&p=1` abre `/oficina/pedidos/<id>` no idioma certo (M4).
