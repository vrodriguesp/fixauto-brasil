# Progresso — 01/10 a 08/10/2026 (testes no iPhone)

Correções dos testes do dono no iPhone (site e app). Tudo publicado em `bipfix.com` e testado em produção (tela de iPhone, 6 idiomas). **O banco foi limpo em 08/10: só resta a conta admin (vitor@outlook.ie).**

## Login e sessão
- **"Sessão expirada" ao aceitar orçamento:** "Sair" num aparelho encerrava o login em todos (padrão do Supabase). Agora sair vale só para o aparelho (`scope: 'local'`); quando o servidor recusa o login, o site e o app renovam e tentam de novo.
- **Menu da oficina voltava para "entrar":** a biblioteca de login do site era a `@supabase/ssr` 0.1.0, que deixava pedaços do cookie do login anterior ao trocar de conta. Atualizada para 0.12.7 (`getAll`/`setAll`).

## Conversas
- **Uma conversa por oficina** (migração 035): cada oficina conversa com o cliente antes de orçar, sem ver a das outras; mensagens chegam na hora (tabela no tempo real).
- **Quem paga o reparo** (outro motorista do acidente) tem conversa particular com a oficina (036–038).
- **App:** áudio nas mensagens (gravar, ouvir, transcrição); aviso de nova mensagem para a oficina (`/api/avisar-mensagem`).

## Oficina
- **Serviço pelo servidor** (`/api/servico`, migração 041): o check-in põe o pedido do cliente em "em andamento" e avisa o cliente; cada etapa avisa o cliente; check-in de agendamento futuro com confirmação (a entrada passa a ser hoje); o dono registra etapas em nome de um mecânico; histórico (`agenda_historico`).
- **Mecânico sem acesso ao portal:** só nome e telefone; o acesso pode ser dado depois. Remover quem já trabalhou só desativa (mantém o histórico).
- **Endereço em campos** (rua, número, CEP, cidade), conferido no mapa (Nominatim). As sugestões (Photon público) levam 4–7 s; com `GEOAPIFY_KEY` no `.env` do servidor elas passam a ~0,2 s e trazem o número da casa.
- **Seguradoras convencionadas** (listas IT, PT, EE, LV, LT, FI e BR em `lib/seguradoras.ts`, mais "outra"): selo no orçamento do cliente e no perfil público.
- Lista e página do pedido alinhadas no celular; "Ver / modificar orçamento" e o orçamento enviado na página do pedido; o carro do pedido é visível antes de orçar (039).
- Orçamento: para hoje só os períodos que ainda não acabaram. Cliente: horário vencido não aparece.
- Foto do acidente visível para a oficina antes do aceite (041–042).
- Análise de IA: tenta de novo e troca de modelo quando o Google está sobrecarregado (`gemini-2.5-flash` → `gemini-3.5-flash` → `gemini-3.5-flash-lite`); mensagens claras (ocupada / sem fotos / foto ilegível).
- Sininho de notificações cabe no iPhone. "[TIPO:...]" não aparece mais em nenhuma tela.

## Cliente e app
- **"Acabei de bater":** localização com resultado na tela (rua e cidade), "Tentar de novo" / "Abrir Ajustes", rede + GPS ao mesmo tempo; "Seu carro" opcional (um toque se cadastrado); o carro informado vira um carro dele; telefone opcional para quem tem conta (040).
- **Dicas pós-acidente pelo país do acidente** (não pelo idioma): Itália (CAI em 3 dias), Portugal (Declaração Amigável em 8 dias), Brasil, Estônia; outros países: conselho genérico (112).
- **Completar/editar o pedido** (carro e descrição), no site e no app.
- **App: avisos dentro do app** (no alto da tela na hora, números nas abas, lista no início). Aviso com o app fechado (push) exige o app instalado como versão própria — não funciona no Expo Go desde o SDK 54.

## Comissão (auditoria)
- Painel do admin com comissão de serviços, de peças e a receber; datas corretas. Correção de segurança: a entrega usa o pedido do próprio agendamento.
- Regra atual: **isento** (serviços e peças) — nenhuma comissão é gerada. Check-in manual nunca gera comissão.

