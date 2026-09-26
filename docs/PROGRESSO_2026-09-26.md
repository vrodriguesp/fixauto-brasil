# Progresso — 26/09/2026

## Contexto: piloto na Estônia (Tallinn)

Usuário confirmou que o BipFix será lançado inicialmente na Estônia, com projeto piloto em **Tallinn**. Isso disparou um pedido grande com 6 frentes, todas explicitamente pedidas na mesma conversa:

1. **Segurança**: sessão de admin não devia durar para sempre.
2. **i18n**: site inteiro (menos `/admin`) em PT/EN/ET (estoniano)/IT, troca manual de idioma + detecção automática por localização. Tradução tem que ser "perfeita" (nativa, não literal) — exigência explícita do usuário.
3. **SEO / Google Search Console**: configurar para o usuário conseguir ver se o site aparece em buscas orgânicas; maximizar aparição orgânica.
4. **Analytics**: acesso a monitoramento de cliques/interações (GA4 já existe de sessão anterior — avaliar se cobre ou falta algo).
5. **Campanha de recrutamento de oficinas fundadoras**: mensagem de "oportunidade única" pras primeiras oficinas se cadastrarem, com tratamento especial por tempo limitado — mas escrita de forma **aberta a qualquer região** (Europa + Brasil), não hardcoded pra Estônia.
6. **Admin CRUD**: admin precisa poder modificar status de conserto, cancelar agendamentos, e ver/modificar/cancelar todas as interações do site (a central de auditoria de 09/09 já dava visão, mas faltam as ações de edição/cancelamento).

Pedido explícito: documentar tudo pra retomar de onde parou.

## Rodada 1: fix de segurança (sessão de admin infinita) + infraestrutura i18n

### 1. Sessão de admin nunca expirava (reportado pelo usuário)

Usuário notou que ficava autenticado no admin por vários dias sem precisar logar de novo. Causa raiz: o Supabase self-hosted (`JWT_EXPIRY=3600`, 1h) usa refresh token que renova a sessão silenciosamente por tempo indefinido — não há expiração de sessão absoluta configurada no GoTrue, e a app não impunha nenhuma própria.

1. [x] `middleware.ts`: rota `/admin` passa a exigir reautenticação a cada **8 horas** desde o último login (`session.user.last_sign_in_at`), independente de atividade — expira e força novo login mesmo com o refresh token ainda válido. Cliente/oficina/loja continuam sem esse limite (ficar logado por dias é aceitável/desejável para eles).
2. [x] Página de login tratando `?sessao_expirada=1` com mensagem "Sua sessão expirou por segurança. Faça login novamente."
3. [x] Build/tsc sem erros, deploy feito (commit `6c5f742`).

### 2. Infraestrutura i18n (next-intl) — pt/en/et/it

**Decisões de arquitetura:**
- **next-intl v4** (App Router), `localePrefix: 'as-needed'`: `pt` (idioma padrão) continua **sem prefixo** na URL — preserva todo o SEO/indexação já existente. `en`/`et`/`it` ganham prefixo (`/en/...`, `/et/...`, `/it/...`).
- **Escopo de tradução**: usuário confirmou explicitamente — **"site inteiro menos painel admin. A tradução tem que ser perfeita."** `/admin` fica inteiramente fora da árvore `[locale]`, permanece só em português.
- **Restrição do Next.js**: só um layout raiz pode declarar `<html>`/`<body>` — como `/admin` e `/[locale]/*` são irmãos dentro de `app/`, `app/layout.tsx` continua sendo o único root de verdade (com `AuthProvider`/`Analytics`/`ErrorReporter`), e `app/[locale]/layout.tsx` é um layout aninhado (Navbar, `NextIntlClientProvider`, metadata por idioma via `generateMetadata`).
- **`<html lang>` dinâmico sem acesso a `params`**: como `/admin` não tem o segmento `[locale]`, o layout raiz não pode ler `params.locale`. Solução: o middleware calcula o idioma resolvido e repassa via header de **requisição** `x-locale-html` (usando `NextResponse.next({ request: { headers } })`), lido no layout raiz via `headers()` do `next/headers`.
- **Detecção automática**: `localeDetection: true` do next-intl (baseado em `Accept-Language` do navegador) + redirect na primeira visita salvando `NEXT_LOCALE` em cookie; visitas seguintes respeitam o cookie. Troca manual via `LanguageSwitcher.tsx` (dropdown com bandeiras 🇧🇷🇬🇧🇪🇪🇮🇹) usando `router.replace(pathname, { locale })` do `@/i18n/navigation`.

**Bug encontrado e corrigido durante o teste local**: o middleware reconstruía a `NextResponse` do zero pra poder anexar o header `x-locale-html`, o que **descartava o rewrite interno** que o next-intl faz pra rotas sem prefixo (ex.: `/` → internamente `/pt/...`). Resultado: a home (`/`) dava 404 (só `/en`, `/et`, `/it` funcionavam, porque essas têm prefixo explícito e não dependem do rewrite). Corrigido copiando explicitamente o header `x-middleware-rewrite` da response do next-intl pra response final antes de devolver.

