# Auditoria (somente leitura) — Parte B: oficina, loja, admin, API e banco

Data: 08–09/10/2026. Escopo: `apps/web/src/app/[locale]/oficina/**`, `apps/web/src/app/[locale]/loja/**`, `apps/web/src/app/admin/**`, todas as rotas de `apps/web/src/app/api/**`, `apps/web/src/lib/*` de servidor e `supabase/migrations` (políticas RLS, funções SECURITY DEFINER, triggers, índices). O esquema do banco de produção foi conferido ao vivo (catálogo: `pg_policies`, `pg_proc`, `information_schema`, `pg_indexes`, enums) — nada de dados de usuário foi lido.

Verificações automáticas: `npx tsc --noEmit -p apps/web` → sem erros; `node apps/web/scripts/checar-traducoes.mjs` → "traducoes completas nos 6 idiomas".

Contagem: **Crítico 1 · Alto 9 · Médio 17 · Baixo 14** (total 41).

Convenção: caminhos relativos à raiz do repositório. "Live" = conferido no banco de produção.

---

## CRÍTICO

### C-01 — Qualquer usuário logado pode se promover a admin (`profiles.tipo`) e reativar conta desativada (`profiles.ativo`)
- **Onde:** `supabase/migrations/001_initial_schema.sql:177` (`profiles_update` USING `auth.uid() = id`, sem WITH CHECK nem restrição de colunas). Live: `information_schema.column_privileges` mostra `profiles authenticated tipo:UPDATE ativo:UPDATE email:UPDATE`; nenhum trigger em `profiles`.
- **Cenário:** cliente faz `supabase.from('profiles').update({ tipo: 'admin' }).eq('id', meuId)` com a anon key no navegador. A partir daí: `eh_admin()` (usado em várias políticas: `comissao_lanc_select_admin`, `cotacoes_pecas_select`, `pode_ver_*`...) devolve `true`; `requireAdmin()` em `apps/web/src/lib/admin-auth.ts:46-54` só confere `profiles.tipo === 'admin'` → todas as rotas `/api/admin/*` (apagar usuários, trocar e-mail de qualquer conta, alterar comissões, exportar CSV com e-mails/telefones de todos os clientes) ficam abertas; `apps/web/src/app/admin/layout.tsx:39` libera o painel. Conta desativada pelo admin pode fazer `update({ ativo: true })` e voltar a entrar (`auth-context.tsx:138-146` só lê o campo).
- **Por que é erro:** privilégio controlado por coluna que o próprio usuário edita.
- **Correção:** `REVOKE UPDATE (tipo, ativo, email, id, created_at, termos_*) ON profiles FROM authenticated, anon;` (manter `nome, telefone, avatar_url, idioma`) **ou** trigger BEFORE UPDATE que force `NEW.tipo := OLD.tipo; NEW.ativo := OLD.ativo` quando `current_user IN ('anon','authenticated')` (mesmo padrão de `proteger_ativacao_parceiro`). Fazer o mesmo para `cliente_id` em `solicitacoes` e `profile_id` em `oficinas/lojas_pecas/veiculos/funcionarios` (ver A-03). Depois, conferir no live se alguma conta já tem `tipo='admin'` indevido.

---

## ALTO

### A-01 — `registrar-no-show`: status `no_show` não existe no enum → pedido fica inconsistente
- **Onde:** `apps/web/src/app/api/registrar-no-show/route.ts:63-65` faz `solicitacoes.update({ status: 'no_show' })`. Live: enum `status_solicitacao = aberta, em_orcamento, aceita, em_andamento, concluida, cancelada` (nenhuma migração acrescentou `no_show`; só o tipo TS em `packages/shared/types/index.ts:23` tem o valor). O erro do Postgres é ignorado (resultado não é lido).
- **Cenário:** oficina marca "Não compareceu". A agenda vira `cancelado` e o orçamento volta para `enviado` (linhas 36-40 e 68-71), mas a solicitação continua `aceita`. O painel da oficina (`oficina/dashboard/page.tsx:30-31`, `s.status !== 'no_show'`) nunca mostra o bloco "Não compareceu"/"Enviar novas datas"; o cliente vê "Orçamento aceito" sem agendamento; `conversa_aberta` continua tratando como serviço em andamento.
- **Correção:** `ALTER TYPE status_solicitacao ADD VALUE 'no_show'` (e incluir em `STATUS_SOLICITACAO`, `StatusBadge`, admin) **ou** usar `aberta`/`em_orcamento` + flag `agenda.no_show` já existente; em qualquer caso, checar `error` do update e devolver 500.

