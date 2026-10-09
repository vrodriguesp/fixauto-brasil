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

## Lote da noite 2 (08/10)
- **Tela de erro** no idioma do endereço (antes sempre em português). O erro do teste na Estônia era "Loading chunk failed": página aberta antes de uma publicação nova. Agora a página recarrega sozinha uma vez (`lib/erro-pagina.ts`).
- **Transcrição de áudio:** a chave do Gemini está no **plano gratuito (20 pedidos/dia no gemini-2.5-flash)** — acabou e a transcrição falhava. Agora: `gemini-3.5-flash` primeiro (acertou o estoniano "Tere, see on test"), depois 2.5 e 3.5-lite, com nova tentativa; tipo do áudio do iPhone (.mp4) certo; idioma de quem fala como dica. **Recomendado ativar o faturamento no Google AI Studio.**
- Pedido do "acabei de bater" aparece para a oficina como acidente/ocorrência (`constants.tiposOcorrencia`), não "colisão".
- Campos de data no iPhone dentro da caixa (CSS global); check-in avulso com ano/placa/cor sem sobrepor.
- App: aviso de notificação com fundo sólido e X para fechar.
- Localização com prazo em tudo (site, app e servidor): nunca fica buscando para sempre.
- Avaliação pendente: o aviso aparece antes do formulário; se o banco recusar, mostra o aviso.
- Veículos em serviço: "Pronto para retirar" = etapa Concluso; entregue sai da tela; caixas cabem em estoniano.
- Teste novo: `site-estonia.mjs`. Dados de teste apagados (só o admin).
- **Search Console (3 meses):** 1 clique, 159 impressões, posição média 12; 64 páginas indexadas, 26 "descobertas, ainda não indexadas". Buscas: pneus de inverno na Estônia (et/ru).

## Decisão do dono (08/10 noite)
- **IA:** por ora continua a chave **gratuita** do Gemini (20 pedidos/dia por modelo). As rotas usam modelos de reserva (3.5-flash, 2.5-flash, 3.5-flash-lite) com nova tentativa; se todos esgotarem, a tela avisa "IA ocupada". Rever quando houver uso real.

## Noite 3 (08/10) — em andamento
- **Excluir conta** (exigência Apple 5.1.1(v) e Google Play): `POST /api/conta/excluir`; página pública `/[locale]/excluir-conta` (pt `/excluir-conta`, pt-PT `/eliminar-conta`, en `/delete-account`, et `/kustuta-konto`, it `/elimina-account`, ru `/udalit-akkaunt`) — usar esta URL no Google Play; link no perfil (site) e botão no Perfil do app. Sem histórico: apaga tudo; com histórico: login desativado e dados pessoais anonimizados (pedidos/comissões ficam anônimos); carro em serviço bloqueia até a entrega. Login aceita `?voltar=`.
- **Lojas:** `apps/mobile/eas.json` (development/preview/production, submit); app.json: só celular (sem iPad), criptografia isenta, microfone no Android. Falta do dono: conta Apple Developer (99 US$/ano), Google Play Console (25 US$), `npx eas login` + `eas init` (gera o projectId), criar o app no App Store Connect (ascAppId no eas.json), chave de serviço do Google Play, capturas de tela, textos da loja nos 6 idiomas. Sem notificações push (expo-notifications não instalado) — avisos só com o app aberto.
- **Buscadores (dados reais, 08/10):** Google 1 clique/159 impressões, 64 páginas indexadas. **Bing: 0 páginas indexadas — `/et` e `/en` "Blocked — URL cannot appear on Bing" (violação das diretrizes, a investigar; afeta também DuckDuckGo/Yahoo).** Yandex: `/` indexado com o título antigo em português (de quando `/` era a página do Brasil) por causa do redirecionamento 307; `/et` marcado "baixo valor".
- Auditorias Fable em andamento → `docs/AUDITORIA_FABLE_2026-10-08/` (SEO_ESTONIA, WEB_CLIENTE_PUBLICO, WEB_OFICINA_ADMIN_SERVIDOR, APP_MOBILE, TRADUCOES).

