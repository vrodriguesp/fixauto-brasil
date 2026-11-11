# Auditoria Fable — 079 "Tenho interesse, mande novas datas"

Data: 11/11/2026. Base auditada: branch `novas-datas-079` no worktree `Documentos/_teste_local/site` (commits ea0083b, b0068ec, b1e56ee, 959a991, 0e45b92 sobre 490f909), `docs/DESENHO_079_novas_datas.md` e a revisão anterior `docs/REVISAO_FABLE_079.md`. Só leitura: nada foi alterado, nenhum servidor/build rodado, sem acesso à produção.

Resumo: **nenhum BLOCKER no código**. O que separa o lote do deploy é verificação (regressão do aceite que não terminou, teste no Hermes, conferência do índice em produção) e três ajustes pequenos (MUST M2–M4 são de processo/OTA). A implementação segue o desenho e fechou os MUST da revisão anterior (M1 retrato+gatilho, M2 índice único + 23505, M3 app com fuso da oficina, M4 link curto, M5 desenho) e os SHOULD pedidos (S1 validade estendida e 077 alinhado, S2 2 h, S3 aviso às outras oficinas, S4 códigos na corrida, S6 RU «Автосервис», S7 realtime e cartão único, S8 dica em Modificar orçamento).

Caminhos dos arquivos abaixo são relativos ao worktree `Documentos/_teste_local/site/`.

---

## 1. MUST — antes do deploy

### M1. Índice único `orcamentos_um_aceito_por_pedido`: conferir os dados e aplicar em transação
`supabase/migrations/079_pedido_novas_datas.sql:82`.
- Fluxos existentes **não** quebram: `registrar-no-show` devolve o aceito a `enviado` antes de qualquer novo aceite (`apps/web/src/app/api/registrar-no-show/route.ts:73-76`); `cancelarAgendamento` (076/077) marca o aceito como `recusado` antes de reabrir (`apps/web/src/lib/mudanca-data.ts:122`); o cancelamento pelo cliente idem (`api/solicitacoes/[id]/cancelar/route.ts:65`); a revisão de orçamento aceito (`orcamento-revisao/decidir`) muda só `valor_total`. Além disso o núcleo já recusava um segundo aceito pela leitura prévia (`lib/aceitar-orcamento.ts:55-61`), então o índice só transforma uma corrida que antes passava em `409 ORCAMENTO_INDISPONIVEL` (`lib/aceitar-orcamento.ts:76`).
- O único risco é a **criação** do índice falhar por dado legado (dois `aceito` no mesmo pedido antes da conferência M-02 de 08/10). O banco de produção foi limpo em 10/10, mas há contas de teste e oficinas reais desde 31/10.
- Fix: antes da migração rodar `SELECT solicitacao_id, count(*) FROM orcamentos WHERE status='aceito' GROUP BY 1 HAVING count(*)>1;` — se vier linha, corrigir à mão (o mais antigo vira `recusado`); aplicar a migração inteira **numa transação só** (`BEGIN; … COMMIT;`, como em 073-078) com backup antes; depois `NOTIFY pgrst, 'reload schema'`.

### M2. Regressão do núcleo do aceite ainda não terminou
`docs/PROGRESSO_2026-10-15.md` (commit 0e45b92): os e2e de aceite `cancelar-pedido`, `site-estonia`, `site-garantia`, `privacidade-agenda`, `site-conclusao`, `correcoes-0811`, `feedback-0711`, `fotos-geral`, `site-servico` **não terminaram** (processos parados por falta de memória). O `aceitar-orcamento/route.ts` virou só um delegador de `lib/aceitar-orcamento.ts` — conferi linha a linha contra `git show 490f909:apps/web/src/app/api/aceitar-orcamento/route.ts`: a ordem, as respostas (401/400/403/409/400/500/404/200 e os `codigo`), a agenda (08:00/13:00, 18:00 no fuso da oficina), o e-mail de agendamento, a notificação à oficina e todo o bloco de emergência/pagador (chat `emergencia_mensagens`, `mensagens` com `pagador_id`, e-mails ao responsável e ao outro motorista) são idênticos. As diferenças são só as previstas: `ORCAMENTO_VENCIDO` (l.46-48), `23505` (l.76) e `cancelarPedidosDatasPendentes` (l.112).
- Fix: rodar a suíte inteira antes do OK do dono (um e2e por vez, por causa da memória). Nenhum e2e do 079 passa pelo passo 7 (emergência); se nenhum dos existentes cobrir, fazer um teste manual local de aceite em pedido com emergência `outro_causou`.