### A-02 — `registrar-no-show` aceita `solicitacaoId` do corpo (BOLA)
- **Onde:** `apps/web/src/app/api/registrar-no-show/route.ts:15,47-71`. A posse é conferida só para `agendaId`; `solicitacaoId` vem do corpo e é usado em `solicitacoes.update`, `orcamentos.update(status='enviado')` e `no_show_historico.insert(cliente_id=...)`.
- **Cenário:** dona de oficina A manda `{ agendaId: <evento próprio>, solicitacaoId: <pedido de outra oficina> }` → reabre o orçamento aceito do concorrente, registra falta contra um cliente que nunca tratou com ela.
- **Correção:** ignorar o corpo e usar `agenda.solicitacao_id` (mesmo padrão já adotado em `confirmar-entrega/route.ts:30-35`). Exigir `agenda.status = 'agendado'` e `tipo = 'plataforma'`.

### A-03 — Cliente pode editar qualquer coluna dos orçamentos do seu pedido (`orcamentos_update`)
- **Onde:** `supabase/migrations/001_initial_schema.sql:207` (USING: oficina dona OU `solicitacoes.cliente_id = auth.uid()`, sem WITH CHECK). Live: `orcamentos authenticated valor_total:UPDATE status:UPDATE garantia_dias:UPDATE oficina_id:UPDATE ...`.
- **Cenário:** cliente aceita orçamento de 2.000 € e, antes da entrega, faz `update({ valor_total: 1 })` → `entregarServico` (`lib/entrega.ts:86-120`) lança comissão sobre 1 €; ou altera `garantia_dias` para 3650 (conversa aberta 10 anos); ou muda `status` de qualquer orçamento sem passar por `/api/aceitar-orcamento` (sem agenda, sem notificação). A oficina também pode mexer em `valor_total` de um orçamento já aceito (ver A-06).
- **Correção:** política de UPDATE do cliente só para `status IN ('recusado')` (ou mover a recusa para rota de servidor) e `REVOKE UPDATE (valor_total, oficina_id, solicitacao_id, garantia_dias, ...) ON orcamentos FROM authenticated` para quem não é a oficina; a oficina não deve poder alterar valor de orçamento `aceito` (trigger: se `OLD.status='aceito'` bloquear mudança de `valor_total`/`status` fora da service role).

### A-04 — Cliente pode mudar `solicitacoes.status` e `veiculo_id` livremente
- **Onde:** `001_initial_schema.sql:194` (`solicitacoes_update` USING `auth.uid() = cliente_id`, sem WITH CHECK). Live: `status:UPDATE veiculo_id:UPDATE cliente_id:UPDATE`.
- **Cenário:** cliente põe `status='concluida'` → `pode_avaliar` passa a aceitar avaliação sem serviço; ou volta para `aberta` com serviço em andamento (reabre para todas as oficinas via `pode_ver_solicitacao`). `veiculo_id` apontando para um UUID de outro dono expõe esse carro às oficinas (`veiculos_select_pedido`).
- **Correção:** restringir colunas editáveis pelo cliente (descrição, endereço, seguro) e exigir `veiculo_id IN (SELECT id FROM veiculos WHERE profile_id = auth.uid())` no WITH CHECK; mudanças de status só por rotas de servidor.

### A-05 — `/api/confirmar-entrega` não confere estado: entrega sem check-in e entrega duplicada
- **Onde:** `apps/web/src/app/api/confirmar-entrega/route.ts:21-37` e `lib/entrega.ts:15-33` (nenhuma checagem de `agenda.status`).
- **Cenário:** (a) oficina chama a rota com um evento `agendado` (carro nunca entrou) → pedido `concluida`, cliente recebe "Seu carro foi entregue, avalie", comissão lançada, avaliação obrigatória bloqueia o cliente de abrir pedido novo. (b) Chamada repetida em evento já `concluido` → nova etapa `entregue`, novo histórico, nova notificação + e-mail + WhatsApp a cada chamada (spam). A rota `/api/servico` (`route.ts:97`) faz a checagem; esta não.
- **Correção:** em `entregarServico` (ou na rota) exigir `status = 'em_andamento'` e usar `update ... .eq('status','em_andamento').select()` como trava atômica; devolver 409 se 0 linhas.

