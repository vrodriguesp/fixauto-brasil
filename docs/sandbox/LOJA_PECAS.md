# Sandbox — Loja de Peças (BipFix)

Documentação de referência do tipo de conta **Loja de Peças** (`profiles.tipo = 'loja_pecas'`), criado na fase 5 da retenção de oficinas e ampliado na fase de comissão/chat (migrations `017_portal_pecas.sql` e `018_comissao_fornecedor_pecas.sql`). Escrita para servir de base a um tutorial guiado (sandbox) para donos de loja de peças automotivas que nunca usaram o site.

> **Contexto de negócio em uma frase**: uma oficina mecânica publica um pedido de peça ("cotação"), lojas de peças cadastradas respondem com preço e prazo, a oficina escolhe uma resposta e confirma o pedido, a entrega e o pagamento são combinados **fora da plataforma** (WhatsApp/telefone/chat interno), e só quando o pedido é marcado como "entregue" o BipFix cobra uma pequena comissão da loja.

> **Nota sobre overlap**: uma oficina também pode virar "fornecedora de peças" (aba "Vender excedente" em `/oficina/pecas`) e competir pelas mesmas cotações que as lojas respondem. Do ponto de vista da loja, isso é invisível — na lista de respostas de uma cotação, a oficina dona simplesmente vê respostas de "lojas" e de "oficinas" misturadas, sem distinção visual especial. Esse fluxo do lado da oficina fornecedora é documentado à parte (`docs/sandbox/OFICINA.md`, se já existir).

---

## Índice

1. Cadastro ("Sou Loja de Peças")
2. Dashboard da loja
3. Catálogo de Peças (estoque)
4. Cotações de Oficinas (responder pedidos)
5. Conversa / Chat com a oficina
6. Pedidos
7. Comissão BipFix (fórmula completa)
8. Perfil da Loja
9. Fluxo ponta a ponta (linha do tempo completa)
10. Regras de negócio e RLS (banco de dados)
11. Bugs e inconsistências encontrados

---

## 1. Cadastro ("Sou Loja de Peças")

Arquivo: `apps/web/src/app/(auth)/cadastro/page.tsx`

### O que é
É o formulário de criação de conta em `/cadastro`. Quando a pessoa escolhe o cartão **"Sou Loja de Peças"** (ícone laranja de caixas empilhadas, com o texto "Quero vender peças e responder cotações de oficinas"), o cadastro segue um fluxo de 3 passos específico para loja.

### Passo a passo exato

**Passo 1 — Escolha do tipo de conta** (só aparece se a pessoa chegou em `/cadastro` sem um parâmetro `?tipo=` na URL; se veio de um link tipo `/cadastro?tipo=loja_pecas`, pula direto pro passo 2).
- Três cartões: "Sou Motorista", "Sou Oficina", "Sou Loja de Peças".
- Clicar em "Sou Loja de Peças" define `userType = 'loja_pecas'` e avança pro passo 2.

**Passo 2 — Dados pessoais** (título da página vira "Cadastro da Loja de Peças"):
- Nome completo * (obrigatório pelo atributo HTML `required`)
- Email * (obrigatório)
- Telefone (opcional, sem obrigatoriedade nem máscara)
- Senha * (mínimo 6 caracteres, validado por `minLength={6}` do HTML — não há validação de força de senha)
- Botão "Próximo" (em vez de "Criar conta", porque loja e oficina têm um passo 3). Enquanto salva, mostra "Criando conta..." — mas na real esse botão só avança de passo, a conta ainda não é criada aqui.

