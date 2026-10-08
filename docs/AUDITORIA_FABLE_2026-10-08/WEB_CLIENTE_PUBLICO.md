# Auditoria (somente leitura) — Site: páginas públicas + área do cliente + rotas de API

Data: 08–09/10/2026 · Escopo: `apps/web/src/app/[locale]` (exceto `oficina/` e `loja/`), `components`, `hooks`, `lib`, `middleware.ts`, rotas em `apps/web/src/app/api/*` usadas por essas telas (inclui `api/conta/excluir`, `excluir-conta/*` e `?voltar=` do login, adicionados em 09/10). Regras de negócio conferidas contra `docs/PROGRESSO_2026-10-08.md` e migrações `supabase/migrations` (028, 035, 036, 043, 044).

Verificações executadas: leitura do código; `npx tsc --noEmit -p apps/web` (sem erros); `node apps/web/scripts/checar-traducoes.mjs` (completo nos 6 idiomas); script próprio conferindo 288 chaves dinâmicas (`constants.statusManutencao.*`, `*Desc`, `tiposServico`, `urgencias`, `servicos*`, `seguroReparo.dica_*_*`, `guias.cta.*`, `erros.*`…) nos 6 idiomas; `curl` nas páginas públicas em produção (status, canonical, hreflang, `<html lang>`, robots, og:image).

Legenda: **Crítico** = abuso de conta/dinheiro sem login · **Alto** = quebra de regra de negócio ou buraco de permissão para usuário logado · **Médio** = defeito visível ao usuário · **Baixo** = cosmético/qualidade.

---

## CRÍTICO

### C1 — `/api/emergencia` sem login cria acidente, pedido e veículo na conta de QUALQUER e-mail já cadastrado e devolve o token de acesso
- **Arquivos:** `apps/web/src/lib/conta-convite.ts:21-26`; `apps/web/src/app/api/emergencia/route.ts:70-76, 80-98, 121-166, 190`; `apps/web/src/app/api/emergencia/[id]/outro-veiculo/route.ts:19-20, 62-66`; `apps/web/src/lib/emergencia-acesso.ts:25-26`.
- **Cenário:** sem estar logado, `POST /api/emergencia` com `email = vitor@outlook.ie` (qualquer e-mail de conta existente), nome qualquer e uma foto. `garantirContaCliente` acha o perfil pelo e-mail e devolve o `id` existente (`criada: false`) sem nenhuma verificação. A rota então grava `emergencias.profile_id`, cria um **veículo** e uma **solicitação `colisao`** em nome da vítima, avisa todas as oficinas, e devolve `{ id, token }` — o token dá papel `proprietario` sobre esse acidente (`emergencia-acesso.ts:25`). Com ele o atacante: registra um "outro veículo" com e-mail/telefone de um terceiro (`outro-veiculo`), o que cria conta para esse terceiro e dispara e-mail/WhatsApp com a marca BipFix (`emergencia-outro.ts`); altera dados de seguro (`seguro/route.ts`); lê os orçamentos e contatos das oficinas que responderem. A vítima vê no painel um carro e um pedido que não criou e, se tiver avaliação pendente, o bloqueio `tem_avaliacao_pendente` é contornado (service role).
- **Por que é erro:** o e-mail digitado por um anônimo é tratado como prova de identidade; o limite é só 3/h por IP (`route.ts:32`).
- **Correção:** sem sessão, só aceitar e-mail que **não** tenha conta (ou gravar o acidente como "pendente" ligado a nenhum perfil e enviar link assinado por e-mail para a pessoa reivindicá-lo); nunca devolver `token` quando `conta.criada === false`; não criar veículo/solicitação em perfil existente sem confirmação.

---

## ALTO