## 09/10 madrugada — auditoria Fable aplicada (parte 1)
- Relatórios em `docs/AUDITORIA_FABLE_2026-10-08/` (SEO_ESTONIA, WEB_CLIENTE_PUBLICO, WEB_OFICINA_ADMIN_SERVIDOR, APP_MOBILE, TRADUCOES_ET_RU, TRADUCOES_PT_EN_IT).
- **Feito e publicado:** `/` 301 → `/et` (x-default et; tira o snippet brasileiro e o redirecionamento "por visitante" que o Bing pode ver como suspeito); sitemap sem oficinas incompletas/de teste (revalida 10 min); home linka os guias; guias com "Leia também"; sem links para a lista de oficinas vazia. Migrações 045 (C-01 ninguém vira admin; A-03/A-04/A-08/A-09/M-06/M-17; índices) e 046 (status no_show). C1 acidente anônimo não entra em conta existente. Entrega com trava (A-05/A-07/M-04). No-show sem BOLA (A-01/A-02). Aceite validado e atômico (M-02). Horário local da oficina (M-03, `lib/fuso.ts`, `lib/turnos.ts`). Testes: `seguranca-rls.mjs`, `site-conclusao.mjs`, `site-estonia.mjs` — tudo OK em produção.
- **Em andamento (Fable, não commitado):** correções de tradução dos dois relatórios; conteúdo SEO et/ru (guia de pneus 2026/27 + 3 guias novos).
- **Falta:** demais itens Médio/Baixo dos relatórios web (M-05, M-08–M-16, cliente A4/A5/M1–M14) e do app (L1 chaves Supabase no EAS, L2 galeria Android, L3 splash, E1–E10); pedir re-rastreamento no Bing/Google/Yandex; itens do dono (Apple/Google, OÜ, perfis).

## 09/10 — Raiz `/`: decisão final (pesquisa em documentação oficial + sites grandes)
- **Corrigido:** o 301 de `/` para `/et` (aplicado sem pesquisa) foi revertido.
- **Fontes:** Google — "Avoid automatically redirecting users from one language version of a site to a different language version" (Managing multi-regional sites) e "x-default … was designed for language selector pages and so it will work best with those" (Localized versions). Yandex — x-default para página cujo idioma é escolhido automaticamente. Bing — não usa hreflang; usa `lang`/`Content-Language` de cada página.
- **Sites grandes (verificado com curl em 09/10):** IKEA `ikea.com/` = 200 "Welcome to IKEA Global" (escolha de país/idioma), x-default = `/`; Wise `wise.com/` = 200, x-default = `/`; Airbnb, Apple, Wikipedia = 200 sem redirecionar; Bolt = 307 por localização (o que o Google desaconselha).
- **Adotado (padrão IKEA):** `https://bipfix.com/` = página leve de escolha de idioma (Eesti, Русский, English primeiro; depois Brasil, Portugal, Italia), 200, sem redirecionamento; `<html lang="en">`, `Content-Language: et, ru, en`; x-default das homes = `/`, das páginas internas = versão `en`; `/` no sitemap; quem já escolheu idioma (cookie) vê essa opção destacada no topo, sem redirecionar. Título padrão do layout raiz trocado (era o antigo do Brasil, o que o Google mostrava).
- **Falta (dono, nos painéis):** pedir re-rastreamento de `https://bipfix.com/` no Google (Inspeção de URL), Yandex ("Переобход страниц") e Bing (URL Inspection → Request indexing).

## 09/10 — Idioma ≠ país (acidente e seguro)
- **Regra (W3C "Be wary about using IP addresses or other location services to guess the language"; Airbnb "Languages & currency" separado do lugar):** idioma = preferência da pessoa; país = onde está o carro. Nunca deduzir um do outro.
- **Acidente:** regras e passos (número de emergência, formulário amigável, seguro) pelo país do acidente (GPS/endereço; sem isso, onde o aparelho está — fuso no site, região no app), escritos no idioma da pessoa. Cada idioma tem as versões br/ee/it/pt/geral.
- **Seguro:** país do seguro escolhido à parte ("Seguro de outro país?"); sugestões de seguradoras desse país; se diferente do país do acidente, aviso de **Carta Verde** (a seguradora atende pelo representante no país do acidente; na Estônia lista da LKF). Site e app.
- Página do acidente usa o país da localização; consulta de placa pelo formato brasileiro; catálogo FIPE só com aparelho no Brasil.
- Teste: `site-seguro-pais.mjs` (italiano em Tallinn, sem GPS) — OK em produção.
- **Decisão pendente do dono:** termos/privacidade hoje seguem o idioma (pt = LGPD do Brasil; demais = GDPR). Um brasileiro morando na Estônia lendo em pt vê a versão brasileira.