### A-06 — "Refazer orçamento" de serviço aceito/em andamento desfaz o aceite e quebra o fechamento
- **Onde:** `apps/web/src/app/[locale]/oficina/solicitacoes/[id]/page.tsx:58-61,82,102-106,136-140` oferece "Refazer/Modificar orçamento" quando `isAccepted || isEmAndamento`; `hooks/use-orcamentos.ts:140-156` grava `status: 'enviado', disponibilidade_escolhida_id: null`.
- **Cenário:** carro na oficina (agenda `em_andamento`), oficina revisa o valor (dano oculto). O orçamento deixa de ser `aceito`: `entregarServico` não acha `status='aceito'` → sem comissão; `tem_avaliacao_pendente`/`pode_avaliar` falham → cliente não consegue avaliar; `conversa_aberta` fecha a conversa da oficina escolhida ao concluir (`ELSE EXISTS ... o.status='aceito'`). Se o cliente aceitar de novo, `/api/aceitar-orcamento:77-95` apaga só agendas `agendado` e insere OUTRA agenda `agendado` ao lado da `em_andamento` (duplicata) e rebaixa o pedido de `em_andamento` para `aceita` (linha 60-63).
- **Correção:** revisão de orçamento aceito deve manter `status='aceito'` e a agenda (guardar histórico em `valor_original`/`revisao_numero`, pedir "aceite da revisão" por rota de servidor sem recriar agenda); `aceitar-orcamento` deve recusar quando já existe agenda `em_andamento`/`concluido` para a solicitação.

### A-07 — Funcionário (cargo `admin`) clicando "Entregar" deixa a agenda `concluido` sem fechar o serviço
- **Onde:** `apps/web/src/app/[locale]/oficina/veiculos-em-servico/page.tsx:148-158`: chama `/api/confirmar-entrega` (que só aceita o **dono**, `route.ts:26`) e, sem olhar a resposta, faz `update(evento.id, { status: 'concluido' })` direto no banco (RLS `agenda_update_funcionario` permite). Botão aparece para todo não-mecânico (linha 475).
- **Cenário:** funcionário com cargo admin confirma a entrega → API responde 403, mas a agenda vira `concluido`: solicitação segue `em_andamento`, nenhuma etapa `entregue`, sem garantia, sem pedido de avaliação, sem comissão, e o cron de entrega automática não a pega (filtra `em_andamento`). Na página `agenda/page.tsx:181-191` o mesmo clique falha em silêncio (nada acontece, sem erro).
- **Correção:** remover o `update` direto; mostrar erro quando `!res.ok`; na rota aceitar dono **ou** funcionário ativo (como `/api/servico`), ou usar `/api/servico { acao:'etapa', status:'entregue' }` nas duas telas.

### A-08 — Qualquer funcionário pode inserir etapas em agendas de outras oficinas (e disparar entrega automática)
- **Onde:** `supabase/migrations/008_funcionarios_manutencao.sql:72` — política "Funcionário pode inserir etapas" com CHECK apenas `funcionarios.id = manutencao_etapas.funcionario_id AND funcionarios.profile_id = auth.uid()`; não confere `agenda_id`. Live confirma.
- **Cenário:** funcionário da oficina A insere `{ agenda_id: <evento da oficina B>, funcionario_id: <o dele>, status: 'concluido' }`. O cliente de B passa a ver "pronto para retirar" (`veiculos-em-servico` lê a última etapa) e, 5 dias depois, `POST /api/tarefas/entregas-automaticas` entrega o serviço de B e lança comissão contra B. `created_at` também é gravável (sem REVOKE), permitindo antedatar.
- **Correção:** acrescentar ao CHECK `EXISTS (SELECT 1 FROM agenda a WHERE a.id = agenda_id AND a.oficina_id = funcionarios.oficina_id)`; `REVOKE INSERT (created_at)`. Como as etapas já passam por `/api/servico`, considerar remover as políticas de INSERT do cliente.

### A-09 — `plataforma_metricas` sem RLS e com GRANT total para `anon`/`authenticated`
- **Onde:** live `pg_class.relrowsecurity = false` para `plataforma_metricas`; `role_table_grants`: `anon INSERT,SELECT,UPDATE,DELETE,TRUNCATE`. Nenhum código em `apps/web/src` usa a tabela (grep vazio), mas ela existe no banco com colunas `gmv, comissao_total, total_clientes_ativos...`.
- **Cenário:** qualquer visitante com a anon key lê/escreve/trunca a tabela via PostgREST.
- **Correção:** `ALTER TABLE plataforma_metricas ENABLE ROW LEVEL SECURITY;` + `REVOKE ALL ON plataforma_metricas FROM anon, authenticated;` (ou dropar se não for usada).

---

## MÉDIO

### M-01 — Transição `aberta → em_orcamento` nunca acontece (update bloqueado pela RLS)
- **Onde:** `hooks/use-orcamentos.ts:63-67` e `:177-180` atualizam `solicitacoes.status` como **oficina**; a única política de UPDATE é `cliente_id = auth.uid()` → 0 linhas, sem erro. Nenhuma rota de servidor define `em_orcamento` (grep).
- **Efeito:** pedido com orçamentos fica "Aberta" para cliente, oficinas e admin (`admin/solicitacoes` resumo "abertas"), e o tratamento `['aberta','em_orcamento']` espalhado pelo código esconde o problema. Acidentalmente evita parte do A-06.
- **Correção:** mover a mudança para uma rota de servidor (p.ex. dentro de `/api/notificar-orcamento`, que já valida a oficina dona) com `.eq('status','aberta')`.