### A1 — `/api/aceitar-orcamento` não valida o estado do orçamento, do pedido nem do horário
- **Arquivo:** `apps/web/src/app/api/aceitar-orcamento/route.ts:29-42, 65-76`.
- **Cenário:** (a) cliente já aceitou o orçamento A (B virou `recusado`); chama a rota com `orcamentoId = B` → B vira `aceito` sem checar `status === 'enviado'`; o pedido fica com **dois orçamentos `aceito`**, duas agendas (o `delete` em 77-82 só limpa a mesma oficina), `GarantiasAtivas`/`conversa_aberta`/comissão (`entrega.ts:86-92`) passam a depender de qual oficina entrega primeiro. (b) `slotId` que não pertence ao orçamento → `slot` undefined (75), orçamento marcado `aceito` com `disponibilidade_escolhida_id` inválido e **sem agenda**; a oficina nunca vê o agendamento. (c) horário já vencido (hoje de manhã às 15h) é aceito: `turnoDisponivel` só roda no navegador. (d) pedido já `cancelada`/`concluida` volta para `aceita` (60-63).
- **Correção:** `UPDATE orcamentos SET status='aceito' WHERE id=? AND status='enviado'` e checar `rowCount`; validar que o slot pertence ao orçamento e `turnoDisponivel` no servidor; exigir `solicitacao.status IN ('aberta','em_orcamento','no_show')` e nenhum outro `aceito`.

### A2 — RLS deixa o cliente editar qualquer coluna dos orçamentos do seu pedido (valor, garantia, status)
- **Arquivo:** `supabase/migrations/001_initial_schema.sql:207-210` (`orcamentos_update ... OR s.cliente_id = auth.uid()`); nenhuma migração posterior restringe colunas (`grep GRANT UPDATE` só acha `mensagens`).
- **Cenário:** cliente logado, no console do navegador: `supabase.from('orcamentos').update({ valor_total: 1, garantia_dias: 3650, status: 'aceito' }).eq('id', X)`. Passa. A comissão é calculada sobre `valor_total` na entrega (`lib/entrega.ts:86-110`) e a garantia alimenta `conversa_aberta` (044). O site só precisa de `status='recusado'` (`hooks/use-orcamentos.ts:225-231`).
- **Correção:** `REVOKE UPDATE ON orcamentos FROM authenticated; GRANT UPDATE (status) ...` e política `WITH CHECK (status = 'recusado')` para o cliente (ou mover "recusar" para uma rota de API).

### A3 — RLS deixa o cliente mudar `status`, `cliente_id` e `veiculo_id` da própria solicitação livremente
- **Arquivo:** `supabase/migrations/001_initial_schema.sql:194` (`solicitacoes_update USING (auth.uid() = cliente_id)`, sem `WITH CHECK` nem restrição de coluna).
- **Cenário:** cliente com carro na oficina (`em_andamento`) faz `update({ status: 'cancelada' })` → oficina perde o pedido da lista; ou `update({ status: 'concluida' })` → dispara garantia/avaliação pendente sem serviço; ou `update({ cliente_id: <outro> })` → transfere o pedido (a política não tem `WITH CHECK`, então a linha sai do seu escopo). A tela só oferece cancelar em `aberta/em_orcamento` (`orcamentos/[id]/page.tsx:212-226`) e editar descrição (`EditarPedido.tsx:40-41`), mas a API do Supabase não.
- **Correção:** restringir colunas (`GRANT UPDATE (descricao, status)`) e `WITH CHECK (cliente_id = auth.uid() AND status IN ('cancelada') ...)` com condição sobre o status anterior via função; ou mover cancelamento para rota de API.

### A4 — No acidente "eu causei", a vítima (outro motorista) tem botão "Aceitar orçamento" que leva a um beco sem saída
- **Arquivos:** `apps/web/src/app/[locale]/emergencia/acidente/[id]/page.tsx:112-116, 717-724`; `hooks/use-solicitacoes.ts:33-34`; `api/aceitar-orcamento/route.ts:29-36`.
- **Cenário:** registrante marca `eu_causei`; o outro motorista (papel `outro`) é `isVitima` e vê "Aceitar orçamento" → `/cliente/orcamentos/<solicitacao do registrante>`. `useSolicitacoes` filtra por `cliente_id = user.id` → "Pedido não encontrado". Mesmo que visse, `/api/aceitar-orcamento` exige `cliente_id === caller` (403). A regra "vítima decide" (texto `victimDecidesNote`) não tem implementação.
- **Correção:** decidir a regra: ou o aceite é sempre do dono do pedido (esconder o botão para `papel === 'outro'` e trocar o texto), ou criar rota que permita ao `eh_pagador_do_reparo`/vítima aceitar.