## 09/10 — Decisões do dono (lista 1–9) e o que foi feito
1. **Termos/privacidade seguem o país** (não o idioma): `?regiao=br|eu` (noindex) + aviso `components/legal/AvisoJurisdicao.tsx` ("Você está no Brasil/na UE? veja a versão…"), baseado no país do aparelho.
2. **/it = mercado italiano (teste):** textos de marketing reescritos para a Itália; guia `compare-car-repair-quotes` adaptado; em /it, aparelho na Estônia vê o aviso `home.avvisoEstonia` (pode continuar em italiano e usar o serviço na Estônia — idioma ≠ país).
3. **Comissão:** nada de valores; texto único nos 6 idiomas: "por enquanto gratuito; se mudarmos a forma de cobrança, avisamos com 30 dias corridos de antecedência".
4. **SEO / re-rastreamento** — ver `docs/AUDITORIA_FABLE_2026-10-08/SEO_COMPARATIVO.md` (comparação com sites do mesmo caso de uso). Feito: H1 com "Tallinn" em ru/en, parágrafo de apresentação na raiz, título próprio do 404, IndexNow (88 URLs, HTTP 200), Yandex "Переобход" de 12 URLs (na fila), Google Inspeção de URL de `/` → "Indexação solicitada". **Falta no painel (dono, 5 min):** Google → Inspeção de URL + "Solicitar indexação" para `/et`, `/ru`, `/en` e os guias da lista "Dia 1" do SEO_COMPARATIVO; Bing → URL Inspection → Request indexing de `/et` e `/en` (estavam "Blocked"); reenviar `sitemap.xml` nos dois.
   Para depois (lacunas G2/G5/G6/G8): páginas por tipo de serviço, seção de serviços na home, BreadcrumbList em mais páginas, preço no título do guia de preços; `sameAs` da Organization quando houver perfis sociais (dono).
5. **Contas das lojas:** em espera (dono). VM de iOS: não é possível legalmente — a licença do macOS só permite rodar em hardware Apple; alternativas: testar no iPhone com Expo Go (túnel) ou build na nuvem do EAS.
6. Testes nos aparelhos: dono.
7. **Site (auditoria) — tudo corrigido e publicado** (parte 3, commit 200a00a): termos por país, revisão de orçamento, exclusão de conta compartilhada (admin anonimiza em vez de apagar, auditado), tipo do acidente em coluna, carro com histórico não se apaga, loja de peças internacional, textos fixos traduzidos, avisos/aceite/no_show/notificações do cliente, IP real (x-real-ip) e limites por IP, busca do admin sem caracteres que mudam o filtro, agenda (cor, nome do mecânico, tipo traduzido), 404 e H1.
8. **App (boas práticas, commit 58ba87f):** conversa com área segura e teclado no lugar certo; gravação encerrada ao sair da tela; transcrição chega em tempo real; câmera negada → alerta com botão "Ajustes"; sessão renovada só com o app em primeiro plano (`AppState` + start/stopAutoRefresh, recomendação Supabase) e perfil recarregado só quando o login muda; topo das abas pela área segura; tipo da foto pelo `mimeType`; excluir conta sem toque duplo; `@expo/ui` removido; `fetchComPrazo` (Hermes não tem `AbortSignal.timeout`).
9. SEO feito por mim (acima).