### M-02 — `/api/aceitar-orcamento` aceita orçamento em qualquer estado e qualquer `slotId`
- **Onde:** `route.ts:29-42` só confere o dono; não verifica `orcamento.status` (recusado/expirado/aceito), `validade`, `solicitacao.status` (cancelada/concluida) nem se existe outro já `aceito`; `slotId` inválido ainda marca `aceito` sem agenda (linha 75).
- **Cenário:** cliente aceita dois orçamentos da mesma solicitação (o segundo não recusa o primeiro, que não está mais `enviado`) → duas agendas em duas oficinas; ou aceita um orçamento recusado; ou chama duas vezes seguidas (sem trava) → notificação/e-mail/mensagem de chat duplicados e agenda recriada.
- **Correção:** `update ... .eq('id', id).eq('status','enviado').select()` como trava; validar slot pertence ao orçamento antes de mudar status; recusar se `solicitacao.status NOT IN ('aberta','em_orcamento')` ou já houver `aceito`; índice único parcial `agenda(solicitacao_id) WHERE status IN ('agendado','em_andamento')`.

### M-03 — Horários gravados com `Z` (UTC) como se fossem locais — agenda mostra hora errada fora do UTC
- **Onde:** `apps/web/src/app/api/aceitar-orcamento/route.ts:89-91` (`T08:00:00Z`/`T13:00:00Z`/`T18:00:00Z`), `oficina/checkin/page.tsx:63-64`, `oficina/agenda/page.tsx:149-150,236-237`; leitura em `agenda/page.tsx:422-423` (`toLocaleTimeString` local) e `dashboard/page.tsx:58-61`.
- **Cenário:** oficina em Tallinn cadastra evento às 08:00 → gravado 08:00Z → tela mostra 10:00/11:00; previsão de entrega 18:00Z aparece 21:00; no Brasil 08:00Z vira 05:00. A edição (`slice(11,16)` na linha 222-224) lê a parte UTC, então o formulário "concorda" com o valor gravado mas não com o exibido. `getGroups` (linha 130-133) agrupa pelo dia UTC. O cron `entregas-automaticas` não é afetado.
- **Correção:** montar `new Date(\`${data}T${hora}:00\`)` no fuso do navegador e gravar `.toISOString()`; no servidor (`aceitar-orcamento`) gravar o turno em hora local do país da oficina (`Intl` com timeZone por `pais`) ou guardar `data_checkin`/`turno` e exibir sem hora.

### M-04 — Comissão de serviço pode ser lançada duas vezes (sem UNIQUE em `comissao_lancamento.orcamento_id`)
- **Onde:** `lib/entrega.ts:96-120` faz SELECT-depois-INSERT; live: índices de `comissao_lancamento` não têm unique em `orcamento_id` (contraste: `comissao_pecas_lancamento_pedido_id_key` existe).
- **Cenário:** dois cliques/abas em "Entregar" (A-05 não bloqueia) ou cron + clique simultâneos → dois lançamentos, "pendente" dobrado no admin e na oficina.
- **Correção:** `CREATE UNIQUE INDEX ON comissao_lancamento(orcamento_id)` e tratar `23505` como já lançado.

### M-05 — Qualquer usuário logado pode inserir notificações falsas para qualquer oficina/loja
- **Onde:** `028_rls_por_relacao.sql:227` (`notificacoes_insert WITH CHECK pode_ver_perfil(profile_id)`); `pode_ver_perfil` devolve `true` para todo dono de oficina/loja (`EXISTS (SELECT 1 FROM oficinas WHERE profile_id = p)`). Sem limite de volume.
- **Cenário:** cliente insere `{ profile_id: <dona da oficina>, tipo: 'orcamento_aceito', titulo: 'Orçamento aceito!', dados: { solicitacao_id: X } }` em loop → sino da oficina cheio de aceites falsos com link; o mesmo contra qualquer cliente com quem a oficina conversou.
- **Correção:** retirar o INSERT de `notificacoes` do cliente (as rotas de servidor já geram quase todos os avisos; `use-orcamentos`, `checkin/page.tsx:87`, `pecas/page.tsx:138`, `NotasInternas.tsx:95` e `mensagens/[id]` precisam migrar para rotas) ou restringir o CHECK a tipos permitidos por papel + limitar via trigger.

