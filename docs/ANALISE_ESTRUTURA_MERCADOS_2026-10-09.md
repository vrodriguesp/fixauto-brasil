# Estrutura do site por mercado (país) — análise antes de decidir (09/10/2026)

Pergunta do dono: com pastas por idioma (`/et`, `/ru`, `/en`, `/it`, `/pt-br`, `/pt-pt`), o Google indexa pior do que um domínio do país? A IKEA faz `ikea.it` → `ikea.com/it/it/`, em italiano e com o mercado italiano. Não seria mais correto assim? A página `bipfix.com` atual é fraca; a da Norwegian é melhor.

**Status: DECIDIDO em 09/10 — opção B, implementada e publicada (ver docs/PROGRESSO_2026-10-08.md).**

## 1. O que temos hoje
- As pastas são por **idioma**, não por país. O hreflang também é só de idioma: `et`, `ru`, `en`, `it` (mais `pt-BR` e `pt-PT`).
- Na prática, isso diz ao Google:
  - `/ru` serve para **qualquer pessoa que fala russo**, inclusive na Rússia;
  - `/en` serve para **qualquer pessoa que fala inglês**, no mundo todo.
- Mas o conteúdo é de Tallinn. Esse é o ponto fraco real: o sinal de país é ambíguo.
- Na raiz `/` fica uma lista de idiomas simples (200, x-default).

## 2. Como os grandes fazem (verificado com curl e navegador em 09/10)

| Site | Raiz | Estrutura | hreflang |
|---|---|---|---|
| **IKEA** | `ikea.com/` 200 "Welcome to IKEA Global" (escolha de país) | `/{país}/{idioma}/`: `/ee/et/`, `/ee/ru/`, `/ee/en/`, `/it/it/` | `et-EE`, `ru-EE`, `en-EE`, `ru-LV`… |
| IKEA (domínios de país) | `ikea.it` → 301 `ikea.com/it/it/`; `ikea.ee` → 301 `ikea.com/ee/et/` | o domínio do país só **redireciona** | — |
| **Norwegian** | `norwegian.com/` 200 "Greetings, traveller!": lista de **países com bandeira**, ex. "Italia (Italiano)", "Other countries (English)" | `/{país}/`: `/it/`, `/uk/`, `/dk/`, `/en/` = outros países | x-default = `/` |
| **Bolt** (Estônia) | `bolt.eu/` → 307 conforme a localização | `/{idioma}-{país}/`: `/et-ee/`, `/ru-ee/`, `/en-ee/` | `et-ee`, `ru-ee`, `en-ee` |
| **Wolt** (Finlândia/Estônia) | `wolt.com/` 200 página global | `/{idioma}/{país}`: `/et/est`, `/en/est` | `et-EE`, `en-EE` |
| Ryanair | `ryanair.com/` → `/it/it` | `/{país}/{idioma}` | — |
| airBaltic | `/` → `/en/index` | só idioma (`/et`, `/ru`), como nós hoje | `et`, `ru` |
| Autobutler (orçamento de oficina, DK/NO/SE) | — | **um domínio por país** (`.dk`, `.no`, `.se`) | — |
| Vroomly (orçamento de oficina, FR) | — | `.com` + `/es/` | `fr`, `es` |

Conclusão: quase todos os grandes que atendem **mercados** separam por **país + idioma**. Domínio próprio por país é a exceção (Autobutler), e a IKEA usa os domínios de país só como atalho que redireciona.

## 3. O que dizem as fontes oficiais
- **Google, "Managing multi-regional and multilingual sites":**
  - domínio de país = "Clear geotargeting", mas é "Expensive" e "Can only target a single country";
  - subpastas no .com = "Easy to set up", "Low maintenance";
  - parâmetros `?loc=` = não recomendado;
  - URLs diferentes por idioma, nunca escolher pelo IP.