## 09/10 — Revisão de orçamento já aceito (monitoramento mantido)
- **Problema:** oficina dá orçamento baixo, cliente aceita, depois a oficina cobra mais. O monitoramento (revisao_numero, valor_original, selo público de ajuste de preço, bônus de comissão para poucas revisões) **foi mantido**.
- **Fluxo limpo (migração 049, tabela `orcamento_revisoes`):** a oficina propõe a revisão (itens novos + motivo obrigatório 5–1000 caracteres; só com orçamento aceito e carro agendado/em serviço; uma pendente por vez) → o cliente decide:
  - **aprovar:** novo valor vale, `valor_original` guardado, `revisao_numero` +1;
  - **recusar** (com confirmação): o serviço é encerrado e o cliente retira o carro — agenda cancelada com histórico "retirado_revisao_recusada", pedido cancelado, sem comissão (status "retirada").
  - **Mudança 09/10 (dono):** saiu a opção "recusar e manter o original" — se a oficina diz que custa mais, manter o preço antigo não é uma opção real. A API ainda aceita o nome antigo 'retirar'. No admin, "Recusadas (carro retirado)" e qualquer recusa gera alerta.
  Rotas: `POST /api/orcamento-revisao` (oficina) e `POST /api/orcamento-revisao/decidir` (cliente, com trava atômica). Notificações nos 6 idiomas (`lib/notif-revisao.ts`). Entrega cancela revisões pendentes.
- Telas: oficina — botão "Propor revisão" e modo revisão em enviar-orçamento; cliente — `RevisaoPendente` no site e no app.
- **Admin:** `RevisoesSuspeitas` em Oficinas → desempenho ruim (90 dias): alerta quando um carro foi retirado ou 2+ propostas com aumento médio > 20%.
- Teste: `site-revisao.mjs` — OK em produção.

## 09/10 — Migrações aplicadas em produção (047–051)
- 047: notificações com autor + limite 40/h; dono de oficina visível só para quem tem relação; pedidos abertos só para oficina ativa; orçamento só de oficina ativa.
- 048: média das avaliações calculada no banco (trigger).
- 049: revisão de orçamento (acima).
- 050: `tipo_acidente` em coluna (emergências e solicitações), com preenchimento dos antigos.
- 051: carro com pedidos não pode ser apagado pelo usuário (apagaria o histórico).

## Pendências do dono (atualizado 09/10 noite)
- Registro da OÜ; contas Apple Developer e Google Play; `npx eas login` + `eas init`; APPLE_TEAM_ID e ANDROID_SHA256 para os links do app (L4); capturas de tela e textos das lojas; contas de teste para os revisores (Apple/Google).
- Pedidos de indexação no Google/Bing listados no item 4; bipfix.pt quando ativar (DNS, HTTPS, indexação).
- No iPhone: confirmar o novo pedido (ponto 12) e o orçamento por PDF (ponto 16) — ver `TESTE_IPHONE_2026-10-09.md`.
- Decidir: desligar também os e-mails de negócio (cadastro de empresa, pedido sem oficina perto)?
- Simulação de pedido de peças: adiada pelo dono (sem dados de teste por agora).

## 09/10 — Site por mercado (país + idioma), modelo IKEA/Norwegian — FEITO
- **Decisão do dono:** opção B de `docs/ANALISE_ESTRUTURA_MERCADOS_2026-10-09.md`.
- **Endereços:**

  | Versão | Endereço | hreflang |
  |---|---|---|
  | Estônia, estoniano | `/ee/et` | `et-EE` e `et` |
  | Estônia, russo | `/ee/ru` | `ru-EE` |
  | Estônia, inglês | `/ee/en` | `en-EE` |
  | Itália | `/it/it` | `it-IT` e `it` |
  | Portugal | `/pt/pt` | `pt-PT` |
  | Brasil | `/br/pt` | `pt-BR` |

  - Códigos: EE = país (ISO 3166, domínio .ee); et = idioma estoniano (ISO 639).
  - Sem `ru`/`en` genéricos: diriam que a página de Tallinn serve para a Rússia ou para o mundo todo.
- **301 de todos os endereços antigos** (um salto só):
  - `/et/...` → `/ee/et/...`, e assim para `/ru`, `/en`, `/pt-br` e `/pt-pt`;
  - `/it/...` → `/it/it/...`;
  - Brasil sem prefixo → `/br/pt/...`;
  - `/ee`, `/it`, `/pt`, `/br` → idioma principal do país.
