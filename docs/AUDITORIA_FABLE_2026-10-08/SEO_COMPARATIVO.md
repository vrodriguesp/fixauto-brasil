# Auditoria SEO comparativa — BipFix vs. marketplaces de reparo automotivo

Data: 09/10/2026. Somente leitura (curl com user-agent de navegador contra os sites, HTML do servidor; nenhum arquivo do projeto alterado além deste relatório). Complementa `SEO_ESTONIA.md` (08/10) e o `PROGRESSO_2026-10-08.md` — o que já foi feito lá (raiz `/` como página 200 de escolha de idioma com x-default `/`, sitemap limpo, home linkando guias, guias com "Leia também", 4 guias novos et/ru) é tomado como ponto de partida e **não** é repetido como achado.

Pergunta do dono: *"auditar melhor se estamos seguindo os sites importantes com o nosso mesmo caso de uso"*.

> Auditoria concluída em 09/10/2026 (todas as seções preenchidas).

## 0. Resumo executivo

1. **Base técnica: estamos no nível dos líderes ou acima** (hreflang/canonical/lang em 6 idiomas, FAQ/Article/Breadcrumb nos guias, sitemap limpo, raiz 200 sem redirecionamento, sem cloaking, 404 correto). ClickMechanic não tem `<html lang>`, GetaPro tem `lang` errado, ProntoPro serve `lang="tr"` numa página italiana, Sua Oficina Online não tem `<title>`. Nada técnico nosso justifica os 0 cliques.
2. **O que os líderes têm e nós não é oferta e tipo de página**: todos (Fixter, ClickMechanic, WhoCanFixMyCar, Vroomly, Autobutler) vivem de três páginas — *serviço* (com preço e FAQ), *cidade* (lista de oficinas em `ItemList`/`LocalBusiness`) e *perfil de oficina* (com avaliações). Nós temos guias (desde 09/10) e o código dos perfis, mas **zero oficinas**, logo sem cidade, sem perfil, sem avaliação, sem prova social. Os concorrentes estonianos que também não listam oficinas (FixAuto.ee, Carson.ee) não aparecem para nada além do próprio nome — é o nosso cenário se nada mudar.
3. **Vantagem que ninguém na Estônia explora: russo.** Nenhum concorrente direto (FixAuto.ee, Carson, Tegi) tem versão ru; só o generalista GetaPro. Nossa cauda longa ru é campo aberto no Yandex e no Google.
4. **Ninguém indexa página de cidade vazia** — nosso `noindex` em `/et/tookojad` está certo. O que fazem diferente (Vroomly): a página de cidade sempre tem FAQ de preço + oficinas num raio; quando ativarmos a listagem, ela deve nascer com texto, não só lista.
5. **Antes do re-rastreamento há só 3 ajustes de minutos** (H1 de `/ru` e `/en` com Tallinn; 1 frase por idioma na raiz; título do 404) — o resto é trabalho de semanas e não deve segurar o pedido. O estado atual do servidor já não desperdiça o rastreamento.
6. **Itália/Brasil**: `/it` hoje é "Tallinn em italiano". idGarages mostra o padrão (locale = país+idioma). Antes de abrir a Itália, decidir se `it` é Itália ou italianos na Estônia; não pode ser os dois na mesma URL.

Top 10 lacunas (detalhe em 4.3): G1 oferta zero (dono) · G2 páginas de serviço (`/teenused`, `/uslugi`) · G3 prova social real + Trustpilot + OÜ (dono) · G4 H1 ru/en sem Tallinn (1 linha) · G5 home curta sem seção de serviços · G6 Breadcrumb/ItemList fora dos guias · G7 listagem de cidade com texto de preço ao sair do noindex · G8 preço no título do guia de preços · G9 `sameAs`/`address` + perfis sociais (dono) · G10 decisão `it` = Itália ou Estônia.

## 1. Sites comparáveis verificados

Critério: marketplace/plataforma onde o motorista pede orçamento ou reserva reparo em oficinas de terceiros (o mesmo caso de uso do BipFix). Todos verificados em 09/10/2026 com `curl` (UA de Chrome) ou, quando o curl falhou no sandbox, com leitura da página renderizada.