### A5 — Nova solicitação: sem trava de duplo envio e avisa TODAS as oficinas ativas, do navegador
- **Arquivo:** `apps/web/src/app/[locale]/cliente/nova-solicitacao/page.tsx:174-268, 237-254, 682`.
- **Cenário:** no passo 5, dois toques rápidos em "Enviar" (sem `submitting`) → `createSolicitacao` roda duas vezes: dois pedidos iguais, duas rodadas de upload e 2×N notificações. Além disso o laço 237-254 insere uma notificação por oficina ativa **do mundo inteiro** (sem raio, país ou capacidade — ao contrário de `/api/emergencia`, que usa `avisarOficinasDoAcidente` com 50 km), em série, no navegador: com 200 oficinas são 200 inserts antes da tela de sucesso, e fechar a aba no meio deixa o aviso pela metade.
- **Correção:** estado `enviando` + `disabled`; mover o aviso às oficinas para `/api/pedido-criado` (já existe e já verifica o dono) com filtro por distância/país como no acidente.

---

## MÉDIO

### M1 — Painel do cliente mostra check-in e previsão de entrega com um dia a menos em fusos negativos (Brasil)
- **Arquivo:** `apps/web/src/app/[locale]/cliente/dashboard/page.tsx:17-20, 219, 227`.
- **Cenário:** `data_checkin = '2026-10-15'` → `new Date('2026-10-15')` é meia-noite UTC → em São Paulo (UTC-3) `toLocaleDateString` imprime "ter 14/10". `orcamentos/[id]` já usa `T12:00:00` (`formatSlotDate`, linha 29) e `reagendar` também; o painel não.
- **Correção:** reutilizar `formatSlotDate` (data + `T12:00:00`).

### M2 — Página do pedido mostra o PRIMEIRO horário oferecido como "check-in" do orçamento aceito, não o escolhido
- **Arquivo:** `apps/web/src/app/[locale]/cliente/orcamentos/[id]/page.tsx:704-715`.
- **Cenário:** oficina ofereceu 3 slots, cliente escolheu o 3º. O bloco verde "Orçamento aceito" imprime `orc.disponibilidade[0]`. O painel (`dashboard:181-184`) usa `disponibilidade_escolhida_id` corretamente — as duas telas discordam.
- **Correção:** `orc.disponibilidade.find(d => d.id === orc.disponibilidade_escolhida_id) ?? orc.disponibilidade[0]`.

### M3 — Horários de turno gravados como UTC fixo (`T08:00:00Z` / `T13:00:00Z`)
- **Arquivos:** `api/aceitar-orcamento/route.ts:89-91`; `cliente/reagendar/[id]/page.tsx:97-98`; consumido em `api/servico/route.ts:71` e na página de acompanhamento (`formatDate(agenda.data_inicio)`).
- **Cenário:** manhã 08:00 em Tallinn vira `08:00Z` = 11:00 local; tarde 13:00 vira 16:00; `data_fim` 18:00Z = 21:00. No Brasil vira 05:00/10:00. "Check-in futuro" (`servico:71`) considera futuro até 11:00 de Tallinn. Datas ficam certas em ambos os fusos, só as horas erram.
- **Correção:** gravar sem `Z` no fuso da oficina (ou guardar `turno` na agenda e não hora) — o fuso da oficina pode vir de `oficinas.pais`.

### M4 — "Pedido não encontrado" pisca enquanto o pedido carrega
- **Arquivos:** `cliente/orcamentos/[id]/page.tsx:50, 111-117`; `hooks/use-solicitacoes.ts:10-15` (`loading` existe mas a página não usa; e nunca vira `false` enquanto `user` é null).
- **Cenário:** abrir `/cliente/orcamentos/<id>` por link de e-mail/notificação: até o `fetch` voltar, `solicitacoes = []` → renderiza "Pedido não encontrado", depois troca para o pedido. Em 3G o texto fica visível por segundos.
- **Correção:** usar `loading` do hook (spinner) e só mostrar "não encontrado" após `loading === false`.