- **Raiz `/` no estilo Norwegian:** logo, "Tere! · Привет! · Ciao! · Olá!", cartões por país com bandeira; a Estônia com três botões (Eesti keel / Русский / English). Continua 200, x-default, sem redirecionar.
- **Seletor do topo e rodapé:** agrupados por país.
- **Sugestão de idioma:** só dentro do mesmo país (na Estônia: et/ru/en). Trocar de país é escolha da pessoa.
- **App:**
  - links dos termos/privacidade nos novos endereços;
  - confirmação de e-mail aceita `/ee/et/confirmar-email` (rota `app/[idioma]/[versao]`);
  - AASA com `/*/*/confirmar-email*`.
- **Verificado em produção:** todas as versões 200, 301 corretos, sitemap com os novos endereços, robots, imagem de compartilhamento 200. Testes `site-estonia`, `site-revisao`, `site-conclusao`, `site-admin-email` e `seguranca-rls` OK; `site-seguro-pais` com o resultado esperado.
- **IndexNow:** 88 endereços novos + 87 antigos, HTTP 200.
- **Falta (dono, nos painéis):**
  - Google Search Console → Inspeção de URL → "Solicitar indexação" de `https://bipfix.com/`, `/ee/et`, `/ee/ru`, `/ee/en`, `/it/it`, `/pt/pt`, `/br/pt`;
  - reenviar `sitemap.xml` no Google e no Bing;
  - Bing → URL Inspection das mesmas;
  - Yandex → Переобход de `/ee/et` e `/ee/ru`.
- **Opcional (dono):** comprar `bipfix.ee`, `bipfix.it` e `bipfix.pt`. Eu configuro o 301 para `/ee/et`, `/it/it` e `/pt/pt`, como `ikea.it`.
- **Marca:** `bipfix.com.br` é de outra empresa; consultar o INPI antes de investir no Brasil.

## 09/10 tarde — Domínios de país, Search Console e guias de ajuda
- **Domínios:**
  - `bipfix.ee` (Zone.ee) e `bipfix.it` (IONOS): A `@` e `www` → `204.168.139.154`. Na IONOS o "Default Site" foi desativado, junto com o AAAA dela; MX/SPF/DKIM ficaram.
  - nginx `/etc/nginx/sites-available/dominios-pais`: 301 num salto só para `bipfix.com/ee/et` e `bipfix.com/it/it` (mantém `?utm_...`).
  - HTTPS Let's Encrypt nos dois; `certbot renew --dry-run` OK nos dois.
  - `bipfix.pt` (Portugal): ainda em ativação no registro. Quando ativar, fazer o mesmo (o bloco nginx já existe).
- **E-mail do Search Console (noindex / redirect / duplicate):** analisado com os exemplos do próprio relatório.
  - Noindex: cadastro e listas de oficinas vazias (de propósito).
  - Redirect: endereços antigos.
  - Duplicate: endereços antigos e as páginas de ajuda.
  - "Discovered – not indexed" (26): endereços antigos ainda não visitados.
  - Corrigido: guias da inspeção técnica (et/en/ru) linkavam a lista vazia de oficinas.
- **Pedidos de indexação no Google (feitos 09/10):** `/`, `/ee/et`, `/ee/ru`, `/ee/en`, `/it/it`, `/pt/pt`, `/br/pt` ("Indexing requested"). O reenvio do sitemap no painel não registrou; o Google relê sozinho (última leitura 08/10).
- **Guias de ajuda (Guia do Motorista `/docs/cliente`, Guia da Oficina `/docs/oficina`; rodapé "Como funciona" / "Guia da oficina" / "Central de ajuda"):**
  - **Causa da indexação ruim:** o acordeão em React só montava a seção aberta. O Google via 1 de 7 seções (~200 palavras), e as versões pareciam duplicadas.
  - **Agora:** `components/docs/GuiaAjuda.tsx` com `<details>` nativo; todo o texto vai no HTML, com índice no topo e `<h2>` por seção.
  - **Correções:** as páginas passam o idioma explicitamente (`setRequestLocale` + `getTranslations({ locale })`). Sem isso, a página estática saía em inglês nas 6 versões.
  - **Conteúdo** conferido no código e corrigido. Saíram:
    - selo 4,5★/10 serviços (o real é média ≥ 4);
    - selo "Resposta Rápida" (não existe);
    - filtros de ordenação;
    - resposta pública a avaliações;
    - fotos de progresso;
    - e-mail de novos pedidos;
    - "Ajuste de preço = disposta a negociar" (é a % de revisão depois do aceite).
  - **Conteúdo novo:** revisão de preço (aprovar/recusar), garantia e conversa, falta (no-show), reagendar, seguro no acidente/Carta Verde, peças, distribuição de trabalho, capacidade, aprovação da oficina, conta/privacidade/exclusão, custos.
  - **Tamanho:** ~1.390 palavras (motorista) e ~1.270 (oficina) por idioma.
  - **Traduções:** Fable, com os nomes reais dos botões de cada idioma e adaptações por país (112, registrikood/partita IVA/NIF, sem DDD/FIPE fora do Brasil). Verificado com `checar-traducoes.mjs`, a mesma estrutura nos 6 idiomas, cada página com o próprio texto em produção e celular de 390 px sem rolagem lateral.
  - **IndexNow:** 15 URLs (as 12 dos guias + os 3 guias de inspeção).