| # | Site | País / idioma | Tipo | Acesso | Relevância para nós |
|---|---|---|---|---|---|
| 1 | **Fixter** (fixter.co.uk, fixter.fr) | UK, FR | reserva + coleta/entrega; marketplace de oficinas | 200 | páginas de cidade com 26–50 `LocalBusiness` + reviews; páginas de serviço com `Service` + FAQ |
| 2 | **ClickMechanic** (clickmechanic.com) | UK | marketplace mecânicos móveis + oficinas | 200 | `/jobs/<serviço>`, `/locations/<cidade>`, `/price-estimates/` (guias de preço) |
| 3 | **WhoCanFixMyCar / FixMyCar** (whocanfixmycar.com) | UK | marketplace de orçamentos (15.200 oficinas) | 200 | 17 sitemaps: serviços × cidades, marcas × serviços, perfis de oficina, advice |
| 4 | **Vroomly** (vroomly.com) | FR (+ES) | comparador de orçamentos + reserva | 200 | `/garage-<cidade>/` para **toda** cidade, hub `/villes/`, FAQ por cidade, `City` + `Service` schema |
| 5 | **idGarages** (idgarages.com) | FR, BE | comparador + reserva | 200 | reviews no schema da home (`Review`, `AggregateRating`), locales `fr-fr`/`fr-be`/`nl-be` |
| 6 | **Autobutler** (autobutler.dk; .co.uk/.de atrás de Cloudflare 403) | DK, UK, DE, SE, NO | marketplace de orçamentos (pioneiro europeu) | 200 (dk) | `/opgaver/<serviço>` com `Product` + `AggregateRating` + "spar 52 %" |
| 7 | **ProntoPro** (prontopro.it) | IT | marketplace generalista com categoria "meccanico" | 200 | `/meccanico` com 2 FAQPage + 16 Review; `/vicino-a-me/<cidade>` **thin** (454 palavras, sem title) |
| 8 | **CercaOfficina** (cercaofficina.it) | IT | comparador de preventivos de oficinas | 200 na home (listagens atrás de Cloudflare) | 6 `Service` na home; `/officine/<categoria>` |
| 9 | **Carrozzeria24** (carrozzeria24.it) | IT | comparador de orçamentos de funilaria | 200 | WordPress; `Article` na home, sem H1 |
| 10 | **GetaPro** (getapro.ee, /ru) | EE (et + ru) | marketplace generalista de serviços, inclui autoremont | 200 | mesma estrutura de idiomas que a nossa (`/ru`), `LocalBusiness`+`Service`, hinnad por categoria |
| 11 | **Tegi.ee** (tegi.ee/t/autoremonditookoda) | EE | pedidos de orçamento generalista; categoria autoremonditöökoda com 10 oficinas, notas, FAQ | 200 (render) | concorrente direto estoniano com oferta real |
| 12 | **FixAuto.ee** (fixauto.ee) | EE (só et) | comparador de orçamentos de manutenção/reparo | render | **concorrente direto, nome quase igual ao do nosso repositório**; sem ru, sem oficinas listadas, sem preços |
| 13 | **Carson** (carson.ee) | EE (só et) | "võta pakkumisi mitmelt töökojalt korraga", só Tallinn | 200 | 818 palavras, 15 links, sem schema, sem ru — concorrente direto, mas fraco em SEO |
| 14 | **Sua Oficina Online** (suaoficinaonline.com.br) | BR | comparador de orçamentos de oficinas | 200 | home **sem `<title>` e sem H1** no servidor; `/orcamento/` |
| 15 | **BateClick** (bateclick.com.br) | BR | app de orçamentos pós-batida | 200 | sem schema, sem canonical |
| — | RepairPal, Openbay (US) | US | referência de "fair price estimate" | 403 Cloudflare / 301 para app | só como referência de padrão (estimador de preço + oficinas certificadas) |

Não existem (DNS/timeout em 09/10): autoabi.ee, mycarservice.ee, autoteenindus.ee, autobutler.it, trovofficina.it (404), oficinabrasil.com.br, mecanicaonline.com.br.

## 2. O que cada um faz (HTML do servidor)

### 2.1 Raiz, idiomas e países

| Site | Raiz `/` | Idiomas/países | x-default | Observação |
|---|---|---|---|---|
| Fixter | 200 (UK em `.co.uk`, FR em `.fr`) | um domínio por país; hreflang `en`/`fr` entre eles | não declara | sem redirecionamento por idioma |
| ClickMechanic | `clickmechanic.com` → 301 `www` | só UK | — | sem `<html lang>` (!) |
| WhoCanFixMyCar | 200 | só UK | — | — |
| Vroomly | 200, `Vary: Accept-Language, Cookie`, `Content-Language: fr` | hreflang `fr`, `es`, **`x-default`** (ES em domínio separado) | declarado | só o cabeçalho varia; **não redireciona** |
| idGarages | 200 em `/` = fr-FR | `/` = fr-FR, `/fr-be`, `/nl-be` (subpastas por **país+idioma**) | não declara | `robots` bloqueia combinações erradas (`/fr-fr/nl-*`) |
| Autobutler | `autobutler.dk` → 301 `www` | um ccTLD por país (dk/co.uk/de/se/no) | — | sem hreflang entre países |
| ProntoPro | `www` → 308 sem `www` | só IT (`it-IT`) | — | `/meccanico` sai com `lang="tr"` (erro deles) |
| GetaPro | 200 | `/` = et, `/ru` = ru (**igual ao nosso modelo**) | não declara | `<html lang="en">` nas duas (erro deles); títulos e H1 traduzidos |
| FixAuto.ee / Carson.ee / Tegi.ee | 200 | só et | — | **nenhum concorrente estoniano direto tem versão russa** |
| Sua Oficina Online / BateClick | 200 | só pt-BR | — | — |

Leitura: ninguém grande redireciona a raiz por idioma; os que têm vários idiomas no mesmo domínio (idGarages, GetaPro, Vroomly) servem 200 na raiz com o idioma principal e linkam os outros. O nosso `/` como página de escolha (padrão IKEA/Wise, decidido em 09/10) é mais conservador que todos eles e igualmente válido; a única diferença prática é que **a raiz deles tem conteúdo rankeável** (é a home do idioma principal) e a nossa não (6 links, 0 palavras). Isso é aceitável porque `/et` e `/ru` são as homes reais — desde que o Google trate `/` como x-default e não como "home vazia". Ver 4.2.

### 2.2 Estrutura das "páginas de dinheiro"