### M-06 — Dono da oficina pode escrever a própria nota (`avaliacao_media`, `total_avaliacoes`) e outros campos sensíveis
- **Onde:** `001_initial_schema.sql:183` (`oficinas_update` USING `auth.uid() = profile_id`); live: `avaliacao_media:UPDATE total_avaliacoes:UPDATE profile_id:UPDATE pais:UPDATE`. Triggers só protegem `ativa` e `parceiro_fundador`.
- **Cenário:** `update({ avaliacao_media: 5, total_avaliacoes: 120 })` → nota falsa na página pública e no ranking até a próxima avaliação real (`/api/atualizar-avaliacao-oficina` recalcula só quando chamada). Mudar `pais` troca a moeda da comissão.
- **Correção:** `REVOKE UPDATE (avaliacao_media, total_avaliacoes, profile_id, created_at) ON oficinas FROM authenticated` (idem `lojas_pecas.profile_id`).

### M-07 — Comprador e fornecedor podem editar `pedidos_pecas` inteiro (preço, status)
- **Onde:** `018_comissao_fornecedor_pecas.sql:68` (`pedidos_pecas_update` sem WITH CHECK); live: `preco_total:UPDATE status:UPDATE fornecedor_tipo:UPDATE`.
- **Cenário:** fornecedor reduz `preco_total` antes de marcar entregue (comissão menor) ou comprador marca `status='entregue'` direto (sem passar por `/api/marcar-pedido-peca-entregue` → sem comissão, sem notificação). Hoje comissão isenta, mas é a receita planejada.
- **Correção:** só a service role altera `status`/`preco_total`; cliente no máximo `cancelado` enquanto `confirmado`.

### M-08 — `DELETE /api/funcionarios` apaga a conta inteira (auth) de quem pode ser cliente ou funcionário de outra oficina
- **Onde:** `apps/web/src/app/api/funcionarios/route.ts:64-74` liga um `profile` já existente (de qualquer tipo) como funcionário; `:286-318` ao remover, se o profile não é dono de oficina, faz `auth.admin.deleteUser` (cascata em veículos, pedidos, mensagens).
- **Cenário:** oficina cadastra como funcionário o e-mail de um cliente (ou de um mecânico que também trabalha na oficina B) e depois remove → a conta do cliente/mecânico some com todo o histórico. Também: o `senha` informado é ignorado silenciosamente quando o e-mail já existe (linha 73-74) — o dono acha que definiu a senha.
- **Correção:** não apagar auth user que tenha `tipo <> 'oficina'`, outras linhas em `funcionarios`, veículos ou solicitações; só desligar o vínculo. Ao vincular e-mail existente, exigir que o profile seja `tipo='oficina'` sem oficina própria (ou convite por e-mail) e avisar que a senha não foi alterada.

### M-09 — Perfis de todos os donos de oficina/loja (e-mail, telefone) legíveis por qualquer usuário logado
- **Onde:** `pode_ver_perfil` (live) — `OR EXISTS (SELECT 1 FROM oficinas WHERE profile_id = p) OR EXISTS (SELECT 1 FROM lojas_pecas ...)`; `profiles_select` para `authenticated` sem restrição de colunas.
- **Cenário:** `supabase.from('profiles').select('email, telefone').in('id', <profile_ids das oficinas, públicos em oficinas_select>)` → lista de contatos pessoais de todos os parceiros (inclusive inativos/não aprovados).
- **Correção:** restringir a oficinas envolvidas com o usuário ou expor só `nome`/`avatar_url` por view; telefone/e-mail de contato da oficina deveriam vir de colunas próprias da tabela `oficinas`.

### M-10 — Oficina não aprovada (`ativa=false`) vê pedidos abertos e envia orçamentos
- **Onde:** `pode_ver_solicitacao` (live) libera `aberta/em_orcamento` para quem tem `minhas_oficinas()` sem olhar `ativa`; `orcamentos_insert` (`001:…`) idem; `hooks/use-solicitacoes.ts:72-91` e `oficina/dashboard` só mostram um aviso.
- **Cenário:** cadastro auto-servido com registro falso → antes da conferência do admin já lê endereço, fotos e telefone do cliente (via conversa) e manda orçamento.
- **Correção:** incluir `ativa = true` em `minhas_oficinas()` (ou em `pode_ver_solicitacao`/`orcamentos_insert`) e esconder o botão "Enviar orçamento" quando `oficina.ativa === false`.

### M-11 — WhatsApp força DDI 55 (Brasil) em todo número
- **Onde:** `apps/web/src/lib/notifications.ts:255-258` (`if (!phone.startsWith('55')) phone = '55' + phone`).
- **Cenário:** com Twilio configurado, cliente na Estônia (+372 5xxx) recebe prefixo 55372… → mensagem vai para número inexistente/errado no Brasil. Afeta `sendQuoteWhatsApp`, `sendServicoConcluidoWhatsApp`, `sendAccidentWhatsApp`.
- **Correção:** guardar telefone em E.164 no cadastro (campo com país) e não prefixar; no mínimo só prefixar 55 quando `pais === 'BR'`.

