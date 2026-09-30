# Auditoria completa do BipFix — 30/09/2026

**Escopo:** site (apps/web, Next.js 14 + next-intl, produção em https://bipfix.com) e app (apps/mobile, Expo).
**Método:** para cada achado: (1) problema com evidência (arquivo:linha ou saída exata de curl/HTTP); (2) o que a documentação oficial diz (e como sites grandes fazem, quando útil); (3) recomendação concreta; (4) esforço estimado.
**Regras:** somente o que foi verificado. Itens não confirmados estão marcados como **a confirmar**. Nada foi editado, commitado ou enviado; nenhuma conta ou dado foi criado.
**Severidade:** Crítico / Alto / Médio / Baixo.

> Documento concluído em 30/09/2026. Evidências reproduzíveis: scripts em `scratchpad/audit/` (`head.mjs` — cabeçalhos/SEO por URL; `forged.mjs` — cookie forjado; `visual.js` — Playwright celular/desktop) e os testes já existentes `teste-rotas.mjs` e `mobile-audit.js`.

---

## 0. Sumário executivo — top 10

Contexto: a fundação de SEO/i18n feita em 29–30/09 está correta e foi reconfirmada em produção (75 URLs, 0 problemas de canonical/hreflang/links; conteúdo renderizado no servidor; HTTP/2; CVE-2025-29927 corrigida). O risco concentrado hoje é **segurança de dados**: o banco está vazio, então ainda não houve incidente — mas o desenho atual expõe dados pessoais no primeiro dia com clientes reais. Depois disso, o maior problema é de **produto**: o motorista é convidado a usar uma plataforma sem oficinas.

| # | Sev. | Achado | Seção |
|---|---|---|---|
| 1 | Crítico | Políticas RLS `USING (true)` deixam qualquer visitante ler `profiles` (nome, e-mail, telefone), `solicitacoes`, `orcamentos`, `mensagens` (e editá-las), `emergencias` e dados do outro condutor — confirmado em produção com a chave anon (`profiles`: 1 linha lida) | 2.1 |
| 2 | Crítico | `getSession()` no servidor aceita cookie de sessão forjado (reproduzido offline); com o UUID do admin público (item 1), todas as rotas `/api/admin/*` ficam acessíveis | 2.2 |
| 3 | Crítico | 11 rotas de API com service role sem autenticação: criar contas para qualquer e-mail, ler transcrições/análises de qualquer pedido, enviar arquivos, disparar notificações em massa; sem rate limit nem validação | 2.3 |
| 4 | Alto | Bucket `damage-photos` público e listável anonimamente (fotos de danos e áudios) — confirmado: listagem + `HEAD` sem chave → 200 | 2.4 |
| 5 | Alto | Sem CSP / `frame-ancestors` / `Permissions-Policy`; `Server` e `X-Powered-By` expostos; HSTS sem `includeSubDomains` | 2.5 |
| 6 | Alto | Produto: home diz ao motorista "você já pode usar hoje" com 0 oficinas; FAQ promete "todas as oficinas verificadas"; página de parceiro sem prova, sem contato humano, sem a comissão futura que o próprio sistema já define | 8.2, 8.3 |
| 7 | Alto | `llms.txt` desatualizado: 8 dos 9 links-chave redirecionam (301) e afirma que os caminhos são iguais em todos os idiomas — falso desde 30/09 | 5.1 |
| 8 | Médio | IA e e-mails fixos no Brasil: prompts do Gemini "mercado brasileiro / reais / português brasileiro", preço de peças formatado `pt-BR`/`BRL`, fallback "São Paulo, SP" na emergência europeia; erros da API em português em todos os idiomas | 7.1, 7.2 |
| 9 | Médio | Acessibilidade: 4 blocos com contraste 2,5–4,4:1 (WCAG AA exige 4,5) em todas as páginas; botão "×" de 9×20 px, rádios 13 px; banner de cookies ocupa 17–20 % do celular inclusive na página de acidente | 6.1–6.3 |
| 10 | Médio | Títulos: login/cadastro herdam "BipFix - … \| BipFix" e a descrição da home; padrão de título diverge entre idiomas; `og:image` ausente em guias/para-oficinas; `Organization` sem russo/`sameAs`; app mobile sem ru/pt-PT, fallback pt-BR e permissões só em português | 3.1–3.4, 7.3 |

Severidades por seção: Segurança 3 Crítico / 2 Alto / 4 Médio / vários Baixo; SEO 0/0/4/3; Indexação 0/0/0/3 (+1 a confirmar); IAs 0/1/2/1; Visualização 0/0/2/2; Tradução 0/0/3/2; Padronização 0/0/2/1; Produto 0/2/2/1.

---

## 1. Padronização

Pontos fortes: mapas de idioma/URL centralizados em `src/i18n/routing.ts` (`PATHNAMES`, `LOCALE_PREFIX`, `HREFLANG`, `OG_LOCALE`) e usados por middleware, sitemap, rodapé e e-mails; formatação de moeda/data em `packages/shared/format.ts` compartilhada com o app; regra de comissão em um único lugar (`lib/comissao-regras.ts`); componentes de layout com `aria-*` consistentes; guias em JSON com validador.

### 1.1 [MÉDIO] Cliente admin do Supabase criado 43 vezes; três fluxos de e-mail paralelos
- **Evidência:** `const supabaseAdmin = createClient(…SERVICE_ROLE_KEY || …ANON_KEY…)` copiado em 43 arquivos (`grep -rl` em `apps/web/src`), cada um com o fallback perigoso do achado 2.9. E-mails: `lib/notifications.ts` (fetch cru à API), `api/visita/route.ts` (SDK `resend`) e três rotas com o próprio `sendEmail` inline (`criar-solicitacao-emergencia`, `esqueci-senha`, `notificar-acidente`), cada uma com `FROM` fixo diferente (`'BipFix <noreply@bipfix.com>'` vs `process.env.FROM_EMAIL || …`).
- **Documentação:** Next.js *Route Handlers* (módulos compartilhados em `lib/`); OWASP *Secure by default* (um único ponto de configuração de credenciais).
- **Recomendação:** `lib/supabase-admin.ts` (singleton, lança se a chave faltar) e `lib/email.ts` (uma função `enviarEmail({to, locale, template})` sobre o SDK, com `FROM` de uma env só).
- **Esforço:** 3 h (mecânico).

### 1.2 [MÉDIO] Mensagens de erro da API e do painel admin só em português; nomes de rota misturam idiomas
- **Evidência:** todas as rotas respondem `{ error: 'Não autenticado' | 'Acesso negado' | '… obrigatório' }`; o front mostra `data.error` direto em `oficina/equipe/page.tsx:73` e `seja-parceiro/page.tsx:39`. Painel `/admin` (12 páginas) é só em pt-BR por decisão (`middleware.ts:110`), sem prefixo de idioma — aceitável para uso interno, mas o `lang` do `<html>` de `/admin` vem do fallback `'pt-BR'` (`app/layout.tsx:48`). Rotas em português (`/api/confirmar-entrega`) coexistem com nomes em inglês nos arquivos (`vehicle-catalog`, `log-error`, `reset-password`) e as pastas internas continuam em português enquanto as URLs públicas são traduzidas (`/docs` → `/abi`), o que é intencional e documentado.
- **Recomendação:** contrato de erro `{ code, message }` com `code` estável (ex.: `UNAUTHENTICATED`, `FORBIDDEN`, `MISSING_FIELD`) e tradução no cliente via `messages.*.json`; manter o padrão de nome de arquivo (escolher inglês ou português para novos handlers e documentar em `docs/`).
- **Esforço:** 4 h.

### 1.3 [BAIXO] Duplicações e restos
- `lib/supabase.ts` (`export const supabase = createBrowserClient…`, usado em 53 arquivos) e `lib/supabase-client.ts` (`createClient()`, 0 usos) — apagar o segundo. `lib/currency.ts` é só *re-export* do pacote compartilhado (comentário explica; ok, mas migrar imports).
- `INTL_LOCALE[locale] || 'pt-BR'` repetido 15 vezes (fallback brasileiro para a Europa); centralizar `intlLocale(locale)` com fallback `'en-GB'` (o único lugar que já faz isso: guia, `'en-GB'`).
- `mobile/lib/notif-i18n.ts` (35 linhas) é um subconjunto de `web/src/lib/notif-i18n.ts` (380) — mover para `packages/shared`.
- Título da home com marca no início em pt-br/pt-pt/it e no fim em en/et/ru (3.2); `og:image` ora presente ora não (3.3).
- Nomes de arquivo de upload `Date.now()-nome_original` (`upload-emergencia`) vs UUID em outros fluxos — unificar (também por segurança, 2.4).
- `ALL_NEW_FEATURES.sql` e `FULL_MIGRATION.sql` fora da sequência numerada de `supabase/migrations/001…027` — risco de aplicar duas vezes / esquecer; consolidar em migrações numeradas.
- Copy: "oficina" é traduzida como *repair shop/garage/töökoda/автосервис* de forma consistente; "Motoristas/Drivers/Juhid/Водители" consistente; "parceiro fundador" consistente (asutajapartner / партнёр-основатель / founding partner). OK.

---

## 2. Segurança

Resumo: a camada de **páginas** está bem protegida (middleware, CVE-2025-29927 testado e corrigido: `curl -H "x-middleware-subrequest: middleware:..." /et/cliente` → 307 para login). O problema está na **camada de dados e de API**: políticas RLS abertas (`USING (true)`) em tabelas com dados pessoais, bucket de fotos listável por qualquer um, sessão de servidor que aceita cookie forjado e 11 rotas de API com service role sem nenhuma autenticação. Como o banco de produção ainda está praticamente vazio (1 perfil), o dano real hoje é nulo — mas tudo isso vira incidente de RGPD no primeiro dia com clientes reais.

### 2.1 [CRÍTICO] Qualquer visitante lê a tabela `profiles` (nome, e-mail, telefone, tipo, idioma) com a chave anônima
- **Problema:** a política de leitura de `profiles` é irrestrita; a chave `anon` (pública, está no bundle JS) lê todos os perfis.
- **Evidência:** `supabase/migrations/001_initial_schema.sql:176` — `CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);` (nunca substituída: nenhum `DROP POLICY` posterior). Verificado em produção com a chave anon extraída de `/_next/static/chunks/9459-*.js`: `HEAD /rest/v1/profiles?select=id` com `Prefer: count=exact` → `200`, `content-range: 0-0/1`; `GET /rest/v1/profiles?select=*&limit=1` devolveu as colunas `id, tipo, nome, email, telefone, avatar_url, created_at, ativo, termos_aceitos_em, termos_versao, idioma` do único perfil existente (o admin). O mesmo padrão existe em `solicitacoes_select` (001:192), `orcamentos_select` (001:203), `itens_select` (001:213), `emergencias_select_anon` (004:84), `outro_veiculo_select` (004:95 — nome, e-mail, telefone e placa do outro condutor), `msgs_select` (004:102), `mensagens_select` e `mensagens_update` (006:22–24 — chat privado cliente↔oficina legível **e editável** por qualquer um), `analise_dano_select`, `no_show_*` e `emergencia_notif_*` (`ALL_NEW_FEATURES.sql:26–145`). Para essas tabelas vazias não foi possível confirmar em produção (0 linhas), mas o SQL está aplicado no mesmo `FULL_MIGRATION.sql`.
- **Documentação:** Supabase, *Row Level Security*: "Row Level Security is enabled on all tables… you must write policies; a policy `USING (true)` grants access to everyone, including unauthenticated users with the anon key" e recomenda `TO authenticated` + `auth.uid()`; Supabase, *Securing your API*: a chave anon "is safe to use in a browser **only** if RLS is enabled with restrictive policies". OWASP Top 10 2021 A01 *Broken Access Control*. RGPD art. 5(1)(f) e art. 32 (integridade e confidencialidade); art. 33 (notificação de violação em 72 h à Andmekaitse Inspektsioon).
- **Recomendação:** nova migração que (1) substitui `profiles_select` por `USING (auth.uid() = id)` mais uma view/RPC pública com só `nome` e `avatar_url` para o que precisa aparecer (avaliações, chat); (2) restringe `solicitacoes`, `orcamentos`, `orcamento_itens`, `mensagens`, `emergencias`, `emergencia_outro_veiculo`, `emergencia_mensagens`, `analise_dano`, `no_show_historico` a cliente dono, oficina destinatária (via `orcamentos`/`emergencia_oficinas_notificadas`) e funcionários (`funcionarios`); (3) `mensagens_update` só para o remetente/destinatário (marcar como lida); (4) roda o *Security Advisor* do Supabase e um teste automatizado com a chave anon (como o `HEAD … count=exact` acima) no CI. Enquanto não migra: tratar o e-mail do admin como já exposto.
- **Esforço:** 1–2 dias (políticas + teste dos fluxos cliente/oficina/loja em et e ru, que já têm script e2e).

### 2.2 [CRÍTICO] Sessão de servidor aceita JWT forjado: `getSession()` em `api-auth.ts`, `admin-auth.ts` e `middleware.ts`
- **Problema:** as três funções que decidem "quem está chamando" leem o cookie e confiam no conteúdo sem validar a assinatura. Um cookie `sb-…-auth-token` montado à mão com `sub = <uuid de qualquer usuário>` e `exp` no futuro é aceito como sessão desse usuário. Como `requireAdmin()` depois consulta `profiles.tipo` **com a service role** usando esse `sub`, e o UUID do admin é público (achado 2.1), qualquer pessoa consegue chamar todas as rotas `/api/admin/*` (usuários, comissões, exportação, correção de status, desativar contas).
- **Evidência:** `apps/web/src/lib/api-auth.ts:48` (`supabase.auth.getSession()` no caminho de cookie), `apps/web/src/lib/admin-auth.ts:37`, `apps/web/src/middleware.ts:167`. Teste offline reproduzível (`scratchpad/audit/forged.mjs`, mesma versão `@supabase/ssr 0.1.0` do projeto): cookie com JWT assinado com `assinatura-invalida` → `getSession() retornou user.id = 00000000-0000-0000-0000-000000000abc | error = null`, e a própria biblioteca imprime o aviso "Using the user object as returned from supabase.auth.getSession() … could be insecure … Use supabase.auth.getUser() instead". O caminho *mobile* (`Authorization: Bearer`) já usa `getUser(token)` (`api-auth.ts:29`) e está correto. Nas páginas o risco é menor porque a consulta a `profiles` no middleware usa a chave anon + o JWT forjado, e o PostgREST rejeita a assinatura — mas o `isProtected && !session` é contornado.
- **Documentação:** Supabase, *Server-Side Auth (Next.js)*: "**Always use `supabase.auth.getUser()` to protect pages and user data. Never trust `supabase.auth.getSession()` inside server code such as middleware. It isn't guaranteed to revalidate the Auth token.**" OWASP *Session Management Cheat Sheet* (validação do token no servidor a cada requisição). `@supabase/ssr` está na versão 0.1.0; a atual é 0.12.7 (`npm view`), com API `getAll/setAll` e correções.
- **Recomendação:** trocar `getSession()` por `getUser()` nos três arquivos (uma chamada de rede à Auth por requisição de API/página protegida; aceitável); atualizar `@supabase/ssr` e o padrão de cookies para `getAll/setAll`; adicionar teste que envia cookie forjado a `/api/admin/metricas` e espera 401.
- **Esforço:** meio dia + regressão das áreas logadas.

### 2.3 [CRÍTICO] 11 rotas de API usam a service role sem autenticação nenhuma
- **Problema:** o middleware não cobre `/api/*` (`middleware.ts:242`, matcher exclui `api`), então cada rota precisa se proteger. As rotas abaixo não chamam `getSessionUserId` nem `requireAdmin` e operam com `SUPABASE_SERVICE_ROLE_KEY` (ignora RLS). A auditoria de 08/09 (`docs/AUDITORIA_SEGURANCA_API_2026-09-08.md`) já as listava como abertas; continuam abertas.

| Rota (`apps/web/src/app/api/…/route.ts`) | O que qualquer pessoa na internet consegue fazer | Sev. |
|---|---|---|
| `criar-solicitacao-emergencia` (l. 32–98) | Criar conta Supabase para **qualquer e-mail** (`auth.admin.createUser` com `email_confirm: true`), enviar senha por e-mail, e atrelar a emergência a **qualquer `clienteId`** do corpo | Crítico |
| `notificar-acidente` (l. 36–137) | Idem: cria conta para o e-mail do "outro veículo" e envia credenciais; sem dono verificado | Alto |
| `transcrever-audio` (l. 9–30) | Ler a transcrição de **qualquer** mensagem de áudio privada por `mensagemId` e gastar cota do Gemini | Alto |
| `analisar-dano` (l. 9–25) | Obter análise (descrição do cliente, veículo, fotos) de qualquer `solicitacao_id` + custo Gemini | Alto |
| `upload-emergencia` (l. 9–48) | Enviar arquivos de qualquer tipo/tamanho para o bucket `damage-photos` sob qualquer `emergenciaId` | Alto |
| `notificar-oficinas-emergencia` (l. 11–91) | Disparar notificação de "emergência" falsa para até 20 oficinas, quantas vezes quiser | Médio |
| `notificar-fornecedores-cotacao-peca` (l. 19–89) | Disparar notificações + e-mails (Resend) para fornecedores | Médio |
| `consultar-placa` (l. 29–87) | Descobrir marca/modelo/cor de qualquer veículo cadastrado pela placa; gastar a API paga `placas.app.br` | Médio |
| `recalcular-comissao`, `atualizar-avaliacao-oficina` | Forçar recálculo para qualquer oficina (DoS leve) | Baixo |
| `leads-parceiros`, `log-error` | Inserção ilimitada (spam de leads com e-mail ao admin; encher `app_errors`) | Baixo |

- **Evidência adicional:** nenhuma rota tem validação de esquema (0 ocorrências de `zod`), e o único rate limit é o `Map` em memória de `esqueci-senha` (l. 18–43) e `visita`.
- **Documentação:** OWASP Top 10 A01 (Broken Access Control) e A04 (Insecure Design); OWASP *API Security Top 10* API1 (BOLA) e API4 (Unrestricted Resource Consumption); Supabase, *Service role key*: "never expose … use only in trusted server environments **after** authenticating the caller". OWASP *Forgot Password Cheat Sheet*: nunca enviar senha em texto claro; usar link de uso único (já feito em `esqueci-senha`, mas não nos dois fluxos de emergência).
- **Recomendação:** (1) `getSessionUserId(req)` obrigatório e verificação de dono em `transcrever-audio`, `analisar-dano`, `upload-emergencia`, `notificar-*`, `recalcular-comissao`, `atualizar-avaliacao-oficina`; (2) nos fluxos públicos de emergência, trocar "criar conta com senha por e-mail" por *magic link*/`generateLink({type:'invite'})` e nunca aceitar `clienteId` do corpo (derivar da sessão ou deixar nulo); (3) `upload-emergencia`: limitar a `image/jpeg|png|webp`, 10 MB e 6 arquivos, e exigir que a emergência tenha sido criada há < 1 h sem `profile_id` ou pertença ao usuário; (4) rate limit por IP (nginx `limit_req` ou `@upstash/ratelimit`) em todas as rotas públicas; (5) validação de entrada com `zod`.
- **Esforço:** 2–3 dias.

### 2.4 [ALTO] Bucket `damage-photos` é público e listável por anônimos (fotos de danos e áudios)
- **Problema:** qualquer pessoa enumera e baixa todas as fotos de solicitações e mensagens de áudio.
- **Evidência:** com a chave anon, `POST /storage/v1/object/list/damage-photos` → `[{"name":"audio"},{"name":"solicitacoes"}]`; com `prefix: "solicitacoes/c83f…"` → 1 arquivo `.webp`; `HEAD /storage/v1/object/public/damage-photos/solicitacoes/<uuid>/<arquivo>` **sem chave nenhuma** → `200 image/webp`. O código gera URLs públicas (`upload-emergencia/route.ts:35`, `getPublicUrl`).
- **Documentação:** Supabase *Storage access control*: buckets públicos "are accessible to anyone with the URL"; listagem exige política em `storage.objects`; para conteúdo privado, usar bucket privado + *signed URLs* com expiração. RGPD art. 25 (proteção por padrão); fotos de acidente podem conter placas e pessoas.
- **Recomendação:** bucket privado; política de `select` em `storage.objects` só para dono/oficina envolvida; `createSignedUrl(…, 3600)` no servidor ao renderizar; nomes de arquivo aleatórios (hoje `Date.now()-nome_original`, `upload-emergencia/route.ts:23`). Mesmo antes disso, remover a política de listagem anônima.
- **Esforço:** 1 dia (inclui trocar `foto_url` persistida por caminho + assinatura na leitura).

### 2.5 [ALTO] Sem CSP, sem `X-Frame-Options`/`frame-ancestors`, sem `Permissions-Policy`; versões expostas
- **Evidência:** `curl -I https://bipfix.com/en` → só `Strict-Transport-Security: max-age=31536000`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`. Ausentes: `Content-Security-Policy`, `X-Frame-Options`, `Permissions-Policy`. Expostos: `Server: nginx/1.24.0 (Ubuntu)` e `X-Powered-By: Next.js`. HSTS sem `includeSubDomains`/`preload`. Comparação: `bolt.eu` envia `x-frame-options: SAMEORIGIN` + `content-security-policy: frame-ancestors 'self' …` + HSTS `includeSubDomains`; `wise.com` e `ikea.com` enviam CSP completa.
- **Documentação:** OWASP *HTTP Security Response Headers Cheat Sheet* (CSP, `frame-ancestors`, `Permissions-Policy`, remover `Server`/`X-Powered-By`); MDN CSP; Next.js docs *Content Security Policy* (nonce por requisição no middleware) e `poweredByHeader: false` em `next.config.js`; hstspreload.org exige `max-age ≥ 31536000; includeSubDomains; preload`.
- **Recomendação:** começar por `Content-Security-Policy: frame-ancestors 'self'` + `Permissions-Policy: camera=(self), microphone=(self), geolocation=(self)` (o site usa os três) + `poweredByHeader: false` + `server_tokens off` no nginx; depois CSP completa com nonce (o site tem JSON-LD e gtag inline).
- **Esforço:** 2 h para o mínimo; 1 dia para CSP completa.

### 2.6 [MÉDIO] Senhas temporárias geradas com `Math.random()` e enviadas em texto claro; mínimo de 6 caracteres
- **Evidência:** `criar-solicitacao-emergencia/route.ts:25–30` e `notificar-acidente/route.ts:87–89` (`Math.random()`, 8 chars, senha impressa no e-mail); `funcionarios/route.ts:163` ("Generate a new temporary password"); cadastro web `minLength={6}` (`(auth)/cadastro/page.tsx:352`).
- **Documentação:** OWASP *Cryptographic Storage* / Node `crypto.randomInt` (não usar `Math.random` para segredos); NIST SP 800-63B §5.1.1.2: mínimo 8 caracteres, verificar contra listas de senhas vazadas; OWASP *Forgot Password*: link de uso único em vez de senha por e-mail.
- **Recomendação:** `crypto.randomInt`; `minLength 8` + *Leaked password protection* do Supabase Auth (HaveIBeenPwned, ativável no painel); convites por link.
- **Esforço:** 2 h.

### 2.7 [MÉDIO] Cookies sem `Secure`; `NEXT_LOCALE` e `bipfix_idioma` idem
- **Evidência:** `set-cookie: NEXT_LOCALE=en; Path=/; SameSite=lax` (produção); `lib/idioma-escolhido.ts:9` (sem `secure`); `@supabase/ssr` 0.1.0 padrão `httpOnly: false, sameSite: "lax"` sem `secure` (`node_modules/@supabase/ssr/dist/index.js`). O cookie de sessão precisa ser legível pelo JS (desenho do Supabase), mas nada impede `Secure`.
- **Documentação:** OWASP *Session Management*: atributos `Secure` e `SameSite`; MDN `Set-Cookie`.
- **Recomendação:** `cookieOptions: { secure: true, sameSite: 'lax' }` nos `createServerClient/createBrowserClient`; `secure` nos dois cookies de idioma.
- **Esforço:** 1 h.

### 2.8 [MÉDIO] `/api/fipe?path=` e `/api/geocode` são proxies abertos sem limite
- **Evidência:** `api/fipe/route.ts:14` concatena `path` cru na URL (`../` alcança outros caminhos do host `parallelum.com.br`); `api/geocode/route.ts` chama o Nominatim público por requisição, sem cache nem limite, embora o próprio comentário (l. 15) cite o limite de 1 req/s.
- **Documentação:** OSM *Nominatim Usage Policy* ("absolute maximum of 1 request per second", proibido *bulk*; violação = bloqueio do User-Agent/IP, o que quebraria o cadastro de oficinas); OWASP SSRF Prevention (lista de permissões de caminhos).
- **Recomendação:** validar `path` com regex (`^(cars|motorcycles|trucks)/…`); exigir sessão no geocode ou limitar por IP e cachear resultados por `q`/coordenadas arredondadas.
- **Esforço:** 2 h.

### 2.9 [MÉDIO] `SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY` em 40 rotas
- **Evidência:** padrão repetido em todas as rotas (ex.: `api/log-error/route.ts:6`). Se a variável faltar no servidor, o código silenciosamente roda com a chave anon e falha de formas confusas (ou passa a depender das políticas abertas do achado 2.1).
- **Recomendação:** um único `lib/supabase-admin.ts` que lança erro se a service role não existir; importar dele.
- **Esforço:** 1 h.

### 2.10 [BAIXO] Outros pontos
- **DMARC `p=none`** (`_dmarc.bipfix.com`): SPF `include:spf.privateemail.com ~all`, DKIM do Resend presente. Google/Yahoo *sender requirements* (2024) pedem DMARC alinhado; subir para `p=quarantine` após validar relatórios `rua=`. Sem registro CAA.
- **Sem `/.well-known/security.txt`** (RFC 9116) → 404. Criar com `Contact: mailto:security@bipfix.com`.
- **Chave do Gemini na query string** (`analisar-dano/route.ts:72`, `transcrever-audio:53`): usar header `x-goog-api-key` para não vazar em logs de proxy.
- **`oficina/solicitacoes/[id]/page.tsx:29`** busca `orcamentos(*, oficina:oficinas(*, profile:profiles(*)))` — todos os orçamentos concorrentes com e-mail dos donos; a tela filtra só o próprio (`myQuote`, l. 50), mas o JSON inteiro chega ao navegador da oficina (funciona hoje porque `orcamentos_select USING (true)`). Selecionar só o próprio orçamento.
- **Reviewers com nome completo** na página pública (`perfil-dados.ts:69`, `cliente:profiles(nome)`): mostrar "Maria K." (minimização, RGPD art. 5(1)(c)).
- **Mobile — token em `AsyncStorage`** (`apps/mobile/lib/supabase.ts:19`): texto claro no dispositivo. A doc do Supabase para Expo oferece o padrão `LargeSecureStore` (AES no AsyncStorage com chave no `expo-secure-store`), que resolve o limite de 2 KB citado no comentário. Base da API `https://bipfix.com` fixa (`lib/api.ts:8`) — OK.
- **Sem `zod`/validação** e mensagens de erro da API em português para todos os idiomas (`'Não autenticado'`, `'oficinaId obrigatório'`) — ver Padronização.
- **`termos_aceitos_em`**: o cadastro exige aceite (`cadastro/page.tsx:179`), mas a conta criada por `criar-solicitacao-emergencia` e `notificar-acidente` nasce sem aceite registrado (`insert` em `profiles` sem `termos_*`).

---

## 3. SEO

Resumo: a base técnica de 29–30/09 está sólida e foi reconfirmada em produção: 75 URLs no sitemap, canonical = URL, `<html lang>` = hreflang, hreflang recíproco em todas, 99 links internos sem redirecionamento (`teste-rotas.mjs` contra `https://bipfix.com` → "0 problema(s)"). Home com 560–710 palavras renderizadas no servidor por idioma, JSON-LD válido (Organization, WebSite, FAQPage; Article + FAQPage + BreadcrumbList nos guias). Os achados abaixo são de refinamento, não de fundação.

### 3.1 [MÉDIO] Título e descrição da home herdados por login/cadastro, com marca duplicada
- **Evidência:** `https://bipfix.com/et/login` e `/et/registreeru` → `<title>BipFix - Ühendame sind parima autotöökojaga | BipFix</title>` (o `meta.title` de cada idioma já contém "BipFix - …" e o `template: '%s | BipFix'` do `app/[locale]/layout.tsx:26–29` acrescenta de novo) e `<meta name="description">` idêntica à home. Estão `noindex, follow` (correto), mas o título aparece no histórico/abas e em compartilhamentos.
- **Documentação:** Google Search Central, *Influencing your title links*: "avoid repeated or boilerplate text in `<title>` elements", títulos únicos por página.
- **Recomendação:** `title.absolute` para a home e títulos próprios curtos para login ("Logi sisse | BipFix"), cadastro, escolher-tipo, reset; descrição própria ou nenhuma.
- **Esforço:** 1 h.

### 3.2 [MÉDIO] Padrão de título inconsistente entre idiomas
- **Evidência:** en `Car Repair Quotes in Tallinn – Compare Garages | BipFix`, et `Autoremont Tallinnas: võrdle hinnapakkumisi | BipFix`, ru `Ремонт авто в Таллинне: … | BipFix` (marca no fim, cidade no início) **vs** pt-br `BipFix - Compare orçamentos de oficina mecânica perto de você`, pt-pt `BipFix - Compare Orçamentos de Oficinas de Confiança`, it `BipFix - Confronta preventivi di officine meccaniche affidabili` (marca no início, sem cidade/mercado). A descrição ru tem 180 caracteres (as demais 133–159).
- **Documentação:** Google, *Title links*: coloque o termo principal primeiro, marca de forma consistente; descrições longas são truncadas (~155–160 caracteres no desktop, menos no celular).
- **Recomendação:** um único padrão "{benefício + mercado} | BipFix" nos 6 idiomas; para it/pt-pt decidir o mercado-alvo (se o público é Estônia, dizer "in Estonia/Tallinn"; se não há mercado, não competir por "officine meccaniche" genérico na Itália).
- **Esforço:** 1 h.

### 3.3 [MÉDIO] `og:image` ausente em páginas-chave; imagem de pt-br aponta para `/pt/opengraph-image`
- **Evidência:** sem `og:image` em `/et/tookodadele`, `/et/juhendid`, `/et/tookojad`, `/et/juhendid/talverehvid-eestis` (páginas com `generateMetadata` próprio que não repassa `openGraph.images`); a home e as páginas sem metadata própria têm. `/pt-br` usa `og:image=https://bipfix.com/pt/opengraph-image?…` (nome interno do idioma; funciona — 200 image/png — só por causa da exceção no `middleware.ts:84–96`).
- **Documentação:** Open Graph Protocol (`og:image` obrigatório para *rich preview*); Google, *Article structured data*: `image` recomendado (várias proporções); LinkedIn/WhatsApp/Telegram usam `og:image`.
- **Recomendação:** `openGraph.images` no `generateMetadata` de guias, para-oficinas, oficinas, guias/[slug] (imagem por guia seria ideal); `Article.image` no JSON-LD dos guias; gerar a imagem pelo prefixo público (`/pt-br/opengraph-image`) para poder remover a exceção do middleware.
- **Esforço:** 2 h.

### 3.4 [MÉDIO] `Organization` incompleto e inconsistente com a oferta
- **Evidência:** `app/[locale]/layout.tsx:83–97`: `availableLanguage: ['Portuguese','English','Estonian','Italian']` (sem Russian), `areaServed: ['BR','EE']`, sem `sameAs`, sem `address`, `contactType: 'customer support'`; `description` = descrição genérica do idioma. A pendência de perfis sociais/endereço da OÜ já está no `PROGRESSO_2026-09-29.md`.
- **Documentação:** Google, *Organization structured data* (`sameAs`, `address`, `contactPoint`, `logo` ≥ 112×112, `foundingDate`, `email`); Google, *Knowledge panel* usa `sameAs`.
- **Recomendação:** acrescentar Russian, `email`, `foundingDate`, `sameAs` assim que existirem; `logo` dedicado (o `apple-touch-icon.png` serve mas é 180×180).
- **Esforço:** 30 min + dados do usuário.

### 3.5 [BAIXO] `FAQPage` na home e em para-oficinas não gera *rich result* para este tipo de site
- **Evidência:** JSON-LD `FAQPage` em `/et`, `/en`, `/et/tookodadele` e nos guias.
- **Documentação:** Google Search Central (ago/2023): "FAQ rich results are now only shown for well-known, authoritative government and health websites". Não prejudica; apenas não deve ser esperado como ganho de SERP. Útil ainda para IAs (seção 5).
- **Recomendação:** manter, sem investir mais nisso; priorizar `Article` + `BreadcrumbList` (guias) e `LocalBusiness/AutoRepair` (perfis, já implementado em `seo-utils.ts:74`).

### 3.6 [BAIXO] Peso e cache: páginas públicas com `Cache-Control: private, no-store`; logo PNG de 139 KB
- **Evidência:** todas as páginas HTML respondem `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` (dinâmicas por causa de `headers()`/cookies); TTFB 0,20–0,29 s medido de Portugal/Windows (bom para um único servidor); HTML 86 KB (25 KB gzip); JS 246 KB comprimido na home (16 chunks); `/logo.png` = 138 865 B servido em `h-7 sm:h-10` (28–40 px) com `Cache-Control: public, max-age=0`; `apple-touch-icon.png` 25 KB idem. Não há imagem *hero*, então LCP é texto (bom). HTTP/2 confirmado no Chromium (`protocol: h2`).
- **Documentação:** web.dev *Core Web Vitals* (LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1); Next.js *Image Optimization* (`next/image`, formatos AVIF/WebP); Next.js *Caching* (`headers()` em `app/layout.tsx:47` força renderização dinâmica de tudo). Google: velocidade é sinal de *page experience*, mas conteúdo pesa mais.
- **Recomendação:** (1) logo em SVG (ou PNG ≤ 10 KB) e cabeçalho `Cache-Control: public, max-age=31536000, immutable` para `/public` com nome versionado; (2) medir no PageSpeed Insights de campo após tráfego (hoje sem dados de CrUX); (3) considerar `export const revalidate` nas páginas públicas e mover a leitura de `x-locale-html` para o layout `[locale]` (o root layout só precisa dela por causa de `/admin`), o que permitiria cache/ISR e tiraria o `private, no-store`.
- **Esforço:** 1 h (logo) / 1 dia (cache).

### 3.7 [BAIXO] Links internos e conteúdo
- `/et/tookojad` (lista de oficinas) está `noindex, follow` enquanto o banco está vazio (correto) mas continua linkado no menu, no rodapé e no CTA "Vaata töökodasid": um visitante cai em "Esimesed partnertöökojad on tulekul". Considerar apontar esses links para `/et/juhendid` ou para o cadastro até existir a primeira oficina.
- Guias existem em et/en/ru (3 guias) e só o de "comparar orçamentos" em 6 idiomas; `/it/guide` e `/pt-pt/guias` têm 1 guia cada — páginas-índice finas (≈200 palavras).
- `sitemap.xml` inclui `?cidade=` (query) quando há oficinas — aceito pelo Google, mas garantir canonical próprio dessas páginas (a confirmar quando existir oficina).

---

## 4. Indexação

Verificado em produção (curl, sem Accept-Language):

| URL | Resposta | Avaliação |
|---|---|---|
| `https://bipfix.com/` | 307 → `/en`, `Vary: Accept-Language, Cookie`, `Cache-Control: private, no-store` | OK (ver 4.1) |
| `http://bipfix.com/`, `https://www.bipfix.com/` | 301 → `https://bipfix.com/` | OK |
| `/en/` (barra final) | 308 → `/en` | OK |
| `/pt`, `/termos`, `/et/seja-parceiro` | 301 → `/pt-br`, `/pt-br/termos`, `/et/hakka-partneriks` | OK |
| `/et/partner` (flyer) | 307 → `/et/hakka-partneriks?utm_…` | OK |
| `/et/naoexiste`, `/et/tookojad/abc`, `/en/guides/nao-existe`, `/api/naoexiste` | 404 real | OK |
| `/naoexiste` (sem prefixo) | 301 → `/pt-br/naoexiste` → 404 | Ver 4.2 |
| `/et/avarii/teade/abc` (acidente inexistente) | 200 | Ver 4.3 (soft 404) |
| `/et/cliente`, `/et/oficina`, `/admin` | 307 → login | OK |
| login, cadastro, lista de oficinas vazia | `noindex, follow`, fora do sitemap | OK |

### 4.1 A raiz `/` como redirecionamento 307 por idioma — está de acordo com o Google, com uma ressalva
- **Evidência:** `middleware.ts:60–67`; robôs sem `Accept-Language` recebem `/en`; x-default de todas as páginas = versão inglesa (`hreflang x-default=/en` em todas as páginas verificadas). `bolt.eu/` faz o mesmo (307 → `/it-it/` na nossa requisição; `Vary` inclui `Accept-Encoding`). `ikea.com` mantém a raiz como página real e a declara `x-default`.
- **Documentação:** Google, *Managing multi-regional and multilingual sites*: "Google recommends not automatically redirecting users based on their perceived language… Use hreflang; x-default can be a page that lets users select their language **or a redirecting page**" (blog 2013 e Search Central 2023: "x-default … the page you redirect the user to"). Google, *Redirects and Google Search*: 307/302 são tratados como temporários; o Googlebot rastreia sem `Accept-Language` (documentado em *Locale-adaptive pages*) e pode usar `Accept-Language` variado em rastreamento geo-distribuído.
- **Ressalva:** hoje `x-default` aponta para `/en` (uma página de idioma), não para `/`. É válido, mas o `/` em si fica fora de qualquer cluster hreflang; como `/` é a URL mais linkada de fora (flyers antigos, redes, `Host:` do robots), vale garantir que ele sempre responda 307 rápido e nunca 200 (está assim). Nenhuma ação obrigatória; alternativa aceita pelo Google: declarar `x-default = https://bipfix.com/` em todas as páginas e manter o 307 — reduz a chance de o Google mostrar `/en` para quem busca em estoniano. **A confirmar** com relatórios do Search Console após 2–3 semanas (aba "Páginas" → "Página alternativa com tag canônica adequada").

### 4.2 [BAIXO] 301 genérico para qualquer caminho sem prefixo, inclusive inexistentes
- **Evidência:** `middleware.ts:74–80`: qualquer caminho sem prefixo de idioma (exceto admin/api) → 301 para `/pt-br/...`, então `/naoexiste` vira cadeia 301 → 404 e `/robots.txt`/`/sitemap.xml` só funcionam porque o matcher exclui `.*\..*`. Um caminho antigo digitado errado por um estoniano (`/xyz`) vai para a versão do Brasil.
- **Documentação:** Google, *Redirects*: evitar cadeias; 301 para 404 é "soft" e consome rastreio.
- **Recomendação:** lista explícita de caminhos antigos do Brasil (os que existiam antes de 30/09) → 301; o resto → 404 direto (ou 307 pela regra da home).
- **Esforço:** 30 min.

### 4.3 [BAIXO] Página de acidente inexistente responde 200
- **Evidência:** `/et/avarii/teade/abc` → 200 (renderiza cliente e busca depois); `robots.txt` já bloqueia `/et/emergencia/acidente/` **mas o caminho público agora é `/et/avarii/teade/`** (renomeado em `PATHNAMES`), então o `Disallow` não bate.
- **Documentação:** Google, *robots.txt*: as regras são por caminho literal; Google *Soft 404*.
- **Recomendação:** `robots.ts` gerar os `Disallow` a partir de `caminhoLocal(locale, '/emergencia/acidente')` (`/et/avarii/teade/`, `/en/accident/report/`, `/ru/dtp/soobshchenie/`…), e a página devolver `notFound()` (ou `noindex`) quando o id não existe.
- **Esforço:** 1 h.

### 4.4 [BAIXO] `robots.txt` com regras para caminhos que não existem e sem as que existem
- **Evidência:** `Disallow: /pt-br/admin/`, `/en/api/` etc. (`robots.ts:4–13` prefixa tudo por idioma), mas o painel é `/admin` e a API é `/api` (sem prefixo) e não estão listados; `Host: https://bipfix.com`.
- **Documentação:** Google ignora `Host`; Yandex deixou de suportar a diretiva `Host` em 2018 (usa 301 + "Главное зеркало" no Webmaster); Bing/Google: `Disallow` é literal por prefixo.
- **Recomendação:** adicionar `Disallow: /admin/` e `/api/` (o middleware já protege, mas evita rastreio inútil), remover os prefixados inexistentes e a linha `Host`.
- **Esforço:** 15 min.

### 4.5 Estado nos buscadores (a confirmar pelo usuário)
- Search Console, Bing e Yandex configurados em 29–30/09 (`PROGRESSO_2026-09-29.md`); IndexNow com 75 URLs. Sem acesso aos painéis nesta auditoria: **a confirmar** cobertura de `/et`, `/ru` e dos guias em ~2 semanas. Sinal já visível: `Content-Language` por resposta (Bing), `lastmod` real no sitemap.

---

## 5. Ser encontrado por IAs

Pontos fortes verificados: conteúdo renderizado no servidor (a home entrega 560–710 palavras sem JS; o guia de pneus de inverno 1 362); `robots.txt` libera explicitamente GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot etc.; `llms.txt` existe, é curto, diz claramente o que o BipFix é e o que **não** é, e inclui "Notes for AI assistants" com limites factuais — isso é raro e bom.

### 5.1 [ALTO] `llms.txt` está desatualizado: 8 dos 9 links-chave redirecionam e a frase "paths are the same in every language" é falsa desde 30/09
- **Evidência:** `curl https://bipfix.com/llms.txt` lista `/en/emergencia`, `/en/para-oficinas`, `/en/seja-parceiro`, `/en/guias`, `/en/oficinas`, `/en/docs`, `/en/termos`, `/en/privacidade` — todos respondem **301** para `/en/accident`, `/en/for-repair-shops`, `/en/become-a-partner`, `/en/guides`, `/en/repair-shops`, `/en/help`, `/en/terms`, `/en/privacy`. O texto diz "Every key page above exists in all six languages at the same path with the language prefix (e.g. https://bipfix.com/et/para-oficinas …)" — `/et/para-oficinas` → 301 → `/et/tookodadele`. Só a seção "Guides" é gerada por código (`app/llms.txt/route.ts:27–37`); os links-chave são literais (l. 50–58). Cache de 1 h (`cache-control: public, max-age=3600`).
- **Documentação:** llmstxt.org: links devem ser URLs finais e o arquivo "should be kept up to date"; muitos agentes não seguem redirects ao ler o arquivo. Google: cadeias de redirecionamento reduzem confiança.
- **Recomendação:** gerar os links-chave com `hrefNoIdioma('en', '/para-oficinas')` etc. (mesma função do rodapé), corrigir a frase para "each language has its own translated path (see the language switcher/hreflang)", e acrescentar um teste (o `teste-rotas.mjs` já visita links internos; incluir `llms.txt`).
- **Esforço:** 30 min.

### 5.2 [MÉDIO] Não existe `llms-full.txt` nem versão texto dos guias
- **Evidência:** `https://bipfix.com/llms-full.txt` → 404. Os guias só existem como HTML (~70–105 KB) com Article/FAQ em JSON-LD.
- **Documentação:** llmstxt.org propõe `llms-full.txt` (conteúdo completo em Markdown) e versões `.md` das páginas para consumo por LLMs.
- **Recomendação:** rota `llms-full.txt` que concatena os guias (já estão em `content/guias/*.json`) em Markdown, e `/guides/<slug>.md` opcional.
- **Esforço:** 2 h.

### 5.3 [MÉDIO] Afirmações que uma IA vai repetir e que hoje não são verdadeiras
- **Evidência:** `llms.txt`: "[Partner repair shops] … public list of active partner shops … each shop has a public profile with verified reviews" — a lista está vazia e `noindex`. FAQ (JSON-LD) na home: "Every registered shop goes through verification" (et: "Kõik registreeritud töökojad läbivad kontrolli") sem descrever qual verificação; para-oficinas: "Public profile indexed on Google, by city" (a lista está `noindex` enquanto vazia). Organization `availableLanguage` sem russo.
- **Documentação:** Google *Helpful content*/E-E-A-T e Bing *Webmaster Guidelines* penalizam alegações não sustentadas; para IAs, a coerência entre `llms.txt`, JSON-LD e texto visível é o que evita respostas erradas ("BipFix tem rede de oficinas verificadas em Tallinn").
- **Recomendação:** frasear no presente real ("estamos selecionando as primeiras oficinas; cada perfil terá…"), descrever a verificação (registro na empresa, visita, documento) e atualizar quando a 1ª oficina entrar.
- **Esforço:** 1 h de copy × 6 idiomas.

### 5.4 [BAIXO] Sinais adicionais
- `Article.author` é a organização; para E-E-A-T e citações, uma `Person` (nome do fundador) com `sameAs` (LinkedIn) ajuda; adicionar `dateModified` já existe.
- Não há página "Sobre/Quem somos" (about) — IAs e Google usam para entidade; a seção "Miks me BipFixi ehitame" na home cumpre parcialmente. Criar `/about` com fundador, cidade, estágio, contato.
- `robots.txt` bloqueia `/api/` só nos prefixos inexistentes (4.4); `Bytespider` liberado explicitamente — decisão de negócio (é o crawler da ByteDance, não traz busca).

---

## 6. Visualização (celular e desktop)

Método: Playwright (Chromium 1223) contra produção, 10 páginas × 2 viewports (390×844 iPhone com UA móvel; 1366×768 desktop), locale `et-EE`, `networkidle`; script em `scratchpad/audit/visual.js`, resultados em `visual-results.json`, capturas em `audit/shots/`. Também rodado o `teste-rotas.mjs` (0 problemas).

Sem problemas: nenhuma página com transbordo horizontal nos dois tamanhos; 1 `<h1>` por página; 0 imagens sem `alt`; 0 botões/links sem nome acessível; landmarks `nav`/`main`/`footer` presentes; 0 erros de console; nenhum `input` com fonte < 16 px (evita zoom no iOS); seletor de idioma e menu abrem dentro da tela (já corrigido em 30/09); banner de cookies não cobre o primeiro CTA.

### 6.1 [MÉDIO] Contraste abaixo de WCAG AA em 4 blocos recorrentes (todas as páginas e idiomas)
- **Evidência (razão medida / cor / fundo / texto):**
  - `3,95` — `rgb(254,226,226)` sobre `rgb(220,38,38)` — subtítulo do bloco vermelho "Sain just avarii" na home e no topo de `/et/avarii` ("Tee kohe foto ja saa lähedal…");
  - `4,24` — `rgb(219,234,254)` sobre `rgb(37,99,235)` — os dois parágrafos da seção "Miks me BipFixi ehitame" (fundo azul);
  - `4,44` — `rgb(107,114,128)` sobre `rgb(239,246,255)` — texto dos cartões simulados ("Kokkupõrge - VW Golf 2021 …");
  - `2,54` — `rgb(156,163,175)` (gray-400) sobre branco — aviso "Saates nõustud meie kasutustingimustega" e o link nele em `/et/hakka-partneriks`; `4,42` no aviso de `/et/avarii` ("Sina oled kannatanu…").
- **Documentação:** WCAG 2.2 SC 1.4.3 (AA): 4,5:1 para texto normal, 3:1 para texto grande (≥ 24 px ou ≥ 18,66 px negrito). Diretiva (UE) 2019/882 (European Accessibility Act, em vigor desde 28/06/2025) aplica EN 301 549 (= WCAG 2.1 AA) a serviços de comércio eletrônico — um marketplace se enquadra.
- **Recomendação:** `text-red-50`→`text-white` no bloco vermelho; `text-blue-100`→`text-white`/`text-blue-50` no azul; `text-gray-500`→`text-gray-600` nos cartões; `text-gray-400`→`text-gray-600` nos avisos legais (o link do aviso é justamente o que precisa ser lido).
- **Esforço:** 30 min (4 classes Tailwind).

### 6.2 [MÉDIO] Alvos de toque pequenos: botão "×" de 9×20 px, rádios de 13×13 px, links de 17 px de altura
- **Evidência:** `/en` e `/ru` no celular: `button "×" 9x20` (fechar o aviso `SugestaoIdioma`, `components/layout/SugestaoIdioma.tsx:73`); `/et/avarii`: 3 `input` (rádio "quem sou no acidente") `13x13`; `button "Unustasin parooli" 99x16` no login; 19–27 alvos por página com < 24 px de altura (links do rodapé e do banner de cookies, 17 px). Total de alvos < 44 px: 25–34 por página.
- **Documentação:** WCAG 2.2 SC 2.5.8 *Target Size (Minimum)* (AA): 24×24 px CSS, exceto texto em linha; Apple HIG: 44×44 pt; Material: 48×48 dp. Google *Mobile usability* ("clickable elements too close together").
- **Recomendação:** `×` com `p-2 min-w-[44px] min-h-[44px]`; rádios com rótulo clicável grande (`label` com `py-3`) ou cartões-botão; "Unustasin parooli" e links do rodapé com `py-2 inline-block`.
- **Esforço:** 1 h.

### 6.3 [BAIXO] Banner de cookies ocupa 17–20 % da tela do celular, também na página de acidente
- **Evidência:** banner fixo de 147 px (ru: 167 px) em 844 px de altura; em `/et/avarii` cobre a base do formulário de emergência (captura `mobile_et_avarii.png`). Botões "Keeldu / Nõustun" têm paridade (bom: EDPB *Guidelines 05/2020*, rejeitar tão fácil quanto aceitar).
- **Documentação:** Google *Page experience*: intersticiais que "cover a significant amount of content" contam contra; a exceção documentada é o banner de cookies "reasonably sized".
- **Recomendação:** versão compacta no celular (1 linha + 2 botões, ≈ 90 px) e não exibir na página `/avarii` até o envio (ou só após o envio), já que ali não há analytics relevante.
- **Esforço:** 1 h.

### 6.4 [BAIXO] Outros
- "Logi sisse" quebra em duas linhas em 390 px (captura `mobile_et_avarii.png`), desalinhando o cabeçalho; usar `whitespace-nowrap` e reduzir padding.
- Sem `<meta name="theme-color">` nem `color-scheme`; o site é só claro (`prefers-color-scheme: dark` → `body` continua `rgb(249,250,251)`), o que é coerente; documentar como decisão.
- Sem *skip link* ("ir para o conteúdo"): WCAG 2.4.1 (A). 15 min.
- Sem `manifest.json`/`site.webmanifest` (404): sem "adicionar à tela inicial" com nome/ícone corretos; útil na fase em que o app nativo ainda não está nas lojas. 30 min.
- Fonte de 11 px só no código do idioma (`ET`, `RU`) do seletor — aceitável (é decorativo e `aria-hidden`).
- Tempo de carregamento completo (networkidle) no celular: 0,9–2,6 s por página a partir de Portugal; sem imagens pesadas além do logo (3.6).

---

## 7. Tradução

Método: comparação automática das 36 planilhas `apps/web/messages/*.json` (6 idiomas × 6 áreas) contra `en`; busca de literais em português nos `.tsx`/`.ts` fora de `app/admin`; leitura dos textos legais por jurisdição; app mobile (`apps/mobile/i18n`).

Resultado geral: **muito bom**. pt-PT, et, it e ru têm exatamente as 2 173 chaves do inglês, 0 vazias, e só 3–6 valores idênticos ao inglês (todos legítimos: placeholders de telefone `+372 5555 5555`, `Check-in {nome}`, `Item {numero}`). `pt` (Brasil) tem estrutura própria para termos/privacidade (`title1/body1a…` em vez de `secoes[]`), o que explica as "166 chaves faltantes" — não é bug. Nos componentes compartilhados só há **um** texto em português hard-coded fora do admin.

### 7.1 [MÉDIO] Fallback "São Paulo, SP" para localização em todos os idiomas europeus
- **Evidência:** `misc.emergencia.locationFallback` = `"São Paulo, SP"` em `en`, `et`, `it`, `pt-PT` (e `pt`); usado em `app/[locale]/emergencia/page.tsx:526` quando o geocoding falha — um estoniano que nega a localização vê "São Paulo, SP" preenchido. Em `ru` foi traduzido.
- **Recomendação:** fallback vazio com placeholder "Tallinn, Harjumaa" por idioma, ou pedir o endereço manualmente.
- **Esforço:** 15 min.

### 7.2 [MÉDIO] Prompts da IA e mensagens do servidor fixos em português do Brasil
- **Evidência:** `api/analisar-dano/route.ts:82–85`: "Especialista em reparos automotivos **Brasil** … Preços em **reais do mercado brasileiro**"; `api/transcrever-audio/route.ts:61`: "Transcreva este áudio em **português brasileiro**"; a resposta JSON (`resumo`, `checklist_inspecao`, `perguntas_sugeridas`) sai em português e em BRL para uma oficina de Tallinn ouvindo um áudio em estoniano ou russo. `lib/notifications.ts:446`: `Intl.NumberFormat('pt-BR', { currency: params.moeda || 'BRL' })` — preço de peça formatado à brasileira no e-mail europeu. `lib/notifications.ts:496`: `moeda || 'BRL'`. Erros das rotas (`'Não autenticado'`, `'Acesso negado'`, `'oficinaId obrigatório'`) são mostrados ao usuário em `oficina/equipe/page.tsx:73` e `seja-parceiro/page.tsx:39` sem tradução. `emergencia/page.tsx:167`: descrição padrão `'Emergência - Colisão'` gravada para todos os idiomas.
- **Documentação:** next-intl (mensagens no servidor via `getTranslations({locale})` também em rotas de API); Google Gemini docs: o idioma de saída deve ser pedido no prompt.
- **Recomendação:** passar `locale` (do perfil do solicitante/da oficina) e `moeda` (`currencyForCountry`) ao prompt; instruir "responda no idioma X, preços em EUR"; códigos de erro (`{ code: 'UNAUTHENTICATED' }`) traduzidos no cliente.
- **Esforço:** 3 h.

### 7.3 [MÉDIO] App mobile: só 4 idiomas, fallback `pt`, permissões do sistema só em português
- **Evidência:** `apps/mobile/i18n/index.ts:10,26`: `SUPPORTED = ['pt','en','et','it']`, `fallbackLng: 'pt'` — um telefone em russo (≈ 1/3 de Tallinn) ou em pt-PT cai no português **do Brasil**. `apps/mobile/app.json:17–19,44–52`: `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` e as permissões dos plugins só em português ("Usamos sua localização…") — o diálogo do iOS/Android para um estoniano aparece em português. `lib/api.ts:22`: `'Erro na requisição'` fixo.
- **Documentação:** Apple *App Store Review Guidelines* 5.1.1(i) e *Information Property List*: purpose strings devem ser claras para o usuário; Expo docs *Localization* — `expo.locales` em `app.json` (`"locales": { "et": "./locales/et.json" }`) gera `InfoPlist.strings` por idioma; Google Play *Data safety* pede consistência com as permissões.
- **Recomendação:** adicionar `ru` e `pt-PT` (reaproveitar as chaves do site: são 140 no app); `fallbackLng: 'en'`; `expo.locales` para et/en/ru; termos e privacidade linkados no cadastro do app (hoje nenhum arquivo em `apps/mobile/app` menciona `termos`/`privac`), exigência da App Store (5.1.1) e do Play.
- **Esforço:** 1 dia.

### 7.4 [BAIXO] Textos legais por jurisdição
- **EN/ET/IT/RU/PT-PT (UE):** políticas completas (controlador, base legal por finalidade, Clarity/GA/Resend/Gemini nomeados, transferências fora do EEE, retenção, direitos, autoridade AKI) — acima da média. A seção 1 dos termos declara que a OÜ ainda está em registro e que "a plataforma é operada pelo fundador como pessoa singular" — correto e transparente; atualizar assim que houver código de registro.
- **PT-PT:** é a versão da UE traduzida; não menciona Portugal (CNPD, Livro de Reclamações). Como a empresa é estoniana e Portugal não é mercado-alvo, é aceitável; mas o título da página e o `og:locale pt_PT` sugerem público português — decidir se `/pt-pt` é "português europeu para quem vive na Estônia" (dizer isso na home, como o russo faz) ou mercado Portugal (aí sim CNPD/LRE).
- **PT (Brasil):** LGPD e CDC citados, "encarregado" presente; **sem** menção à ANPD (canal de reclamação, LGPD art. 18 §1 e art. 55-J) — acrescentar.
- **RU:** enquadrado como "para russófonos da Estônia" (Эстони presente, Россия ausente, euro presente) — correto.
- **Estoniano:** títulos novos e guias ainda sem revisão de nativo (pendência já registrada). A declinação "BipFixi/BipFixis" está correta.

### 7.5 [BAIXO] Um literal em português em componente compartilhado
- `components/tutorial/TutorialHub.tsx:196`: "Ainda não encontrei isso no seu perfil. Faça a ação na tela real e clique em verificar de novo." — aparece nos 6 idiomas. Mover para `messages`.

---

## 8. A ideia do site / produto

Base: textos de `messages/en.json` (home, para-oficinas, seja-parceiro), HTML em produção em et/en/ru, `lib/comissao-regras.ts` (via `PROGRESSO_2026-09-29.md`), termos (seções 4–6), estado do banco (1 perfil, 0 oficinas, 0 solicitações — contagem com a chave anon).

### 8.1 O que está bom
- **Proposta clara em uma frase** ("Autoremont Tallinnas, ilma üllatusteta" / "Car repairs, no surprises") e os 4 passos; o CTA de emergência ("Sain just avarii") é diferenciador real e o fluxo funciona sem conta.
- **Honestidade sobre o estágio** ("We're, literally, just getting started"; termos dizendo que a OÜ está em registro; `llms.txt` pedindo às IAs para não inflar) — em um mercado pequeno como Tallinn, isso constrói mais confiança do que fingir escala.
- **Oferta para oficinas** bem estruturada: sistema de gestão (agenda, orçamentos, equipe, peças) + leads, sem mensalidade, sem comissão na fase fundadora, aviso de 30 dias antes de cobrar, mecanismo técnico já pronto (`isento` → `fixa`/`desempenho` 5–15 % serviços, 1–3 % peças, individual com prazo), e a oficina vê de onde vem a taxa.
- **Guias locais** (pneus de inverno, tehnoülevaatus, acidente na Estônia) são o melhor ativo de aquisição orgânica que o site tem hoje.

### 8.2 [ALTO] Para o motorista, o produto ainda não entrega: 0 oficinas, mas a home diz "você já pode usar hoje"
- **Evidência:** `home.parceiroTexto`: "If you're a driver, you can already use the platform today"; FAQ: "Every registered shop goes through verification"; `/et/tookojad` renderiza "Esimesed partnertöökojad on tulekul" (noindex); tabela `oficinas` = 0 linhas. Um motorista que envia fotos hoje não recebe orçamento nenhum, e o fluxo de emergência notifica "todas as oficinas ativas" (`notificar-oficinas-emergencia/route.ts:41–47`) — nenhuma.
- **O que dizem as referências:** marketplaces de dois lados com *cold start* (Bolt, Wolt, Uber em cidades novas) abrem a oferta (motoristas/restaurantes) **antes** da demanda e comunicam "lista de espera" ao lado da demanda; Google *Helpful content*: prometer o que a página não entrega gera *pogo-sticking*.
- **Recomendação:** enquanto `count(oficinas ativas em Tallinn) < N` (ex.: 5): (1) trocar o CTA do motorista por "Entre na lista: avisamos quando as primeiras oficinas de Tallinn estiverem no ar" (captura e-mail + bairro), (2) o fluxo de emergência continuar existindo mas com aviso claro e com o admin recebendo o lead para encaminhar manualmente (concierge) — isso vira argumento de venda para a oficina ("já temos X pedidos esperando"); (3) a FAQ dizer o que é a verificação.
- **Esforço:** 1 dia de produto/copy.

### 8.3 [ALTO] Para a oficina, falta prova e falta "o que acontece depois que eu me inscrevo"
- **Evidência:** `/et/hakka-partneriks` tem 206 palavras, 3 benefícios e um formulário; não há nome do fundador, foto, telefone/WhatsApp direto, nem prazo de resposta ("Our team will review…"); não há preço futuro (os termos §5 e `comissao-regras` já definem faixas 5–15 % / 1–3 %, mas a página diz só "sem comissão nesta fase"); não há demonstração (capturas do painel, vídeo de 60 s, conta demo). "Public profile indexed on Google, by city" é hoje `noindex`.
- **Referências:** Google E-E-A-T (quem está por trás); páginas de parceiros de Bolt/Wolt mostram ganhos esperados, passos após a inscrição e contato humano; na Estônia, oficinas pequenas decidem por telefone/visita, não por formulário.
- **Recomendação:** (1) seção "Quem somos" com fundador, e-mail e telefone estoniano (+372) e "respondemos em 1 dia útil"; (2) "Como será a comissão depois" com a tabela real (transparência é o posicionamento do site — usar isso); (3) 4–6 capturas reais do painel em estoniano e/ou vídeo; (4) 3 passos após a inscrição (ligamos → cadastramos juntos em 30 min → primeiro pedido); (5) selo/lista dos primeiros parceiros assim que existirem, com link para o perfil (o `sitemap.ts` já os inclui automaticamente).
- **Esforço:** 1–2 dias + material do usuário.

### 8.4 [MÉDIO] Modelo de comissão "absorver ou repassar" pode virar surpresa para o motorista
- **Evidência:** para-oficinas: "Structured quotes, with the option to pass on or absorb the commission"; home: "no hidden costs"; termos §4 "Klientidele tasuta". Se a oficina repassar, o preço ao cliente inclui a comissão sem isso aparecer no orçamento (a confirmar na tela de orçamento — o código atual mostra um aviso "sem comissão" quando a taxa é 0, `PROGRESSO_2026-09-29.md`).
- **Referências:** Diretiva 2011/83/UE (direitos do consumidor) e a Lei de Proteção do Consumidor estoniana (TKS) exigem preço total; a Diretiva Omnibus (2019/2161) exige informar quando um ranking/preço é influenciado por pagamento; DSA art. 26–27 para marketplaces (transparência de ranking).
- **Recomendação:** quando houver comissão, o orçamento ao cliente mostra o total final (sem linha "comissão BipFix"), e os termos explicam que a plataforma cobra da oficina; manter a promessa "nenhuma oficina paga por posição" (já está no `llms.txt`) também nos termos e na FAQ.
- **Esforço:** decisão de negócio; 2 h de copy.

### 8.5 [MÉDIO] Concorrência e lacunas na Estônia (o que o site não responde)
- **Contexto verificável no próprio site:** os guias já citam LKF (seguradoras) e Transpordiamet; a oferta não menciona **seguro/kasko** (na Estônia grande parte dos reparos de colisão é paga pela seguradora, que tem oficinas parceiras próprias), nem **fatura/e-arve e KM (IVA 24 %)** nos orçamentos, nem **integração com o registro de veículos** (placa → modelo). A rota `consultar-placa` usa `placas.app.br` (Brasil) — para a Estônia não há equivalente ligado.
- **Concorrentes/alternativas que o motorista de Tallinn usa hoje** (a confirmar por pesquisa de mercado, não verificado nesta auditoria): busca no Google Maps + ligação, grupos de Facebook, portais tipo *autoremont/hinnapäring* das seguradoras, e as próprias redes (Bolt Drive Service, dealers). O diferencial defensável do BipFix é o orçamento estruturado + acompanhamento + avaliação verificada, não o "achar oficina".
- **Recomendação:** (1) FAQ "E se o seguro paga?" (fluxo: você pode pedir orçamentos aqui e apresentar à seguradora); (2) campo "tenho kasko/seguro do terceiro" no fluxo de acidente; (3) orçamento com KM destacado e número de registro da oficina (äriregistri kood) no perfil público — sinal de confiança forte na Estônia; (4) desligar/ocultar `consultar-placa` fora do Brasil (hoje é um botão que sempre falha na Estônia — a confirmar na UI).
- **Esforço:** 1–2 dias.

### 8.6 [BAIXO] Mercados secundários (it, pt-pt) sem proposta
- **Evidência:** `/it` e `/pt-pt` têm home completa, termos da UE e 1 guia genérico, mas nenhuma cidade/país-alvo (título "officine meccaniche affidabili" sem lugar). Um italiano que chega via Google não descobre que o piloto é em Tallinn até o `heroTexto`.
- **Recomendação:** ou declarar na home desses idiomas "BipFix opera em Tallinn; a versão italiana é para quem vive na Estônia" (como o russo), ou tirar `it`/`pt-pt` do sitemap até haver plano — evita indexar páginas que geram cliques sem valor (o problema de "0 cliques" que motivou o trabalho de 29/09).
- **Esforço:** 1 h.

---

## 9. Plano de ação priorizado

Ordem sugerida: fechar o que exporia dados no primeiro cliente real (semana 1), depois o que faz o site converter (semana 2), depois refinamentos.

### Semana 1 — segurança (antes de qualquer campanha ou flyer)
1. **RLS** (2.1): migração 028 restringindo `profiles`, `solicitacoes`, `orcamentos`, `orcamento_itens`, `mensagens` (select + update), `emergencias`, `emergencia_outro_veiculo`, `emergencia_mensagens`, `analise_dano`, `no_show_historico`, `emergencia_oficinas_notificadas`; view pública mínima para nome/avatar; teste automatizado com a chave anon (HEAD count) no CI. — 1–2 dias
2. **`getUser()` em vez de `getSession()`** em `api-auth.ts`, `admin-auth.ts`, `middleware.ts`; atualizar `@supabase/ssr` para 0.12.x. — ½ dia
3. **Rotas sem auth** (2.3): `getSessionUserId` + verificação de dono em 7 rotas; fluxos de emergência com link de convite em vez de senha por e-mail e sem `clienteId` do corpo; limites de tipo/tamanho no upload; rate limit por IP (nginx `limit_req`) nas rotas públicas; `zod`. — 2–3 dias
4. **Storage privado** + URLs assinadas + política de listagem (2.4). — 1 dia
5. **Cabeçalhos**: `frame-ancestors`, `Permissions-Policy`, `poweredByHeader: false`, `server_tokens off`, HSTS `includeSubDomains` (2.5); cookies `Secure` (2.7); `crypto.randomInt` e mínimo de 8 caracteres (2.6); `lib/supabase-admin.ts` sem fallback (2.9/1.1). — ½ dia
6. Validar `path` em `/api/fipe`; cache + limite em `/api/geocode` (2.8). — 2 h

### Semana 2 — conversão e coerência
7. **Modo pré-lançamento para motoristas** (8.2): CTA "lista de espera" enquanto não há N oficinas em Tallinn; fluxo de acidente com aviso + concierge pelo admin; FAQ dizendo o que é a verificação. — 1 dia
8. **Página de parceiro com prova** (8.3): quem somos + contato +372, capturas/vídeo do painel em et, comissão futura em tabela, "o que acontece depois" em 3 passos. — 1–2 dias (+ material)
9. **`llms.txt`** gerado a partir de `PATHNAMES`, frase corrigida, `llms-full.txt` com os guias (5.1, 5.2); afirmações no presente real (5.3). — 3 h
10. **Brasil fora da Europa** (7.1, 7.2): prompts do Gemini por idioma/moeda, `formatCurrency` por locale nos e-mails, fallback de localização, erros com `code` traduzido. — 3 h
11. **Contraste e alvos de toque** (6.1, 6.2), banner compacto no celular e ausente em `/avarii` (6.3). — 2 h

### Semana 3 — refinamento
12. Títulos únicos para login/cadastro; padrão de título por idioma; `og:image` em guias/para-oficinas; `Organization` com russo e `sameAs` (3.1–3.4). — 3 h
13. `robots.ts` com caminhos traduzidos e `/admin/`, `/api/`; 404 real para acidente inexistente; 301 só para caminhos antigos conhecidos (4.2–4.4). — 2 h
14. Logo SVG + cache de `/public`; avaliar ISR nas páginas públicas (3.6). — 1 h / 1 dia
15. App mobile: `ru` e `pt-PT`, fallback `en`, `expo.locales` para as permissões, links de termos/privacidade, `LargeSecureStore` (7.3, 2.10). — 1–2 dias
16. `security.txt`, DMARC `p=quarantine` após relatórios, `manifest.json`, skip link (2.10, 6.4). — 2 h
17. Padronização: `lib/email.ts`, apagar `supabase-client.ts`, `intlLocale()` com fallback `en-GB`, `notif-i18n` no pacote compartilhado, migrações soltas numeradas (1.1–1.3). — ½ dia
18. Decisão de negócio: comissão "absorver/repassar" e preço total ao consumidor (8.4); papel de `/it` e `/pt-pt` (8.6); FAQ de seguro/kasko e KM no orçamento (8.5).

Verificação ao final de cada semana: rodar `teste-rotas.mjs` e `mobile-audit.js` (scratchpad) + o teste de RLS com a chave anon + o teste de cookie forjado, e reconferir os itens deste documento.

---

## 10. O que não foi possível verificar

- **Políticas RLS em tabelas vazias** (`solicitacoes`, `orcamentos`, `mensagens`, `emergencias`…): em produção o `count` é 0 tanto quando a política bloqueia quanto quando a tabela está vazia; a conclusão vem do SQL aplicado (`FULL_MIGRATION.sql`/migrações), não de dados lidos. Só `profiles` (1 linha) foi confirmada de fato.
- **Exploração real do cookie forjado contra `bipfix.com`**: reproduzido offline com a mesma biblioteca/versão; não foi enviado à produção (seria acesso não autorizado ao painel). Nome exato do cookie (`sb-<ref>-auth-token`) para um Supabase self-hosted em `supabase.bipfix.com` — a confirmar.
- **Painéis** Search Console, Bing Webmaster, Yandex Webmaster, Google Analytics/Clarity (cobertura, cliques, erros de rastreamento): sem acesso.
- **HTTP/2 via curl**: o curl local não suporta `--http2`; confirmado só pelo Chromium (`protocol: h2`).
- **Core Web Vitals de campo** (CrUX): sem tráfego suficiente; medidas aqui são de laboratório a partir de Portugal (TTFB 0,2–0,3 s; carga completa 0,9–2,6 s no celular).
- **Áreas logadas** (cliente/oficina/loja/admin) e app mobile em execução: não foram abertas (auditoria sem criar contas). A cobertura foi por leitura de código; o script e2e de 30/09 no scratchpad cobre parte disso.
- **Configuração do nginx/VM** (`limit_req`, `server_tokens`, TLS): só o que aparece nos cabeçalhos de resposta.
- **Fluxo de e-mail** (renderização, DMARC alinhado, entregabilidade): só DNS foi consultado (SPF, DKIM do Resend, DMARC `p=none`, MX privateemail).
- **Textos em estoniano e russo**: verificado completude, chaves e enquadramento (Estônia/euro), não a qualidade linguística — pendência de revisão nativa já registrada pelo usuário.
- **Concorrentes na Estônia** (8.5): não pesquisados fora do site; as alternativas listadas são hipóteses a confirmar.
- **Comportamento da tela de orçamento com comissão > 0** (8.4): inferido do código/progresso; não executado.
- **Lojas de aplicativos**: sem `eas.json`/builds no repositório; não há como verificar metadados, política de privacidade cadastrada ou revisão da Apple/Google.

---

## 11. Status das correções (30/09/2026, publicado em produção)

Commits `eff350f`, `677aaef`, `c87d939`. Verificado em produção: teste de regras de acesso (48 verificações, era 27 falhas), rotas/SEO (sitemap inteiro e 105 links, 0 problemas), celular 390/360 px com menus abertos (0), contraste WCAG AA em 12 páginas (0), áreas logadas de cliente/oficina/loja em et e ru, fluxo de acidente de ponta a ponta, análise de dano por IA com foto privada.

| Item | Status |
|---|---|
| 2.1 RLS | **Corrigido** — migração 028 (acesso por relação, fim de `USING (true)`), `scripts/teste-rls.mjs` |
| 2.2 `getSession()` | **Corrigido** — `getUser()` em api-auth, admin-auth e middleware |
| 2.3 Rotas sem autenticação | **Corrigido** — acidente numa rota só no servidor (dono pela sessão, código secreto para quem registrou sem login, conta por link de definir senha), login + relação + limite nas demais, 4 rotas abertas removidas |
| 2.4 Storage | **Corrigido** — fotos/áudios privados com link assinado; fotos de oficina em bucket público próprio; fim do envio/sobrescrita anônimos |
| 2.5 Cabeçalhos | **Corrigido** — CSP, X-Frame-Options, Permissions-Policy, sem X-Powered-By, `server_tokens off`, HSTS com subdomínios |
| 2.6 Senhas | **Corrigido** — mínimo 8 (formulários e GoTrue), gerador criptográfico, sem senha por e-mail |
| 2.7 Cookies | **Corrigido** — Secure/SameSite; `NEXT_LOCALE` desligado |
| 2.8 FIPE/geocode | **Corrigido** — caminhos permitidos; cache 24 h + fila 1/s + limite |
| 2.9 / 1.1 Cliente admin e e-mail | **Corrigido** — `lib/supabase-admin.ts` (falha sem a chave) e `lib/email.ts` |
| 2.10 | **Corrigido**: security.txt, chave do Gemini no cabeçalho, nomes de avaliadores abreviados, sessão do app cifrada (LargeSecureStore), aceite dos termos para contas criadas no acidente. **Pendente (usuário)**: DMARC `p=quarantine` e CAA no DNS |
| 1.2 Erros da API | **Corrigido** nas telas voltadas ao usuário (código traduzido: `erros.*`) |
| 1.3 | **Corrigido** (cliente morto removido, fallback en-GB, migrações antigas em `supabase/migrations_legado`). Adiado: mover `notif-i18n` do app para o pacote compartilhado (baixo impacto) |
| 3.1–3.4 | **Corrigido** |
| 3.5 | Mantido (sem ação, como recomendado) |
| 3.6 | **Corrigido**: logo 139→16 KB e cache de `/public`. **Adiado**: ISR/cache das páginas (1 dia de trabalho; hoje TTFB 0,2–0,3 s) |
| 3.7 | Aceito: lista vazia mostra "primeiras oficinas chegando" com texto honesto |
| 4.1 | Sem ação (conforme Google); reavaliar com o Search Console em 2–3 semanas |
| 4.2–4.4 | **Corrigido** |
| 5.1–5.4 | **Corrigido** — llms.txt gerado, llms-full.txt, afirmações no presente real, página Sobre |
| 6.1–6.4 | **Corrigido** (contraste medido: 15 → 0) |
| 7.1–7.5 | **Corrigido** (app com ru/pt-PT, fallback en, permissões iOS localizadas, termos no cadastro do app, ANPD, tutorial traduzido). Pendente: revisão de nativo do estoniano |
| 8.2 | **Corrigido**: texto honesto + aviso por e-mail ao admin de todo pedido/acidente enquanto não há oficina ativa |
| 8.3 | **Corrigido**: "o que acontece depois" e "quem está por trás". **Decisão do usuário**: publicar as faixas de comissão futura; **material do usuário**: capturas/vídeo do painel, telefone +372 |
| 8.4 | FAQ "o preço do orçamento é o final?" e "alguma oficina paga para aparecer?". **Decisão do usuário**: manter ou não a opção "repassar comissão" |
| 8.5 | **Corrigido**: FAQ do seguro/kasko, registrikood no perfil público, consulta de placa só no Brasil. Opcional: campo "quem paga o reparo" no fluxo de acidente |
| 8.6 | **Corrigido** parcialmente: títulos/descrições de it e pt-pt dizem Tallinn/"para quem vive na Estônia" |

### Achado novo desta rodada
- **Confirmação de e-mail desligada** no Supabase (`ENABLE_EMAIL_AUTOCONFIRM=true`, SMTP do GoTrue não configurado): qualquer pessoa cria conta com o e-mail de outra. As regras de acesso novas já não confiam no e-mail, mas o certo é exigir confirmação. Exige configurar o SMTP (Resend) no GoTrue e mover a criação do perfil para o servidor (gatilho no banco), porque hoje o cadastro cria o perfil logo após o `signUp`, o que só funciona sem confirmação. Recomendado como próxima tarefa.
- **Não testado em aparelho**: o app de celular (compila; sessão cifrada, idiomas e cadastro novos precisam de teste num iPhone/Android).