| Site | Serviço | Cidade | Serviço × cidade | Perfil de oficina | Preço | Marca de carro |
|---|---|---|---|---|---|---|
| Fixter | `/brake-pads-replacement` (`Service` + `FAQPage` 14 Q + `BreadcrumbList`, 2.600 palavras) | `/mechanic-garage/london` (`ItemList` de 50 `LocalBusiness` com `AggregateRating`, `GeoCoordinates`, `Review`) | não | `/garage/<slug>` (`LocalBusiness` + reviews) | dentro da página de serviço | não |
| ClickMechanic | `/jobs/brake-pads-replacement` (18 FAQ, 11.700 palavras, 587 links) | `/locations/london`, `/locations/swansea` (6.800–8.500 palavras, FAQ "car repairs in London", `BreadcrumbList`) | **sim**: a página de cidade linka serviço×cidade | `/mechanics/<slug>` | **hub `/price-estimates/`** + `/price-estimates/<sistema>` | sim (`/car-makes/`) |
| WhoCanFixMyCar | `/mot`, `/car-diagnostics/` (FAQ 9 Q, "from £29.99") | `/services/<cidade>` (sitemap `xml-locations`) | **`/services/<serviço>/<cidade>` aos milhares (sitemaps `xml-services-locations` 1 e 2)** | `sitemap/garage.xml` | "Average drivers save £112" | `/services/bmw` ("2.304 specialist garages", `BreadcrumbList`, FAQ) + marcas×serviços + marcas×cidades |
| Vroomly | `/intervention/<serviço>` (59 links na página de cidade) | `/garage-<cidade>/` **para qualquer cidade** (Lyon e Lannion têm a mesma estrutura: `City` + `Service` + `FAQPage` 6 Q "Quels sont les prix des garages à Lannion ?", 50 links de oficinas próximas) + hub `/villes/` + `/region/<região>` | sim | `/garages/<slug>` | FAQ de preço por cidade | `/vehicules/<marca>` |
| Autobutler.dk | `/opgaver/olieskift` (`Product` + `AggregateRating` + "fra kun 695 kr", "spar 52 %", 6.500 palavras) | sitemap `areas.xml` + `seo_pages.xml` (7 arquivos, serviço×área) + `mechanics.xml` (perfis) + `entity_hubs.xml` | sim (`seo_pages`) | via `/jobs/new` | **preço mínimo no título** | "Populære bilmærker" |
| ProntoPro | `/meccanico` (2 `FAQPage`, 16 `Review`, `Product`+`AggregateRating`) | `/vicino-a-me/<cidade>-<id>` (thin: 454 palavras, **sem `<title>`**) | `/<serviço>/<cidade>` (não verificado) | sim | "preventivo gratuito" | não |
| CercaOfficina | `/officine/<categoria>` | `/officine/<categoria>/<cidade>` (atrás de Cloudflare) | sim | sim | — | — |
| GetaPro | `/category/<slug>` (hinnad por categoria via `/landing/getaverageprices`) | título "Tallinnas ja Eestis" | não | `/tradesman/<slug>` | preço médio por categoria | não |
| Tegi.ee | `/t/autoremonditookoda` (10 oficinas com nota, cidade, especialidade, 6 FAQ) | não | não | sim (perfil com nota) | FAQ "mis mõjutab hinda" | não |
| FixAuto.ee / Carson.ee | lista de serviços em texto na home, sem páginas próprias | lista de regiões em texto, sem páginas | não | não | não | não |

Leitura: o padrão dos líderes (Fixter, ClickMechanic, WCFMC, Vroomly, Autobutler) é **uma página por serviço com FAQ e preço no HTML + uma página por cidade com oficinas listadas em `ItemList`/`LocalBusiness` + perfil de oficina**. Os pequenos (FixAuto.ee, Carson, Sua Oficina Online) só têm a home — e é por isso que não aparecem para nada além do nome. O BipFix hoje está entre os dois: tem guias de serviço/preço (desde 09/10), mas não tem página de cidade nem perfis (porque não há oficinas).

### 2.3 Como tratam cidade sem oferta

- **Vroomly**: indexa toda cidade francesa (`/garage-lannion/` tem a mesma profundidade que Lyon: FAQ de preço, oficinas das redondezas, links para 59 serviços). Quando não há oficina na cidade, lista as "près de chez vous" (raio). Nunca devolve página vazia.
- **ClickMechanic**: `/locations/swansea` (cidade pequena) com 6.800 palavras, mesma estrutura de Londres (mecânicos móveis cobrem qualquer lugar).
- **Fixter**: Swansea tem 26 `LocalBusiness` vs 50 em Londres — só gera página quando tem oficinas. `/mechanic-garage/<cidade>` existe para as cidades da rede.
- **ProntoPro**: `/vicino-a-me/<cidade>` existe para toda província, mas é thin (sem title, 454 palavras) — exemplo do que **não** copiar.
- **WCFMC**: 404 real (`noindex`, `canonical` → `/404`) para combinações inexistentes.
- **Autobutler.dk**: 404 com `noindex, nofollow` e sem title para rotas que não existem.

Conclusão: ninguém indexa página de cidade **vazia**; ou ela tem oferta por raio (Vroomly/ClickMechanic) ou não existe. O nosso `noindex` em `/et/tookojad` enquanto está vazio está alinhado. A alternativa que eles usam e nós não: página de cidade com **conteúdo de preço/FAQ independente da oferta** (Vroomly) — é o que os nossos guias `autoremondi-hinnad-tallinnas` já fazem; falta só que, quando houver oficinas, a listagem herde esse texto.

### 2.4 Elementos on-page que se repetem em todos os líderes

