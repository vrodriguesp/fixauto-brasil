# Portal de peças — fase 2 (comissão, chat, oficina fornecedora, capacidade por funcionário, rastreabilidade)

Continuação da fase 5 da retenção de oficinas (`docs/NOVIDADES_RETENCAO_OFICINAS.md`), implementada em 08/09/2026. Migration `018_comissao_fornecedor_pecas.sql`.

---

## 1. Comissão sobre venda de peças

Mesma lógica da comissão de serviço (`docs/NOVIDADES_RETENCAO_OFICINAS.md` fase 2), adaptada pra peças e cobrada de **quem vende a peça** (loja de peças OU oficina que vende excedente — ver item 3):

- Taxa parte de **3%**, entre **1% e 3%**.
- Reduções: resposta rápida a uma cotação (`< 2h` → -1%, `< 6h` → -0,5%) + volume/fidelidade nos últimos 90 dias (≥15 pedidos entregues → -0,5%, ≥5 → -0,25%).
- Cobrada só quando um **pedido é marcado como entregue** (`/api/marcar-pedido-peca-entregue`, rota de servidor — mesma lição dos bugs de RLS anteriores: quem marca "entregue" não é sempre o "dono" da linha pras políticas de segurança, então fazer isso direto do navegador arrisca falhar silenciosamente).
- Cada fornecedor (loja ou oficina) vê sua taxa e extrato em uma tela própria: lojas em `/loja/comissao` (novo item no menu), oficinas-fornecedoras dentro da aba "Vender excedente" de `/oficina/pecas` (accordion "Ver minha comissão como fornecedora").
- **Por que 3% e não os 15% do serviço**: a margem de revenda de peça é bem mais apertada que a de mão de obra, e o objetivo declarado é primeiro fazer o canal pegar tração — a taxa pode ser revista depois que houver dado de uso real (ver item 5, a página de admin foi desenhada exatamente pra essa decisão).

## 2. Chat entre oficina e fornecedor de peça

Canal de mensagens dedicado por par (cotação, fornecedor) — se 3 lojas respondem a mesma cotação, a oficina tem 3 conversas separadas, e cada loja só vê a própria (mesma lógica de "lance fechado" das respostas, pra não vazar preço entre concorrentes).

- Suporta texto e **fotos** (comprimidas no navegador antes do upload, mesmo helper já usado em fotos de oficina/dano).
- Tempo real (Supabase Realtime), mesmo padrão do chat cliente↔oficina já existente.
- Acessível por um link "Conversar" em cada resposta de cotação (`/oficina/pecas`) e em cada pedido (`/loja/pedidos`, `/loja/cotacoes`).
- Tabela nova: `cotacoes_pecas_mensagens`.

## 3. Oficina também pode vender peças (excedente)

Nova aba **"Vender excedente"** dentro de `/oficina/pecas` (ao lado de "Comprar", que já existia):

- Toggle `oficinas.vende_pecas` — ativa/desativa a oficina como fornecedora. Desligado por padrão, não afeta quem não usa.
- Quando ativo, a oficina vê cotações abertas de **outras oficinas** dentro do seu próprio raio de atendimento (`raio_atendimento_km`, campo que já existia pra outra finalidade — reaproveitado aqui em vez de criar um raio separado), calculado por distância real (fórmula de haversine, `lib/utils.ts`).
- Quando uma oficina abre uma nova cotação, `/api/notificar-fornecedores-cotacao-peca` avisa (notificação in-app) as oficinas-fornecedoras próximas — mesmo padrão de roteamento por proximidade já usado em `/api/notificar-oficinas-emergencia`. **Lojas de peças continuam no modelo antigo (pull, navegam cotações abertas manualmente) — isso não mudou.**
- Oficina-fornecedora responde cotações, confirma pedidos, marca como entregue e acompanha sua própria comissão, tudo dentro da mesma aba.
- **Decisão de dado**: pra isso funcionar sem duplicar todo o sistema de cotação/pedido, generalizei as tabelas `cotacoes_pecas_respostas` e `pedidos_pecas` pra aceitarem um fornecedor de dois tipos (`fornecedor_tipo`: `'loja'` ou `'oficina'`, com `loja_id` OU `oficina_fornecedora_id` preenchido, nunca os dois — reforçado por `CHECK` constraint no banco). Como o portal foi criado só ontem e não tem dado real de produção, esse era o momento certo de arrumar o modelo — não seria assim tão barato depois.

## 4. Gestão de capacidade por funcionário

A gestão de capacidade que já existia (`/oficina/capacidade`, fase 4 da retenção) era só por tipo de serviço, na oficina como um todo. Agora tem uma seção nova **"Capacidade por funcionário"** na mesma tela:

- Cada mecânico pode ter um limite de veículos simultâneos (`funcionarios.capacidade_maxima`, editável em `/oficina/equipe` — campo opcional, sem limite por padrão, então **não obriga ninguém a configurar nada**, inclusive quem opera sozinho sem nenhum funcionário).
- A tela mostra, por mecânico, quantos veículos `em_andamento` estão atribuídos a ele agora vs. o limite (`calcularCargaPorFuncionario`, `lib/capacidade.ts`), com a mesma barra de progresso visual da capacidade por tipo de serviço.
- **O que NÃO foi construído** (por escopo — isso é um MVP, não uma reformulação completa): uma agenda visual tipo calendário/Gantt onde o administrativo arrasta e solta veículos entre mecânicos. O que existe hoje é a visão de carga (pra saber quem está sobrecarregado) + a atribuição de mecânico responsável que já existia em `/oficina/veiculos-em-servico` (dropdown "Atribuir mecânico" por veículo) — juntos, dá pra decidir manualmente, só que sem drag-and-drop. Se depois de usar isso o administrativo achar pouco, um calendário dedicado é o próximo passo natural.

## 5. Rastreabilidade do portal de peças (admin)

Nova página **`/admin/pecas`** no painel admin, pensada especificamente pra responder "esse canal está pegando, e a comissão está vindo?":

- Lista todas as lojas de peças e oficinas-fornecedoras: nome, tipo, cidade/estado, ativa/inativa, data de cadastro e **último login** — esse último dado não existia em lugar nenhum do admin antes (não fica na tabela `profiles`; vem do Supabase Auth via `supabaseAdmin.auth.admin.listUsers()`, cruzado pelo `profile_id`).
- Resumo no topo: quantos ativos logaram nos últimos 7 dias vs. nunca logaram (sinal de adoção real, não só cadastro).
- Contadores de uso do canal: cotações abertas/respondidas, pedidos confirmados/entregues, comissão pendente e paga — inclusive um aviso automático se houver pedidos entregues mas nenhuma comissão lançada (sinal de bug, não só de falta de uso).
- Ideia é que essa tela sozinha responda a pergunta que o usuário levantou ao pedir a feature: *"se vemos que vem sendo usado mas ninguém paga a comissão, podemos mudar"* — sem precisar consultar o banco na mão.

## Adiado

**Consulta de histórico de reparos por placa** (pra concessionárias verificarem reparos anteriores de um carro): não foi implementada nesta rodada, a pedido explícito do usuário. Envolve dado de terceiro (histórico de reparo/acidente de um veículo específico) e portanto precisa de um modelo de acesso definido antes de construir — a proposta em aberto era uma conta "concessionária" aprovada manualmente pelo admin, mostrando só tipo de serviço/data/oficina (sem nome/telefone do cliente), em vez de acesso público. Fica registrado aqui pra retomar quando o usuário quiser destravar essa decisão.