### M5 — Pedido em `no_show` some do painel e não há caminho para reagendar
- **Arquivos:** `cliente/dashboard/page.tsx:34-36` (filtros só `aberta/em_orcamento/aceita/em_andamento/concluida`); `cliente/reagendar/[id]/page.tsx` (nenhum link aponta para ela — `grep` não acha; e o `update` em `agenda` 94-102 é barrado pela RLS `agenda_update` que só permite oficina/funcionário, `001:229-231`, `010:14-21`); `api/registrar-no-show/route.ts:63-71`.
- **Cenário:** oficina registra falta → pedido vira `no_show`, orçamento volta a `enviado`. No painel o pedido não aparece em nenhuma lista; só em `/cliente/orcamentos`. Se o cliente chegasse à página de reagendar, receberia "erro ao reagendar"; a oficina nunca é avisada de um reagendamento.
- **Correção:** incluir `no_show` nas listas do painel com chamada "escolher novo horário"; remover a página `reagendar` ou passar o reagendamento para uma rota de API que atualize a agenda e avise a oficina.

### M6 — Áudio gravado na conversa sempre com duração 0
- **Arquivo:** `apps/web/src/components/ui/AudioRecorder.tsx:56-61` (`onstop` definido dentro de `startRecording` captura `duration = 0`); comparado com `hooks/use-audio-recorder.ts:91-99` que usa `durationRef` corretamente.
- **Cenário:** gravar 20 s na conversa do cliente → `onRecorded(blob, 0)` → `mensagens.audio_duracao_segundos = 0`; o balão mostra "0:00" até o `loadedmetadata` (e no app, que lê o campo, fica 0).
- **Correção:** guardar a duração num `useRef` (ou reaproveitar `useAudioRecorder`, que já está importado na página).

### M7 — `timeAgo` sem russo nem pt-PT: russo lê "5min atrás"
- **Arquivo:** `packages/shared/format.ts:103-118` (`TIME_AGO_WORDS` só pt/en/et/it; fallback `pt`). Usado em `dashboard:289`, `orcamentos/page.tsx:44`, `mensagens/page.tsx:400,442`.
- **Correção:** adicionar `ru` e `'pt-PT'` (ou usar `Intl.RelativeTimeFormat`).

### M8 — Link "Ver todas (N)" do painel leva a página inexistente
- **Arquivo:** `cliente/dashboard/page.tsx:69` → `/cliente/notificacoes`; não existe `app/[locale]/cliente/notificacoes` → cai no `[...resto]` (404).
- **Correção:** criar a página ou apontar para o sino.

### M9 — Sino de notificações leva "nova mensagem" para a página do pedido e o pagador do acidente para "Pedido não encontrado"
- **Arquivo:** `components/layout/NotificationBell.tsx:16-20` (qualquer `solicitacao_id` → `/cliente/orcamentos/<id>`), ao contrário de `dashboard:80-88`, que trata `nova_mensagem` e `pagador_id`.
- **Cenário:** outro motorista que paga o reparo recebe `orcamento_aceito` com `pagador_id` → clica no sino → `/cliente/orcamentos/<id de outro cliente>` → "Pedido não encontrado". Cliente recebe `nova_mensagem` → cai no pedido, não na conversa.
- **Correção:** reaproveitar a função `getNotificationHref` do dashboard no sino.

### M10 — Página do acidente mostra o nome de QUEM ESTÁ VENDO como "registrante"
- **Arquivo:** `emergencia/acidente/[id]/page.tsx:490` (`user?.nome || t('youFallback')`), apesar de a API devolver `emergencia.nome` (`api/emergencia/[id]/route.ts:59`).
- **Cenário:** o outro motorista (ou a oficina) abre o acidente e vê o próprio nome no cartão "Vítima/Responsável (registrante)".
- **Correção:** usar `emergData.nome`.

### M11 — Coordenadas/país padrão "São Paulo / BR" quando o GPS é negado e a geocodificação falha
- **Arquivos:** `cliente/nova-solicitacao/page.tsx:50, 54, 84-98`; `(auth)/cadastro/page.tsx:58, 62, 120-136`.
- **Cenário:** cliente em Tallinn nega localização, digita endereço livre, Nominatim está lento/404 → pedido salvo com `latitude/longitude` de São Paulo e `pais='BR'`; a análise de IA estima em reais (`api/analisar-dano:67-69`) e "oficinas próximas" filtra por SP. No cadastro de oficina/loja o `EnderecoEstruturado` normalmente resolve a posição; a confirmar o caso em que ele falha: a oficina nasceria com `pais='BR'` e preços em R$ para sempre.
- **Correção:** não ter padrão fixo (como já feito em `emergencia/page.tsx:40`): sem posição, bloquear o envio pedindo o endereço, ou deduzir o país do idioma/`Accept-Language` em vez de BR.