## 09/10 noite — Testes por mercado, bugs achados e Quadro da agenda
- **Teste novo `site-mercados.mjs`** (produção, celular 390 px, pela tela).
  - **Quem participa:** 4 países, 6 oficinas, 2 lojas de peças e 6 clientes em it/ru/en/pt-PT/pt. Inclui um italiano morando em Tallinn conversando com uma oficina estoniana e uma russa.
  - **Fluxo:** pedido com GPS do país → avisos só às oficinas do lugar, no idioma de cada dono → orçamento pela tela → moeda certa (€ / R$) → conversa nos dois sentidos → aceite com horário → check-in e etapas → revisão de preço aprovada → concluído → entregue → avaliação.
  - **Peças:** só a loja do mesmo país vê a cotação.
  - **Avisos:** todos no idioma de quem lê.
  - **Resultado:** 215 verificações ✓ e a Itália refeita OK depois de corrigir o filtro do próprio teste.
- **Regressão completa depois da mudança de endereços:** as 14 suítes do site OK. O `e2e-seguro` só bateu no limite de 3 acidentes por hora por IP (proteção). Mais a varredura dos 6 idiomas.
- **Bugs reais achados e corrigidos:**
  1. **Acidente avisava oficinas de qualquer país:** sem oficina num raio de 50 km, avisava 20 oficinas quaisquer; além disso, "pedido novo" ia para TODAS as oficinas de funilaria ativas. Agora só as oficinas perto do acidente. O admin recebe e-mail quando ninguém perto foi avisado (antes só quando não havia nenhuma oficina ativa no mundo). Vale também para o pedido comum.
  2. **Histórico da agenda** aceitava só 5 ações e recusava em silêncio "retirado_revisao_recusada" (cliente recusou a revisão e retirou o carro). Migração 054.
- **Quadro da agenda (pedido do dono):**
  - **Visão:** nova visão "Quadro" ao lado de Mês/Dia/Lista. A oficina escolhe, e a escolha fica salva no aparelho.
  - **Layout:** linhas por **mecânico** ou por **elevador/box**; dias nas colunas; cada carro é uma barra da entrada até a entrega prevista. Cores por situação: agendado, na oficina, aguardando peças, pronto para retirar, prazo estourado, check-in atrasado, falta, entregue, serviço interno. Alertas no topo e disponibilidade por dia.
  - **Elevadores e boxes (migração 053):** um carro no elevador ocupa o elevador e o mecânico ao mesmo tempo. Elevador com dois carros nos mesmos dias = conflito marcado. Mecânico acima do limite (`capacidade_maxima`) é avisado. Linha "Livres (de N)" por dia.
  - **Trocar mecânico/elevador:** arrastando (computador) ou tocando no carro (celular), via `/api/servico` (`atribuir` / `elevador`), com histórico. A data nunca muda por arrasto: mudar a data de carro de cliente é reagendamento com ele.
  - **Permissões:** o dono troca tudo; o mecânico com acesso escolhe o elevador só dos carros dele.
  - **Tempo real (migração 052):** a agenda e os elevadores entraram no tempo real. As quatro visões usam os mesmos agendamentos, e uma mudança em um aparelho aparece nos outros sem recarregar. O cartão do Dia mostra o elevador.
  - **Telas removidas:** "Distribuição de trabalho" e "Capacidade" saíram do site. Os endereços antigos levam ao Quadro; os indicadores (capacidade por tipo de serviço, tempo médio por etapa) ficam abaixo do Quadro.
  - **Textos:** tutorial "Aprender" e Guia da Oficina atualizados nos 6 idiomas.
  - **Teste novo `site-quadro.mjs`:** 35 verificações ✓, cobrindo celular e computador, arrastar, conflito, tempo real entre dois aparelhos, mecânico com acesso, endereços antigos e os 6 idiomas.