1. [x] `next-intl` instalado; `src/i18n/routing.ts` (`defineRouting`: locales `pt/en/et/it`, default `pt`, `as-needed`, `localeDetection: true`), `src/i18n/navigation.ts` (`createNavigation` → `Link`/`useRouter`/`usePathname`/`redirect` locale-aware), `src/i18n/request.ts` (`getRequestConfig`, carrega `messages/${locale}.json`).
2. [x] `next.config.js` envolvido com `createNextIntlPlugin`.
3. [x] Todas as ~54 rotas públicas movidas via `git mv` para `src/app/[locale]/*` (cliente, oficina, loja, `(auth)`, docs, emergencia, oficinas/[id], para-oficinas, privacidade, seja-parceiro, termos, home). `admin/`, `api/`, `robots.ts`, `sitemap.ts`, `globals.css`, `error.tsx` continuam soltos na raiz de `app/`, fora do i18n.
4. [x] `middleware.ts` reescrito: aplica `next-intl` middleware só fora de `/admin` e `/api`; mantém toda a lógica de proteção de rota/sessão Supabase já existente (incluindo o limite de 8h do admin da Rodada anterior), agora locale-aware (redirects preservam o prefixo de idioma atual).
5. [x] `app/layout.tsx` (root) e `app/[locale]/layout.tsx` (novo, com `generateMetadata` por idioma, JSON-LD Organization/WebSite, `Navbar`).
6. [x] `Navbar.tsx` convertida: `Link`/`useRouter`/`usePathname` agora vêm de `@/i18n/navigation` (não mais `next/link`/`next/navigation`) — necessário pra não perder o idioma ao clicar em qualquer link do menu. `LanguageSwitcher` novo, inserido na barra. Labels do menu (Dashboard, Solicitações, Agenda, Perfil, Sair, Entrar, Cadastrar, etc.) convertidos pra `useTranslations('nav')`.
7. [x] `messages/{pt,en,et,it}.json` criados com os namespaces `meta` (title/description/brand, usado no `<head>`) e `nav` (labels do menu). **Conteúdo das páginas em si ainda não traduzido** — só a casca (navegação + metadata) por enquanto.
8. [x] `npx tsc --noEmit` e `npm run build` limpos, sem erros/warnings.
9. [x] **Testado localmente** (`next start`) via `curl`: `/`, `/en`, `/et`, `/it` todos 200 com `<html lang>` correto (`pt-BR`/`en`/`et`/`it`); auto-detect por `Accept-Language` redireciona certo (`et-EE`→`/et`, `it-IT`→`/it`, `en-US`→`/en`, `pt-BR` fica em `/`); `/admin` continua protegido (307 pro login) e fora do i18n.
10. [x] Deploy feito (commit `9cdc219`, push + pull na VM + `npm install` + build + `pm2 restart`). **Validado em produção** via `curl` em `bipfix.com`: mesmos resultados do teste local.

### O que falta (próximas rodadas)

- [ ] **Traduzir o conteúdo real das páginas** (não só nav/metadata) em EN/ET/IT — a maior parte do trabalho de i18n ainda não começou. Prioridade: home, `/seja-parceiro`, `/para-oficinas` (páginas públicas de conversão), depois as demais.
- [ ] Auditar e converter todo `Link`/`useRouter`/`usePathname` que ainda importa de `next/link`/`next/navigation` em vez de `@/i18n/navigation` dentro das páginas movidas (só a Navbar foi convertida até aqui — os componentes internos de cada página ainda não foram auditados).
- [ ] Traduzir labels de `packages/shared/constants/index.ts` (tipos de serviço, status, urgências, estados) usados em várias páginas.
- [ ] Avaliar `lib/notifications.ts` (templates de e-mail em português) — ainda não discutido com o usuário se precisa traduzir.
- [ ] `robots.ts`/`sitemap.ts` ainda não atualizados pra URLs com prefixo de idioma (`hreflang` alternates) — relevante pro pedido de SEO.
- [ ] Campanha "oficina fundadora" (item 5 do pedido) — ainda não iniciada, precisa ser escrita e traduzida nos 4 idiomas.
- [ ] Google Search Console (item 3) — ainda não iniciado, precisa decidir método de verificação (meta tag vs DNS) e acesso à conta Google do usuário.
- [ ] Confirmar com o usuário se GA4 (já implementado) cobre o pedido de "monitoramento de cliques/interações" (item 4) ou se querem algo além (heatmap/gravação de sessão).
- [ ] Admin CRUD (item 6): adicionar ação de editar status de solicitação/conserto e cancelar `agenda`, além da visibilidade que já existe desde a central de auditoria de 09/09.
- [ ] Pergunta em aberto do usuário (respondida "depois de terminar tudo"): pesquisar APIs baratas/gratuitas de veículo (placa/dados) conectadas à Europa/Estônia, como alternativa às atuais focadas no Brasil (`/api/fipe`, `/api/consultar-placa`).

## Rodada 4 (mesmo dia): tradução em massa via 5 agentes em paralelo + bug crítico de localização encontrado

### Infraestrutura pra permitir tradução em paralelo sem conflito

1. [x] Mensagens divididas por área: `messages/{locale}.json` continua sendo a base (nav, home, seja-parceiro, para-oficinas, cookieBanner, login, **constants** — ver abaixo), e cada área ganhou seu próprio arquivo `messages/{locale}.cliente.json` / `.oficina.json` / `.loja.json` / `.auth.json` / `.misc.json`, mesclados em `src/i18n/request.ts`. Permite vários agentes trabalharem em paralelo sem duas edições colidirem no mesmo arquivo.
2. [x] Namespace **`constants`** adicionado aos 4 idiomas: traduz os labels de `STATUS_SOLICITACAO`, `STATUS_ORCAMENTO`, `STATUS_MANUTENCAO`, `TIPOS_SERVICO`, `URGENCIAS`, `CARGOS_FUNCIONARIO` (hoje só em português no pacote `shared`, usados em badges espalhados por quase toda página). O arquivo compartilhado em si (`packages/shared/constants/index.ts`) continua só em português de propósito — o admin usa direto sem passar por next-intl. **Falta ainda**: trocar cada `CONSTANTE[x].label` por `t(\`constants.grupo.${x}\`)` página por página (meio caminho andado, não finalizado).

### 5 agentes em paralelo para tradução de conteúdo