| Elemento | Fixter | ClickMechanic | WCFMC | Vroomly | Autobutler | BipFix |
|---|---|---|---|---|---|---|
| Título "serviço + cidade/benefício + marca" | sim | sim | sim ("Compare MOT quotes and garages online") | sim ("Meilleurs Garages à Lyon : Devis Réparation Auto") | sim (com preço "Fra kun 695 kr") | sim nas homes e guias |
| H1 com a cidade | sim | sim | não (postcode) | sim | — | `/et` sim; `/ru` **não** ("Ремонт автомобиля без сюрпризов") |
| `BreadcrumbList` em páginas internas | sim | sim | sim | sim | sim | guias sim; `tookodadele`, `meist`, `abi` **não** |
| `FAQPage` em serviço/cidade | sim | sim | sim | sim | não | homes e guias sim |
| `Service`/`Product` na página de serviço | `Service` | não | não | `Service` | `Product`+`AggregateRating` | `Article` (guia) — ver 4.3 |
| `LocalBusiness`/`AutoRepair` em lista e perfil | sim (50/página) | não (só breadcrumb) | sim (garage sitemap) | `AutomotiveBusiness` (org) | `AutomotiveBusiness` (org) | pronto no código (`lib/seo-utils.ts`), sem dado |
| `AggregateRating`/`Review` | sim | não | `Person`/`VideoObject` depoimentos | sim (org) | sim (org + produto) | não (sem avaliações reais — correto não inventar) |
| Prova social numérica no HTML | "As featured in" | "save up to 47 %" | "15.200 rated garages", "save £112" | "x avis", Trustpilot | "Over 1 mio. tilfredse bilejere" | "Esimesed partnertöökojad on tulekul" (honesto, mas zero prova) |
| `/review/<domínio>` Trustpilot linkado | — | — | sim | sim | sim | não |
| Blog/guias linkados da home | sim (`/blog/`) | sim (price-estimates) | sim ("Related guides", `/advice/`) | sim (`/blog/`) | não | **sim (desde 09/10)** |
| Tamanho da home (palavras no servidor) | ~1.800–2.700 | 3.700 | 2.700 | 18.000 (!) | 3.900 | ~700 (et) |
| `Cache-Control` público | `no-store` | — | `private, no-store` | — | — | `private, no-store` (igual ao Fixter/WCFMC — não é problema) |

## 3. BipFix hoje (HTML do servidor, 09/10)

| URL | Código | Título | Robots | Schema | Notas |
|---|---|---|---|---|---|
| `/` | **200**, 14 KB, `Content-Language: et, ru, en`, `lang="en"` | `BipFix — Autoremont · Ремонт авто · Car repair quotes` | index | nenhum | H1 "BipFix"; 6 links (`/et`,`/ru`,`/en`,`/pt-br`,`/pt-pt`,`/it`); x-default = `https://bipfix.com`; canonical `https://bipfix.com` (sem barra) e sitemap `https://bipfix.com/` (com barra) — equivalente para raiz, ok |
| `/et` | 200, 113 KB | `Autoremont Tallinnas: võrdle hinnapakkumisi \| BipFix` | index (sem meta) | Organization, WebSite, FAQPage (9) | H1 com Tallinn; 42 links; linka os 6 guias et; H2: Kuidas toimib / Töökodadele / Miks / Asutajapartner / Juhendid / KKK |
| `/ru` | 200, 155 KB | `Ремонт авто в Таллинне: сравните сметы автосервисов \| BipFix` | index | idem | **H1 sem "Таллинн"** |
| `/en` | 200 | `Car Repair Quotes in Tallinn – Compare Garages \| BipFix` | index | idem | H1 "Car repairs, no surprises." (sem Tallinn) |
| `/it` | 200 | `Riparazione auto a Tallinn: confronta i preventivi \| BipFix` | index | idem | conteúdo "per chi vive in Estonia" — **não serve para o mercado Itália** (ver 4.6) |
| `/pt-br` | 200 | `Orçamentos de oficina mecânica: compare e agende \| BipFix` | index | idem | sem cidade (Brasil inteiro) |
| `/et/tookodadele` | 200 | `Autotöökoja Haldustarkvara ja Rohkem Kliente \| BipFix` | index | SoftwareApplication + Offer + FAQPage (5) | sem BreadcrumbList |
| `/et/juhendid` | 200 | `Juhendid autojuhtidele \| BipFix` | index | só Organization/WebSite | 7 guias; sem `ItemList`/`CollectionPage` |
| `/et/juhendid/talverehvid-eestis` | 200 | `Talverehvid kohustuslikud 2026/27: … \| BipFix` | index | Article + BreadcrumbList + FAQPage (8) | hreflang só en/et/ru (correto: só onde existe) |
| `/et/juhendid/autoremondi-hinnad-tallinnas` | 200 | `Autoremondi hinnad Tallinnas 2026: … \| BipFix` | index | Article + BreadcrumbList + FAQPage (7) | linka 5 guias irmãos + `/et/registreeru?tipo=cliente` |
| `/ru/stati/zimnie-shiny-v-estonii` | 200 | `Зимняя резина в Эстонии 2026/27: … \| BipFix` | index | idem | ok |
| `/et/tookojad` | 200 | `Partnerautoremonditöökojad \| BipFix` | **noindex, follow** | — | vazio; fora do sitemap (correto) |
| `/et/meist`, `/et/abi/*` | 200 | próprios | index | só Organization/WebSite | sem BreadcrumbList |
| `/et/nao-existe` | **404** | `BipFix - Ühendame sind parima autotöökojaga \| BipFix` | noindex | — | título do 404 ainda com marca duplicada (herdado do layout); irrelevante para indexação, só estética |
| `/et/` | 308 → `/et` | | | | ok |
| `/pt` | 301 → `/pt-br` | | | | ok |
| `http://`, `www` | 301 → `https://bipfix.com/` | | | | ok |
| `/robots.txt` | 200 | | | | `Disallow` só de áreas logadas/API; `Sitemap:` declarado; 22 UAs de IA com as mesmas regras |
| `/sitemap.xml` | 200, **88 URLs** | | | | `/` + 6 idiomas × 12 páginas estáticas + 7 guias × (et, ru, en…) ; **zero 404, zero noindex** (contaminação de 08/10 resolvida); `lastmod` reais |
| UA Bingbot vs Chrome em `/et` | mesmos 114.882 bytes | | | | sem cloaking; sem `X-Robots-Tag` |

## 4. Comparação: o que já igualamos, o que fazemos diferente, lacunas

### 4.1 O que já igualamos (ou fazemos melhor)