### M12 — `/api/confirmar-entrega` pode ser chamada repetidas vezes para o mesmo evento
- **Arquivo:** `api/confirmar-entrega/route.ts:21-37` (não checa `agenda.status`); `lib/entrega.ts:19-20, 47-78`.
- **Cenário:** duplo clique/retry → segunda chamada insere outra etapa `entregue`, outro histórico, nova notificação e novo e-mail/WhatsApp "carro pronto" ao cliente (comissão está protegida por `jaLancado`). `/api/servico` (`97-102`) exige `em_andamento`, então lá a segunda chamada falha — mas esta rota não.
- **Correção:** `if (evento.status !== 'em_andamento') return 409`.

### M13 — Exclusão de conta (novo, 09/10): efeitos colaterais na cascata e em pedidos abertos
- **Arquivo:** `apps/web/src/app/api/conta/excluir/route.ts:43-49, 57-83`.
- **Cenários:** (a) `semHistorico` só olha solicitações/emergências/oficinas/lojas do usuário. Um usuário que é **outro motorista** num acidente alheio, **funcionário** de oficina ou que só **avaliou/conversou** cai no `deleteUser` → cascata apaga `mensagens` dele (`006:13 ON DELETE CASCADE`), `avaliacoes` (`001:131`), `funcionarios` (`008:24`) e zera `emergencia_outro_veiculo.profile_id` (`004:41 SET NULL`): a oficina perde o histórico da conversa e a avaliação some da média sem recálculo. (b) Modo anonimizado: pedidos `aberta/em_orcamento/aceita` viram `cancelada` sem avisar as oficinas com orçamento; se o excluído é dono de oficina, os orçamentos `enviado` dela continuam aceitáveis pelo cliente (só `ativa=false`) e os funcionários mantêm acesso ao portal. (c) `ExcluirContaClient.tsx:35` monta `?voltar=` com `window.location.pathname` durante o render (no SSR cai em `/`), inofensivo.
- **Correção:** tratar como "com histórico" quem tem mensagens/avaliações/`emergencia_outro_veiculo`/`funcionarios`; recusar orçamentos `enviado` da oficina excluída e avisar oficinas dos pedidos cancelados; desativar funcionários da oficina.

### M14 — Aceite do orçamento: erro silencioso e sem bloqueio de duplo clique
- **Arquivo:** `cliente/orcamentos/[id]/page.tsx:124-133, 664-671`.
- **Cenário:** `/api/aceitar-orcamento` responde 403/500 (sessão caiu, orçamento já aceito) → `if (!error)` falha e **nada** é mostrado; o botão continua ativo e dois cliques mandam duas requisições (a rota apaga/recria a agenda e notifica a oficina duas vezes).
- **Correção:** estado `confirmando` + mensagem de erro traduzida (`erros.*`).

---

## BAIXO

### B1 — Middleware não reconhece as páginas de conta pelos nomes traduzidos
- `middleware.ts:188` compara `path === '/cadastro' | '/escolher-tipo'`, mas `path` já é o nome público (`/sign-up`, `/registreeru`, `/registo`…) → usuário logado abre o cadastro em en/et/it/ru/pt-pt (em pt-br é redirecionado). Correção: comparar com `caminhoLocal(locale, '/cadastro')`.

### B2 — Redefinição de senha: versão dos termos fixa e pós-sucesso inconsistente
- `(auth)/reset-password/page.tsx:90` grava `termos_versao: '2026-09-08'` enquanto `lib/termos.ts:4` diz `2026-09-30` (cadastro usa a constante). Linha 96: `router.push('/login')` com sessão ativa → middleware (`234-236`) manda para a home; a tela diz "redirecionando para o login". Linhas 115-128: sem `token_hash` e sem sessão, fica "verificando link…" pulsando para sempre.