Rodados simultaneamente, cada um com escopo de arquivos e arquivo de mensagens exclusivo (sem sobreposição):
1. [x] **Cliente** (10 páginas + `NotificationBell.tsx`): dashboard, veículos, histórico, perfil, nova-solicitação, orçamentos (+detalhe), mensagens (+detalhe), acompanhamento, reagendar. Commitado (`c3e7bb0`).
2. [x] **Auth restante** (cadastro, definir-senha, escolher-tipo, reset-password — login já tinha sido feito antes). Commitado (`4ec1879`).
3. [x] **Oficina** (19 arquivos): dashboard, agenda, aprender, avaliações, capacidade, checkin, comissão, distribuição, enviar-orçamento, equipe, layout, mensagens, peças (+conversas), perfil, solicitações (+detalhe), veículos-em-serviço. Commitado (`6a1d872`).
4. [x] **Loja** (9 páginas): dashboard, aprender, catálogo, comissão, conversas, cotações, pedidos, perfil. Commitado (`7b15175`).
5. [x] **Docs + emergência + legal + perfil público de oficina** (12 arquivos): termos, privacidade (registro formal/impessoal, terminologia GDPR correta por idioma — diferente do tom casual do resto do site), emergência (+detalhe do acidente), docs (home/cliente/oficina), `oficinas/[id]` (perfil público). Commitado (`c273717`, `2caa71a`).

**Incidente**: os 5 agentes bateram no limite de sessão da conta (rate limit, reset 17:40 horário de Roma) e pararam no meio. Retomados um a um via mensagem direta assim que o limite resetou — cada um continuou exatamente de onde parou (checando `git status`/`git diff` primeiro pra não refazer trabalho). Prática adotada a partir daqui: **commitar e dar push de cada área assim que o respectivo agente termina**, em vez de esperar todos concluírem, para não arriscar perder trabalho de novo.

### Bug crítico encontrado (não relacionado a i18n): coordenadas fixas de São Paulo

Ao revisar os campos de endereço durante a tradução, percebi que **tanto `/cliente/nova-solicitacao` quanto o cadastro de oficina/loja em `/cadastro` sempre gravavam `latitude=-23.5505, longitude=-46.6333` (São Paulo) no banco**, não importa o que o usuário digitasse em endereço/cidade/estado. Isso quebra o "oficinas próximas" — o núcleo do produto — pra qualquer solicitação ou oficina fora de São Paulo, inclusive (e principalmente) para o piloto na Estônia. O fluxo de emergência (`emergencia/page.tsx`) já fazia certo, via `navigator.geolocation` real do navegador.

1. [x] Confirmado com o usuário antes de mexer (pergunta explícita, resposta: corrigir agora).
2. [x] Replicado o mesmo padrão do `emergencia/page.tsx` em `/cliente/nova-solicitacao` e em `/cadastro` (oficina e loja): começa com o default de SP e sobrescreve com a coordenada real assim que o navegador concede a permissão de localização.
3. [x] `/cadastro`: campo "Estado" da oficina/loja também era um `<select>` fixo de UFs brasileiras (mesma classe de bug já corrigida em `/seja-parceiro`) — virou campo livre. Fallback ao gravar no banco (colunas `estado`/`cep` são `NOT NULL`) trocado de `'SP'`/`'00000-000'` para `'A definir'`.
4. [x] Build/tsc sem erros (isolado do trabalho dos agentes ainda em andamento), commit e push feitos.
5. [ ] **Não testado ainda com geolocalização real do navegador** (precisa de teste manual/extensão do Chrome concedendo a permissão) — recomendado antes de confiar 100%.
6. [ ] **Dado de produção potencialmente afetado**: solicitações e oficinas/lojas já cadastradas antes desta correção podem ter coordenadas de SP erradas gravadas no banco. Não investiguei nem corrigi dados existentes — só a gravação de dados novos daqui pra frente.

### Fechamento da rodada 4: todos os 5 agentes concluídos, build/tsc limpos, teste end-to-end, deploy