## Testes (em `apps/web/scripts/e2e`)
`site-correcoes`, `site-servico`, `site-mensagens`, `site-pagador`, `site-fluxos`, `site-pecas`, `site-varredura` (6 idiomas) e `nativo-correcoes` (app no emulador Android) — todos passando em 08/10.

## Pendências (decisão do dono)
1. Valores da comissão (hoje isento).
2. `GEOAPIFY_KEY` para sugestões de endereço rápidas (conta gratuita em geoapify.com).
3. Push no celular: precisa do app como versão própria (EAS Build; no iPhone, conta Apple Developer).
4. Testar no iPhone: GPS real e gravação de áudio (no emulador Android funcionaram).

## Lote da tarde (08/10)
- **Garantia** no orçamento (conta da entrega); contagem regressiva no início do cliente (site e app). Conversa com a oficina escolhida aberta até o fim da garantia (mínimo 7 dias); com as outras fecha ao terminar o serviço (migração 043, `conversa_aberta`).
- **Orçamento feito em outro sistema:** foto/PDF lido pela IA (`/api/ler-orcamento`) preenche itens, prazo e garantia; a oficina confere; o documento pode ir anexado. **Comissão:** não muda — é calculada sobre o total enviado na plataforma, no momento da entrega.
- **App:** tela de notificações com sino (todas as interações, a mais recente em destaque); telas recarregam quando chega aviso; texto não "pula" ao digitar no iPhone (altura de linha); teclado fecha ao rolar.
- Aviso de mensagem feito pelo servidor (antes podia falhar sem aparecer).
- Agenda: botão "Etapas" após o check-in; entregar o carro pede confirmação; resumo do mês traduzido.
- Perfil da oficina: cabeçalho no celular, aviso antes da aprovação; página pública não guarda mais o 404.
- Teste novo: `site-garantia.mjs`.

## Lote da noite (08/10)
- **Concluído ≠ Entregue:** "Concluído" (dupla confirmação na tela da oficina) avisa o cliente para buscar o carro, com o endereço. "Entregue" fecha o serviço (garantia, avaliação, comissão — `lib/entrega.ts`, usado pela confirmação, pela etapa e pelo agendador).
- **Entrega automática:** 5 dias em "concluído" sem entrega → entregue. `POST /api/tarefas/entregas-automaticas` (chave `TAREFAS_CHAVE` em `.env.production.local` do servidor), chamado de hora em hora pelo crontab do servidor (`/root/entregas-automaticas.sh`, log em `/var/log/entregas-automaticas.log`).
- **Avaliação obrigatória (como no Uber):** serviço entregue sem avaliação → aviso fixo no início (site e app) e pedido novo bloqueado (tela + banco, migração 044 `tem_avaliacao_pendente`). O "acabei de bater" não é bloqueado.
- **Conversas:** orçamento recusado ou outra oficina escolhida → a conversa com essa oficina fecha e some da lista (migração 044, `conversa_aberta`); a escolhida fica até o fim da garantia.
- **Orçamento para o cliente:** itens, garantia do vendedor, nota e link da página pública da oficina; o escolhido em destaque (verde) e os recusados apagados. Link da oficina também na conversa.
- Garantia digitada à mão ("Outra") além das opções prontas.
- **App:** contagem da garantia também dentro do pedido e recarregada ao voltar à tela (antes só carregava uma vez); botão voltar sem "(tabs)"; puxar para atualizar no pedido e na conversa; horários com a entrega prevista em duas linhas.
- Etapas sem chave crua (`aguardando_pecas` → `aguardandoPecasDesc`); página pública com estrelas dentro da tela no celular.
- Teste novo: `site-conclusao.mjs` (produção, 390 px) — tudo OK.

## Admin: trocar email de acesso (08/10)
- `/admin/oficinas/<id>` (campo "Email de acesso") e `/admin/usuarios` (coluna email): "Mudar email" pede motivo e confirmação; o novo email já fica confirmado e a senha não muda. Recusa email de outra conta; registrado em "Histórico do admin". Rota `POST /api/admin/usuarios/email`. Teste: `site-admin-email.mjs`.
- Oficina "Italiano" (Estônia), cadastrada com um email sem acesso, passou para `oficina-estonia@example.test` (confirmado).