### B3 — Textos fixos em português/inglês em avisos
- `lib/entrega.ts:44` `'seu veículo'` e `:62,72` `'Cliente'` para todos os idiomas; `api/aceitar-orcamento/route.ts:88` `"Orçamento #..."` na descrição da agenda; `components/ui/NoShowWarning.tsx:30-31` frase inteira em português (usado na área da oficina); `lib/notif-i18n.ts` e e-mails só pt/en/et/it → usuário **ru** recebe avisos in-app/e-mail em inglês e **pt-PT** em pt-BR (decisão a confirmar).

### B4 — Veículos: exclusão sem confirmação e erro engolido; edição não reflete marca/modelo nos selects
- `cliente/veiculos/page.tsx:79-81` + `hooks/use-veiculos.ts:44-48`: excluir carro com pedido (FK) falha e nada é mostrado; `FipeAutocomplete` ao editar começa com `selectedMarcaCode=''` → selects vazios embora `formData` tenha os valores (salvar sem tocar mantém).

### B5 — Acessibilidade
- `components/ui/StarRating.tsx:27-33`: estrelas são `<button>` sem `aria-label`/`aria-pressed` e sem `role="radiogroup"`; botões só-ícone sem rótulo: remover foto (`nova-solicitacao:471-479`), editar/excluir veículo (`veiculos:199-214`), enviar/gravar na conversa (`mensagens/[id]:499-517` — gravar tem `title`); `AudioPlayer` play/pause sem `aria-label`.

### B6 — Layout em 390 px (a confirmar em aparelho)
- `cliente/orcamentos/[id]/page.tsx:454-529`: cabeçalho do orçamento com nome + selos à esquerda e preço `text-2xl` à direita sem `min-w-0`/quebra — "Autoremont Kesklinn OÜ" + "€1.234,56" tendem a estourar; `532-547` grade de 3 colunas com rótulos estonianos/russos longos ("Järgmine vastuvõtt", "Доступные даты") em caixas de ~110 px. `emergencia/acidente/[id]/page.tsx:348-373`: três abas `px-4 text-sm` sem rolagem — em russo ("Участники · Сообщения (3) · Сметы (2)") passam de 390 px.

### B7 — Lista de conversas faz N chamadas `conversa_aberta` em série
- `cliente/mensagens/page.tsx:169-176`: para cada pedido concluído/cancelado, um `rpc` por oficina, sequencial; com histórico grande a tela fica no spinner vários segundos. Correção: uma RPC que receba a lista, ou `Promise.all`.

### B8 — Rotas idempotentes abertas a qualquer logado
- `/api/recalcular-comissao` e `/api/atualizar-avaliacao-oficina` aceitam qualquer `oficinaId` de qualquer usuário (só recalculam a partir do banco; limite 30–60/h) — ruído/custo, não vazamento.

### B9 — Página do acidente mostra o formulário "registrar outro veículo" para quem não pode usá-lo
- `emergencia/acidente/[id]/page.tsx:376`: antes de `loadData` voltar (e para `papel` `outro`/`oficina` quando o dono ainda não registrou), aparece o formulário; o envio devolve 403 ("sem acesso"). Correção: só exibir com `papel === 'proprietario'` e após carregar.

### B10 — Dados do usuário logado no acidente vêm do corpo da requisição
- `api/emergencia/route.ts:58-69`: com sessão, `nome/email/telefone` gravados na emergência são os do corpo (prefill editável), podendo divergir do perfil. Correção: com sessão, usar sempre o perfil.

---

## Revisado e OK (sem defeito encontrado)