### M3. `minutoNaOficina` no app usa `hourCycle: 'h23'` — nunca usado no app antes e só testado no build web
`apps/mobile/lib/fuso.ts:17-20` (novo), chamado por `turnoDisponivel(…, pais)` (`apps/mobile/lib/turnos.ts:27`), que agora roda para **todo horário de todo orçamento** na tela do pedido (`apps/mobile/app/solicitacao/[id].tsx:287, 452, 468`). `git grep hourCycle 490f909 -- apps/mobile` = nada; o e2e F usa o app **web** (Chromium), não o Hermes. Se o Intl do Hermes (Android) ignorar a opção ou lançar `RangeError`, a tela principal do motorista quebra para todo mundo depois do OTA.
- Fix: antes do OTA, abrir a tela de pedido no emulador Android (Hermes) e num iPhone com orçamento com datas de hoje; por segurança, trocar por `hour12: false` (já basta para 'en-GB') e embrulhar em `try { … } catch { return instante.getHours()*60+instante.getMinutes(); }` — igual ao fallback "sem pais".

### M4. App antigo (sem OTA) × API nova: `erros.ORCAMENTO_VENCIDO` **não existe** no app publicado
`git show 490f909:apps/mobile/i18n/locales/et.json` só tem `HORARIO_VENCIDO`; a revisão anterior afirmou que o texto já existia — estava errado. Com a API nova, quem não atualizou vê "Aceitar" num orçamento vencido e, ao tocar, recebe `common.erroGenerico` sem explicação (`apps/mobile/lib/erro.ts:19-26`).
- Fix: publicar o OTA **logo depois** do deploy da API (mesmo dia), e na ordem certa (API primeiro: o app novo chama `/api/orcamento/[id]/pedir-datas`, que não existe no servidor antigo). Registrar no checklist. Nada a mudar no código novo.

---

## 2. SHOULD — no mesmo lote

### S1. Push/aviso da oficina no app abre a tela do motorista
`apps/mobile/lib/destino-aviso.ts:11`: qualquer aviso com `solicitacao_id` vai para `/solicitacao/<id>` (tela de cliente). Os tipos novos `pedido_novas_datas` e `pedido_novas_datas_cancelado` (`lib/pedido-datas.ts:190, 137, 326`) vão à oficina, que no app só tem a conta de cliente. Pré-existente (N2 da revisão), mas o 079 é o primeiro fluxo que **pede ação** da oficina por push.
- Fix (só JS, vai no mesmo OTA): em `destinoDoAviso`, `if (a.tipo.startsWith('pedido_novas_datas')) return null;` (ou `Linking.openURL(\`${SITE_URL}/r/<numero>?o=<idioma>&p=1\`)` se `dados` carregar o número do pedido — hoje não carrega).

### S2. Cartão da oficina não se atualiza depois de 409
`apps/web/src/components/oficina/NovasDatasPedidas.tsx:48`: só `PEDIDO_DATAS_RESPONDIDO` chama `carregar()`. Em `ORCAMENTO_INDISPONIVEL` (pedido cancelado — cliente fechou com outra, gatilho de revisão), `ORCAMENTO_MUDOU` e `SUGESTAO_VENCIDA` o cartão continua igual, com o botão "Confirmar" ativo, e `aoMudar` não roda.
- Fix: `if (r.status === 409) { carregar(); aoMudar?.(); }`.