| Item | Quem faz | BipFix |
|---|---|---|
| `<html lang>`, canonical absoluto, hreflang completo e recíproco | Vroomly (parcial), idGarages; ClickMechanic **não tem lang**, GetaPro tem `lang` errado | **melhor que a média**: 6 idiomas + x-default, `Content-Language` por resposta |
| Raiz sem redirecionamento automático por idioma | todos os grandes (200 na raiz) | sim, desde 09/10 (página de escolha; ver 4.2) |
| `FAQPage` nas homes e páginas de conteúdo | Fixter, ClickMechanic, WCFMC, Vroomly, ProntoPro | sim (9 Q nas homes, 7–8 nos guias) |
| `Article` + `BreadcrumbList` nos guias | WCFMC `/advice/`, Vroomly `/blog/`, ClickMechanic `/price-estimates/` | sim |
| Guias/preços linkados da home e entre si | todos | sim desde 09/10 (6 guias et/ru na home; "Loe ka" nos guias) |
| Ano no título de conteúdo sazonal | abcabi.ee, rehvitakso (concorrentes de busca) | sim desde 09/10 (2026/27, 2026) |
| Sitemap limpo, `lastmod` real, sem 404/noindex | WCFMC (17 sitemaps por tipo) | sim (88 URLs, zero lixo; revalida em 10 min) |
| Listagem vazia com `noindex, follow` e fora do sitemap; 404 real com `noindex` | WCFMC, Autobutler | sim |
| robots.txt só bloqueando áreas logadas/API; nada de `Disallow: /` acidental | todos | sim (+ regras explícitas para 22 bots de IA) |
| Sem cloaking / mesma resposta para bot e navegador | — | verificado (Bingbot = Chrome, byte a byte) |
| `llms.txt` | nenhum dos comparados | sim (200) |
| Versão russa no mercado estoniano | **nenhum concorrente direto estoniano** (FixAuto.ee, Carson, Tegi são só et; GetaPro tem `/ru`) | sim — é a nossa vantagem mais clara no mercado; o Yandex já indexa `/ru/*` |

### 4.2 O que fazemos diferente — e se é um problema

| Diferença | Eles | Nós | Veredito |
|---|---|---|---|
| Raiz `/` é página de escolha de idioma com 0 palavras | raiz = home do idioma principal (idGarages fr-FR, GetaPro et, Vroomly fr) | `/` com H1 "BipFix" e 6 links | **Aceitável** (padrão IKEA/Wise, e o Google diz que x-default foi feito para isso). Risco pequeno: o Bing/Yandex podem classificar `/` como "thin". Mitigação barata: 1–2 frases por idioma sob cada link (o IKEA tem texto na raiz). Não bloqueia o re-rastreamento. |
| Idiomas como subpastas no mesmo domínio | ccTLD por país (Fixter, Autobutler) ou subpasta país+idioma (idGarages `fr-be`) | `/et`, `/ru`, `/en`, `/it`, `/pt-br`, `/pt-pt` (idioma, não país) | **Fine para a Estônia** (et+ru = um país). **Problema para Itália e Brasil** (ver 4.6): `/it` hoje fala de Tallinn; quando a Itália for mercado, `it` precisa ser `it-IT` com conteúdo italiano, e a Estônia-em-italiano some ou vira `it-EE`. É a mesma lição "idioma ≠ país" já registrada em memória. |
| Sem `AggregateRating`/`Review` | todos mostram | nenhum | **Correto** — sem avaliações reais seria spam de schema; entra sozinho com os perfis (`lib/seo-utils.ts`). |
| Sem página de cidade/bairro | todos têm (Fixter/ClickMechanic/Vroomly indexam qualquer cidade com oferta por raio) | listagem noindex | **Correto enquanto não há oferta** (ninguém indexa página vazia). Diferença real: Vroomly põe FAQ de preço na página de cidade; nós temos isso no guia de preços. Ao ativar a listagem, levar o texto do guia para `/et/tookojad` (4.4 G7). |
| `Cache-Control: private, no-store` nas públicas | Fixter e WCFMC também `no-store`; Vroomly/idGarages público | `no-store` | **Não é problema** (TTFB 0,2 s). |
| Home ~700 palavras | 1.800–18.000 | 700 | **Lacuna** (G6): a home é a página mais linkada e com menos texto. |
| Guia de preços como `Article` | Autobutler `Product`+preço; Fixter/Vroomly `Service` | `Article` + FAQ | **Aceitável**; `Service` com `offers`/`priceRange` só quando tivermos oficina que presta (senão é schema sem entidade). |

### 4.3 Lacunas, por impacto (com arquivo + mudança, ou ação do dono)