- **App:** hoje é só para motoristas; contas de oficina não entram nele, e as oficinas usam o site, que funciona no celular. Uma área de oficina no app seria um projeto à parte. O Quadro já funciona no navegador do celular.

## 09/10 noite 2 — Correções do teste no iPhone, menu, dados zerados e projeto do Quadro
- **Novo pedido no app carregando sem fim (ponto 12):**
  - **Prova:** o servidor recebia do iPhone até ~1000 consultas de localização por minuto, ou seja, a tela era recriada sem parar.
  - **Causa:** `react-native-screens` recria a tela quando o cabeçalho de um modal é ligado/desligado de dentro dela (aviso da própria biblioteca).
  - **Correção:** cabeçalho do "novo pedido" e do "acabei de bater" fixo no `_layout.tsx`; `<Stack.Screen>` saiu das telas (commit b6c1e9b).
- **Orçamento por PDF/foto (ponto 16):**
  - **Medido no servidor:** 2.5-flash sem raciocínio 4 s, 3.5-flash-lite 2,6 s, 3.5-flash 82 s.
  - **Novo `apps/web/src/lib/gemini.ts`:** fila de modelos com prazo por tentativa (30 s) e total (50 s, abaixo do corte de 60 s do nginx). Usado em `ler-orcamento`, `analisar-dano` (modelo usado vem de `modelVersion`) e `transcrever-audio` (mantém 3.5-flash primeiro pela qualidade no estoniano).
  - **Tela:** a página desiste em 70 s com erro claro.
  - **Quantidade fracionada:** vira uma linha com o valor total (ponto 17).
  - **Produção:** o orçamento real do dono (PDF de 2 páginas e foto) foi lido em 6,6 s e 5,5 s, total €1797,01.
- **App — garantia (ponto 18):**
  - **Cartão:** abre o pedido (histórico completo).
  - **Botão "Falar com a oficina":** no cartão e no bloco da garantia do pedido; chave nova `garantia.verServico` nos 6 idiomas.
  - **Teste:** `app-garantia.mjs` 7/7.
- **Menu do site (ponto 19):**
  - **Teste novo `site-menu-sobreposto.mjs`:** mede caixa a caixa o cabeçalho de oficina, cliente e loja nos 6 idiomas, de 360 a 1920 px. Antes 56 combinações com texto sobreposto; depois 0.
  - **Mudanças em `Navbar.tsx` e `LanguageSwitcher.tsx`:**
    - links só a partir de 1280 px (abaixo, ☰);
    - logo e papel sem encolher;
    - idioma compacto quando logado;
    - "Perfil" pelo avatar (com rótulo acessível);
    - nome ao lado do avatar só em tela muito larga;
    - "Sair" dentro do ☰ no celular;
    - painel logado mais largo (`max-w-screen-2xl`).
- **Deploy:** commit c5a828c em produção (build OK).
- **Dados zerados (pedido do dono):**
  - **Apagado:** todas as contas não-admin (oficina Moretto do dono, oficinas de demonstração Kereremont/Mootorikeskus, cliente de demonstração), fotos de acidente e registros de erro do app.
  - **Ficaram:** o admin e `plataforma_config`. Conferido tabela por tabela.
- **Em andamento — Quadro profissional (pontos 21–22):**
  - **Pedido do dono:**
    - barra no tempo real do check-in ao check-out;
    - visão do dia hora a hora para reservar o elevador;
    - modo de monitoramento opcional;
    - explicar/renomear "Elevador / Box / Vaga (Lugar)";
    - limite de carros por serviço e geral.
  - **Projeto:** pesquisa e proposta pedidas ao Fable em `docs/PROJETO_QUADRO_OFICINA_2026-10-09.md`; depois implementação em fases e testes em 6 idiomas.
