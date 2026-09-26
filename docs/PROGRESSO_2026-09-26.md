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