| # | Lacuna | Impacto | O que fazer (exato) |
|---|---|---|---|
| **G1** | **Zero oferta: sem oficinas → sem página de cidade, sem perfis, sem avaliações, sem `LocalBusiness`.** Todas as "páginas de dinheiro" dos comparados nascem da oferta; FixAuto.ee e Carson (que também não listam oficinas) não rankeiam para nada. | Alto | **Dono**: 10–20 oficinas em Tallinn por contato direto. Código já pronto (`[locale]/oficinas/[id]/page.tsx`, `lib/seo-utils.ts`, sitemap só lista perfis completos com >24 h). Ao ativar a 1ª: conferir título "Nome – autoremont Lasnamäel, Tallinn", `AutoRepair` com `telephone`, `geo`, `openingHoursSpecification`. |
| **G2** | **Sem tipo de página "serviço"** (Fixter `/brake-pads-replacement`, ClickMechanic `/jobs/`, Vroomly `/intervention/`, Autobutler `/opgaver/`): título "serviço + cidade + preço", `Service`/`Product`, FAQ, CTA, oficinas que fazem. Hoje cobrimos só por guias (`Article`). | Alto (é a cauda longa: kereremont, värvimine, rehvivahetus, klaasivahetus, diagnostika, pidurid, vedrustus, õlivahetus, kliima) | **Código**: novo `apps/web/content/servicos/<slug>.json` (mesma forma dos guias: `tituloSeo`, `titulo`, `descricao`, `secoes`, `faq`, `atualizado`, + `precoDe`, `precoAte`, `moeda`, `fonte`); rota `src/app/[locale]/servicos/[slug]/page.tsx` copiando `guias/[slug]/page.tsx`; entrada em `PATHNAMES` (`src/i18n/routing.ts`): `'/servicos': { et: '/teenused', ru: '/uslugi', en: '/services', it: '/servizi', 'pt-PT': '/servicos', pt: '/servicos' }` e `'/servicos/[slug]'`; schema `Service` (`serviceType`, `areaServed: Tallinn`, `provider: Organization`) + `FAQPage` + `BreadcrumbList` em `components/seo/StructuredData.tsx`; incluir em `app/sitemap.ts` (bloco igual ao dos guias) e no `llms.txt`; bloco "Teenused" na home (`HomeClient.tsx`) linkando os 8–10 serviços. Atalho aceitável se não houver tempo: converter os guias de preço existentes (`car-repair-prices-tallinn.json`) em hub com âncoras e manter `Article`. |
| **G3** | **Nenhuma prova social numérica no HTML** (WCFMC "15.200 garages", Autobutler "1 mio. bilejere", Fixter "As featured in", Trustpilot `/review/<domínio>` em WCFMC/Vroomly/Autobutler). Nós: "Esimesed partnertöökojad on tulekul". | Alto para conversão, médio para SEO (E-E-A-T) | **Dono**: abrir perfil Trustpilot (gratuito) e Google-reviews da marca quando houver 1º serviço; OÜ + registrikood + endereço + telefone em `/et/meist` e no `Organization` (`src/app/[locale]/layout.tsx` linha ~102: `sameAs`, `address`, `telephone`). **Nunca inventar número.** Enquanto isso, mostrar fatos reais: nº de guias, "asutatud 2026, Tallinn", fontes oficiais citadas. |
| **G4** | `/ru` H1 sem cidade ("Ремонт автомобиля без сюрпризов"); `/en` idem. Todos os comparados põem a cidade no H1 das páginas locais. | Médio, custo 1 linha | `apps/web/messages/ru.json` linha 282: `"heroTitulo": "Ремонт автомобиля в Таллинне,"`; `messages/en.json` chave `home.heroTitulo` → "Car repairs in Tallinn,". Fazer **antes** do re-rastreamento de `/ru`. |
| **G5** | Home curta (700 palavras) e **sem seção de serviços** com links (A5 do relatório de 08/10 continua pendente). Fixter/ClickMechanic/Autobutler abrem a home com "Our most popular services" (10–20 links). | Médio | `src/app/[locale]/HomeClient.tsx`: seção "Teenused, mille jaoks saad hinnapakkumisi küsida" (8–10 cards) linkando para G2 (ou, até lá, para o guia de preços com âncora `#pidurid` etc.); textos em `messages/et.json`/`ru.json` namespace `home`. Faixas de preço de referência com fonte e data (já existem no guia; repetir 3–4 na home). |
| **G6** | `BreadcrumbList` só nos guias; falta em `/et/tookodadele`, `/et/hakka-partneriks`, `/et/meist`, `/et/abi/*`, `/et/juhendid` (índice sem `ItemList`/`CollectionPage`). Fixter/ClickMechanic/Vroomly têm breadcrumb em toda página interna. | Baixo-médio (rich result + hierarquia) | Reutilizar o componente de `guias/[slug]/page.tsx` (`components/seo/StructuredData.tsx`) em `para-oficinas/page.tsx`, `seja-parceiro/page.tsx`, `sobre/page.tsx`, `docs/layout.tsx`; em `guias/page.tsx` emitir `CollectionPage` + `ItemList` dos guias. |
| **G7** | Padrão Vroomly: página de cidade **sempre** com FAQ de preço + "oficinas próximas". Quando `/et/tookojad` sair do noindex, não pode ser só uma lista. | Médio (futuro próximo) | `src/app/[locale]/oficinas/page.tsx`: ao haver ≥1 oficina na cidade, renderizar no servidor: intro de 150–250 palavras, 3–4 faixas de preço do guia (`content/guias/car-repair-prices-tallinn.json`), FAQ (4–6) com `FAQPage`, `ItemList` de `AutoRepair`, links para serviços/guias; título "Autoremonditöökojad Tallinnas: võrdle hinnapakkumisi \| BipFix". Bairros (Lasnamäe, Mustamäe…) só com oficina no bairro. |
| **G8** | Preço no título (Autobutler "Fra kun 695 kr*", WCFMC "from £29.99"). Nosso guia de preços tem título sem número. | Baixo-médio (CTR) | `content/guias/car-repair-prices-tallinn.json` → `tituloSeo` et: "Autoremondi hinnad Tallinnas 2026: töötund 36–60 €, õlivahetus, pidurid, vedrustus"; ru equivalente. Só com faixa já citada e com fonte no corpo. Atualizar `atualizado`. |
| **G9** | `Organization` sem `sameAs`, `address`, `telephone`; nenhum perfil social (todos os comparados linkam FB/IG/LinkedIn e Trustpilot no rodapé). | Médio para marca/entidade | **Dono**: criar páginas (FB, IG, LinkedIn) e OÜ; **código** depois: `src/app/[locale]/layout.tsx` (~linha 87–102) e `components/layout/SiteFooter.tsx`. |
| **G10** | **Mercado Itália**: `/it` hoje = "Riparazione auto a Tallinn… per chi vive in Estonia". idGarages mostra o padrão certo (locale = país+idioma: `fr-fr`, `fr-be`, `nl-be`). | Alto quando a Itália abrir; zero hoje | **Decisão do dono** antes de qualquer código: `it` = Itália (então hreflang `it-IT`, home italiana com cidades italianas, guias italianos, oficinas italianas) ou `it` = italianos na Estônia (manter). Não dá para ser os dois na mesma URL. Mesmo raciocínio para `pt-br` (já é país) e `pt-pt`. |
| **G11** | Título da página 404 "BipFix - Ühendame sind parima autotöökojaga \| BipFix" (marca duplicada: `meta.title` + template). | Baixo (noindex, só estética) | `apps/web/messages/*.json` chave `meta.title` sem "BipFix - " (o template já acrescenta) **ou** `generateMetadata` próprio em `src/app/[locale]/not-found.tsx` com título "Lehte ei leitud". |
| **G12** | Canonical servido da raiz `https://bipfix.com` (sem barra) vs sitemap e 301s `https://bipfix.com/`. O código já escreve `${SITE}/` (`src/app/page.tsx` l.27); é o Next (`trailingSlash: false`) que normaliza. | Cosmético — raiz com/sem barra é a mesma URL para Google, Bing e Yandex. | Nada a fazer; registrado só para ninguém "corrigir" o sitemap achando que está errado. |