### M-12 — Reenvio ilimitado de e-mail/WhatsApp ao cliente e a fornecedores
- **Onde:** `apps/web/src/app/api/notificar-orcamento/route.ts:13-24` (sem idempotência/limite; cada chamada manda e-mail + WhatsApp ao cliente e ao outro motorista), `marcar-cotacao-respondida/route.ts:49-88` (re-notifica a compradora a cada chamada), `notificar-email-pedido-peca-confirmado/route.ts`.
- **Cenário:** dona da oficina (ou script com o token dela) chama a rota 500 vezes → 500 e-mails "Novo orçamento" ao cliente; custo de Resend/Twilio e bloqueio de domínio.
- **Correção:** `dentroDoLimite` por `orcamentoId` (1 envio por revisão: comparar `revisado_em`/flag `notificado_em`) e por usuário.

### M-13 — `recalcular-comissao` e `atualizar-avaliacao-oficina` aceitam `oficinaId` de qualquer oficina
- **Onde:** `apps/web/src/app/api/recalcular-comissao/route.ts:14-26`, `atualizar-avaliacao-oficina/route.ts:16-25` (só exigem login + limite por usuário).
- **Cenário:** cliente recalcula/atualiza a config de comissão de todas as oficinas (escrita em `comissao_config`/`oficinas` via service role). Idempotente, mas é escrita arbitrária e carga.
- **Correção:** exigir relação (`oficinasDoUsuario(userId).includes(oficinaId)` ou cliente com avaliação naquela oficina).

### M-14 — Perfil da loja de peças só funciona para o Brasil (CEP ViaCEP, sem país/coordenadas)
- **Onde:** `apps/web/src/app/[locale]/loja/perfil/page.tsx:7,28-43,129` (`formatCep` 00000-000, `maxLength=9`, `viacep.com.br`); não há campo de país nem mapa, diferente de `oficina/perfil` (`EnderecoEstruturado`).
- **Cenário:** loja em Tallinn digita código postal 10111 → campo trava em 5 dígitos, busca falha, "CEP não encontrado"; `loja.pais` só vem do cadastro e a lista de cotações filtra por `loja.pais || 'BR'` (`loja/cotacoes/page.tsx:40`).
- **Correção:** reutilizar `EnderecoEstruturado` + `/api/geocode` como na oficina; só usar ViaCEP quando `pais === 'BR'`.

### M-15 — Texto fixo em português nas telas da oficina (aparece igual em et/ru/en/it)
- **Onde:** `apps/web/src/components/ui/NoShowWarning.tsx:33-35` ("Este cliente tem N falta(s) registrada(s)", usado em `oficina/solicitacoes/[id]:234`); `ChatCotacaoPeca.tsx:153,183` (`alt="Foto enviada"`, `title="Enviar foto"`); `oficina/perfil/page.tsx:303` (`alt="Logo"`); `oficina/comissao/page.tsx:110,126` e `veiculos-em-servico/page.tsx:446` (`'N/A'`); `oficina/agenda/page.tsx:282` e `oficina/dashboard/page.tsx:300` mostram `sol.tipo` cru ("colisao") em vez de `tc('tiposServico.…')`.
- **Correção:** mover para `messages/*.oficina.json` e usar `tc(\`tiposServico.${tipo}\`)`.

### M-16 — Dinâmica de entrega automática/etapas depende de `created_at` da última etapa — e `/api/servico` permite "concluido" repetido com spam ao cliente
- **Onde:** `apps/web/src/app/api/servico/route.ts:95-111`: sem limite por evento; cada etapa `concluido` dispara `notifProntoRetirar` (notificação ao cliente); `funcionarioId` validado só por `oficina_id`, não por `ativo` (linha 46).
- **Cenário:** cliques repetidos em "Salvar" (botão só desabilita por `actionLoading`) → várias notificações "Seu carro está pronto"; etapa registrada em nome de mecânico desativado.
- **Correção:** ignorar etapa igual à última (mesmo status nos últimos N minutos), exigir `ativo = true`, `dentroDoLimite` por evento.

### M-17 — `leads_parceiros` aceita INSERT anônimo direto (sem o limite da rota)
- **Onde:** `022_leads_parceiros.sql:20` (`leads_parceiros_insert_publico WITH CHECK (true)` para `public`), enquanto `/api/leads-parceiros` tem rate limit e validação de tamanho.
- **Cenário:** script com a anon key insere milhares de leads (tamanho ilimitado) → painel `/admin/leads-parceiros` inutilizável.
- **Correção:** `DROP POLICY leads_parceiros_insert_publico` (a rota usa service role) e `REVOKE INSERT ON leads_parceiros FROM anon`.