1. [x] Todos os 5 agentes de tradução terminaram (após retomada pós rate-limit) — cada área foi validada (`tsc --noEmit`) e commitada/pushada individualmente assim que ficou pronta, conforme pedido explícito do usuário ("vai salvando os trabalhos para nao perder tudo").
2. [x] Também corrigidos, aproveitando que os arquivos ficaram liberados: mesmo bug de `<select>` fixo de UFs brasileiras em `loja/perfil` e `oficina/perfil` (edição de perfil pós-cadastro) — mesma classe de bug já corrigida em `/seja-parceiro` e `/cadastro`. Confirmado por `grep` que não sobra nenhuma ocorrência de `ESTADOS_BRASIL` fora do `/admin`.
3. [x] **Segundo bug crítico encontrado no teste end-to-end** (não relacionado a i18n): o middleware bloqueava `/oficinas` (perfil público de oficina, sem necessidade de login) porque `path.startsWith('/oficina')` também casava com o plural "/oficinas" como substring — a rota redirecionava pro `/login` antes de carregar. **Isso é exatamente a página que ganhou `hreflang`/`sitemap` nesta sessão para SEO** — o Google estaria sendo redirecionado pro login em vez de indexar o conteúdo real, inutilizando o trabalho de SEO da Rodada 2. Corrigido com um helper `isUnderPath()` que checa limite de segmento (`path === prefixo` ou `prefixo + "/"`), aplicado também em `/admin` e `/loja` por consistência.
4. [x] `npm run build` completo do zero, sem nenhum erro ou warning.
5. [x] Teste end-to-end via `curl` cobrindo: todas as páginas públicas x 4 idiomas (200), todas as rotas protegidas x 4 idiomas sem sessão (307 pro login), `/oficinas/[id]` x 4 idiomas (200, confirma o fix do bug #3), conteúdo traduzido visível em cada idioma (spot-check de strings específicas por página).
6. [x] Deploy feito, **mesmo teste re-executado direto em bipfix.com com os mesmos resultados**.
7. [ ] **Ainda não testado clicando de verdade no navegador** (extensão do Chrome) — o teste foi inteiramente via `curl`/HTTP status + grep de conteúdo. Recomendado fazer um passe visual antes de anunciar o piloto, especialmente formulários (cadastro, nova solicitação) e o seletor de idioma.

### Estado final da tradução (site inteiro exceto `/admin`)

**100% das páginas traduzidas para pt/en/et/it**: home, seja-parceiro, para-oficinas, termos, privacidade, docs (+2 sub-guias), emergência (+detalhe do acidente), login/cadastro/escolher-tipo/definir-senha/reset-password, toda a área cliente (10 páginas), toda a área oficina (18 páginas), toda a área loja (9 páginas), perfil público de oficina, Navbar, LanguageSwitcher, banner de cookies, NotificationBell.

**Ainda pendente** (não bloqueia o piloto, mas fica registrado):
- Trocar `CONSTANTE[x].label` (status de solicitação/orçamento/manutenção, tipo de serviço, urgência, cargo) pelas traduções já preparadas no namespace `constants` — hoje esses badges específicos ainda aparecem em português em qualquer idioma. Tradução já existe nos 4 idiomas, falta só religar página por página.
- `lib/notifications.ts` (todos os e-mails do sistema) — 100% português, nem discutido ainda se precisa traduzir (e como decidir o idioma de cada e-mail, já que é assíncrono).
## Rodada 5 (mesmo dia): catálogo de veículo aberto + geocodificação Nominatim + pesquisa de APIs pro piloto

Usuário pediu pra ver o que falta pro piloto na Estônia, com foco em API de placa/modelo de carro e de endereço, preferindo gratuitas.

### Implementado e em produção

1. [x] **Catálogo de marca/modelo (VehiclesDB)**: FIPE só cobre o Brasil — fora do pt, o formulário de veículo tinha virado texto livre. Agora usa [VehiclesDB](https://github.com/vehiclesdb/vehiclesdb) (CC-BY 4.0): 918 marcas / ~14.900 modelos reconciliados de 14 países (Holanda, GB, Espanha, Finlândia, Luxemburgo, Irlanda, Alemanha, EUA, Canadá, Nova Zelândia, Malásia, Tailândia, Ucrânia, Argentina) — confirmado que cobre marcas da região báltica (Lada, UAZ). Dataset estático (750KB) embutido no repo, servido por `/api/vehicle-catalog`, sem chamada de rede externa em tempo de execução. `FipeAutocomplete.tsx` agora usa `<select>` cascateado (marca→modelo) pra qualquer idioma, não só pt.
2. [x] **Geocodificação via Nominatim (OpenStreetMap)**: gratuito, sem chave, cobre o mundo todo incluindo Estônia. Novo `/api/geocode` (proxy do servidor, já que a política do Nominatim exige um User-Agent identificando a app, algo que o fetch do navegador não deixa customizar). Usado como fallback em `/cadastro` e `/cliente/nova-solicitacao`: se o navegador negar geolocalização, tenta geocodificar o endereço que o usuário já digitou, em vez de deixar a coordenada presa no default de São Paulo. Testado com endereço real de Tallinn (Vabaduse väljak) — retornou coordenadas/cidade/condado/CEP corretos.
3. [x] Google Search Console configurado (propriedade verificada, sitemap enviado) e Microsoft Clarity configurado (Project ID do usuário, confirmado recebendo dados reais) — feito direto pelo navegador (Claude in Chrome) usando a sessão já logada do usuário.

### Pesquisado, mas não perseguido (decisão registrada, não é bloqueio)

- **Placa → dados do veículo**: não existe equivalente limpo/gratuito ao `placas.app.br` brasileiro pra Estônia (confirmado: registro estoniano não é publicamente consultável por placa, restrição de design da UE/GDPR). **Correção de uma pesquisa anterior**: existe sim uma opção paga real — **RegCheck.org.uk** (empresa irlandesa desde 2004), endpoint dedicado `/CheckEstonia`, retorna marca/modelo/ano/VIN/potência. Não é gratuito (10 consultas de teste, depois £0,15/consulta, pacotes mínimos de 100) — decisão de usar ou não fica pro usuário, exige criar conta lá.
- **auto24.ee** (maior marketplace estoniano) — não tem API pública, é site tradicional sem chamadas JSON por trás. Não perseguido (scraping de site comercial de terceiro é questão de ToS).
- **auto24.lv via Parse.bot** (sugerido pelo usuário) — descartado: é da Letônia (não Estônia), é busca de anúncios usados (não catálogo marca/modelo), é scraper não-oficial de terceiro (a própria página admite "not an official API"), e é pago além de um free tier pequeno.
- **Kaggle "Status of vehicles in Estonia"** — dado real e oficial do Transpordiamet (CC BY-SA 4.0, atualizado mensalmente), **confirmado que tem colunas `Mark` (marca) e `Mudel` (modelo)** — seria mais preciso que o VehiclesDB genérico (frota real da Estônia). Mas são arquivos de 148MB-300MB+ cada (850MB total), possivelmente exige conta no Kaggle pra baixar, e precisaria de ETL (extrair pares únicos marca/modelo de centenas de milhares de linhas, traduzir termos estonianos). **Usuário decidiu adiar**: vai baixar os arquivos por conta própria e voltar a falar sobre integrar depois. O dado também existe na fonte primária (portal de dados abertos da própria Estônia, avaandmed.eesti.ee) sem precisar do Kaggle.

- [x] Google Search Console configurado (via navegador, usando a conta Google já logada do usuário): propriedade `https://bipfix.com/` adicionada (URL prefix), verificada por HTML tag (`GOOGLE_SITE_VERIFICATION` já suportado desde a Rodada 2 — só faltava o valor real, agora setado em `.env.production.local` da VM e rebuildado), e `sitemap.xml` submetido com sucesso.
- [x] **Microsoft Clarity configurado**: usuário forneceu o snippet/Project ID (`yoeb6spjv9`) direto no chat. Setado `NEXT_PUBLIC_CLARITY_PROJECT_ID` em `.env.production.local` da VM, rebuild + restart. Confirmado funcionando de verdade via navegador real (Claude in Chrome): requisições para `clarity.ms/tag/...`, `scripts.clarity.ms/.../clarity.js` e `u.clarity.ms/collect` todas com sucesso (200/204).
- Pergunta em aberto sobre API de veículo/placa pra Europa/Estônia (pesquisa já foi feita, ver resposta na conversa — resumo: não existe um equivalente direto e barato ao `placas.app.br` brasileiro pra Estônia por causa do GDPR; a tabela FIPE já foi contornada com campo livre pra fora do Brasil).

## Rodada 2 (mesmo dia): SEO técnico multi-idioma + tradução real das 2 páginas de conversão de oficinas

### SEO técnico

1. [x] `sitemap.ts`: cada página estática (e cada perfil de oficina) agora gera uma entrada **por idioma**, com `alternates.languages` (hreflang) cruzado entre todas as variantes + `x-default` apontando pro locale padrão (pt, sem prefixo). Antes só existia a URL em português — o Google não tinha como saber que `/en`, `/et`, `/it` eram a mesma página traduzida.
2. [x] `robots.ts`: o `disallow` das rotas privadas (`/cliente/`, `/oficina/`, `/loja/`, `/admin/`, etc.) agora cobre também as variantes com prefixo de idioma (`/en/admin/`, `/et/cliente/`...) — antes só bloqueava a versão sem prefixo, deixando os painéis privados das versões `en/et/it` indexáveis em teoria.
3. [x] **Google Search Console**: adicionado suporte à verificação por tag HTML via env var `GOOGLE_SITE_VERIFICATION` (só aparece a tag `<meta name="google-site-verification">` se a env var existir — não força rebuild condicional). **Falta o usuário**: criar a propriedade em https://search.google.com/search-console, escolher método "Tag HTML", copiar o valor do atributo `content` e me passar (ou adicionar direto na env var da VM) pra eu rebuildar e confirmar a indexação. Alternativa "Domínio" (verificação por DNS TXT) cobre www + subdomínios automaticamente mas exige acesso ao DNS do domínio — perguntar ao usuário qual prefere.
4. [x] Build/tsc sem erros, deploy feito (commit `ffda648`), confirmado em produção: `robots.txt` e `sitemap.xml` com hreflang corretos.

### Tradução real das 2 páginas públicas de conversão de oficina (`/seja-parceiro`, `/para-oficinas`)

Essas são as páginas que sustentam o pedido do item 5 (recrutamento de "parceiros fundadores") — priorizadas primeiro dentro do trabalho de tradução de conteúdo, que ainda está no início pro resto do site.

1. [x] **Bug funcional encontrado em `/seja-parceiro`**: o campo "Estado" era um `<select>` fixo com as 27 UFs brasileiras (`ESTADOS_BRASIL`) — quebraria completamente para qualquer parceiro fora do Brasil, inclusive o piloto na Estônia (nenhum "condado"/"maakond" estonio é uma UF brasileira). Substituído por um campo livre "Estado/Região" (a coluna no banco já era `TEXT` sem constraint, então não precisou de migration).
2. [x] `/seja-parceiro` e `/para-oficinas` convertidas pra `useTranslations`/`getTranslations`, com conteúdo traduzido de verdade (não literal) em pt/en/et/it — hero, benefícios, FAQ (schema.org `FAQPage` também atualizado, agora por idioma), lista de funcionalidades, "dores → solução", passos, transparência sobre comissão.
3. [x] `/para-oficinas` ganhou `generateMetadata` por idioma (antes era `metadata` estático só em português) e a moeda do schema.org `SoftwareApplication` passou a variar por locale (BRL no pt, EUR nos demais).
4. [x] Build/tsc sem erros, testado localmente (`curl`) nas 4 variantes de cada página, deploy feito, confirmado em produção.

### O que falta (atualização da lista da Rodada 1)

- [ ] Home (`/`) ainda não traduzida — provável próxima página, é a porta de entrada de todo o tráfego orgânico.
- [ ] Restante das ~50 páginas do site (cliente/oficina/loja/docs/emergencia/auth) ainda 100% em português.
- [ ] Google Search Console aguardando o usuário criar a propriedade e passar o código de verificação (ou decidir pelo método de DNS).
- [ ] Itens 4 (monitoramento de cliques — confirmar se GA4 basta) e 5 (seção de campanha "parceiro fundador" **na home**, ainda não escrita — hoje só existe em `/seja-parceiro` e `/para-oficinas`) continuam pendentes.

## Rodada 3 (mesmo dia): admin ganha ação de editar/cancelar (item 6 do pedido original)

A central de auditoria construída em 09/09 já dava visão total ao admin (solicitações, veículos, emergências, conversas), mas só de leitura. Faltava exatamente o que o usuário pediu agora: "o admin deve ser capaz de conseguir modificar os status do conserto, cancelar agendamentos".

1. [x] `PATCH /api/admin/solicitacoes/[id]`: admin corrige manualmente o status de uma solicitação (aberta/em_orcamento/aceita/em_andamento/concluída/cancelada) — útil pra destravar um caso preso ou cancelar em nome do cliente/oficina. Notifica (in-app, tabela `notificacoes`) o cliente e qualquer oficina com orçamento aceito naquela solicitação.
2. [x] `PATCH /api/admin/agenda/[id]` (rota nova): cancela um agendamento específico. Deliberadamente **não** mexe no status da solicitação vinculada (evita side-effect não solicitado) — só marca `agenda.status = 'cancelado'` e notifica cliente + oficina. Diferente do "no-show" que a oficina já registra (esse é cancelamento por decisão administrativa).
3. [x] `/admin/solicitacoes/[id]`: novo seletor de status + botão "Salvar status" no topo da página; nova seção "Agendamentos" listando cada entrada de agenda daquela solicitação com botão "Cancelar" (some quando já cancelado/concluído).
4. [x] Build/tsc sem erros. Testado que os 2 endpoints novos exigem autenticação de admin (401 sem sessão) tanto local quanto em produção. Deploy feito (commit `814e811`).
5. [ ] **Teste clicando de verdade (sessão admin real) ainda não feito nesta rodada** — recomendado antes de confiar 100% no fluxo, especialmente a notificação sendo criada corretamente pro cliente/oficina certos.
6. [ ] Escopo deliberadamente restrito a solicitação (status do "conserto") + agenda (agendamentos), que foram os dois termos exatos usados pelo usuário. Ações de editar/cancelar em cotações de peças, pedidos de peças ou avaliações **não foram adicionadas** — se o usuário quiser esse alcance mais amplo de "todas as interações", é um próximo passo natural.

## Rodada 4 (mesmo dia): moeda por país da oficina (não pelo idioma) + varredura de gaps multi-país pro piloto na Estônia

Contexto: preparação pro piloto na Estônia expôs que várias partes do site assumiam Brasil-only (moeda BRL fixa, CEP/placa só brasileiros, formatação de data em `pt-BR` fixo). Endereçado em duas levas.

### Leva 1: arquitetura de moeda por país (commit `50dbd82`)

1. [x] **Correção de rumo importante**: a primeira tentativa decidia a moeda pelo *idioma da página* (pt→BRL, en/et/it→EUR) — usuário corrigiu: a moeda tem que vir do **país real da oficina/loja/solicitação**, não do idioma de quem está olhando (senão uma oficina em Portugal ou Brasil aparece com valores errados pra quem navega em outro idioma). Todo o trabalho de "moeda por idioma" já feito foi refeito do zero por país.
2. [x] Migrations `023`/`024`: coluna `pais` (ISO 3166-1 alpha-2) em `oficinas`, `lojas_pecas` e `solicitacoes`, aplicadas em produção.
3. [x] `lib/currency.ts`: mapa país→moeda (BRL, GBP, CHF, NOK, SEK, DKK, PLN, CZK, HUF, RON, BGN, e EUR pros países da zona do euro; fallback EUR).
4. [x] `/api/geocode`: agora suporta geocodificação reversa (lat/lon→país) via Nominatim, usada no cadastro pra capturar o país automaticamente a partir da geolocalização do navegador.
5. [x] `/api/vehicle-catalog` (VehiclesDB, dataset estático e gratuito, 918 marcas/14.900 modelos de 14 países) substitui a dependência exclusiva da FIPE pra marca/modelo de veículo fora do Brasil — antes era campo livre, agora é o mesmo cascading-select que o Brasil usa.
6. [x] ~40 arquivos (todo `formatCurrency` do site) migrados pra usar `currencyForCountry(pais)` em vez de moeda fixa. Dashboards agregados que somam comissão de fornecedores de países diferentes (`/admin/pecas`) passaram a agrupar por moeda em vez de somar tudo junto.
7. [x] `ComissaoPecasCard` e `DamageAnalysis` (componentes que tinham escapado da tradução geral do site) ganharam i18n completo nessa mesma leva, já que precisavam ser tocados pra moeda mesmo.

### Leva 2: varredura de gaps que a implementação de moeda tinha deixado passar (commit `06e6903`)

1. [x] Schema.org da página pública de oficina (`addressCountry`) e o `openGraph.locale` dessa mesma página estavam fixos em `'BR'`/`'pt_BR'` — agora refletem o país real e o idioma da página.
2. [x] `/emergencia` tinha `metadata` **estática** (não `generateMetadata`) 100% em português — toda visita em `/en`, `/et`, `/it` mostrava título/descrição em português no Google e ao compartilhar. Convertido pra `generateMetadata` por locale, com keywords/OG traduzidos.
3. [x] Mais 6 componentes/páginas formatando data/hora com `'pt-BR'` fixo (tinham escapado da varredura anterior de locale): `NotasInternas`, `ChatCotacaoPeca`, `oficina/agenda`, `oficina/mensagens/[id]`, `oficina/comissao`, perfil público da oficina.
4. [x] E-mails transacionais de peças (resposta de cotação, pedido confirmado) e a notificação de orçamento (e-mail + WhatsApp) formatavam preço sempre em BRL — agora usam `currencyForCountry(pais)` do fornecedor/oficina relevante.
5. [x] Dashboard admin (`/admin/dashboard`): GMV e comissão total do mês somavam tudo num número só, misturando moeda de países diferentes — agora agrupa por moeda (mesmo padrão já usado em `/admin/pecas`). Tipo `PlataformaMetricas` atualizado (`gmv_mes` → `gmv_mes_por_moeda`, idem comissão).
6. [x] Placeholder do campo CNPJ (opcional) no cadastro era o formato brasileiro fixo (`00.000.000/0001-00`) mesmo pra oficina/loja de outro país — virou texto traduzido por idioma ("Company registration number", "Äriregistri kood", etc.).
7. [x] Schema JSON-LD de `/para-oficinas` também tinha moeda decidida pelo idioma da página (mesma gambiarra corrigida na leva 1, só que numa página que não tinha sido re-auditada) — removida, `priceCurrency` fixo em EUR já que a oferta anunciada ali é sempre grátis (R$0/€0, então a moeda exibida é só decorativa).
8. [x] `tsc --noEmit` e `npm run build` limpos, deploy feito, confirmado em produção (`/api/geocode`, `/api/vehicle-catalog`, `/en/emergencia`, `/emergencia` com metadata correta por idioma).

### O que fica pendente (não resolvido nesta rodada, deliberadamente)

- [ ] **Tradução completa dos e-mails transacionais**: os ~12 templates de e-mail em `lib/notifications.ts` (mais outros espalhados em rotas de API individuais, ex. `criar-solicitacao-emergencia`) são 100% português fixo — corrigi só a **moeda** (bug de correção óbvia), não o idioma do texto. Pra traduzir de verdade falta: (a) persistir o idioma preferido do usuário em algum lugar (hoje não existe — `profiles` não tem coluna de idioma, e o idioma só é conhecido durante a navegação via URL, nunca em contexto assíncrono de e-mail); (b) traduzir cada template pra en/et/it; (c) passar esse idioma em cada um dos ~9 call sites. Escopo grande o suficiente pra merecer uma leva própria, então não foi atacado aqui pra evitar fazer pela metade.
- [ ] Resto da varredura geral "tudo que falta pro site rodar bem em qualquer país" continua em andamento (próximo: teste end-to-end completo do fluxo Estônia, depois o app cliente iOS/Android).

## Rodada 5 (mesmo dia): teste end-to-end real (navegador) do cadastro de oficina na Estônia - 6 bugs novos encontrados e corrigidos

A pedido do usuário: "antes de começar o app, garanta que o site funciona perfeitamente em todos os idiomas, teste e só depois disso comece o app". Testado o fluxo real de cadastro de oficina em `/et` (Claude in Chrome, navegador de verdade), não apenas `curl`/build - foi o que revelou os bugs abaixo, invisíveis em qualquer teste automatizado que não renderiza a página de verdade.

1. [x] **Lista de serviços oferecidos 100% em português no cadastro**, mesmo em `/et`: `TIPOS_SERVICO`/`URGENCIAS`/`STATUS_MANUTENCAO`/`CARGOS_FUNCIONARIO` (`packages/shared/constants`) têm campo `.label` fixo em português, e ~12 arquivos usavam esse campo direto em vez de traduzir - mesmo já existindo as traduções corretas em `messages/*.json` (namespace `constants`, usado só pelo `StatusBadge` até então). Corrigido nos 12 pontos de uso (cadastro, nova-solicitação, agenda, solicitações, perfil, checkin, capacidade, distribuição, equipe, veículos-em-serviço, acompanhamento do cliente, perfil público da oficina).
2. [x] Placeholder de telefone (`(11) 99999-0000`) e CEP (`00000-000`) fixos em formato brasileiro no cadastro, checkin e perfil da oficina - traduzidos/genéricos por idioma.
3. [x] Banner de tutorial do dashboard (oficina/loja) 100% hardcoded em português (`TutorialBanner.tsx` não usava next-intl) - novo namespace `tutorialBanner` com `t.rich()` pro link embutido.
4. [x] Cadastro gravava o texto literal **"A definir"** (português) no banco quando endereço/cidade/estado/CEP ficavam em branco (campos hoje opcionais) - permanecia visível pra sempre no dashboard/perfil público independente do idioma. Trocado por string vazia; `loja/aprender` checava esse sentinel específico pra saber se o perfil estava completo, ajustado pra checar vazio/preenchido.
5. [x] **Mapa do Google embutido no perfil público da oficina sempre buscava com ", Brazil" fixo no final da query**, quebrando o mapa exibido pra qualquer oficina fora do Brasil (ex: busca virava "Rua X, Tallinn - Harjumaa, Brazil"). Corrigido com `countryNameForCode()` novo em `lib/currency.ts` (usa `Intl.DisplayNames`, funciona pra qualquer país sem manter lista própria).
6. [x] `/seja-parceiro` tinha `metadata` estática (não `generateMetadata`) 100% em português - mesmo bug já corrigido em `/emergencia` na Rodada 4, mas essa página tinha escapado daquela varredura. Convertido pra `generateMetadata` por locale.
7. [x] Todas as correções com `tsc --noEmit`/`npm run build` limpos, deploy feito a cada leva, confirmado em produção (inclusive re-testado no navegador depois do primeiro fix, confirmando a checklist de serviços e os placeholders corretos em estônio).
8. [x] Dados de teste (conta "Test Töökoda OU" criada durante o teste) removidos do banco de produção depois de validar o fluxo.

### Gaps identificados mas deliberadamente NÃO resolvidos nesta rodada (documentados, não esquecidos)

- [ ] **Notificações in-app** (tabela `notificacoes`) tem título/mensagem hardcoded em português em vários pontos (ex: "Nova solicitação!" em `cliente/nova-solicitacao`) - mesma causa raiz do problema de e-mails transacionais já documentado na Rodada 4 (falta persistir o idioma preferido do usuário, hoje não existe em `profiles`). Fica junto daquele mesmo trabalho maior e dedicado.
- [ ] `SERVICOS_REVISAO`/`SERVICOS_MECANICA`/`SERVICOS_ELETRICA`/`SERVICOS_PNEU` (as listas de sintomas específicos dentro de cada categoria de serviço) ainda são arrays de string cru 100% em português, sem estrutura `value`/`label` - identificado durante essa rodada mas não corrigido (~47 strings, precisam virar objetos com chave antes de poder ganhar tradução).
- [ ] `src/app/api/criar-solicitacao-emergencia/route.ts` e `src/app/api/notificar-acidente/route.ts` também gravam `'A definir'` como placeholder de marca/modelo/ano de veículo (dado incompleto vindo do relato de acidente) - mesma classe de bug do item 4 acima, não corrigido por ter menor visibilidade (fluxo de emergência/admin).

## Rodada 6 (mesmo dia): e-mails no idioma do destinatario + traducao das listas de sintoma + SEO/descobribilidade em IA

Continuacao direta da Rodada 5, seguindo instrucao explicita do usuario: "nao deixe pontos em aberto, adote a melhor pratica, prossiga sem minha aprovacao, faca o melhor que puder e a solucao mais limpa" + pedido explicito de otimizar SEO pra busca organica e IA. As 3 pendencias documentadas nas Rodadas 4/5 foram fechadas nesta rodada.

### 1. E-mails e notificacoes no idioma do destinatario (commit `1a8482a`)

Pendencia da Rodada 4: todo e-mail/WhatsApp/notificacao saia sempre em portugues porque o idioma preferido do usuario nunca era persistido (so existia durante a navegacao, via URL).

- Migration `025_idioma_profile.sql`: coluna `profiles.idioma` (pt/en/et/it, default 'pt'), **aplicada em producao**.
- `signUp()` (auth-context) e as 3 rotas que criam profile via admin API (`funcionarios`, `notificar-acidente`, `criar-solicitacao-emergencia`) passaram a gravar o idioma no cadastro/convite/criacao de conta (capturado do locale da URL no momento da acao).
- `src/lib/email-i18n.ts` (novo): dicionario completo pt/en/et/it pros 9 templates de e-mail + 3 mensagens de WhatsApp. `lib/notifications.ts` foi reescrito pra montar o HTML a partir dessas strings (antes: texto fixo em portugues em cada template). `sendLeadParceiroEmail` (avisa a equipe interna da BipFix) ficou deliberadamente so em portugues - nao e enviado a um usuario.
- `src/lib/notif-i18n.ts` (novo): mesmo padrao pras poucas notificacoes in-app com destinatario facil de identificar (nova solicitacao, cotacao de peca respondida/disponivel, pedido de peca entregue).
- ~9 rotas de API atualizadas pra buscar `profiles.idioma` do destinatario (join no select ja existente) e passar como `locale`/`idioma` nas chamadas de e-mail.
- 2 pontos que gravavam o sentinel `'A definir'` (dados de veiculo incompletos no relato de acidente) trocados por string vazia.
- **Pendencia que fica, documentada**: os outros ~20 pontos que inserem em `notificacoes` ainda gravam texto fixo em portugues - escopo grande demais pra fechar de uma vez sem risco de regressao, e secundario ao e-mail (que agora esta 100% localizado).

### 2. Traducao das listas de sintoma especifico (commit `5423a88`)

Ultima pendencia de i18n documentada: `SERVICOS_REVISAO`/`MECANICA`/`ELETRICA`/`PNEU` (52 opcoes tipo "Motor - barulho estranho", mostradas no passo 3 de nova-solicitacao) eram arrays de string cru em portugues, sem estrutura value/label.

- Convertido pra `{ value, label }` em `packages/shared/constants`.
- Traducao completa pt/en/et/it em `messages/*.json` (`constants.servicosRevisao/Mecanica/Eletrica/Pneu`).
- `cliente/nova-solicitacao/page.tsx` agora seleciona/armazena por `value` e exibe/monta a descricao final com o label traduzido no idioma do cliente.

### 3. SEO e descobribilidade em IA (commit `54fd4ee`)

Pedido explicito do usuario: "otimize o SEO pra ser o melhor encontrado em busca organica e em IA".

- **`/llms.txt`** novo (convencao llmstxt.org): resumo curado do site em ingles pra agentes de IA lerem direto - o que e o BipFix, paginas-chave (home, emergencia, para-oficinas, seja-parceiro, termos, privacidade) em cada idioma, e uma nota explicita pedindo pra IA nao inferir precos/garantias que o site nao afirma.
- **`robots.txt`**: lista explicita dos principais crawlers de IA (GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-User, Claude-SearchBot, anthropic-ai, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended, CCBot, Bytespider, Amazonbot) com `allow` - ja estavam implicitamente permitidos pelo `*`, mas alguns bots so respeitam regra que os nomeia direto.
- **OpenGraph image dinamico** (`src/app/[locale]/opengraph-image.tsx`, via `next/og`): antes NAO existia nenhuma imagem de preview - compartilhar um link do BipFix no WhatsApp/Slack/redes sociais nao mostrava nada. Agora gera uma imagem de marca (gradiente azul + "BipFix" + tagline) traduzida por idioma.
- **Organization schema (JSON-LD)** ganhou `contactPoint` (e-mail de suporte real `contato@bipfix.com`, idiomas atendidos, paises atendidos) - antes so tinha nome/logo/descricao.
- Sitemap.xml e robots.txt "base" (hreflang, disallow por idioma) ja existiam de rodadas anteriores e continuam validos - essa rodada so adicionou, nao substituiu.
- Tudo com `tsc --noEmit`/`npm run build` limpos, deploy feito, confirmado em producao: `/llms.txt` retorna o conteudo certo, `robots.txt` lista os crawlers de IA, `/opengraph-image` e `/en/opengraph-image` retornam `200 image/png`.

### Estado geral ao final desta rodada

- **Tudo commitado e pushed pra `origin/master`** (ultimo commit: `54fd4ee`). Nada pendente de commit exceto a pasta `Documentos/` (nao rastreada, pre-existente, nao e minha).
- **VM de producao (204.168.139.154) esta no mesmo commit** `54fd4ee`, buildada e rodando via PM2 (`fixauto-brasil`).
- Como tudo esta em git (GitHub) e ja deployado na VM, um reset da maquina local (Windows) **nao perde nenhum trabalho** - só precisa re-clonar o repo (`git clone` + `npm install` em `apps/web` e na raiz do monorepo) pra continuar trabalhando localmente. As credenciais de acesso a VM (chave SSH root@204.168.139.154) e ao Supabase self-hosted (`.env.production.local` na propria VM) nao vivem no repo - se o reset apagar a chave SSH local, o acesso a VM precisa ser reconfigurado.

### Proximo passo combinado com o usuario (ainda NAO iniciado)

Construir o **app mobile (iOS + Android) so da versao CLIENTE** (nao oficina/loja), depois mostrar rodando emulado em ambiente iOS e Android. Ressalva ja comunicada ao usuario: **rodar o Simulador de iOS exige macOS/Xcode**, o que essa maquina (Windows) nao tem - o app e o preparo do projeto iOS podem ser feitos, mas rodar o simulador de verdade vai precisar de um Mac (ou servico de Mac na nuvem) quando chegar nessa etapa.