### 4.4 Oportunidade que os concorrentes estonianos deixam aberta

- FixAuto.ee, Carson.ee e Tegi.ee: só estoniano, sem páginas de serviço, sem preços, sem schema (Carson: 15 links, 0 JSON-LD). GetaPro é generalista (categoria "transpordi-remont").
- Nenhum deles tem conteúdo russo. ~1/3 de Tallinn é russófona e usa Yandex + Google em russo: a cauda longa ru (`шиномонтаж Таллинн цена`, `кузовной ремонт Таллинн`, `автосервис Ласнамяэ`) está praticamente sem marketplace concorrendo. Priorizar G2 em **ru e et ao mesmo tempo** (já é a regra dos guias).
- Nome "FixAuto" (fixauto.ee) é concorrente real e tem nome quase igual ao do repositório — cuidado para não usar "FixAuto" em nenhum texto público, OG ou título (verificado: hoje só aparece o nome BipFix no HTML).

## 5. Antes de pedir re-rastreamento: o que corrigir primeiro

**Veredito: o estado do servidor hoje está limpo — o re-rastreamento não seria desperdiçado.** Confirmado em 09/10: `/` 200 com x-default correto; `www`/`http` 301; 88 URLs no sitemap, nenhuma 404/noindex; hreflang recíproco; 404 real com `noindex`; sem cloaking (Bingbot = Chrome); títulos com ano nos guias; home linkando guias.

Fazer **no mesmo deploy, antes de clicar** (todas de minutos, e mudam exatamente o que o robô vai ler nas URLs que vamos pedir):

1. **G4** — H1 de `/ru` e `/en` com "Таллинн"/"Tallinn" (`messages/ru.json` l.282, `messages/en.json` `home.heroTitulo`). Vamos pedir re-rastreamento de `/ru`; que ele já leia o H1 certo.
2. ~~G12~~ — verificado no código: é normalização do Next; nada a corrigir.
3. **Raiz com texto** (4.2, 1ª linha) — uma frase sob cada link em `src/app/page.tsx` (et: "Autoremondi hinnapakkumised Tallinnas", ru: "Сметы автосервисов Таллинна", en: "Car repair quotes in Tallinn" …) para a página não ser 0 palavras quando o Bing/Yandex a reavaliarem. 10 minutos.
4. **G11** — tirar "BipFix - " de `meta.title` (ou dar título próprio ao 404). Opcional, mas é o único título "sujo" que sobra no site.
5. Depois do deploy: `cd apps/web && npm run indexnow` (envia as 88 URLs ao Bing e Yandex de uma vez — `scripts/indexnow.mjs`). Só então ir aos painéis.

**Não** segurar o re-rastreamento por G1–G3, G5–G10: são semanas de trabalho/decisão; pedir de novo quando cada lote sair (sitemap reenviado + IndexNow + Inspeção das URLs novas).

Bing — "Blocked — URL cannot appear on Bing" em `/et` e `/en` (08/10): não encontrei causa técnica atual (sem cloaking, sem `X-Robots-Tag`, sem noindex, robots ok, sem UA diferente). Hipóteses mais prováveis: (a) o 307 por `Accept-Language` que existia até 09/10 (o Bing trata redirecionamento variável por visitante como sinal de doorway/cloaking) e (b) 6 homes quase iguais em 6 idiomas num domínio de 2 semanas sem links. Ambas já atacadas (raiz 200; conteúdo et/ru). Sequência no Bing Webmaster Tools: *Site Scan* → *URL Inspection* de `/et` e `/en` (mostra o motivo e tem "Request indexing") → se continuar "blocked" após 7 dias, *Support → Report a problem* com o print do URL Inspection.

Painéis (dono), uma vez:
- GSC: criar **propriedade de Domínio** (TXT no DNS) — cobre `www` e `http`; reenviar `sitemap.xml`.
- Yandex Webmaster: *Региональность* = Tallinn/Eesti; *Главное зеркало* = `https://bipfix.com`; reenviar sitemap; Clean-param `utm_*&tipo&servico` (opcional).
- Bing: reenviar sitemap; confirmar a chave IndexNow aceita (HTTP 200 no `npm run indexnow`).

## 6. URLs para enviar em cada buscador (prioridade)

Critério: primeiro o que mudou de estado (raiz) e o que já tem impressões (pneus), depois os guias novos de 09/10 (ru antes de et no Yandex; et antes de ru no Google), depois homes secundárias e páginas de oficina. Páginas legais, `abi/*`, `it`, `pt-pt`, `pt-br` **não** entram (o sitemap cuida; não gastar cota).

### 6.1 Google — Search Console → Inspeção de URL → "Solicitar indexação" (cota ≈ 10–12/dia por propriedade)