---

## BAIXO

### B-01 — `esqueci-senha`: sem limite por IP; mapa zera a cada 5.000 e-mails
- `apps/web/src/app/api/esqueci-senha/route.ts:34-39`. Atacante alterna 5.000 e-mails para resetar o intervalo de 2 min e manda recuperação repetida à vítima. Usar `limitarPorIp` + `dentroDoLimite` por e-mail.

### B-02 — Admin: busca `q` interpolada no filtro `.or()` do PostgREST
- `apps/web/src/app/api/admin/solicitacoes/route.ts:44`, `admin/veiculos/route.ts:31`. Vírgula/parênteses em `q` alteram a expressão (só admin, sem escalada). Escapar ou usar `.ilike` separado.

### B-03 — `DELETE /api/admin/usuarios` apaga em cascata lançamentos financeiros
- `route.ts:48-66` + `comissao_lancamento.orcamento_id ... ON DELETE CASCADE` (`012:16`). Remover um dono de oficina some com o histórico de comissões pagas/pendentes. Preferir desativação; se apagar, antes exportar/copiar lançamentos.

### B-04 — Índices ausentes para consultas quentes (live)
- Faltam: `agenda(solicitacao_id)` (usado em `conversa_aberta`, `oficina_envolvida`, aceite, métricas), `agenda(status)` (cron), `veiculos(profile_id)` (política `veiculos_select`), `profiles(lower(email))` (cadastro/esqueci-senha/funcionários com `ilike`), `solicitacoes(veiculo_id)`, `comissao_lancamento(orcamento_id)` (ver M-04), `emergencias(solicitacao_id)`, `manutencao_etapas(funcionario_id)`, `notificacoes(profile_id, created_at desc)`. Irrelevante hoje (banco vazio), mas são seq scans dentro de funções SECURITY DEFINER chamadas por política.

### B-05 — `entregas-automaticas` carrega todas as agendas `em_andamento` com todas as etapas
- `route.ts:17-19`. Sem filtro por data; com volume vira lento. Filtrar no SQL (`manutencao_etapas.status='concluido' AND created_at < limite`) ou view.

### B-06 — Comparação de chave do cron não é timing-safe
- `route.ts:15` usa `!==`; usar `iguaisSeguro` de `lib/segredos.ts`.

### B-07 — Agenda: cor do aviso de prazo depende do texto em português
- `oficina/agenda/page.tsx:292` (`note.includes('antes')/('depois')`) → em et/ru/en o aviso fica sempre cinza. Devolver `{tipo, texto}` de `deliveryNote`.

### B-08 — Agenda: mecânico sem acesso ao portal aparece sem nome
- `oficina/agenda/page.tsx:426-430` (`ev.funcionario?.profile?.nome`) e `:518` (`f.profile?.nome`) ignoram `funcionarios.nome`; usar `nomeFuncionario()` como nas outras telas.

### B-09 — Códigos de erro devolvidos pela API sem tradução em `erros`
- Rotas devolvem `CHECKIN_JA_FEITO`, `CHECKIN_FUTURO`, `SEM_CHECKIN`, `TIPO_ARQUIVO`, `ARQUIVO_GRANDE`, `SEM_ITENS`, `FOTO_INVALIDA`, `IA_OCUPADA`; `messages/pt.json` → `erros` só tem 14 chaves (sem esses). `textoErroApi` cai no genérico; `veiculos-em-servico` mostra só `t('erroAcao')`. Acrescentar as chaves nos 6 idiomas.

### B-10 — `oficina/dashboard` conta `eventos.length` (inclui cancelados/concluídos) como "Na agenda"
- `dashboard/page.tsx:141`. Filtrar `status IN ('agendado','em_andamento')`.

### B-11 — `aceitar-orcamento` e `notificar-orcamento` ainda dependem do marcador `[TIPO:…]` na descrição
- `aceitar-orcamento/route.ts:162-163` (`match(/\[TIPO:(\w+)\]/)`), `eh_pagador_do_reparo` (live, `strpos(e.descricao,'[TIPO:outro_causou]')`). Se o cliente editar a descrição ("completar o pedido" — `cleanDescricao` remove o marcador na tela, mas a edição pode gravar sem ele), o fluxo de "quem paga" deixa de funcionar. Guardar `tipo_acidente` em coluna própria.

### B-12 — Admin: `oficina.avaliacao_media.toFixed(1)` e `especialidades.map` sem proteção contra `null`
- `admin/oficinas/page.tsx:165`, `admin/oficinas/[id]/page.tsx:189,206`. Colunas são `numeric`/`ARRAY` sem NOT NULL visível → tela quebra se vierem nulas (a confirmar: default das colunas). Usar `?? 0` / `?? []`.

