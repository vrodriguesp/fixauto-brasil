# Auditoria SEO — Estônia (et/ru): por que o site quase não recebe cliques

Data: 08/10/2026. Auditoria somente de leitura (curl contra https://bipfix.com, código em `apps/web`, Search Console e Yandex Webmaster relatados pelo dono, pesquisas no Google). Nenhum código foi alterado. Onde escrevo "hipótese", não consegui confirmar com dado direto.

Leitura prévia: `docs/AUDITORIA_COMPLETA_2026-09-30.md` (seções 3, 4 e 8.5) e `docs/PROGRESSO_2026-09-29.md`. As conclusões de lá continuam válidas e **não** são repetidas aqui como achados novos (hreflang, canonical, `<html lang>`, títulos únicos, `www` → 301, x-default = en, robots sem `Host`). Esta auditoria responde a uma pergunta diferente: a base técnica está certa e mesmo assim não há cliques — por quê.

---

## Resumo

1. **A causa dominante não é técnica: é autoridade + conteúdo + oferta.** O domínio tem ~2 semanas nesta forma, zero backlinks encontrados, nenhuma menção externa, nenhuma empresa registrada (a OÜ ainda está em registro), nenhum perfil social, e o banco tem zero oficinas. Google e Yandex tratam um site assim como "ainda não provou valor": rastreiam pouco (26 URLs "descobertas, não indexadas") e posicionam em página 2+ (posição média 12). Isso é o esperado para a idade do domínio, não um defeito.
2. **O site não tem páginas para as buscas que estonianos e russófonos de Tallinn fazem.** As únicas impressões vêm do guia de pneus de inverno (uma busca sazonal informativa). Não existe nenhuma página sobre `kere remont`, `värvimine`, `rehvivahetus`, `autoremondi hinnad Tallinnas`, `автосервис Таллинн цены`, bairros (Lasnamäe, Mustamäe), `kasko remont`, etc. A home fala de "Autoremont Tallinnas" no título e H1, mas o corpo é marketing genérico do produto (709 palavras), sem serviços, preços, bairros ou nomes de oficinas — exatamente o que os concorrentes que rankeiam têm.
3. **Marketplace de dois lados sem o lado da oferta**: `/et/tookojad` está `noindex` (correto, está vazio), não há perfis de oficina (o ativo de SEO local previsto no código), e a página para oficinas promete "perfil indexado no Google" sem exemplo real. Para o motorista, nada rankeável; para a oficina, nada que prove.
4. **Problemas técnicos ativos (poucos, mas reais)**: (a) o `sitemap.xml` servido hoje lista **18 URLs de perfis de oficina de teste que respondem 404** e 6 URLs `?cidade=milano` com `noindex` (dado de teste criado hoje às 19:17 UTC vazou para o sitemap e fica em cache 1 h); (b) a raiz `/` com 307 mantém, no Google e no Yandex, a URL `/` indexada com o **snippet antigo em português do Brasil** ("BipFix - Compare orçamentos de oficina mecânica…"/"Conectando você à melhor oficina mecânica") — quem busca "bipfix" na Estônia vê o Brasil; (c) o Yandex marcou `/et` (a home estoniana) como "página de baixo valor/baixa demanda".
5. **Guia de pneus de inverno sem ano no título** enquanto todos os concorrentes que rankeiam usam "2026/27" no título e H1; as buscas do GSC ("talverehvid kohustuslikud 2022/2026", "с какого числа зимняя резина в эстонии") mostram que o Google já nos associa ao tema, mas na posição 10–15, sem clique.
6. **Expectativa honesta**: para "autoremont Tallinn" e equivalentes, as primeiras posições são oficinas reais com 5–15 anos de domínio, endereço, telefone e avaliações (carvex.ee, vakservice.ee, autotallinn.ee…) e diretórios (eestiauto.com, getapro.ee, hinnaguru.ee, tallinn.place). O BipFix não vai disputar isso em meses. O caminho realista é: cauda longa informativa em et/ru (guias de preço e de "como escolher"), perfis de oficina reais, marca e links; e aquisição das primeiras oficinas **fora** do SEO (contato direto, grupos de Facebook, anúncios).

---

## Evidências

### 1. O que o Google/Yandex recebem (HTML do servidor, user-agent Googlebot/YandexBot)

| URL | Código | Título | Robots | Observações |
|---|---|---|---|---|
| `https://bipfix.com/` | **307 → /en** (`Vary: Accept-Language, Cookie`, `Cache-Control: private, no-store`); com `Accept-Language: et` → /et; `ru` → /ru | — | — | YandexBot e Googlebot não mandam Accept-Language → recebem /en |
| `https://www.bipfix.com/` | 301 → `https://bipfix.com/` | — | — | correto; o Google ainda mostra o título antigo por cache do índice |
| `/et` | 200, 106 KB (31 KB gzip), TTFB 0,25 s | `Autoremont Tallinnas: võrdle hinnapakkumisi \| BipFix` | index | H1 "Autoremont Tallinnas, ilma üllatusteta."; 709 palavras visíveis; JSON-LD Organization + WebSite + FAQPage (9 perguntas); **0 links para guias individuais**; link para `/et/tookojad` (noindex, vazio) |
| `/ru` | 200, 145 KB | `Ремонт авто в Таллинне: сравните сметы автосервисов \| BipFix` | index | H1 "Ремонт автомобиля без сюрпризов." (sem "Таллинн" no H1; 14 menções no corpo) |
| `/et/tookodadele` | 200 | `Autotöökoja Haldustarkvara ja Rohkem Kliente \| BipFix` | index | H1 "Korras haldus ja rohkem kliente sinu autotöökojale"; SoftwareApplication + FAQPage; CTA "Vaata töökodasid platvormil" → página vazia noindex |
| `/et/hakka-partneriks` | 200 | `Saa asutajapartneriks \| BipFix` | index | formulário + texto honesto da fase fundadora |
| `/ru/dlya-avtoservisov` | 200 | `Программа для автосервиса и новые клиенты \| BipFix` | index | — |
| `/et/juhendid` | 200 | `Juhendid autojuhtidele \| BipFix` | index | 4 guias listados |
| `/et/juhendid/talverehvid-eestis` | 200 | `Talverehvid ja naastrehvid Eestis: tähtajad ja nõuded \| BipFix` | index | 1.257 palavras; Article + BreadcrumbList + FAQPage; `datePublished` 2026-09-29; **sem ano no título/H1** |
| `/ru/stati/zimnie-shiny-v-estonii` | 200 | `Зимняя резина в Эстонии: сроки, шипованные шины, протектор \| BipFix` | index | 1.553 palavras |
| `/et/juhendid/liiklusonnetus-eestis-mida-teha` | 200 | `Liiklusõnnetus Eestis: mida teha pärast avariid \| BipFix` | index | 1.424 palavras, fontes oficiais (LKF, Transpordiamet) |
| `/et/tookojad` | 200 | `Partnerautoremonditöökojad \| BipFix` | **noindex, follow** | "Esimesed partnertöökojad on tulekul" (vazio, como previsto) |
| `/et/tookojad?cidade=milano` | 200 | idem | noindex | canonical → `/et/tookojad`; **está no sitemap** |
| `/et/tookojad/f6dd5d4e-…`, `/et/tookojad/0546cb6f-…`, `/et/tookojad/c2608839-…` | **404** | `BipFix - Ühendame sind parima autotöökojaga \| BipFix` (título herdado, marca duplicada) | noindex | **estão no sitemap** (×6 idiomas = 18 URLs), `lastmod` 2026-10-08T19:17Z |
| `/et/abi`, `/et/abi/autojuhid`, `/et/abi/tookojad`, `/et/meist` | 200 | próprios | index | `/et/abi/autojuhid` tem só **193 palavras** visíveis (o resto é cliente/JS) |
| `/et/avarii` | 200 | `Autoavarii? Teata sellest kohe \| BipFix` | index | formulário; pouco texto |
| `/et/login`, `/et/registreeru` | 200 | próprios | noindex, follow | ok |
| `/et/termos`, `/ru/privacidade`, `/et/guias`, `/et/seja-parceiro`, `/ru/para-oficinas`, `/et/docs` | **301** → slug localizado | — | — | os slugs antigos em português **já redirecionam** corretamente; o Yandex ainda os lista porque os rastreou antes de 30/09 |
| `/robots.txt` | 200 | — | — | `Disallow` corretos (`/admin/`, `/api/`, áreas logadas por idioma, `/et/avarii/teade/`), sem `Host`, `Sitemap:` declarado |
| `/sitemap.xml` | 200, **111 URLs** | — | — | 6 idiomas × (home, avarii, tookodadele, hakka-partneriks, meist, termos, privaatsus, abi ×3, **tookojad**, **tookojad?cidade=milano**, juhendid) + guias + **18 perfis 404**; `lastmod` reais (28–30/09 e 08/10) |

Hreflang, canonical e `<html lang>` estão corretos em todas as páginas verificadas (x-default = versão inglesa; cada idioma aponta para o próprio canonical). `Content-Language` por resposta presente. JS da home: 15 chunks, 250 KB gzip; sem imagem hero; TTFB 0,16–0,35 s de Portugal. Nada disso é gargalo.

### 2. Search Console (dado do dono, 3 meses até ~06/10)

- 1 clique, 159 impressões, CTR 0,6 %, posição média 12 (= página 2). Impressões subindo desde 27/09 (quando `/et` passou a existir para o Google).
- 16 consultas, todas com 0 cliques. Agrupadas: **pneus de inverno** (et: "talverehvid kohustuslikud 2022", "talverehvid lubatud 2026"; ru: "зимняя резина в эстонии", "с какого числа зимняя резина в эстонии") ≈ 12 impressões; **ruído de marca** ("biplaza", "bip loja", "c/b fix", "buy fix store") — o Google está testando a marca "BipFix" contra buscas de outras marcas; "liiklusõnnetused eile" (acidentes de ontem — intenção de notícia, não nossa); "система управления автосервисом" (1 impressão para `/ru/dlya-avtoservisov` — a única impressão do lado oficina).
- Indexação: 64 indexadas; 43 não indexadas = noindex 6, redirect 5, duplicata sem canonical 3, **descobertas-não indexadas 26**, canonical diferente 2, rastreada-não indexada 1.

### 3. Yandex Webmaster (dado do dono)

- `/` indexada com o título antigo "BipFix - Compare orçamentos de oficina mecânica perto de você" (rastreada em 29/09, quando `/` ainda servia pt-BR). Hoje `/` responde 307; o Yandex mantém a URL de origem e o snapshot antigo até rastrear de novo. Buscar "bipfix" no Yandex mostra a página portuguesa.
- `bipfix.com`: 155 adicionadas, 123 pesquisáveis, 13 excluídas como "Малоценная или маловостребованная страница" (baixo valor ou baixa demanda): `/et`, `/et/juhendid/tehnoulevaatus-eestis`, `/et/termos`, `/it/privacy`, `/ru/konfidentsialnost`, `/ru/privacidade`. Indexadas: `/ru/dlya-avtoservisov`, `/ru/stati`, `/ru/pomoshch/voditelyam`, `/et/avarii`, `/et/meist`, `/en/guides/winter-tyres-estonia` etc. Fonte da maioria: IndexNow.
- `www.bipfix.com`: 1 página, 0 pesquisáveis (301) — correto.

### 4. Quem rankeia na Estônia para as buscas-alvo (pesquisa feita hoje)

| Busca | Quem aparece | O que a página deles tem e a nossa não |
|---|---|---|
| `autoremont Tallinn hinnapakkumine` | rehvitakso.ee (59 €/h), auto-remont.ee (hinnakiri), goldencar.ee, carvex.ee, vakservice.ee (36 €/h), autotallinn.ee (59,90 €/h), rehvidpluss.com | oficinas reais com **tabela de preços por hora**, endereço, telefone, anos de domínio |
| `автосервис Таллинн ремонт авто цены` | **getapro.ee** (marketplace de serviços: 12+ mecânicos com €/h e avaliações, FAQ, tabela de preços, menções na mídia), okidoki.ee (132 anúncios), automed.ee, autokoda.ee, v8carservice.ee, ariolauto.ee | marketplace real com oferta; classificados; preços |
| `kere remont Tallinn hind / autoremondi hinnad` | automaailm.ee, vakservice.ee ("Autoremondi hinnakiri Tallinnas (2024)"), **tallinn.place** ("11 Parimat autoremonditöökoda Tallinnas"), autovarvimine.ee, ccauto.ee | listas "melhores de Tallinn", hinnakiri com faixas (óleo 50–120 €, freios 60–200 €, suspensão 50–400 €) |
| `auto värvimine hind` | **hinnaguru.ee** "Auto värvimise hinnad 2026 — võrdlus ja pakkujad": 35 empresas, faixas (peça 40–250 €, carro inteiro 800–3.500 €, 40–65 €/h), dados do registro comercial, FAQ | página de preço agregada com fonte e ano |
| `kuidas valida autoteenindust` | autoosa.ee, carfox.ee ("13 moodust kuidas mitte petta saada"), motointegrator.com/ee, parimad.ee, eestiauto.com, viruauto.ee | guias "como escolher" longos, com checklists |
| `talverehvid kohustuslikud 2026` | **abcabi.ee** "Talverehvid kohustuslikud 2026/27: naastrehvid, trahv, hind" (~3.500 palavras, 8 FAQ, preços, 40+ links internos), rehvitakso.ee ("Millal peab talverehvid alla panema 2026"), headrehvid.ee, fixwheels.ee, tehnikamaailm.kodus.ee, vrb.ee | **ano no título**, 2–3× mais texto, preços de troca, link para agendar |
| `töökoja tarkvara / broneerimissüsteem autoteenindus` | hoolduskeskus.ee, autorsoft.eu, autofutur.net (2.000 empresas EE/FI/SE), anolla.com, ajabroneerimine.ee | fornecedores estabelecidos de software; a nossa página diz "haldustarkvara" mas não compete em funcionalidades nem em prova |
| `"bipfix"` | `www.bipfix.com` com título antigo do Brasil; depois Wikipedia (BIP, BIF…) e bifix.pl (chá polonês) | nenhuma menção externa ao BipFix; nenhum perfil social encontrado |

### 5. Off-page

- Backlinks: nenhum encontrado (buscas por "bipfix" só retornam o próprio site). Sem menções em mídia, fóruns ou diretórios.
- Redes sociais: nenhuma página BipFix encontrada no Facebook/Instagram/LinkedIn. O JSON-LD `Organization` não tem `sameAs` nem `address` (pendência já registrada em 29/09).
- Diretórios estonianos (inforegister.ee, teatmik.ee, 1182.ee, firmasajt): impossíveis até a OÜ existir (a página `/et/meist` diz "registreeritakse Eesti osaühinguna" — ainda em registro).
- Google Business Profile: marketplace só online não é elegível (confirmado em 29/09). Continua valendo a alavanca indireta: cada oficina parceira linka o perfil BipFix no GBP dela.
- `bipfix.ee`: não responde (não registrado ou sem DNS). Não é necessário para SEO (subpasta `/et` em `.com` funciona), mas é um ativo de marca barato e evita que outro registre.

---

## Causas por ordem de impacto

### C1 — Domínio novo, sem autoridade, sem sinais externos (impacto: alto; prazo de correção: meses)
Evidência: 0 backlinks, 0 menções, 0 perfis sociais, empresa não registrada, 26 URLs "descobertas, não indexadas" (o Google sabe que existem e escolhe não gastar rastreamento), posição média 12. O Google declarou em julho/2026 (Search Off the Record) que quando tem dúvidas sobre a qualidade geral de um site, **rastreia menos e indexa menos**; sites novos com conteúdo majoritariamente de produto/marketing caem nessa faixa. Nada no código resolve isso; só tempo + conteúdo útil + links + marca.

### C2 — Não existem páginas para as buscas com intenção comercial/local em Tallinn (impacto: alto)
Evidência: o site tem 1 home + 4 guias por idioma. Nenhuma página responde a "kere remont Tallinn", "auto värvimine hind", "rehvivahetus Tallinn", "autoremondi hinnad", "autoteenindus Lasnamäe", "автосервис Таллинн цены", "кузовной ремонт Таллинн", "шиномонтаж Таллинн". A home tenta cobrir "autoremont Tallinnas" com 709 palavras de pitch do produto — contra páginas de oficinas com hinnakiri, endereço, telefone e mapa. O Yandex marcou `/et` justamente como "baixo valor/baixa demanda" (ver C5).

### C3 — Marketplace vazio: nenhuma oficina, logo nenhuma página de oficina nem listagem (impacto: alto; é decisão de negócio)
Evidência: `/et/tookojad` noindex e vazio; 0 perfis; a página para oficinas promete "avalik profiil, mis on Google'is linna järgi indekseeritud" sem nenhum exemplo. O código já está pronto para perfis com `AutoRepair/LocalBusiness` (`lib/seo-utils.ts`) e listagem por cidade — só falta oferta real. Enquanto não houver 10–20 oficinas em Tallinn, a maior alavanca de SEO local do produto está desligada.

### C4 — Sitemap contaminado com dados de teste (impacto: médio, fácil de corrigir; ativo e prejudicial)
Evidência: sitemap servido às 21:14 UTC lista 3 oficinas criadas às 19:17 UTC de hoje, cidade "milano", que respondem 404 em todos os 6 idiomas (18 URLs), mais 6 URLs `?cidade=milano` com `noindex`. Causa: `app/sitemap.ts` lê `oficinas.ativa = true` com cache de 1 h (`revalidate = 3600`); dados de teste criados/ativados em produção entram no sitemap e, ao serem apagados, ficam 1 h como 404. Efeito: o Google recebe de um sitemap de 111 URLs 24 inúteis (22 %), o que alimenta "rastreada-não indexada", "noindex" e reduz a confiança no sitemap. Isso provavelmente explica parte dos 43 "não indexadas" de hoje (hipótese: a mesma coisa pode ter acontecido com dados de teste anteriores).

### C5 — A raiz `/` em 307 mantém o snippet brasileiro antigo no Google e no Yandex (impacto: médio para a marca; baixo para tráfego)
Evidência: `/` 307 → `/en` (sem Accept-Language). Google ainda mostra `www.bipfix.com` com "BipFix - Conectando você à melhor oficina mecânica"; Yandex mostra `/` com "Compare orçamentos de oficina mecânica". Com redirecionamento temporário, **ambos mantêm a URL de origem no índice** (Google: 302/307 = "temporário", conserva a origem; Yandex: com redirecionamento temporário o robô continua indexando a URL de origem e mostra o conteúdo do destino) e só atualizam o snippet quando rastreiam de novo. Como os robôs não mandam Accept-Language, o snippet futuro será o **inglês**, não o estoniano — mesmo depois de re-rastrear, quem busca "bipfix" em Tallinn veria a versão inglesa pela URL `/`. Isso é compatível com as diretrizes do Google (x-default pode ser "a página para a qual você redireciona"), mas é ruim para a marca na Estônia.

### C6 — Guias existem mas estão fracos frente ao que rankeia e mal interligados (impacto: médio)
Evidência: o guia de pneus (1.257 palavras et / 1.553 ru) não tem ano no título nem no H1; abcabi.ee tem "2026/27" e ~3.500 palavras; rehvitakso/headrehvid têm "2026" no título. As consultas do GSC são com ano. A home `/et` não linka nenhum guia individual (só "Juhendid" no rodapé); os guias não linkam entre si (o de acidente não linka o de comparar orçamentos, por exemplo). `/et/abi/autojuhid` tem 193 palavras visíveis no servidor.

### C7 — `/et` marcada como "baixo valor/baixa demanda" pelo Yandex (impacto: baixo no Yandex, mas sintoma do C2)
Evidência: lista do Yandex. O Yandex explica o status como automático e reavaliado regularmente; "malotsennaya" = duplicata ou sem conteúdo visível ao robô; "malovostrebovannaya" = sem demanda de busca correspondente. Hipótese mais provável: **baixa demanda** — o público do Yandex na Estônia é russófono; buscas em estoniano no Yandex são raras, e o conteúdo de `/et` é genérico (não responde a nenhuma consulta específica). Reforça: `/et/juhendid/tehnoulevaatus-eestis` (estoniano) também foi excluída enquanto `/ru/stati` e `/ru/dlya-avtoservisov` foram indexadas. As demais excluídas (`/et/termos`, `/ru/privacidade`) são slugs antigos que já respondem 301 e vão cair sozinhas; `/it/privacy` e `/ru/konfidentsialnost` são páginas legais (sem demanda) — irrelevante.

### C8 — Ruído de marca e páginas secundárias (impacto: baixo)
`it`, `pt-pt` e `pt-br` continuam no sitemap e rastreáveis; parte do rastreamento escasso vai para elas. As buscas "biplaza", "bip loja", "c/b fix" mostram que o Google ainda associa a marca a termos brasileiros/lojas. Não é prejudicial, só dilui.

---

## Plano de ação priorizado

### A. No código (ordem sugerida; arquivo → mudança)

**A1. Tirar dado de teste do sitemap e proteger o sitemap contra isso** — `apps/web/src/app/sitemap.ts`, páginas/rotas que ativam/desativam/apagam oficina (admin), `apps/web/src/app/[locale]/oficinas/[id]/page.tsx`
- Chamar `revalidatePath('/sitemap.xml')` (e `revalidatePath` do perfil) nas rotas de admin que ativam, desativam ou apagam oficina; reduzir `revalidate` do sitemap para 300–600 s.
- No sitemap, só incluir oficinas com `pais = 'EE'` (ou com a cidade dentro de uma lista de cidades do piloto) e com perfil completo (nome, endereço, ≥1 especialidade), para que um cadastro de teste ou incompleto nunca vá ao Google.
- Nunca incluir URL de listagem (`/oficinas`, `?cidade=`) que a própria página devolve `noindex` — hoje `generateMetadata` da listagem exige `filtradas.length > 0` por cidade, mas o sitemap inclui a cidade só por existir uma oficina `ativa` (que pode ter sido apagada). Alinhar: a mesma função decide os dois.
- Operacional: **não criar oficinas de teste com `ativa = true` em produção**; se precisar, usar `pais = 'XX'`/cidade reservada e filtrar.
- Depois de publicar: reenviar o sitemap no GSC e no Yandex, rodar `npm run indexnow`.

**A2. Resolver a raiz `/` para Google e Yandex de uma vez** — `apps/web/src/middleware.ts` (bloco `if (pathname === '/')`), `apps/web/src/i18n/routing.ts` (`X_DEFAULT_LOCALE`), `apps/web/src/lib/seo-utils.ts` (`hreflangAlternates`)
Duas opções válidas; recomendo a 1.
- **Opção 1 (recomendada): `/` → 301 permanente para `/et`**, e `x-default` = `https://bipfix.com/et` em todas as páginas. Motivo: a Estônia é o mercado; 301 é a única forma de **ambos** os buscadores substituírem `/` pelo destino (Google: 301 = "indexa e mostra a nova URL"; Yandex: com 301 a URL de origem sai do índice e o destino entra), o que apaga o snippet brasileiro de vez e faz "bipfix" cair no cluster hreflang (estoniano para quem busca em estoniano, russo para russo, pt-BR para Brasil). Quem chega com navegador em russo/português/inglês vê o aviso já existente (`SugestaoIdioma`) + seletor; o Google recomenda exatamente isso (links em vez de redirecionamento automático por idioma). Custo: perde-se o redirecionamento por `Accept-Language` na raiz (que o Google desaconselha de qualquer modo). Manter o cookie `bipfix_idioma` só para quem já escolheu? Não: um 301 não pode depender de cookie (seria cacheado). Simples: 301 fixo.
- **Opção 2: `/` como página real 200 (x-default = `/`)**, seletor de idioma leve, `<title>` trilíngue ("BipFix – Autoremont Tallinnas · Ремонт авто в Таллинне · Car repair quotes in Tallinn"), links para as 6 homes, sem redirecionamento automático. Também válida para ambos (Google: x-default "funciona melhor com páginas de seleção de idioma"; Yandex: declarar x-default junto com as versões). Custo: um clique a mais para o usuário; mais uma página a manter.
- Em qualquer opção: pedir re-rastreamento de `https://bipfix.com/` e `https://www.bipfix.com/` no Yandex ("Переобход страниц") e na Inspeção de URL do GSC; para `www` no GSC é preciso ter a propriedade `www` **ou uma propriedade de Domínio** (verificação por TXT no DNS) — recomendo criar a de Domínio, que mostra tudo (www, http, subdomínios) num lugar só.
- Yandex extra: em Webmaster → "Региональность", definir região Tallinn/Estônia para o site (o Yandex dá mais peso à geolocalização do painel do que ao hreflang); confirmar "Главное зеркало" = `https://bipfix.com`.
- Slugs antigos sob outros idiomas (`/ru/privacidade`, `/et/termos`, `/et/guias`…): **já respondem 301 para o slug localizado** (verificado hoje). Nada a fazer no código; vão sair do Yandex sozinhos. Se quiser acelerar, listar essas URLs em "Переобход".

**A3. Pneus de inverno: ano no título/H1 e expansão** — `apps/web/content/guias/winter-tyres-estonia.json` (campos `tituloSeo`, `titulo`, `descricao`, `secoes`, `atualizado`)
- et: `tituloSeo` "Talverehvid kohustuslikud 2026/27: tähtajad, naastrehvid, mustri sügavus, trahv"; H1 "Talverehvid ja naastrehvid Eestis 2026/27: millal kohustuslikud ja lubatud?"; ru: "Зимняя резина в Эстонии 2026/27: с какого числа, шипы, протектор, штраф". Adicionar seções: multa (trahv) e consequências no seguro, carros finlandeses/estrangeiros, tabela de datas, "rehvivahetuse hind Tallinnas 2026" (faixas reais: ~25–45 € por troca sazonal), checklist. Meta de 2.500+ palavras. Atualizar `atualizado` (entra no `lastmod` e no `dateModified`).
- Repetir "ano no título" nos outros guias quando fizer sentido (tehnoülevaatus 2026).

**A4. Linkagem interna da home para os guias e serviços** — `apps/web/src/app/[locale]/HomeClient.tsx`, `apps/web/messages/{et,ru}.json` (namespace `home`), `apps/web/src/components/layout/SiteFooter.tsx`
- Bloco "Juhendid autojuhtidele" na home com os 4 guias (título + 1 linha + link) — hoje a home tem 0 links para guias.
- Nos guias (`apps/web/src/app/[locale]/guias/[slug]/page.tsx`): bloco "Loe ka" com os outros guias do idioma.
- Enquanto não houver oficinas, trocar os links "Partnertöökojad"/"Vaata töökodasid platvormil" (navbar, rodapé, `tookodadele`) por "Juhendid" ou pelo cadastro — apontar o rastreador e o usuário para uma página vazia e noindex não ajuda ninguém (já sugerido em 30/09, item 3.7; continua pendente).

**A5. Home `/et` e `/ru` com conteúdo específico de Tallinn** — `HomeClient.tsx` + `messages/et.json`, `ru.json`
- Seção "Teenused, mille jaoks saad hinnapakkumisi küsida" com 8–10 serviços nomeados como as pessoas buscam (kereremont, värvimine, rehvivahetus, klaasivahetus, diagnostika, pidurid, vedrustus, õlivahetus, kliimaseadme hooldus, tehnoülevaatuse eelkontroll), cada um linkando para a futura página de serviço (A6) — e, até lá, para o guia relevante.
- Seção "Linnaosad" (Lasnamäe, Mustamäe, Õismäe, Kesklinn, Põhja-Tallinn, Nõmme, Pirita, Haabersti) — só quando houver oficinas; antes disso seria texto vazio.
- Faixas de preço de referência em Tallinn (com fonte e data) — é o que hinnaguru/vakservice têm e o que o Yandex chama de "corresponder ao interesse do usuário". Isso é o que tira `/et` do status "baixo valor".
- ru: pôr "в Таллинне" no H1 ("Ремонт автомобиля в Таллинне без сюрпризов").

**A6. Páginas de serviço + preço (novo tipo de página, cauda longa)** — novo `apps/web/content/servicos/*.json` + rota `app/[locale]/teenused/[slug]` (entrada em `PATHNAMES`: `/servicos` → et `/teenused`, ru `/uslugi`, en `/services`), reaproveitando a estrutura dos guias (Article/FAQ/Breadcrumb já existentes em `lib/guias.ts` e `components/seo`)
- 6–8 páginas em et e ru: título "Kereremont Tallinnas: hinnad 2026 ja kuidas valida töökoda" etc. (lista completa na seção C abaixo). Conteúdo: o que inclui, faixas de preço (com fonte: hinnakiri públicos de oficinas de Tallinn, hinnaguru), tempo típico, perguntas, quando o seguro paga, CTA "küsi hinnapakkumist" (pedido) — e lista das oficinas parceiras que fazem o serviço (vazio hoje → ocultar o bloco até existir).
- Entrar no sitemap e no `llms.txt` (gerado) automaticamente.

**A7. `/et/abi/*` com texto no servidor** — `apps/web/src/app/[locale]/docs/**`
- 193 palavras visíveis é pouco para "Juhi juhend". Ou render no servidor do conteúdo (hoje parte é cliente) ou `noindex` nessas páginas e manter o rastreamento para os guias. Prefiro render no servidor (as páginas respondem a "kuidas BipFix töötab").

**A8. Perfis de oficina (quando existirem)** — já implementado; conferir ao ativar a primeira: título "Nome – autoremont Lasnamäel, Tallinn | BipFix", `AutoRepair` com `telephone`, `openingHoursSpecification`, `geo`, `registrikood`; incluir o bairro no `addressLocality`/texto; listagem por cidade entra sozinha no sitemap.

**A9. Baixa prioridade** — cache público/ISR das páginas públicas (hoje `private, no-store`; TTFB fine, mas CDN/ISR reduziria carga de rastreamento quando o volume crescer); `apps/web/src/app/[locale]/layout.tsx`: `sameAs` e `address` no `Organization` assim que a OÜ e os perfis existirem; considerar tirar `it` e `pt-pt` do sitemap até haver plano para esses mercados (`sitemap.ts`, filtro de `routing.locales`).

### B. Fora do código (dono)

1. **Registrar a OÜ e publicar os dados** em `/et/meist` (nome, registrikood, endereço, telefone +372). Sem isso não há inforegister/teatmik/1182, não há `address`/`sameAs`, e o Google/Yandex não têm entidade para associar.
2. **Criar perfis**: Facebook (página + participar dos grupos "Autoabi", "Auto ostmine/müük Tallinn", "Tallinna autoomanikud", grupos russófonos "Авто Таллинн"), Instagram, LinkedIn (empresa), Google (conta de marca). Linkar no rodapé e em `sameAs`. Postar os guias lá (primeiros links e sinais de marca).
3. **Search Console**: criar propriedade de Domínio (TXT no DNS); depois das mudanças A1/A2, reenviar sitemap, Inspeção de URL em `/`, `/et`, `/ru`, guias atualizados. **Yandex**: região = Tallinn; "Переобход" de `/`, `/et`, `/ru` e guias; reenviar sitemap; (Clean-param opcional para `utm_*`, `tipo`, `servico` — o Google ignora, o Yandex usa).
4. **Primeiras oficinas (a maior alavanca de SEO e de produto)**: 10–20 oficinas de Tallinn por contato direto (telefone/WhatsApp/visita), oferecendo o perfil público + guias de preço com o nome delas. Pedir a cada uma: link do site/GBP para o perfil BipFix (backlink local relevante).
5. **Links e menções baratos e legítimos**: diretórios/listas (eestiauto.com, tallinn.place, parimad.ee aceitam cadastro/sugestão; okidoki.ee e soov.ee aceitam anúncio de serviço), Startup Estonia / Tehnopol (se aplicável), fóruns (auto24 foorum, Reddit r/Eesti com cuidado), nota em mídia estoniana sobre o lançamento (Geenius, Accelerista, Delfi Auto — press release curto em et/ru).
6. **Anúncios para o lado oficina**: SEO não vai trazer oficinas em semanas; Google Ads para "töökoja tarkvara", "rohkem kliente autotöökojale", "программа для автосервиса" em Tallinn é o jeito de testar a página `/et/tookodadele` com tráfego real.
7. Registrar `bipfix.ee` (redirecionar 301 para `bipfix.com/et`).

### C. Conteúdo a criar (títulos sugeridos)

Prioridade = volume provável × facilidade × ligação com a oferta. Cada peça em et **e** ru (público russófono ≈ 1/3 de Tallinn e usa Yandex e Google), com fontes oficiais citadas, faixas de preço datadas e um CTA para o pedido de orçamento.

| # | Estoniano (título SEO) | Russo (título SEO) | Tipo/rota |
|---|---|---|---|
| 1 | Talverehvid kohustuslikud 2026/27: tähtajad, naastrehvid, mustri sügavus, trahv *(atualizar o guia existente)* | Зимняя резина в Эстонии 2026/27: с какого числа, шипы, протектор, штраф | guia (já existe) |
| 2 | Rehvivahetuse hind Tallinnas 2026: mis maksab ja millal broneerida | Шиномонтаж в Таллинне 2026: цены и когда записываться | serviço/preço |
| 3 | Autoremondi hinnad Tallinnas 2026: töötunni hind, õlivahetus, pidurid, vedrustus | Цены на ремонт авто в Таллинне 2026: стоимость часа, замена масла, тормоза, подвеска | preço (hub) |
| 4 | Kereremont Tallinnas: hinnad 2026 ja kuidas valida kerevärvitöökoda | Кузовной ремонт в Таллинне: цены 2026 и как выбрать мастерскую | serviço/preço |
| 5 | Auto värvimine Tallinnas: mis maksab ühe detaili või kogu auto värvimine | Покраска авто в Таллинне: сколько стоит деталь и вся машина | serviço/preço |
| 6 | Kuidas valida usaldusväärne autotöökoda Tallinnas: 12 kontrollpunkti | Как выбрать надёжный автосервис в Таллинне: 12 признаков | guia |
| 7 | Kaskokindlustus ja remont: kas pead kasutama kindlustusandja töökoda? | Ремонт по каско в Эстонии: обязан ли я ехать в сервис страховой? | guia (seguro) |
| 8 | Liikluskindlustuse kahju: kuidas remont toimub, kui süüdi on teine juht (LKF) | Ремонт после ДТП по страховке виновника в Эстонии: пошагово (LKF) | guia (seguro) |
| 9 | Autoremondi garantii Eestis: mida töökoda peab tagama (VÕS, tarbijakaitse) | Гарантия на ремонт авто в Эстонии: что обязан сервис | guia |
| 10 | Tehnoülevaatus 2026: hind, kus Tallinnas, mida kontrollitakse *(atualizar)* | Техосмотр в Эстонии 2026: цена, где в Таллинне, что проверяют | guia (já existe) |
| 11 | Autoteenindus Lasnamäel / Mustamäel / Kesklinnas … *(só quando houver oficinas)* | Автосервис в Ласнамяэ / Мустамяэ … | listagem por bairro |
| 12 | Lado oficina: Kuidas autotöökoda saab rohkem kliente 2026: 9 kanalit, mis Tallinnas töötavad | Как автосервису в Таллинне получать больше клиентов: 9 каналов | guia (oficinas) |
| 13 | Lado oficina: Hinnapakkumise vorm autotöökojale (näidis) — struktureeritud pakkumine, KM, garantii | Образец сметы для автосервиса: структура, НДС, гарантия | guia + download |

Regras de qualidade (para não cair em "baixo valor"): texto nativo (revisão de estoniano nativo continua pendente desde 30/09), números com fonte e data, perguntas reais (olhar "People also ask" e Yandex Wordstat para ru), ano no título quando a busca tem ano, 1.500–3.000 palavras, FAQ de 6–8 itens, links cruzados entre guias e para o pedido.

---

## Explicação de cada "não indexada" do Search Console

| Bucket | Qtd | URLs prováveis (hipótese, verificar no GSC) | Problema real? |
|---|---|---|---|
| Excluída por noindex | 6 | `/{et,ru,en,…}/tookojad` (listagem vazia) e/ou `login`/`registreeru` | Não — intencional |
| Página com redirecionamento | 5 | `/`, `http://`, `www`, `/pt`, slugs antigos (`/et/seja-parceiro`, `/ru/privacidade`) | Não — esperado; `/` muda de estado com A2 |
| Duplicada sem canonical escolhido pelo usuário | 3 | `/{idioma}/tookojad?cidade=milano` (canonical → listagem, mas noindex), `/et/tookojad/<id>` 404 recentes, ou `?tipo=cliente` | Sim, parcialmente — resolvido por A1 |
| Descoberta, não indexada | 26 | guias e páginas de ajuda/legais em it/pt-pt/pt-br, `/ru/pomoshch/*`, `/en/help/*`, perfis 404 recém-adicionados | Sintoma de C1 (pouco rastreamento para um site novo). Melhora com conteúdo, links e remoção do lixo do sitemap; não é bug |
| Google escolheu canonical diferente | 2 | `www.bipfix.com/` ↔ `bipfix.com/en`, ou `/ru/privacidade` ↔ `/ru/konfidentsialnost` | Não — vai se resolver sozinho; acelerar com Inspeção de URL |
| Rastreada, não indexada | 1 | um perfil 404 ou `/et/abi/autojuhid` (193 palavras) | A7 |

---

## O que está tecnicamente ativo e prejudicial (resumo)

1. Sitemap com 18 URLs 404 e 6 URLs noindex (dados de teste) — **corrigir já** (A1).
2. `/` em 307 mantendo snippet brasileiro antigo no Google (via `www`) e no Yandex — corrigir com 301 → `/et` (A2) e pedir re-rastreamento.
3. CTAs e menu levando para `/et/tookojad` vazio/noindex (A4).
4. Guia de pneus sem ano, menor que os concorrentes (A3).
5. `/et/abi/autojuhid` quase vazia no servidor (A7).
6. Não são problemas (confirmado hoje): robots.txt, hreflang/canonical/lang, `www` → 301, slugs antigos → 301, TTFB, tamanho do HTML, JSON-LD válido, `Host` removido.

---

## Métricas para acompanhar (semanal, 8–12 semanas)

- **GSC (propriedade de Domínio)**: cliques e impressões filtrados por página `/et/*` e `/ru/*`; consultas novas por guia; posição média das 5 consultas de pneus (meta: <8 antes de 1/12, data em que os pneus viram obrigatórios); "descobertas-não indexadas" (meta: <10); zero URLs 404/noindex vindas do sitemap no relatório "Páginas" → "Sitemaps".
- **Yandex Webmaster**: páginas pesquisáveis (hoje 123) e status de `/et` (sair de "baixo valor"); snippet de `/` para a consulta "bipfix" (meta: estoniano ou russo, não português); região definida.
- **Marca**: busca "bipfix" no Google (Estônia) e Yandex mostrando `/et`/`/ru` com título atual; nº de domínios que linkam (GSC → Links; Ahrefs Webmaster Tools gratuito).
- **Produto**: oficinas ativas em Tallinn (meta: 10 em 30 dias, 20 em 60) e perfis indexados; pedidos de orçamento vindos de orgânico (Clarity/GA4 por origem e idioma).
- **Conteúdo**: nº de páginas et/ru com >1.500 palavras (hoje 4 et, 4 ru; meta 12 cada); impressões por página de serviço/preço depois de 4 semanas.
- **Sinal de alerta**: se em 8 semanas as impressões de `/et` não passarem de ~300/mês mesmo com 8+ páginas novas, o gargalo é autoridade (C1) e o foco deve ir para links/menções e anúncios, não para mais texto.