### S3. Mecânico vê o cartão e leva 403
RLS de leitura cobre toda a equipe (`minhas_oficinas()`), mas `podeResponder` recusa `cargo = 'mecanico'` (`lib/pedido-datas.ts:118-121`). `oficina/pedidos/[id]/page.tsx:166` monta o cartão sem olhar o cargo → o mecânico clica e vê "Sem acesso".
- Fix: `useAuth()` já expõe `funcionario`; acrescentar `funcionario?.cargo !== 'mecanico'` à condição da l.166.

### S4. `desfazer` depois de exceção no aceite
`lib/pedido-datas.ts:256-258`: se `aceitarOrcamento` **lançar** (não devolver 409) depois do passo 1, o orçamento já está `aceito` com `disponibilidade_escolhida_id` = slot; `desfazer(slot.id)` tenta `DELETE` do slot (viola a FK `orcamentos.disponibilidade_escolhida_id`, só loga) e volta o pedido a `pendente`. Resultado: orçamento aceito, oficina recebe 500, pedido pendente até o cron cancelar (≤ 1 h). Raro (o núcleo devolve erros em vez de lançar), mas é a oficina decidindo pelo cliente.
- Fix: no `catch`/`r.status !== 200`, reler `orcamentos.status`; se já `aceito`, não desfazer — marcar o pedido `atendido` e devolver `200 { modo: 'confirmou' }` (o aceite aconteceu).

### S5. Cobertura do e2e `novas-datas.mjs` (139 asserções, boa) — lacunas
`apps/web/scripts/e2e/novas-datas.mjs`:
- corrida testada é **confirmar × aceitar do cliente** (l.483-498); falta **A confirma × B confirma** (duas oficinas) — é o caso que motivou o índice;
- só o mecânico (403) é testado (l.229); falta **funcionário não mecânico** respondendo com sucesso;
- falta o caso de uso principal depois de **no_show** (orçamento volta a `enviado` com datas velhas → cartão aparece → fluxo completo), que é o único caminho em que `ESTADOS_PEDIDO` inclui `no_show`;
- app: falta aparelho em **outro fuso** (grade no fuso da oficina — M3 da revisão), só roda ET/RU em Tallinn;
- falta o `429` do rate limit (10/h cliente, 30/h oficina);
- seção B l.253-254 lê `novas-datas-feito` antes do `refresh()` do pai: quando o orçamento vira `aceito` o componente **desmonta** (`oficina/pedidos/[id]/page.tsx:166`) e a mensagem some — pode ficar intermitente.
- Fix: acrescentar os cinco casos; na B, verificar o `ResumoAgendamento` em vez da mensagem efêmera (ou ver N3).

### S6. RU: "ревизия" não é o termo usado no painel
`apps/web/messages/ru.oficina.json` `oficinaNovasDatas.semMudarPreco`: "без новой ревизии". O painel em RU usa "изменение сметы" / "пересмотр" (base 490f909).
- Fix: "Смета не меняется: та же сумма, без нового изменения сметы." ET está bom (N4 da revisão aplicado: "Kellaaeg", "ei lähe muudatusena kirja"; selo "Klient küsib uusi aegu").

### S7. `estenderValidade` no modo confirmar grava em orçamento já aceito
`lib/pedido-datas.ts:259`: roda **depois** de `aceitarOrcamento`. Inócuo (os gatilhos de proteção ignoram a chave de serviço; a coluna não dispara `orcamentos_cancela_pedido_datas`), mas é um `UPDATE` em orçamento encerrado.
- Fix: chamar antes do aceite (a sugestão já passou nas conferências) ou não chamar no confirmar — a validade deixa de importar depois do aceite.

---

## 3. NICE — depois