- **Search Console:** a configuração "país-alvo" para .com foi **removida em 22/09/2022**. Hoje o Google tira o país do domínio do país, do **hreflang com região** e do conteúdo local ([Search Engine Land](https://searchengineland.com/google-search-console-to-remove-international-targeting-report-387477), [SE Roundtable](https://www.seroundtable.com/google-search-console-deprecates-international-targeting-report-33983.html)).
- **John Mueller (Google):** para geolocalização usam "mostly the ccTLD"; subdomínio e subpasta são "essentially equivalent" ([SEJ](https://www.searchenginejournal.com/google-uses-cctlds-search-console-settings-geotarget-search-results/205486/)).
- **Na prática:**
  - o domínio de país dá o sinal mais forte de país, mas **cada domínio começa com autoridade zero**;
  - a pasta de país no .com, com hreflang `et-EE` / `ru-EE`, dá um sinal claro e **soma toda a autoridade num domínio só**.

## 4. Domínios (verificado no DNS em 09/10)
- `bipfix.ee`, `bipfix.it`, `bipfix.pt` e `bipfix.eu` estão **livres**.
- `bipfix.com.br` **é de outra empresa**: "BipFix — Gestão Inteligente de Manutenção por QR Code". Então domínio de país no Brasil não é possível, e há **risco de marca no Brasil**. Vale consultar o INPI antes de investir no mercado brasileiro (decisão do dono).

## 5. Opções

### A. Manter as pastas por idioma (hoje)
- A favor: zero trabalho.
- Contra: `/ru` e `/en` sem país. Não corresponde ao que o dono quer: mercado por país.
- **Não recomendado.**

### B. Modelo IKEA/Norwegian: país + idioma no bipfix.com (recomendado)
- **Endereços:**
  - Estônia: `bipfix.com/ee/et`, `/ee/ru`, `/ee/en`;
  - Itália: `/it/it`;
  - Brasil: `/br/pt`;
  - Portugal: `/pt/pt`.
- **hreflang:** `et-EE`, `ru-EE`, `en-EE`, `it-IT`, `pt-BR`, `pt-PT`; x-default = `/`.
- **Domínios de país como atalho:** comprar `bipfix.ee`, `bipfix.it` e `bipfix.pt`, com 301 para a pasta do país, como `ikea.it`. Protege a marca e serve para anúncios e material impresso. O SEO continua todo no .com.
- **Raiz no estilo Norwegian:**
  - título de boas-vindas e lista de **países com bandeira**;
  - cada país mostra os seus idiomas, ex. "Eesti — Eesti keel · Русский · English", "Italia — Italiano";
  - uma frase do que o BipFix faz e os links do app.
  - Continua 200, sem redirecionamento automático.
- **Italiano morando na Estônia:**
  - entra no mercado da Estônia em inglês;
  - as áreas logadas (cliente/oficina) e o app seguem o idioma escolhido pela pessoa, e as regras seguem o país (já feito: acidente e seguro);
  - se houver procura, pode-se abrir `/ee/it` depois.
- **A favor:**
  - uma autoridade só;
  - um login só (Supabase/cookies num domínio);
  - links do app (deep links) num domínio só;
  - um painel no Search Console;
  - igual à IKEA e à Bolt.
- **Contra:** reestruturação de URL: 301 dos endereços antigos, sitemap, hreflang, middleware, links nos e-mails.
  - Hoje há **1 clique e 64 páginas indexadas**, então este é o momento mais barato para mudar; depois fica mais caro.
- **Esforço:**
  - cerca de 1 dia de trabalho com testes;
  - o next-intl permite prefixos personalizados por locale (ex. `et` → `/ee/et`), então as telas não mudam, só os endereços.

### C. Um domínio por país (bipfix.ee, bipfix.it, bipfix.pt; Brasil em bipfix.com/br)
- A favor: sinal de país mais forte; `.ee` passa confiança local.
- Contra:
  - cada domínio começa do zero (o pouco que o .com já tem não passa);
  - login separado por domínio: a pessoa entra de novo em cada um, e a sessão do Supabase é por origem;
  - links do app e e-mails por domínio;
  - 3–4 propriedades no Search Console/Bing;
  - SSL e nginx por domínio;
  - o Brasil continua sem domínio próprio.
- É o que faz o Autobutler, mas ele tem equipes por país. Para um teste de mercado, é o caminho mais caro.

## 6. Recomendação
**Opção B**, mais a compra de `bipfix.ee`, `bipfix.it` e `bipfix.pt` como atalhos 301.
- Resolve o problema real: o país passa a estar claro para o Google, com `ru-EE` em vez de `ru`.
- Separa os mercados como o dono quer: `/it/it` = Itália.
- Mantém um site só.

Se depois um mercado crescer muito, ele pode migrar para o próprio domínio. É mais fácil sair de B para C do que o contrário.

## 7. O que o dono precisa decidir
1. Opção B (recomendada) ou C.
2. Comprar `bipfix.ee`, `bipfix.it` e `bipfix.pt` (cerca de €10–30 por ano cada).
3. Idiomas por mercado:
   - proposta: Estônia et/ru/en, Itália it, Portugal pt, Brasil pt;
   - "outros países" em inglês, como a Norwegian, ou sem essa opção.
4. Marca no Brasil (`bipfix.com.br` de outra empresa): consultar o INPI.

## 8. Enquanto não decide
- **Não** pedir mais indexação no Google/Bing para `/pt-br`, `/it` etc. Se a estrutura mudar, os pedidos devem ser feitos nos endereços novos, logo depois da mudança.
- Depois da mudança: `npm run indexnow` (Bing/Yandex) com os endereços novos e pedidos de indexação no Google/Bing/Yandex.