**Passo 3 — Dados da loja**:
- Nome fantasia * (obrigatório)
- CNPJ (opcional, sem máscara nem validação de formato/dígitos verificadores)
- Endereço (**sem** `required`, apesar do rótulo não indicar isso)
- Cidade / Estado — dois campos lado a lado. Estado é um **campo de texto livre** com placeholder "SP" (não é uma lista de UFs — ver bug #8)
- CEP (texto livre, sem máscara)
- Botão "Criar conta da loja" — dispara a criação de fato.

### O que acontece ao clicar em "Criar conta da loja"
1. `signUp(email, senha, nome, telefone, 'loja_pecas')` do `auth-context.tsx` cria o usuário no Supabase Auth e insere uma linha em `profiles` com `tipo = 'loja_pecas'`.
2. Se isso funcionar, o código insere uma linha em `lojas_pecas` com:
   - `nome_fantasia`: o valor digitado (ou o nome pessoal, se vazio)
   - `cnpj`: o valor ou `null`
   - `endereco`: o valor ou `'A definir'` se vazio
   - `cidade`: o valor ou `'A definir'` se vazio
   - `estado`: o valor ou `'SP'` se vazio
   - `cep`: o valor ou `'00000-000'` se vazio
   - `latitude` / `longitude`: **sempre fixos** em `-23.5505 / -46.6333` (coordenadas de São Paulo) — não há geocodificação do endereço digitado
   - `raio_atendimento_km`: sempre `30` (fixo, não configurável no cadastro)
3. Se der erro em qualquer uma das duas inserções, a mensagem de erro do Supabase é mostrada em uma faixa vermelha no topo do card.
4. Em caso de sucesso, redireciona para `/loja/dashboard`.

### Validações e mensagens
- Erros de autenticação (ex.: e-mail já cadastrado, senha fraca) aparecem na mesma caixa vermelha genérica no topo, com o texto cru vindo do Supabase (não traduzido para português).
- Não existe confirmação de e-mail obrigatória antes de acessar o dashboard (login automático após cadastro).

---

## 2. Dashboard da loja

Arquivo: `apps/web/src/app/loja/dashboard/page.tsx` — rota `/loja/dashboard`.

### O que é
Tela inicial ao logar como loja. Serve como resumo rápido + explicação de como o portal funciona, para uma loja completamente nova entender o modelo de negócio.

### Conteúdo exato
- Saudação: "Olá, {nome fantasia da loja}!"
- Subtítulo: "Acompanhe cotações e pedidos de oficinas"
- Três cartões clicáveis lado a lado (em telas grandes; empilhados em celular):
  1. **Número em laranja** = quantidade de cotações com status `aberta` **em todo o sistema** (não filtrado por proximidade nem por já ter sido respondida por essa loja) → "Cotações abertas pra responder" → leva a `/loja/cotacoes`
  2. **Número em verde** = quantidade total de linhas em `pedidos_pecas` vinculadas a essa loja, **sem filtrar por status** → "Pedidos confirmados" → leva a `/loja/pedidos` (ver bug #5, o rótulo não bate com o dado)
  3. **Número em azul** = quantidade de peças com `ativo = true` no catálogo da própria loja → "Peças ativas no catálogo" → leva a `/loja/catalogo`
- Um card "Como funciona" com uma lista de 4 passos em português simples:
  1. "Oficinas publicam cotações pedindo peças que precisam"
  2. "Você responde com preço e prazo de entrega"
  3. "A oficina escolhe a melhor resposta e confirma o pedido"
  4. "Combine a entrega e o pagamento diretamente com a oficina"

### Estado vazio / carregamento
- Enquanto carrega, mostra um esqueleto cinza pulsante (skeleton).
- Não existe um "estado vazio" dedicado nesta tela — os contadores simplesmente mostram `0`.

---

## 3. Catálogo de Peças (estoque)

Arquivo: `apps/web/src/app/loja/catalogo/page.tsx` — rota `/loja/catalogo`.

### O que é e pra que serve
Um CRUD simples onde a loja cadastra as peças que tem em estoque: nome, compatibilidade (marca/modelo/ano), preço e quantidade. **Importante avisar ao dono da loja**: hoje esse catálogo **não é exibido em nenhuma tela vista pela oficina** (ver bug #4) — ele serve apenas como registro interno da própria loja por enquanto, mesmo o texto da página dizer "oficinas podem ver e comprar direto".

### Passo a passo exato

**Listagem**:
- Cabeçalho: "Catálogo de Peças" / "Anuncie peças em estoque - oficinas podem ver e comprar direto"
- Botão "+ Nova Peça" no canto superior direito
- Lista de cards, um por peça, cada um mostrando:
  - Nome da peça (negrito)
  - Linha secundária com marca/modelo/ano compatíveis, só aparece se pelo menos marca OU modelo estiverem preenchidos
  - Preço formatado em R$ + "· {quantidade} em estoque"
  - Botão "Desativar" (amarelo) ou "Ativar" (verde), alterna o campo `ativo`
  - Ícone de lixeira para excluir
- Peças com `ativo = false` aparecem com opacidade reduzida (60%), mas continuam na lista — não desaparecem.

**Estado vazio**: card centralizado com o texto "Nenhuma peça cadastrada ainda".

**Adicionar Peça** (ao clicar "+ Nova Peça", abre um formulário no topo da lista):
- Nome da peça * — texto livre, ex.: "Farol dianteiro direito"
- Descrição (opcional) — texto livre, "Detalhes, condição, etc."
- Marca compatível — texto livre, ex.: "Fiat" (não usa a lista oficial de marcas FIPE, é digitação livre)
- Modelo compatível — texto livre, ex.: "Argo"
- Ano compatível — texto livre, ex.: "2020"
- Preço (R$) * — campo numérico, `step="0.01"`, **sem `min="0"`**, então tecnicamente aceita valor negativo
- Quantidade em estoque — campo numérico, padrão `1`, também sem `min="0"`
- Botões "Cancelar" e "Adicionar". O botão "Adicionar" fica desabilitado até nome e preço estarem preenchidos (checagem client-side: `!form.nome || !form.preco` — atenção que preço `"0"` é considerado "vazio" por essa checagem, então não dá pra cadastrar peça com preço textualmente `0`).
- Ao confirmar: insere em `pecas_catalogo` com `loja_id`, os campos preenchidos (vazios viram `null`), `preco` convertido para número e `quantidade_estoque` convertido para inteiro (ou `0` se inválido). Fecha o formulário e recarrega a lista.
- **Não há tratamento de erro visível** — se o insert falhar (RLS, rede, etc.), o formulário fecha e reseta como se tivesse dado certo, sem qualquer aviso (ver bug #6).

**Desativar/Ativar**: um clique, sem confirmação, alterna `ativo` na hora.

**Remover peça**: pede confirmação via `confirm()` nativo do navegador ("Remover 'Nome da peça' do catálogo?"). Se confirmado, apaga a linha permanentemente (não é soft-delete).

---

## 4. Cotações de Oficinas (responder pedidos)

Arquivo: `apps/web/src/app/loja/cotacoes/page.tsx` — rota `/loja/cotacoes`.

### O que é
A tela principal de trabalho da loja: uma lista de pedidos de peça publicados por oficinas, esperando resposta com preço e prazo. É o "mercado" onde a loja disputa vendas.

### Como a lista é montada (importante para explicar o comportamento)
A tela busca **todas** as cotações com status `aberta` de **todas as oficinas do Brasil**, sem nenhum filtro de cidade/estado/distância (ver bug #7 — o "raio de atendimento" da loja não é usado aqui). Em paralelo, busca as respostas que a própria loja já enviou, para marcar quais cotações já foram respondidas por ela.

### Passo a passo exato
Cada card de cotação mostra:
- Descrição da peça pedida (ex.: "Farol dianteiro direito")
- Nome da oficina + cidade/estado
- Veículo compatível (marca/modelo/ano), só se algum desses campos existir
- Quantidade pedida
- Tempo relativo desde a criação (ex.: "2h atrás", "3min atras", "agora")

E depois, um de três estados:
1. **Já respondida por essa loja**: caixa verde "Você respondeu: R$ X,XX - prazo Y dia(s)" + link "Conversar" (leva ao chat daquela resposta).
2. **Formulário de resposta aberto** (depois de clicar "Responder cotação"): campos Preço (R$), Prazo (dias, padrão 2), Observação (opcional, texto livre) + botões "Cancelar" / "Enviar resposta".
3. **Ainda não respondida, formulário fechado**: botão "Responder cotação".

### O que acontece ao enviar uma resposta
1. Insere uma linha em `cotacoes_pecas_respostas` com `fornecedor_tipo: 'loja'`, `loja_id`, `preco`, `prazo_dias` (ou `1` se inválido), `observacao`. O campo `peca_catalogo_id` **nunca é preenchido** — a resposta não é vinculada a nenhum item do catálogo da loja, mesmo que exista um item equivalente cadastrado.
2. Se não houver erro, chama `POST /api/marcar-cotacao-respondida` para mudar o status da cotação de `aberta` para `respondida` (precisa ser uma rota de servidor porque a loja não é "dona" da cotação e a política de segurança do banco bloquearia um update direto vindo do navegador).
3. Envia uma notificação in-app para a oficina dona da cotação (`tipo: 'cotacao_peca_respondida'`).
4. Fecha o formulário e recarrega a lista — **independentemente de ter dado erro ou não** (ver bug #6).

### Estado vazio
Card centralizado: "Nenhuma cotação aberta no momento".

### Regra de negócio crítica: "lance fechado" e o efeito colateral do status
- **Lance fechado**: por política de segurança do banco (RLS), uma loja só enxerga a **própria** resposta a uma cotação — nunca vê o preço que a concorrência ofereceu. Só a oficina dona da cotação vê todas as respostas lado a lado. Isso é proposital, para não virar um leilão público de preço.
- **Efeito colateral importante**: assim que a **primeira** loja (ou oficina fornecedora) responde, o status da cotação muda de `aberta` para `respondida`. Como a tela `/loja/cotacoes` só busca cotações com status `aberta`, a cotação **desaparece da lista de todas as outras lojas** a partir da próxima vez que a página recarregar — mesmo que a oficina ainda não tenha escolhido ninguém e outras lojas pudessem, em tese, competir. Ver bug #1.

---

## 5. Conversa / Chat com a oficina

Arquivos: `apps/web/src/app/loja/conversa/[respostaId]/page.tsx` + `apps/web/src/components/pecas/ChatCotacaoPeca.tsx` — rota `/loja/conversa/{respostaId}`.

### O que é
Um chat estilo WhatsApp entre a loja e a oficina, específico para uma cotação + uma resposta. Serve para tirar dúvidas sobre a peça, combinar prazo, forma de pagamento e entrega, e enviar fotos.

### Como se chega até aqui
- Link "Conversar" na tela de Cotações (ao lado de uma resposta já enviada)
- Link "Conversar" na tela de Pedidos (ao lado de cada pedido confirmado)

### Passo a passo exato
- Cabeçalho mostra o nome da oficina e, como subtítulo, a descrição da peça.
- Botão "Voltar" no topo, volta para a página anterior.
- Corpo da conversa: mensagens em bolhas, as da própria loja alinhadas à direita (fundo azul/laranja da marca), as da oficina à esquerda (fundo branco, com o nome do remetente acima do texto).
- Suporta **texto** e **foto**:
  - Campo de texto na parte inferior + botão de enviar (ícone de avião de papel). Enter envia a mensagem (Shift+Enter não foi tratado explicitamente para quebrar linha, mas o input é de uma linha só, então na prática não há quebra de linha).
  - Botão de clipe/câmera abre o seletor de arquivo de imagem. A imagem é comprimida no navegador antes do upload (`compressImage`), enviada para o bucket `damage-photos` do Supabase Storage, em um caminho `pecas-mensagens/{cotacaoId}/{fornecedorId}/{timestamp}.{ext}` — **note**: usa o mesmo bucket de fotos de dano de veículo, não um bucket dedicado ao portal de peças.
  - Enquanto envia a foto, mostra "Enviando foto..." com um spinner.
- Mensagens novas aparecem em tempo real via Supabase Realtime (não precisa recarregar a página) — tanto para quem manda quanto para quem recebe.
- A tela rola automaticamente para a mensagem mais recente.

### Estado vazio
"Nenhuma mensagem ainda." + "Tire duvidas sobre a peca, prazo ou envie uma foto." (Nota: o "dúvidas" está sem acento — ver bug de texto na seção 11.)

### Regra de negócio
A conversa é isolada por par (cotação, fornecedor) — se 3 lojas responderam à mesma cotação, existem 3 conversas totalmente separadas, e uma loja nunca vê a conversa de outra loja com a mesma oficina (mesma lógica do "lance fechado").

---

## 6. Pedidos

Arquivo: `apps/web/src/app/loja/pedidos/page.tsx` — rota `/loja/pedidos`.

### O que é
Lista de pedidos que oficinas **já confirmaram** com essa loja (ou seja, a oficina escolheu a resposta dessa loja entre as recebidas). É aqui que a loja acompanha o que precisa entregar e marca como concluído.

### Passo a passo exato
Cada linha mostra:
- Descrição da peça pedida
- Nome da oficina + cidade/estado + telefone (se cadastrado)
- Valor total formatado em R$ + quantidade + data (dia/mês/ano)
- Link "Conversar" (mesmo chat da seção 5)
- Etiqueta colorida de status: **Confirmado** (amarelo), **Entregue** (verde) ou **Cancelado** (vermelho)
- Se o status for `confirmado`, aparece um link "Marcar entregue"

### O que acontece ao clicar "Marcar entregue"
1. Chama `POST /api/marcar-pedido-peca-entregue` com o `pedidoId`.
2. No servidor: busca o pedido; se já estava `entregue`, não faz nada (idempotente). Senão, atualiza `status = 'entregue'`.
3. Verifica se já existe uma comissão lançada para esse pedido (evita lançar duas vezes). Se não existir:
   - Recalcula a taxa de comissão da loja (`recalcularComissaoPecasConfig`, ver seção 7)
   - Insere uma linha em `comissao_pecas_lancamento` com `valor_pedido` = `preco_total` do pedido, `taxa_aplicada` = taxa calculada, `valor_comissao` = `preco_total × taxa`, arredondado para 2 casas decimais, `status: 'pendente'`
   - Recalcula a taxa **de novo** depois de lançar a comissão (para já refletir o novo total de pedidos entregues nos últimos 90 dias na tela seguinte)
4. Recarrega a lista de pedidos.

### Estado vazio
Card centralizado: "Nenhum pedido ainda".

### De onde vem um pedido (lado da oficina, para contexto)
Um pedido só existe depois que a **oficina** (não a loja) confirma uma resposta específica em `/oficina/pecas`. Ao confirmar:
- Cria a linha em `pedidos_pecas` com `preco_total = preço da resposta × quantidade pedida na cotação` (a quantidade não é digitada de novo pela loja — vem da cotação original)
- Muda o status da cotação inteira para `fechada`
- Notifica o fornecedor escolhido ("Pedido de peça confirmado!")
- **Nenhuma notificação é enviada às outras lojas que responderam e não foram escolhidas** — a cotação delas simplesmente some da lista de cotações abertas (ver bug #11)

---

## 7. Comissão BipFix (fórmula completa)

Arquivos: `apps/web/src/app/loja/comissao/page.tsx`, `apps/web/src/components/pecas/ComissaoPecasCard.tsx`, `apps/web/src/lib/comissao-pecas.ts`, constantes em `packages/shared/constants/index.ts` (`COMISSAO_PECAS_CONFIG`).

### O que é, em português simples
É a taxa que o BipFix cobra da loja sobre cada pedido **entregue**. Diferente da comissão de serviço cobrada da oficina (15% base), a comissão de peça é bem menor (3% base) porque a margem de revenda de peça costuma ser mais apertada. A taxa **cai automaticamamente** quanto mais rápido a loja responde às cotações e quanto mais pedidos ela entrega — é um incentivo, não uma penalidade.

### Tela (`/loja/comissao`)
- Título "Comissão BipFix" / subtítulo "Taxa cobrada sobre pedidos de peças entregues, e como reduzi-la"
- Três cartões-resumo lado a lado:
  1. **Sua taxa atual** (%, uma casa decimal)
  2. **Comissão pendente** (soma de `valor_comissao` de lançamentos com `status = 'pendente'`)
  3. **Comissão paga** (soma dos com `status = 'pago'`)
- Um aviso em caixa azul explicando a regra em texto corrido (citado literalmente):
  > "A taxa parte de 3% e cai pra até 1% respondendo cotações rápido (sua média hoje: X,Xh) e mantendo volume de pedidos entregues. É cobrada só quando um pedido é marcado como entregue."
  (a parte "(sua média hoje: ...)" só aparece se já existir uma média de tempo de resposta calculada)
- Tabela "Extrato de comissão de peças": Data, Valor do pedido, Taxa aplicada naquele lançamento, Valor da comissão, Status (Pendente/Pago).
- Estado vazio da tabela: "Nenhuma comissão registrada ainda"

### A fórmula exata (`lib/comissao-pecas.ts`)

Constantes (`COMISSAO_PECAS_CONFIG`):
```
TAXA_BASE          = 3%    (0.03)
TAXA_MIN           = 1%    (0.01)
TAXA_MAX           = 3%    (0.03)
BONUS_RESPOSTA_2H  = 1%    (0.01)   — desconto se média de resposta < 2h
BONUS_RESPOSTA_6H  = 0,5%  (0.005)  — desconto se média de resposta entre 2h e 6h
```
Bônus de volume (definido em código, não em `COMISSAO_PECAS_CONFIG`, mas mesma lógica):
```
>= 15 pedidos entregues nos últimos 90 dias  → desconto de 0,5%  (0.005)
>= 5  pedidos entregues nos últimos 90 dias  → desconto de 0,25% (0.0025)
(abaixo de 5, nenhum desconto de volume)
```

**Cálculo passo a passo** (função `recalcularComissaoPecasConfig`):
1. Se a loja tiver um **override manual** configurado pelo admin (`comissao_pecas_config.usa_override = true` e `taxa_fixa_override` preenchido), usa exatamente esse valor fixo e para por aí — ignora todo o resto do cálculo.
2. Senão, busca todas as respostas da loja a cotações (`cotacoes_pecas_respostas`) dos **últimos 90 dias**, e calcula o tempo médio, em horas, entre a cotação ter sido criada e a loja ter respondido.
3. Busca a contagem de pedidos com `status = 'entregue'` dessa loja nos últimos 90 dias.
4. Começa com `taxa = TAXA_BASE (3%)`.
5. Se a média de resposta for `> 0` e `< 2h`: subtrai `BONUS_RESPOSTA_2H` (1%). Senão, se for `> 0` e `< 6h`: subtrai `BONUS_RESPOSTA_6H` (0,5%). (Mutuamente exclusivo — só um dos dois bônus de velocidade se aplica.)
6. Aplica o **maior** bônus de volume que a loja atingir (não soma os dois níveis, pega só um): -0,5% se ≥15 pedidos, -0,25% se ≥5, senão nada.
7. Limita (`clamp`) o resultado entre `TAXA_MIN (1%)` e `TAXA_MAX (3%)`, arredondado a 4 casas decimais.
8. Grava (`upsert`) o resultado em `comissao_pecas_config`: `taxa_calculada`, `media_tempo_resposta_horas` (arredondada a 2 casas), `total_pedidos_90dias`.

**Piso real alcançável organicamente**: como `TAXA_BASE = TAXA_MAX = 3%`, a taxa só pode diminuir, nunca subir acima de 3%. E como o desconto máximo possível é `1% (resposta) + 0,5% (volume) = 1,5%`, a taxa mínima que uma loja consegue **na prática**, respondendo tudo em menos de 2h e mantendo 15+ pedidos entregues em 90 dias, é **1,5%** — não 1% como o texto da tela sugere (ver bug #2).

### Quando é cobrada
Só no momento em que um pedido é marcado como **entregue** (seção 6). Nunca é cobrada sobre cotação respondida nem sobre pedido apenas confirmado (ainda não entregue). Se o pedido for cancelado, nenhuma comissão é lançada.

### Quando a taxa é recalculada
**Somente** quando um pedido dessa loja é marcado como entregue (dentro de `/api/marcar-pedido-peca-entregue`). Não existe nenhum outro gatilho no código atual que recalcule a taxa — em especial, **responder uma cotação não recalcula a taxa nem atualiza a "média de tempo de resposta" mostrada na tela** (ver bug #3). Isso significa que uma loja recém-cadastrada, mesmo respondendo rapidíssimo a várias cotações, verá sempre 3% (taxa base) e nenhuma média de tempo de resposta em `/loja/comissao` até o primeiro pedido ser efetivamente entregue.

---

## 8. Perfil da Loja

Arquivo: `apps/web/src/app/loja/perfil/page.tsx` — rota `/loja/perfil`.

### O que é
Tela para editar os dados pessoais do usuário e os dados cadastrais da loja depois da conta já criada.

### Passo a passo exato
Seção "Dados pessoais":
- Nome (editável)
- Email (campo travado/cinza, **não editável** — mostrado só para referência)
- Telefone (editável)

Seção "Dados da loja":
- Nome fantasia
- CNPJ
- Endereço
- Cidade / Estado (aqui Estado **é** um `<select>` com a lista oficial de 27 UFs de `ESTADOS_BRASIL` — diferente do cadastro, que usa texto livre; ver bug #8)
- CEP
- Raio de atendimento (km) — campo numérico livre (na prática, não filtra nada nas cotações que a loja vê, ver bug #7)
- Botão "Salvar"

### O que acontece ao salvar
1. Atualiza a linha em `lojas_pecas` (nome fantasia, cnpj, endereço, cidade, estado, cep, raio).
2. Atualiza a linha em `profiles` (nome, telefone).
3. Chama `refreshProfile()` para recarregar os dados do contexto de autenticação.
4. Mostra "Salvo!" em verde ao lado do botão por 3 segundos.

Não há validação de formato de CNPJ, CEP ou telefone em nenhum desses campos.

### Estado de carregamento
Enquanto os dados da loja ainda não chegaram, mostra um esqueleto cinza pulsante em vez do formulário.

---

## 9. Fluxo ponta a ponta (linha do tempo completa)

Esse é o roteiro ideal para um tutorial passo a passo mostrar do início ao fim:

1. **Cadastro** — dono da loja acessa `/cadastro`, escolhe "Sou Loja de Peças", preenche dados pessoais e dados da loja → cai em `/loja/dashboard`.
2. *(Opcional, hoje sem efeito prático visível pra oficina)* **Catálogo** — cadastra peças em `/loja/catalogo` com nome, compatibilidade, preço e estoque.
3. **Uma oficina cria uma cotação** (do lado da oficina, em `/oficina/pecas`, aba "Comprar") pedindo uma peça específica.
4. **Loja responde** em `/loja/cotacoes`: encontra a cotação na lista (desde que ainda esteja `aberta` — ver bug #1), preenche preço e prazo, envia. A cotação muda de status para `respondida` e some da lista de outras lojas.
5. **Conversa opcional** — loja e oficina podem trocar mensagens e fotos em `/loja/conversa/{respostaId}` para alinhar detalhes antes da confirmação.
6. **Oficina confirma o pedido** (do lado da oficina, escolhendo a melhor resposta entre as recebidas) → cria uma linha em `pedidos_pecas` com status `confirmado`, e a cotação inteira vira `fechada` (as outras respostas, se houver, ficam "perdidas" sem nenhum aviso à loja perdedora).
7. **Loja vê o pedido confirmado** em `/loja/pedidos`, combina entrega e pagamento diretamente com a oficina (fora da plataforma).
8. **Loja marca como entregue** em `/loja/pedidos` → dispara o cálculo/lançamento da comissão da plataforma.
9. **Loja acompanha a comissão** em `/loja/comissao`: vê a taxa atual, quanto está pendente e quanto já foi pago, e o extrato completo por pedido.

---

## 10. Regras de negócio e RLS (banco de dados)

Baseado nas políticas de Row Level Security das migrations `017_portal_pecas.sql` e `018_comissao_fornecedor_pecas.sql`:

- **`lojas_pecas`**: qualquer pessoa autenticada pode **ler** qualquer loja (perfil público, como uma oficina). Só a própria loja pode criar/editar seu registro (`profile_id = auth.uid()`).
- **`pecas_catalogo`**: leitura pública (qualquer um pode ver, em teoria), mas só a loja dona pode inserir/editar/excluir seus itens. Na prática (ver bug #4), nenhuma tela do lado oficina lê essa tabela hoje.
- **`cotacoes_pecas`**: leitura pública (necessário para o modelo "pull" — lojas navegam cotações abertas por conta própria). Só a oficina dona pode criar ou atualizar o status da própria cotação.
- **`cotacoes_pecas_respostas`** — a regra do "lance fechado":
  - Uma loja só enxerga a **própria** resposta.
  - A oficina dona da cotação enxerga **todas** as respostas recebidas (de lojas e de oficinas-fornecedoras).
  - Restrição de unicidade: uma mesma loja (ou oficina fornecedora) só pode responder **uma vez** por cotação (`UNIQUE (cotacao_id, fornecedor_tipo, COALESCE(loja_id, oficina_fornecedora_id))`). Tentar responder de novo pela mesma conta geraria erro de duplicidade no banco — que hoje não é tratado nem exibido na tela (ver bug #6).
  - Constraint de integridade: uma resposta é **ou** de uma loja **ou** de uma oficina fornecedora, nunca as duas coisas ao mesmo tempo, e nunca nenhuma das duas (`fornecedor_resposta_check`).
- **`pedidos_pecas`**: visível só para as duas partes envolvidas (a oficina compradora e o fornecedor escolhido). Ambas as partes podem atualizar (usado para marcar como entregue, seja pela loja ou, teoricamente, pela oficina).
- **`comissao_pecas_config` / `comissao_pecas_lancamento`**: cada fornecedor só lê sua própria configuração/extrato. Não há política de INSERT/UPDATE para o cliente — essas tabelas só são escritas pelas rotas de servidor com `service role` (`/api/marcar-pedido-peca-entregue`), então uma loja não consegue forjar comissão nem taxa mais baixa manipulando o navegador.
- **`cotacoes_pecas_mensagens`** (chat): leitura restrita ao par (cotação, fornecedor) e à oficina dona da cotação — mesma lógica de "lance fechado" do chat. Qualquer usuário autenticado pode inserir mensagem desde que `remetente_id = auth.uid()`. **Atenção**: a política de UPDATE é `USING (true)` — sem nenhuma restrição — ver bug #10 (falha de segurança).

---

## 11. Bugs e inconsistências encontrados

1. **Cotação some do feed de todas as outras lojas assim que a primeira responde.** `apps/web/src/app/loja/cotacoes/page.tsx:28-31` busca só `status = 'aberta'`, e `apps/web/src/app/api/marcar-cotacao-respondida/route.ts:18-22` muda o status para `respondida` no primeiro envio de resposta. Resultado: só a primeira loja a responder consegue efetivamente competir; as demais deixam de ver a cotação na próxima vez que a página carregar, mesmo a oficina ainda não ter escolhido ninguém e o desenho de "lance fechado" sugerir concorrência entre múltiplas lojas.

2. **Texto da comissão promete um piso que a fórmula não alcança.** `apps/web/src/components/pecas/ComissaoPecasCard.tsx:78` mostra "cai pra até 1%" (`COMISSAO_PECAS_CONFIG.TAXA_MIN`), mas a soma máxima de descontos automáticos em `apps/web/src/lib/comissao-pecas.ts:84-90` é `1% + 0,5% = 1,5%` (taxa base 3% menos 1,5%). O piso de 1% só é alcançável via override manual do admin, nunca organicamente.

3. **Taxa e "tempo médio de resposta" só existem depois do primeiro pedido entregue.** `comissao_pecas_config` (lida por `ComissaoPecasCard.tsx:40`) só é criada/atualizada dentro de `apps/web/src/app/api/marcar-pedido-peca-entregue/route.ts:48,63` — nunca depois de uma resposta de cotação. Uma loja nova que responde rápido mas nunca teve pedido entregue sempre vê 3% (taxa base) e nenhum tempo médio, mesmo respondendo tudo em minutos.

4. **Catálogo de peças não é exibido em nenhuma tela do lado oficina.** Busca em todo `apps/web/src/app` mostra que `pecas_catalogo` só é lida/escrita pelas próprias telas da loja (`loja/catalogo`, `loja/dashboard`) — nenhuma tela de oficina lê essa tabela, e o campo `peca_catalogo_id` de `cotacoes_pecas_respostas` nunca é preenchido (`apps/web/src/app/loja/cotacoes/page.tsx:52-59`). O texto "Anuncie peças em estoque - oficinas podem ver e comprar direto" (`apps/web/src/app/loja/catalogo/page.tsx:79`) não corresponde ao comportamento atual do sistema.

5. **Card "Pedidos confirmados" do dashboard conta pedidos de qualquer status.** `apps/web/src/app/loja/dashboard/page.tsx:20` faz `count` em `pedidos_pecas` filtrando só por `loja_id`, sem `.eq('status', 'confirmado')` — o número inclui pedidos já entregues e cancelados.

6. **Nenhum tratamento de erro do Supabase nas ações de escrita da loja.** `handleResponder` (`apps/web/src/app/loja/cotacoes/page.tsx:49-91`, exceto o `if (!error)` que só afeta a notificação), `handleAdd`, `handleToggleAtivo` e `handleDelete` (`apps/web/src/app/loja/catalogo/page.tsx:33-61`) não verificam o retorno de erro do Supabase. Se o insert/update falhar (RLS, duplicidade, rede), a interface fecha o formulário e reseta os campos como se tivesse dado certo, sem avisar o usuário.

7. **"Raio de atendimento" da loja não filtra nada na prática.** O campo é coletado no cadastro (`(auth)/cadastro/page.tsx:112`) e editável no perfil (`loja/perfil/page.tsx:127-129`), mas `apps/web/src/app/loja/cotacoes/page.tsx:26-31` busca cotações abertas de **todo o Brasil**, sem nenhum filtro de distância, cidade ou estado. O raio só é efetivamente usado no fluxo de notificação por proximidade das oficinas-fornecedoras (`/api/notificar-fornecedores-cotacao-peca`), não no modelo "pull" das lojas.

8. **Estado (UF) é texto livre no cadastro, mas select fechado no perfil.** `apps/web/src/app/(auth)/cadastro/page.tsx:343-345` usa `<input type="text" placeholder="SP">` para o estado da loja; `apps/web/src/app/loja/perfil/page.tsx:116-120` usa um `<select>` com a lista oficial de 27 UFs (`ESTADOS_BRASIL`). Se a loja digitar algo fora do formato exato de 2 letras maiúsculas no cadastro (ex.: "sp", "São Paulo", com espaço), o `<select>` do perfil não vai encontrar nenhuma opção correspondente e vai exibir silenciosamente a primeira UF da lista (AC), sem nenhum aviso de que o valor salvo é diferente do exibido.

9. **Endereço/cidade/estado/cep opcionais no formulário, mas obrigatórios (NOT NULL) no banco.** Nenhum desses campos tem `required` no passo 3 do cadastro de loja (`(auth)/cadastro/page.tsx:333-350`), mas a tabela `lojas_pecas` os define como `NOT NULL` (`supabase/migrations/017_portal_pecas.sql:14-17`). O código contorna isso silenciosamente com valores padrão fixos ("A definir" / "SP" / "00000-000", `(auth)/cadastro/page.tsx:106-109`) — uma loja pode acabar com endereço fake sem perceber que deixou o campo em branco.

10. **Política de UPDATE do chat de peças é totalmente aberta.** `supabase/migrations/018_comissao_fornecedor_pecas.sql:151`: `CREATE POLICY "pecas_mensagens_update" ON cotacoes_pecas_mensagens FOR UPDATE USING (true);` — sem nenhuma restrição de dono ou de participante da conversa. Qualquer usuário autenticado no sistema (loja, oficina ou motorista) pode, em teoria, atualizar qualquer mensagem de qualquer conversa de peças (inclusive reescrever o texto ou a imagem de uma mensagem alheia), não só marcar como lida.

11. **Loja "perdedora" de uma cotação nunca é avisada.** Quando a oficina confirma o pedido com outro fornecedor, a cotação vira `fechada` (`apps/web/src/app/oficina/pecas/page.tsx:102`) e some da lista de cotações abertas de todas as lojas, inclusive das que responderam e não foram escolhidas. Não existe notificação nem indicação na tela de que "sua proposta não foi escolhida" — a cotação simplesmente desaparece.

12. **Pequeno erro de acentuação.** `apps/web/src/components/pecas/ChatCotacaoPeca.tsx:133`: "Tire duvidas sobre a peca, prazo ou envie uma foto." — faltam acentos em "dúvidas" e "peça" (inconsistente com o resto da UI, que geralmente usa acentuação correta).

13. **Campos numéricos sem limite mínimo.** Preço e quantidade em estoque no catálogo (`loja/catalogo/page.tsx:110,114`) e preço/prazo na resposta de cotação (`loja/cotacoes/page.tsx:145,149`) são `<input type="number">` sem atributo `min="0"` — nada no front-end impede digitar um preço ou prazo negativo (a validação client-side só checa se o campo está vazio, não se é um valor válido).