**Dia 1**
1. `https://bipfix.com/`
2. `https://bipfix.com/et`
3. `https://bipfix.com/ru`
4. `https://bipfix.com/et/juhendid/talverehvid-eestis`
5. `https://bipfix.com/ru/stati/zimnie-shiny-v-estonii`
6. `https://bipfix.com/et/juhendid/autoremondi-hinnad-tallinnas`
7. `https://bipfix.com/ru/stati/ceny-na-remont-avto-v-talline`
8. `https://bipfix.com/et/juhendid/kuidas-valida-autotookoda-tallinnas`
9. `https://bipfix.com/ru/stati/kak-vybrat-avtoservis-v-talline`
10. `https://bipfix.com/et/juhendid/kasko-ja-liikluskindlustus-remont-parast-avariid`

**Dia 2**
11. `https://bipfix.com/ru/stati/remont-posle-dtp-po-kasko-i-strahovke`
12. `https://bipfix.com/et/juhendid`
13. `https://bipfix.com/ru/stati`
14. `https://bipfix.com/et/juhendid/liiklusonnetus-eestis-mida-teha`
15. `https://bipfix.com/ru/stati/dtp-v-estonii-chto-delat`
16. `https://bipfix.com/et/juhendid/tehnoulevaatus-eestis`
17. `https://bipfix.com/ru/stati/tehosmotr-v-estonii`
18. `https://bipfix.com/et/tookodadele`
19. `https://bipfix.com/ru/dlya-avtoservisov`
20. `https://bipfix.com/en`

**Dia 3 (só se sobrar cota)**
21. `https://bipfix.com/et/juhendid/autoremondi-hinnapakkumiste-vordlemine`
22. `https://bipfix.com/ru/stati/sravnenie-smet-na-remont-avto`
23. `https://bipfix.com/et/hakka-partneriks`
24. `https://bipfix.com/ru/stat-partnerom`
25. `https://bipfix.com/et/meist`
26. `https://bipfix.com/en/guides/winter-tyres-estonia`
27. `https://www.bipfix.com/` (só na propriedade de Domínio — para o Google trocar o canonical antigo)

### 6.2 Bing — Webmaster Tools → URL Submission (cota inicial 10/dia na interface; o IndexNow já cobre as 88)

Ordem: `npm run indexnow` primeiro (todas), depois submeter manualmente na interface, nesta ordem, 10 por dia:
1. `https://bipfix.com/`
2. `https://bipfix.com/et`
3. `https://bipfix.com/en`
4. `https://bipfix.com/ru`
5. `https://bipfix.com/et/juhendid/talverehvid-eestis`
6. `https://bipfix.com/en/guides/winter-tyres-estonia`
7. `https://bipfix.com/et/juhendid/autoremondi-hinnad-tallinnas`
8. `https://bipfix.com/et/juhendid/kuidas-valida-autotookoda-tallinnas`
9. `https://bipfix.com/et/tookodadele`
10. `https://bipfix.com/et/juhendid`
Dia 2: `/ru/stati/zimnie-shiny-v-estonii`, `/ru/stati/ceny-na-remont-avto-v-talline`, `/ru/stati/kak-vybrat-avtoservis-v-talline`, `/et/juhendid/kasko-ja-liikluskindlustus-remont-parast-avariid`, `/ru/stati/remont-posle-dtp-po-kasko-i-strahovke`, `/et/juhendid/liiklusonnetus-eestis-mida-teha`, `/et/juhendid/tehnoulevaatus-eestis`, `/ru/dlya-avtoservisov`, `/et/hakka-partneriks`, `/et/meist`.
Além disso, para `/et` e `/en`: *URL Inspection → Request indexing* (é a tela que mostra o motivo do "Blocked").

### 6.3 Yandex — Webmaster → Индексирование → Переобход страниц (cota ≈ 20/dia; depende do site)

Russo primeiro (é o público do Yandex na Estônia); incluir as URLs antigas em 301 para o Yandex derrubar o snippet português e os slugs antigos de uma vez:
1. `https://bipfix.com/`
2. `https://bipfix.com/ru`
3. `https://bipfix.com/ru/stati/zimnie-shiny-v-estonii`
4. `https://bipfix.com/ru/stati/ceny-na-remont-avto-v-talline`
5. `https://bipfix.com/ru/stati/kak-vybrat-avtoservis-v-talline`
6. `https://bipfix.com/ru/stati/remont-posle-dtp-po-kasko-i-strahovke`
7. `https://bipfix.com/ru/stati/dtp-v-estonii-chto-delat`
8. `https://bipfix.com/ru/stati/tehosmotr-v-estonii`
9. `https://bipfix.com/ru/stati/sravnenie-smet-na-remont-avto`
10. `https://bipfix.com/ru/stati`
11. `https://bipfix.com/ru/dlya-avtoservisov`
12. `https://bipfix.com/et`
13. `https://bipfix.com/et/juhendid/talverehvid-eestis`
14. `https://bipfix.com/et/juhendid/autoremondi-hinnad-tallinnas`
15. `https://bipfix.com/et/juhendid/kuidas-valida-autotookoda-tallinnas`
16. `https://bipfix.com/et/juhendid/tehnoulevaatus-eestis` (estava como "baixo valor"; agora com ano e mais texto)
17. `https://www.bipfix.com/` (301 — para sair do índice de `www`)
18. `https://bipfix.com/ru/privacidade` (301)
19. `https://bipfix.com/et/termos` (301)
20. `https://bipfix.com/et/guias` (301)
Dia 2: `/et/seja-parceiro`, `/ru/para-oficinas`, `/et/docs` (301s antigos), `/et/juhendid`, `/et/tookodadele`, `/et/hakka-partneriks`, `/et/meist`, `/ru/o-nas`, `/en`.

### 6.4 Depois de cada lote de conteúdo novo (G2, G5, G7)
Reenviar `sitemap.xml` nos três + `npm run indexnow` + Inspeção/Переобход só das URLs novas. Não repetir as já indexadas (o Google ignora pedidos repetidos e a cota é pequena).