- N1. `codigoPedidoFechado` sem nenhum pedido na tabela devolve "já respondido" (`lib/pedido-datas.ts:152-155`); devolver `ORCAMENTO_INDISPONIVEL` quando `data` é nulo.
- N2. Lembrete de 24 h só por aviso + push (`lib/pedido-datas.ts:326`); oficina que não usa o app e não abre o painel não vê. Considerar e-mail curto no lembrete (mesmo `caixa`/`botao` já prontos).
- N3. `NovasDatasPedidas` mostra "Aeg kinnitatud" (l.58) mas desmonta no `refresh()` do pai; subir o estado "feito" para a página ou deixar o `ResumoAgendamento` falar por si.
- N4. `DROP POLICY IF EXISTS "disponibilidade_delete"` (migração l.47): se o nome no legado for outro, ficam duas policies de DELETE com o mesmo predicado (OR, inócuo). Conferir em `pg_policies` depois de aplicar.
- N5. Cliente (site e app) não vê em tempo real quando a oficina responde; chega por aviso/e-mail e recarrega. Aceitável.
- N6. `MAX_DIAS_HORARIO = 120` fica coerente com a extensão da validade (S1 da revisão escolhida). Ok.
- N7. `validarSugestoes` aceita domingo e dia fechado (só o cliente filtra) — por desenho; o e2e B l.197 confirma só o lado do cliente.

---

## 4. Conferido e certo

- **Migração**: tabela com `CHECK` em status/sugestões (≤3)/mensagem (≤300)/resposta; FKs com cascade; índice parcial "um pendente por orçamento" (l.31) + `23505 → PEDIDO_DATAS_PENDENTE` (`lib/pedido-datas.ts:180`); `REVOKE ALL … FROM anon, authenticated` + `GRANT SELECT` + policy de SELECT por cliente do pedido / `minhas_oficinas()` / `eh_admin()` (l.36-44; funções da 028) — o e2e A l.176 confirma que o cliente não insere; gatilho `SECURITY DEFINER SET search_path = public` sobre `valor_total, revisao_numero, revisado_em` com `IS DISTINCT FROM` (l.63-75), necessário porque "Modificar orçamento" grava pelo navegador (`hooks/use-orcamentos.ts:136-146`) — e2e G l.457 confirma pela chave da oficina; `EXECUTE` revogado; `supabase_realtime` com exceção tratada; `origem` com default e `CHECK`.
- **Núcleo do aceite**: ver M2 — idêntico ao antigo fora as três adições previstas. A rota mantém 401/400 e o `try/catch` 500.
- **pedir-datas** (`lib/pedido-datas.ts:159-205`): dono do pedido (403), `expirada → PEDIDO_EXPIRADO`, estados do orçamento/pedido, `ORCAMENTO_VENCIDO`, `DATAS_AINDA_VALIDAS`, sugestões de amanhã a +30 dias sem repetir e ≤3, mensagem ≤300, retrato valor/revisão, chat na língua do cliente, aviso em 6 línguas, e-mail com link curto `/r/<numero>?o=<idioma>&p=1` (sem slug em português — e2e B l.223-225); rate limit 10/h por usuário; `ehUuid`.
- **novas-datas** (`l.209-300`): dono ou equipe não mecânica; mesmos estados; `ORCAMENTO_VENCIDO`; confirmar só com ≥2 h de antecedência e retrato igual (`ORCAMENTO_MUDOU`); trava `status='pendente'` (duas pessoas/duplo clique); horários novos 1-3, futuros, ≤120 dias, previsão ≥ data, repetidos descartados; validade estendida à maior data; chat na língua da oficina; aviso + e-mail ao cliente com `/r/<numero>` neutro; rate limit 30/h.
- **Cancelamentos**: expirar (`lib/expirar-pedidos.ts:45`), cancelar pelo cliente (`cancelar/route.ts:64`), aceite de qualquer orçamento (com aviso às outras oficinas, `avisarExceto`), gatilho de revisão, cron (estado/validade/datas futuras de novo) e a própria resposta. `no_show` não expira (`ESTADOS_QUE_EXPIRAM`), mas o cron cancela quando o orçamento vence.
- **Fusos**: servidor, site e app calculam tudo no fuso da oficina (`fusoDoPais`, `diaNaOficina`, `horaLocalEmUtc`); `pais` nulo cai em Tallinn nos três; 077 alinhado (`lib/mudanca-data.ts:124-125`); `orcamentoVencido` igual nos três lugares (validade de hoje ainda vale — e2e E l.412-414).
- **Web**: o cartão do cliente aparece só uma vez (painel de agendamento não abre sem datas futuras — `cliente/orcamentos/[id]/page.tsx:662`); orçamento vencido mostra links para outro ativo (`#orc-<id>`) e pedido novo; oficina só vê o cartão com pedido pendente e orçamento não vencido; selo em tempo real; dica em Modificar orçamento.
- **App**: só JS (nenhum módulo nativo novo; `RolagemTeclado` já era `forwardRef`); i18n com `{x}` (prefixo configurado em `apps/mobile/i18n/index.ts:44`); `apiFetch` lança `ErroApi` com `codigo` → `erros.<codigo>` existe nos 6 locales.
- **i18n**: `novasDatas` (20 chaves), `oficinaNovasDatas` (28), `erros` (+9) nas 6 línguas do site e `novasDatas` + `erros` nos 6 do app; sem chave duplicada; ET e RU corretos e sem promessa de preço/prazo ao motorista; RU «Автосервис «{oficina}»» sem concordância de gênero (e2e G l.514).
- **Comissão**: nenhum caminho do 079 toca `revisao_numero`/`valor_total`.
- **Documentação**: desenho atualizado com as decisões do dono e os itens da revisão; PROGRESSO registra o estado (não publicado).