- **Autenticação/sessão:** `lib/api-auth.ts` (Bearer ou cookie, `getUser` no servidor), `lib/sessao-api.ts` (renova e repete uma vez em 401), `middleware.ts` (áreas protegidas por segmento, `oficinas` público, admin 8 h, conta desativada), `auth-context.tsx` (signOut `local`).
- **Cadastro/confirmação/recuperação:** `/api/cadastro` (resposta igual exista ou não, rollback de conta pela metade, termos/declaração obrigatórios, parceiro nasce inativo), `/api/cadastro/reenviar` (2 min por e-mail), `/api/esqueci-senha` (link de uso único, 2 min), `confirmar-email` (token único, redirect por tipo), `?voltar=` do login (regex só caminho relativo, bloqueia `//` e esquemas).
- **Rotas com service role com dono conferido:** `confirmar-entrega` (dono do evento, pedido vem do evento), `registrar-no-show`, `notificar-orcamento` (dona do orçamento), `avisar-mensagem` (remetente), `transcrever-audio` e `analisar-dano` (`participaDaConversa`/`podeVerSolicitacao` + limite), `pedido-criado`, `servico` (dono/funcionário ativo, check-in futuro com confirmação, `entregue` via `entregarServico`), `tarefas/entregas-automaticas` (chave + 5 dias desde a última etapa `concluido`), `emergencia/[id]/*` (papel por token hash/participante/oficina avisada/admin; dados de seguro escondidos do outro motorista), `consultar-placa` (só veículos do próprio usuário; limite), `geocode` (fila 1/s, cache, limite), `endereco/sugestoes`, `fipe` (caminho validado contra SSRF), `vehicle-catalog`, `leads-parceiros`, `log-error`, `visita` (filtro de robôs, IP mascarado), `app-links`, `conta/excluir` (admin não exclui, carro em serviço bloqueia, limite 5/h).
- **Regras de negócio conferidas:** "concluído" (pronto para retirar) ≠ "entregue" (`api/servico:99-110` e `notif-servico`); entrega fecha serviço + garantia + avaliação + comissão numa função só (`lib/entrega.ts`); entrega automática em 5 dias; avaliação pendente bloqueia pedido novo na tela (`AvaliacaoPendente`, antes do formulário) e no banco (044), acidente passa; conversa com oficina recusada/não escolhida fecha e some da lista (`mensagens/page.tsx:166-176` espelha `conversa_aberta`); garantia conta da entrega (`agenda.data_fim` = momento da entrega, `GarantiasAtivas` e 044 batem); comissão só sobre orçamento aceito da oficina do evento; turnos de hoje já vencidos escondidos no cliente (`lib/turnos.ts`).
- **Traduções:** 6 idiomas completos (script do projeto) e todas as chaves dinâmicas usadas no código existem (statusManutencao + `*Desc`, tiposServico, urgencias + `*Desc`, servicosRevisao/Mecanica/Eletrica/Pneu, tiposItem, tiposOcorrencia, seguroReparo `opcao_*`/`dica_*_*`/`passo_*`, guias.cta, erros usados nas telas). Namespaces de todos os componentes `'use client'` usados em páginas públicas estão em `NAMESPACES_PUBLICOS` (inclusive `excluirConta`); textos de erro fora do next-intl (`lib/erro-pagina.ts`, `SugestaoIdioma`) cobrem os 6 idiomas.
- **SEO (produção, `curl`):** `/` → 307 para idioma; `<html lang>` certo por idioma; canonical + hreflang (x-default = en) na home, acidente, oficinas, guias; `noindex,follow` em login/cadastro/excluir-conta e em `/oficinas` vazia; 404 real para caminho inexistente; antigos sem prefixo → 301 `/pt-br`; nomes internos → 301 para nome traduzido; `/pt/opengraph-image` e `/pt-PT/opengraph-image` respondem 200; sitemap com hreflang e `lastmod` fixos; robots bloqueia áreas privadas pelos nomes traduzidos.
- **Mídia privada:** fotos/áudios por link assinado de 1 h (`MidiaPrivada`), upload em pastas por pedido/conversa com política de storage (043); fotos comprimidas no acidente (`image-compress`).
- **Rate limit:** em memória por IP/usuário em todas as rotas públicas (PM2 processo único, documentado).
- **Páginas públicas estáticas:** home, para-oficinas, seja-parceiro, sobre, termos/privacidade (BR vs UE), docs, guias (301 de slug antigo, redirect para índice quando não há versão no idioma, JSON-LD Article/FAQ/Breadcrumb), perfil público da oficina (SSR, 404 real para inativa, nome do avaliador abreviado), lista de oficinas (filtros via GET).

---

## Resumo

| Severidade | Qtde |
|---|---|
| Crítico | 1 |
| Alto | 5 |
| Médio | 14 |
| Baixo | 10 |

Prioridade sugerida: C1 → A2/A3 (RLS, uma migração resolve) → A1/M14 (aceite) → A5 (nova solicitação) → A4 (regra do acidente) → M1/M2/M3 (datas) → M5/M8/M9 (navegação do cliente) → M13 (exclusão de conta) → resto.