### B-13 — `funcionarios` POST com acesso: `cargo` não validado contra o enum
- `funcionarios/route.ts:39-44,114-124`: qualquer string vai para o INSERT (erro 500 do Postgres em vez de 400). Validar com `umDe`.

### B-14 — `visita/route.ts` confia no último item de `x-forwarded-for` enquanto `rate-limit.ts:9` usa o **primeiro**
- Dois critérios de IP; o de `rate-limit.ts` (`x-forwarded-for` primeiro valor) é forjável pelo cliente quando `x-real-ip` não vier. Confirmar que o nginx sempre define `X-Real-IP`; caso contrário, alinhar com `ipDoVisitante`.

---

## Áreas revisadas e OK

- **Autenticação das rotas:** `lib/api-auth.ts` (valida token com `getUser`, aceita Bearer do app), `lib/admin-auth.ts` (Bearer/cookie + `tipo='admin' AND ativo`), `lib/supabase-admin.ts` (falha alto sem service key). Todas as rotas `/api/admin/*` chamam `requireAdmin()`; nenhuma rota pública usa service role sem checagem de posse exceto as listadas acima.
- **Rotas com posse correta:** `confirmar-entrega` (pedido vem do evento), `servico` (dono/funcionário ativo; check-in com `antecipar`; pedido → `em_andamento`), `funcionarios` (dono), `notificar-orcamento` (oficina dona), `marcar-cotacao-respondida` (fornecedor que respondeu), `marcar-pedido-peca-entregue` (fornecedor; idempotente por UNIQUE `pedido_id`), `notificar-email-pedido-peca-confirmado` (oficina dona), `notificar-fornecedores-cotacao-peca`, `avisar-mensagem` (remetente; destino derivado da conversa), `transcrever-audio`/`analisar-dano` (participação + limite), `ler-orcamento` (oficina + limite + tipo/tamanho), `emergencia/*` (token hash + `iguaisSeguro`, limites por IP, validação de fotos), `pedido-criado`, `comissao-atual` (só a dona), `cadastro`/`cadastro/reenviar` (limite, resposta uniforme, rollback), `fipe` (caminho validado contra SSRF), `geocode`/`endereco/sugestoes` (fila 1/s, cache, limite), `consultar-placa` (só veículos do próprio usuário), `log-error` (truncado + limite), `app-links`, `vehicle-catalog`.
- **Admin:** auditoria (`registrarAuditoria`) em comissões, correções, cancelamento de agenda, troca de e-mail (recusa e-mail de outra conta); `corrigir` valida status contra listas; `export` só admin; `monitoramento` usa caminhos fixos no `execSync` (sem injeção).
- **Comissão:** hierarquia individual > global em `comissao-regras.ts` (único ponto de decisão), modo `isento` não gera lançamento, valor fixo por moeda, `naFaixa` proporcional; `entregarServico` só lança para orçamento `aceito` da oficina do evento; check-in manual (`tipo='externo'`) nunca gera comissão.
- **Banco:** todas as funções SECURITY DEFINER têm `SET search_path = public`; `mensagens` UPDATE restrito à coluna `lida` (035); `admin_auditoria`, `plataforma_config`, `app_errors` com RLS ligada e sem política (só service role); triggers `proteger_ativacao_parceiro`/`proteger_parceiro_fundador` em `oficinas`/`lojas_pecas`; UNIQUE em `orcamentos(solicitacao_id, oficina_id)`, `avaliacoes(solicitacao_id, cliente_id)`, `funcionarios(profile_id, oficina_id)`, `cotacoes_respostas_unico_por_fornecedor`, `comissao_pecas_lancamento(pedido_id)`; `solicitacoes_insert` bloqueia com `tem_avaliacao_pendente`; `conversa_aberta` fecha para recusados/não escolhidos e mantém a escolhida até o fim da garantia (mín. 7 dias).
- **Telas (390 px):** `oficina/solicitacoes`, `solicitacoes/[id]`, `enviar-orcamento` (data/turno empilhados, turno vencido desabilitado, garantia "Outra"), `checkin` (labels com `break-words`/hyphens), `veiculos-em-servico` (cartões `min-w-0`), `perfil` (botões empilhados), `equipe`, `capacidade`, `distribuicao` (scroll horizontal intencional), `admin/*` (cartões no celular). Moeda sempre por `currencyForCountry(pais)` nas telas de oficina/loja/admin; `turnos.ts` usa data local (não `toISOString`). Chaves dinâmicas usadas (`hist_*`, `garantia_*`, `statusOrcamento.*`, `oficinaOpcao_*`) existem nos arquivos de mensagens; `checar-traducoes` sem pendências.