---

## 5. Riscos de regressão no deploy

1. Refatoração do aceite (toda aceitação de orçamento passa pela lib nova) — mitigado pela comparação linha a linha e pela suíte de aceite, **que precisa terminar** (M2).
2. Mudança de comportamento intencional: orçamento com `validade` anterior a hoje **não é mais aceito** (`ORCAMENTO_VENCIDO`) — antes aceitava. Oficinas com validade curta vão ver clientes sem botão; a dica na tela é "revise o orçamento". Avisar o dono explicitamente.
3. Índice único em produção (M1) — falha na criação aborta a migração se estiver em transação; sem transação deixa a migração pela metade.
4. App: `turnoDisponivel` com `pais` em todos os cartões de orçamento (M3) — risco de Intl no Hermes.
5. App antigo até o OTA: erro genérico ao aceitar orçamento vencido (M4); as rotas novas só existem depois do deploy da API.
6. Gatilho `orcamentos_cancela_pedido_datas`: dispara em qualquer `UPDATE … SET valor_total/revisao_numero/revisado_em` (inclusive `orcamento-revisao/decidir`, em orçamento aceito — sem pendente, inócuo).
7. Cron `limpar-pendentes` já roda de hora em hora em produção (`/root/limpar-pendentes.sh` às :29, deploy 09/11) — o 24 h e a limpeza dependem dele.

## 6. Checklist pré-deploy (ordem)

1. Localmente: terminar a regressão do aceite (M2) + `novas-datas.mjs` com os casos de S5; `tsc` web e app e `checar-traducoes` já ok no PROGRESSO.
2. Emulador Android (Hermes) + iPhone: tela de pedido com orçamento com data de hoje e com todas as datas vencidas; cartão de pedir datas; orçamento vencido (M3).
3. Produção (banco): backup; `SELECT solicitacao_id FROM orcamentos WHERE status='aceito' GROUP BY 1 HAVING count(*)>1;` (deve vir vazio); conferir `pg_policies` de `orcamento_disponibilidade` (N4); aplicar `079` em **uma transação**; `NOTIFY pgrst, 'reload schema'`; conferir `SELECT * FROM pg_publication_tables WHERE tablename='orcamento_pedido_datas'`.
4. Produção (site): deploy do código (API primeiro, antes do OTA); `pm2 restart`; smoke: `/r/<numero>?o=et&p=1` → 302 para `/ee/et/oficina/pedidos/<id>`; `POST /api/orcamento/<uuid>/pedir-datas` sem login → 401; `limpar-pendentes` com chave → `novasDatas: {lembretes, cancelados}` no JSON.
5. OTA do app (só JS) **depois** do deploy da API, com o ajuste S1 se entrar; conferir num aparelho que o bundle novo subiu (texto do cartão).
6. Dono: avisar da mudança "orçamento vencido não aceita mais" (risco 2) e do aviso que as oficinas passam a receber por e-mail/push quando o cliente pede datas.
7. Registrar tudo em `docs/PROGRESSO_*.md` e marcar o backlog 002.
