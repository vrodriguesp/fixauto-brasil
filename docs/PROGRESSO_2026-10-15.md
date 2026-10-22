# Progresso — a partir de 15/10/2026

Continuação de `PROGRESSO_2026-10-08.md`. **Regra (pedido do dono, 16/10):** toda modificação é registrada aqui na hora. Rascunhos de e-mail e dados de contatos ficam em `Documentos/` (só no computador — o repositório do GitHub é público).

## 15/10 — Interessados (Seja parceiro) no portal admin
- **Problema (dono):** chegou o e-mail de uma oficina do Brasil, mas o link "Ver todos os interessados" levava ao site e o portal admin não tinha onde ver os interessados.
- **Causa:** a página `/admin/leads-parceiros` já existia, mas não havia link no menu lateral, e o login não voltava para a página pedida.
- **Feito (commit c8ffff9, publicado):**
  - "Interessados" no menu lateral do admin (antes só na barra de cima em tela larga);
  - login volta para a página pedida (`?voltar=`) em todas as áreas logadas (admin, oficina, cliente, loja) — o link do e-mail agora cai na lista;
  - **migração 062:** `leads_parceiros.pais` (EE, IT, PT, BR). O formulário grava o país do mercado; o contato que já existia (São Paulo) foi marcado BR;
  - país no assunto do e-mail ("Novo interessado (Oficina, Estônia): …"), bandeira na lista e filtro por país;
  - WhatsApp com o código do país do contato (+372, +39, +351, +55; antes sempre +55).
- **A página Seja parceiro está ativa em todos os países**, cada um no seu idioma (`/seja-parceiro`, `/hakka-partneriks`, `/diventa-partner`…).
- **Conferido em produção:** sem login, o link leva ao login com `voltar=/admin/leads-parceiros`; contato de teste pela página da Estônia gravado como Estônia e apagado (o e-mail "TESTE – pode ignorar" pode ter chegado ao dono). Portal admin logado não testado (sem a senha do dono).
- **Rascunho de resposta ao interessado do Brasil:** em `Documentos/Email_Parceria_Brasil_2026-10-15.md` (local).

## 16/10 — Sincronização
- Lidos memória, documentos, git e o servidor: git local = GitHub = servidor (c8ffff9); migração 062 aplicada; banco só com o admin; tarefa de entregas automáticas rodando sem erros.
- Documentado o que faltava (10/10 noite em `PROGRESSO_2026-10-08.md` e este arquivo).

## 16/10 — Buscadores (verificação, nada alterado)
- **Google Search Console (28 dias até 13/10):** 3 cliques, 360 impressões, CTR 0,8%, posição média 19,3. Buscas principais: pneus de inverno na Estônia (et/ru), acidente de trânsito, inspeção técnica. Os cliques vieram dos guias (pneus de inverno em inglês, inspeção técnica em russo) e da home em inglês.
- **Indexação (atualizada 12/10):** 100 páginas indexadas (eram 64 em 08/10); 91 não indexadas — 58 "descobertas, ainda não indexadas" (os endereços novos por mercado de 09/10 na fila), 8 rastreadas e não indexadas, 10 noindex (de propósito), 8 redirecionamentos (endereços antigos), 6 duplicadas, 1 404.
- **Sitemap:** lido em 16/10, 88 endereços, todos no formato novo (ee/et 18, ee/ru 18, ee/en 15, it/it 12, pt/pt 12, br/pt 12).
- O Google ainda mostra nas buscas os endereços antigos (antes de 09/10); todos levam com 301 ao novo. **Achado:** `/et/guias/winter-tyres-estonia` faz dois saltos (301 → `/ee/et/juhendid/winter-tyres-estonia` → 308 → `/ee/et/juhendid/talverehvid-eestis`); o certo é um salto só. Não corrigido ainda.
- **Bing:** não verificado — o painel pede login da conta Microsoft do dono.

## 16/10 — Yandex e Bing (verificação, nada alterado)
- **Yandex Webmaster:** o painel está com falha do próprio Yandex (resumo e exportação parados, "Reindex" só leitura). Os dados que ele mostra são de 29–30/09, antes dos endereços novos: "100 títulos duplicados / 98 descrições" são todos endereços antigos (`/pt-br/...`, `/seja-parceiro`, `/it/guias`...) que hoje fazem 301. **Conferido:** as 88 páginas do sitemap de hoje não têm título nem descrição repetidos. Nos registros do servidor (14 dias) o robô real do Yandex pegou 208 páginas com 200, ou seja, ele já visita os endereços novos; o painel só não atualizou. Reindex de 09/10: 34 processados; "Error" em `/` e em `/ee/ru/stati/ceny-na-remont-avto-v-talline` — os dois respondem 200 ao YandexBot hoje (provável falha temporária). Pedir de novo quando o Yandex reativar a ferramenta.
- **Bing Webmaster (logado pelo dono):** 0 cliques e 0 impressões (01–14/10). `/ee/et` continua **"Blocked — URL cannot appear on Bing"**. O Bingbot real recebe 200 nas páginas (51 visitas), então não é bloqueio técnico do site: é uma marcação de qualidade/confiança do domínio no Bing. Caminho: pedido de revisão ao suporte do Bing Webmaster (texto preparado na conversa; envio é do dono).
- **Registros do servidor:** os 404 de "bingbot" e "Googlebot" são robôs falsos procurando `.env`, `.git/config`, credenciais etc. Todos receberam 404 (nada exposto).

## 16/10 — Guia com endereço antigo: um salto só (publicado com OK do dono)
- **Problema:** `/et/guias/winter-tyres-estonia` (28 impressões no Google) fazia dois redirecionamentos: 301 → `/ee/et/juhendid/winter-tyres-estonia` → 308 → `/ee/et/juhendid/talverehvid-eestis`.
- **Causa:** a tradução dos endereços antigos (`caminhoLocal` em `src/i18n/routing.ts`) trocava `guias` → `juhendid`, mas mantinha o slug em inglês; a página do guia fazia o segundo salto.
- **Correção:** `caminhoLocal` troca também o slug do guia pelo do idioma (índice `lib/guias-indice.json`). Vale para todos os guias e idiomas (ex.: `/ru/guias/winter-tyres-estonia` → `/ee/ru/stati/zimnie-shiny-v-estonii` direto). Guia que não existe no idioma continua indo para a lista de guias, como antes.
- **Publicado** (commit 62ec73e, build OK). Conferido em produção: `/et/guias/winter-tyres-estonia` e `/ru/guias/winter-tyres-estonia` → 301 direto para a página final (200); outros endereços antigos e as homes continuam 200.

## 16/10 — Bing "Blocked": pesquisa na documentação e diagnóstico
- **Fontes lidas:** Bing Webmaster Guidelines (21 regras + "Abuse and Examples of Things to Avoid", versão atual com Copilot/grounding), página de suporte do Bing Webmaster, e casos no Microsoft Q&A / Tech Community com o mesmo status.
- **Conferido no site, regra por regra:**
  - **Cloaking:** Bingbot e navegador recebem exatamente a mesma página (mesmas palavras e título em `/`, `/ee/et`, `/ee/en`, `/ee/ru`, guias, `/br/pt`, `/pt/pt`).
  - **Conteúdo no HTML** (sem depender de JavaScript): 900–1.150 palavras nas homes, 2.586 no guia de pneus.
  - **Duplicadas:** nenhuma. O par mais parecido (guia Brasil × Portugal) tem 39% em comum, contando menu e rodapé; títulos e descrições únicos nas 88 páginas.
  - **Sitemap:** só endereços canônicos, 88 com `lastmod`; robots.txt libera o Bingbot; redirecionamentos 301 num salto.
  - **Domínio:** registrado em 12/04/2026, sem histórico anterior no Internet Archive (não herdou fama ruim).
  - **Bing Webmaster:** teste ao vivo de `/ee/et` = "URL can be indexed by Bing… No SEO/GEO issues found"; Recomendações = nenhuma.
- **Diagnóstico:** o índice diz "Blocked" e o teste ao vivo diz "pode ser indexada". Pela própria Microsoft (casos no Q&A), essa contradição é uma **marcação interna de qualidade/confiança no domínio**, que **só o suporte do Bing pode revisar**; nenhuma mudança no site a remove sozinha. Causa provável: o Bing avaliou o domínio novo no período ruim (antes de 29/09 a home mostrava só "Carregando…", `/` redirecionava por visitante, e os endereços mudaram duas vezes em 30/09 e 09/10).
- **Correção do meu lado:** o link de suporte que passei antes (`aka.ms/webmastersupport`) estava errado (leva a um relatório interno da Microsoft). O certo: Bing Webmaster Tools → **?** (Ajuda) → "Bing Webmaster Support" → https://www.bing.com/webmasters/help/webmaster-support-24ab5ebf → botão **"Raise support request"**.
- **`llms.txt` ajustado** (regra nova do Bing contra "conteúdo para manipular modelos de linguagem"): as frases em forma de ordem para IAs ("be accurate when describing", "Do not describe…", "Only describe…", seção "Notes for AI assistants") viraram fatos ("Current stage…", "BipFix does not yet have…", seção "Key facts"); link da Home `/en` (301) → `/ee/en`. Conteúdo e informações iguais.
- **Publicado** (commit 96ddc74, build OK). Conferido em produção: `bipfix.com/llms.txt` sem nenhuma ordem para IAs, Home `/ee/en`, seção "Key facts"; homes, `llms-full.txt` e sitemap 200. **Falta (dono):** abrir o pedido de suporte no Bing ("Raise support request").

## 16/10 — Yandex (nova verificação)
- **Painel ainda fora do ar:** "Reindex pages" continua só leitura. Causa (notícia do próprio Yandex, atualizada em 11/10): data centers em Sasovo (7–8/10), Kaluga (9/10) e Vladimir (11/10) danificados por ataques; sem previsão de volta.
- **Alternativa usada — IndexNow** (não depende do painel): as 88 URLs do sitemap enviadas por `npm run indexnow` (api.indexnow.org, HTTP 200) e direto ao `yandex.com/indexnow` (HTTP 202 `success: true`); arquivo da chave no site responde 200.
- **Robô do Yandex nos registros:** pico de 189 visitas em 09/10 (dia da mudança de endereços), depois quase parou (8–9 por dia em 15–16/10), o que bate com a pane. Os IPs reais são do Yandex (87.250.x, 213.180.x, 95.108.x); parte das visitas de "YandexBot" eram meus testes com curl.
- **Falta:** quando o Yandex reativar "Reindex", reenviar `/` e `/ee/ru/stati/ceny-na-remont-avto-v-talline` (deram "Error" em 09/10) e conferir os títulos duplicados (devem sumir, eram endereços antigos).

## 16/10 — Marca BipFix (verificação, nada alterado)
- **INPI:** a busca do INPI (busca.inpi.gov.br) não responde de fora do Brasil (nem do computador nem do servidor). Consultado o **WIPO Global Brand Database**, que inclui os dados do INPI e de 89 registros (UE/EUIPO e outros): **nenhuma marca "BipFix" registrada ou pedida** em lugar nenhum (16/10/2026).
- **Domínios:** `bipfix.com` registrado em 12/04/2026 (nosso); `bipfix.com.br` registrado em 22/07/2026 por uma pessoa física (não empresa), ativo, vence em 22/07/2027.
- **Nome da empresa (ideia do dono: "Pyrus Tech" dona da marca BipFix):** domínios pyrustech.com, pyrus.tech, pyrustech.ee e pyrustech.eu sem registro; pyrus.com ocupado. Registro de empresas da Estônia não conferido (a busca não respondeu). Decisão do dono pendente.

## 17/10 — Bing Site Scan
- O dono iniciou o **Site Scan** do Bing Webmaster ("BipFixWebsite : https://bipfix.com/"), status "Queued" em 17/10. Eu não tinha rodado essa auditoria antes (falha minha na verificação de 16/10). Quando terminar: ler erros e avisos, corrigir o que for do site e citar o resultado no pedido de suporte ao Bing.
- Scan atual: tipo "Website" (começa em https://bipfix.com/ e segue links), limite 1.000 páginas, avisos no e-mail do dono. O Bing só permite um scan por vez. **Decisão do dono (17/10):** deixar este terminar e **depois rodar um segundo scan com o tipo "Sitemap"** (`https://bipfix.com/sitemap.xml`).
- **Yandex (17/10):** "Reindex pages" continua só leitura (pane dos data centers). Nada a fazer até voltar; as 88 URLs já foram por IndexNow em 16/10.

## 17/10 — Cartão de e-Residency da Estônia (dono)
- O dono recebeu o cartão de e-Residency. Próximo passo dele: abrir a OÜ no e-Business Register (taxa oficial 265 €; endereço legal + pessoa de contato por prestador licenciado, 200–400 €/ano, segundo e-resident.gov.ee). Nome da empresa ainda em decisão (ideia: "Pyrus Tech").
- **Depois de registrada, eu atualizo:** nome, código de registro (registrikood) e endereço nos termos de uso e na política de privacidade (6 idiomas), rodapé, página "Sobre", dados da empresa (Organization) que os buscadores leem, `llms.txt` (hoje diz "being registered") e o texto dos e-mails.

## 17/10 — Títulos e descrições dos guias (aviso do Bing Site Scan)
- **Aviso do Bing:** 7 páginas com título acima de 70 caracteres (guias et/ru). O título final é `tituloSeo` + " | BipFix" (9 caracteres); o validador do projeto (`scripts/validar-guias.mjs`) já exigia `tituloSeo` ≤ 60 e estava acusando 13 erros (7 títulos + 6 descrições) que passaram sem ninguém rodar.
- **Títulos novos** (palavra buscada primeiro; só `tituloSeo`, o título na página não mudou):
  - et preços: "Autoremondi hinnad Tallinnas 2026: töötund ja õlivahetus"
  - ru preços: "Цены на ремонт авто в Таллинне 2026: час, масло, тормоза"
  - et escolher oficina: "Kuidas valida autotöökoda Tallinnas: 12 kontrollpunkti"
  - et seguro: "Kasko ja liikluskindlustus: remont pärast avariid"
  - ru seguro: "Ремонт после ДТП по каско и ОСАГО в Эстонии: пошагово"
  - et pneus: "Talverehvid kohustuslikud 2026/27: tähtajad, naastrehvid"
  - ru pneus: "Зимняя резина в Эстонии 2026/27: с какого числа, шипы, штраф"
- **Descrições ≤ 160** (6, cortes mínimos): et preços, it comparar orçamentos, et e ru escolher oficina, ru seguro (corrigido também "подменный авто" → "подменное авто"), en pneus.
- `validar-guias.mjs --sem-rede`: "tudo certo" (antes 13 erros). **Regra daqui pra frente:** rodar o validador antes de publicar guias.
- **Publicado** (commit 1c7c613, build OK): os 7 títulos conferidos no ar (58–69 caracteres), H1 das páginas inalterado; IndexNow 88 URLs (HTTP 200). As 29 "fontes inacessíveis" do validador eram falha de rede do computador do dono — do servidor todas respondem 200.
- **Resultado do 1º Site Scan do Bing** (tipo Website, 118 páginas): **0 erros**, 8 avisos, todos "Title too long": os 7 guias acima + a home italiana `/it/it` (74 caracteres — minha medição anterior pegou o título vazio por falha de rede e não conferi os zeros; agora repito a busca quando volta vazia).
- `/it/it`: `home.metaTitle` (messages/it.json) → "Riparazione auto in Italia: preventivi delle officine | BipFix" (62). Nenhum outro título fixo dos 6 idiomas passa de 60+marca.
- **Publicado** (commit 9d768c8, build OK): título de `/it/it` conferido no ar; homes 200; IndexNow 88 URLs (HTTP 200, rodado do servidor — a rede do computador do dono não resolvia o DNS).
- **2º Site Scan do Bing iniciado (17/10):** "BipFix Sitemap", tipo Sitemap (`https://bipfix.com/sitemap.xml`), limite 200 páginas — status "Queued". Ler o resultado quando terminar.
- **Yandex (17/10, de novo):** "Reindex pages" ainda só leitura.

## 18/10 — bipfix.pt (verificação, nada alterado)
- O domínio ainda não existe no DNS público ("Non-existent domain").
- A conta do IONOS (my.ionos.it) só tem o `bipfix.it` (contrato 300437012, "Pack Dominio"); o `bipfix.pt` não aparece nela — igual a 09/10. Falta descobrir onde o .pt foi comprado (outra conta/registrador, ou pedido não concluído).
- Servidor já pronto: bloco nginx `dominios-pais` com `bipfix.pt`/`www` → 301 `https://bipfix.com/pt/pt`; falta só o certificado (certbot), depois que o DNS responder.
- **WHOIS oficial (whois.dns.pt, 18/10):** `bipfix.pt - No Match` → o domínio **não está registrado** por ninguém; a compra nunca foi concluída. Próximo passo (dono): procurar o e-mail do pedido no IONOS Itália ou comprar de novo; depois eu aponto o DNS e emito o certificado.
- **Onde está:** o `bipfix.pt` foi comprado na **Hostinger** (não no IONOS). Estado na Hostinger: **"Registando"** ("pedido aceite e a ser processado… pode demorar algumas horas"), sem data de validade — parado desde ~09/10. O registro .pt (DNS.pt) ainda não tem o domínio.
- **DNS já ajustado na Hostinger (18/10, com OK do dono):** A `@` `2.57.91.91` (estacionamento da Hostinger) → **`204.168.139.154`**, TTL 300; CNAME `www` → `bipfix.pt` mantido. Sem MX. Nameservers da Hostinger (artemis/hermes.dns-parking.com).
- **Falta:** (dono) pedir ao suporte da Hostinger para destravar o registro; (eu, com OK para mexer no servidor) quando o domínio responder no DNS: certbot para `bipfix.pt` e `www.bipfix.pt`, teste de renovação e conferir o 301 num salto para `/pt/pt`.

## 18/10 — Abertura da RPyrus OÜ e site rpyrus.com
- **Empresa:** dono preencheu o registro no e-Business Register: **RPyrus OÜ**, capital 100 €, sede Tartu mnt 67/1-13b (Tallinn), pessoa de contato Dalanta OÜ (14330221, conferida ativa), estatuto padrão (diretoria 1–3, custos de fundação 265 € pagos pelo sócio, sem reserva legal, sem dispensa de notário), sem IVA por agora. Código de atividade: discutido (95401 intermediação de consertos / 58291 software / 64211 holding) — escolha do dono.
- **Domínio `rpyrus.com`** registrado pelo dono em 18/10 no Namecheap.
- **Site institucional** em pasta separada `../rpyrus-site` (git local, sem GitHub): `index.html` estático em inglês (estilo corporativo sóbrio, sem copiar a Deloitte), seções Sobre, Portfólio (BipFix), Parcerias (Rede Diretor, Brasil — texto a completar), Nome, Contato; sem cookies; conferido no celular (390/360 px sem rolagem lateral). A pedido do dono, **sem dados pessoais** (nome do fundador removido do texto e dos dados para buscadores).
- **Falta para publicar:** texto da parceria com a Rede Diretor (e logo só com autorização); criar o e-mail `info@rpyrus.com`; DNS no Namecheap (A `@`/`www` → 204.168.139.154); no servidor: pasta `/var/www/rpyrus`, bloco nginx e certbot (precisa do OK do dono).
- **Logo R.Pyrus** (18/10): "R" + ponto dourado (#c8a24a) na linha de base + "Pyrus", fonte Inter 800 convertida em vetor; versões escura e clara + ícone "R●". Inspirado na ideia da Deloitte (nome + ponto colorido), mas com ponto entre as letras e cor própria, para não confundir com a marca deles. **Parceria:** "Rede Diretor is a Brazilian group that provides software solutions for businesses such as gyms, hotels and other service companies. RPyrus is the official partner of Rede Diretor in Brazil."
- **Ícone quadrado (pedido do dono):** "R·P" com o ponto dourado no meio da altura das letras, versões escura e clara. O logo horizontal continua "R.Pyrus" com o ponto na linha de base.
- **Logo horizontal ajustado (pedido do dono):** "R·Pyrus" com o ponto no meio da altura das letras, igual ao ícone "R·P". Cor do ponto ainda em escolha (8 opções mostradas; ver `rpyrus-site/cores-preview.html`).
- **Cor escolhida pelo dono: laranja #f26b1d** (opção 2) no ponto do logo, no ícone, nos botões e nos textos sobre fundo escuro; **#b84a0c** nos textos pequenos sobre fundo claro (contraste 5,2:1, acima do mínimo 4,5:1; o laranja puro dá só 3,0:1 no branco). Corrigido também o texto do topo, que ficava cinza e grande por uma regra mais forte (`.hero p`).
- **Logo da BipFix no portfólio do rpyrus.com:** logo original (`apps/web/public/logo.png`, 800 px, azul-marinho) num quadro azul-claro, no lugar do texto "BipFix". A versão clara (`logo-dark.png`) ficaria com só 342 px úteis depois de recortar a margem e apareceria borrada. Celular 390/360 px sem rolagem lateral.
- **DNS do rpyrus.com no Namecheap (18/10, com OK do dono):** removidos CNAME `www` → parkingpage.namecheap.com e URL Redirect `@` → http://www.rpyrus.com/; criados **A `@` → 204.168.139.154** e **A `www` → 204.168.139.154** (TTL automático). Mail Settings mantido em "Email Forwarding" (SPF `include:spf.efwd.registrar-servers.com`). Propagação em andamento (o Namecheap ainda respondia o IP antigo 192.64.119.66 logo depois).
- **Servidor (18/10, com OK do dono):** arquivos públicos do site em `/var/www/rpyrus` (index.html, favicon.svg, assets/ com os logos; sem .git/README/scripts), dono www-data; nginx `/etc/nginx/sites-available/rpyrus` (rpyrus.com + www, HTTP, cabeçalhos nosniff/referrer/frame, cache de 30 dias nas imagens, logs `rpyrus-access.log`/`rpyrus-error.log`), `nginx -t` ok e reload; teste interno 200; bipfix.com continua 200. HTTPS (certbot) quando o DNS do Namecheap propagar. E-mail `info@rpyrus.com`: o dono compra amanhã (19/10).
- **Imagem de prévia (Open Graph):** `assets/og-image.png` 1200×630, 27 KB, fundo escuro, "R·Pyrus" centralizado (sobrevive ao corte quadrado do WhatsApp), "Technology company · Owner of BipFix" e "Tallinn, Estonia · rpyrus.com". Etiquetas og:image (+tipo, tamanho, alt), og:site_name e twitter:card no site; enviado ao servidor (200, image/png). A prévia só aparece no WhatsApp com HTTPS.
- **HTTPS no ar (18/10):** o DNS já estava certo desde cedo — conferido do servidor (dns1.registrar-servers.com, 8.8.8.8 e 1.1.1.1 respondem 204.168.139.154); o computador do dono recebia respostas antigas por causa da rede local (o celular já abria). `certbot --nginx -d rpyrus.com -d www.rpyrus.com`; config reescrita à mão (backup `/root/rpyrus-nginx-antes-www.bak`): endereço oficial `https://rpyrus.com`, `http://` e `www` → 301 num salto; HSTS de 1 ano; cabeçalhos de segurança também nas imagens. Conferido do servidor: redirecionamentos, 200 na página/og-image/logo, etiquetas og visíveis ao leitor do WhatsApp; bipfix.com continua 200. Teste de renovação (`certbot renew --dry-run`) em andamento.
- **Renovação do certificado testada (18/10):** `certbot renew --dry-run --cert-name rpyrus.com` → "all simulated renewals succeeded" (rodado no servidor com nohup, log `/root/rpyrus-renew-dryrun.log`, porque a conexão SSH do computador do dono caía). Renovação automática pelo `certbot.timer` (2x por dia).

## 19/10 — E-mail do bipfix.com (Private Email): passo a passo do Namecheap conferido (nada alterado)
- **Pedido do dono:** ver se faltou algum passo da configuração do Namecheap e por isso os e-mails caem em spam.
- **Conferido contra a página do Private Email:** MX `mx1`/`mx2.privateemail.com` (prioridade 10) ✓; SPF `v=spf1 include:spf.privateemail.com ~all` ✓; **DKIM** `privateemail._domainkey`: a chave publicada no DNS é idêntica à do painel (392 caracteres, mesmo SHA-256) ✓; DMARC `p=quarantine` ✓. Sem registros duplicados ou antigos. MX `send` (Amazon SES) é da Resend (e-mails do site) e deve ficar.
- **Aviso "You're almost set!" do painel:** é porque o "Mail Settings" está em **Custom MX** em vez de "Private Email"; os registros são os mesmos, então o efeito é só visual. **Não trocar:** mudar para "Private Email" pode apagar o MX `send` da Resend.
- **Conclusão:** nenhum passo pulado; com o mail-tester 10/10 de 16/10, o spam vem de reputação (servidores compartilhados do Namecheap + domínio novo), não de configuração.

## 19/10 — SEO: diagnóstico completo (Google + Bing) e correções para os dois públicos
- **Google Search Console (3 meses, até 17/10):** 4 cliques, 452 impressões, posição média 22,1. **Só ~10% das impressões (48 de 506) estão nos endereços novos** `/ee/...`; o Google ainda mostra os antigos (301 desde 09/10). Inspeção de `/ee/et/juhendid/talverehvid-eestis`: "URL is on Google", indexada, breadcrumbs válidos → indexação funciona; o problema é posição.
- **Links externos: 0** (relatório Links do Search Console). É a causa principal da posição baixa num domínio de abril/2026 — e coerente com o "Blocked" do Bing (domínio sem nenhum sinal de confiança de fora). Fonte (Google, mudança de URLs): sinais passam pelo 301, a recuperação costuma levar semanas a ~3 meses, e acelera com links de sites relevantes para os endereços novos.
- **Técnico (88 páginas do sitemap, lidas como Googlebot do servidor):** todas 200, ~33 ms, canonical próprio, hreflang em todas, dados estruturados (Organization, WebSite, Article, FAQPage, BreadcrumbList, SoftwareApplication), média de 1.159 palavras. Pontos fracos: páginas finas (acidente, sobre, ajuda e lista de guias: 160–290 palavras).
- **Concorrência pesquisada:** motoristas — **fixauto.ee** (mesmo modelo, "Võrdle autohoolduse ja autoremondi hinnapakkumisi", 313 palavras na home); oficinas — Autorsoft, Hoolduskeskus, AutoFutur, Trumpauto ("autoteeninduse tarkvara"). As nossas páginas têm mais conteúdo que as deles; o que falta é autoridade (links).
- **Buscas com posição boa e 0 cliques:** "система управления автосервисом" (pos. 3), "talverehvid lubatud 2026" (4), "с какого числа зимняя резина в эстонии" (5,5), "liiklusõnnetus" (8), "talverehvid keelatud 2026" (9,3).
- **Corrigido (para os dois públicos):**
  - página das oficinas em et: título "Autotöökoja Haldustarkvara ja Rohkem Kliente" → **"Autoteeninduse tarkvara ja uued kliendid"** (termo que as oficinas buscam e que os concorrentes usam); descrição começa com "Autoteeninduse tarkvara";
  - it: "Sistema di Gestione per Officine Meccaniche e Più Clienti" → **"Gestionale per officine meccaniche e più clienti"** ("gestionale" = termo buscado na Itália);
  - maiúsculas de título em inglês (estranhas nessas línguas) trocadas por maiúscula só no início: et "Korduma kippuvad küsimused", it "Domande frequenti", pt e pt-PT "Perguntas frequentes", títulos de oficina em pt e pt-PT.
  - `checar-traducoes.mjs` ok nos 6 idiomas; `tsc` ok.
- **Não dá para resolver por código (dono):** conseguir links de sites reais — ver lista na conversa de 19/10 (oficinas parceiras, diretórios estonianos, perfis da empresa, imprensa/startups). Perfil da Empresa no Google: a BipFix não se qualifica (serviço só online, sem atendimento presencial; endereço virtual não é aceito pelas regras do Google).
- **Publicado** (commit 02fcfd8, build OK, rodado no servidor com nohup): conferido no ar — et "Autoteeninduse tarkvara ja uued kliendid | BipFix", it "Gestionale per officine meccaniche e più clienti | BipFix", pt e pt-PT com maiúscula só no início, "Korduma kippuvad küsimused" na home et. IndexNow 88 URLs (HTTP 200, rodado do servidor — a rede do computador do dono não resolvia o DNS).
- **Bing "Discovered but not crawled – URL cannot appear on Bing":** o Bing conhece a página mas decidiu não ler (domínio novo, sem links, marcação de confiança). Texto do pedido de suporte entregue ao dono (atualizado com o Site Scan 0 erros); envio é do dono.
- **E-mail do Search Console de 07/10 ("Duplicate without user-selected canonical" / "Google chose different canonical"):** conferido em 19/10 — são só 6 endereços antigos, lidos pela última vez entre 28/09 e 03/10 (antes da mudança): `/pt-pt/termos`, `/en/terms`, `/et/privaatsus`, `/it/aiuto/automobilisti`, `/en/docs/cliente`, `/en/docs/oficina`. Todos fazem hoje 301 num salto para o endereço novo, que responde 200 com canonical próprio. Resolvido; o relatório limpa quando o Google reler os antigos.

## 19/10 — Yandex Webmaster: pendências (nada alterado)
- Painel ainda com a pane dos data centers (dados de 07/10, ferramentas em modo leitura).
- **4 recomendações (todas de 30/09):**
  1. "Favicon file not found" → **já resolvido**: `/favicon.ico` responde 200 (image/x-icon, 579 B) também para o YandexBot, e as páginas declaram `<link rel="icon">`. O aviso é antigo.
  2. "No Sitemap files are currently used" → o `sitemap.xml` **já foi enviado em 29/09** e está "na fila de processamento" (1–2 semanas, travado pela pane). Nada a fazer.
  3. "Specify a region for your site" → região não definida. Sugerido ao dono: **Tallinn** (o conteúdo em russo é todo da Estônia); o Yandex pede uma página do site que comprove a região. Decisão do dono.
     **Decisão do dono (19/10):** fazer quando o Yandex voltar (Tallinn, comprovando com `/ee/ru/o-nas`). Junto: reenviar Reindex de `/` e `/ee/ru/stati/ceny-na-remont-avto-v-talline`.
  4. "Add your site to Yandex Business" → **não se aplica**: é para negócio com local físico (como o Perfil da Empresa do Google); a BipFix é só online.
- Títulos/descrições duplicados (100/98): continuam sendo dados antigos de 29–30/09; as 88 páginas atuais não têm duplicados.

## 20/10 — RPyrus OÜ registrada
- **RPyrus OÜ**, registrikood **17628754**, status R (registrada), sede Tartu mnt 67/1-13b, 10115 Tallinn (Harju maakond, Kesklinna linnaosa). Ficha: https://ariregister.rik.ee/est/company/17628754/RPyrus-OÜ
- Próximos passos: conta bancária (dono tem reunião com a Revolut em 21/10; alternativa Wise Business), transferir os 100 € de capital, D-U-N-S, contador; atualizar rpyrus.com e os dados da empresa no bipfix.com (termos, privacidade, rodapé, Organization, llms.txt) — aguardando OK do dono.

## 20/10 — Dados da RPyrus OÜ nos sites (com OK do dono)
- **bipfix.com, 6 idiomas** (script que só troca o texto atual exato, 52 trocas, 1x cada):
  - **Termos (UE: en, et, ru, it, pt-PT):** seção 1 agora diz que a plataforma é operada pela **RPyrus OÜ** (registrikood 17628754, sede Tartu mnt 67/1-13b, 10115 Tallinn); saiu "em registro / operada pelo fundador como pessoa física". Seção de alterações sem o exemplo "quando o registro for concluído".
  - **Privacidade (UE):** controlador = RPyrus OÜ, com registro e sede; mesma limpeza na seção de alterações.
  - **Brasil (LGPD):** os termos e a privacidade **não identificavam o operador/controlador** (a LGPD exige a identidade do controlador) — acrescentado em `termos.body1a` e `privacidade.body1` (sem `<strong>` na privacidade, que usa texto puro).
  - Data "última atualização" de termos e privacidade: **20/10/2026** nos 6 idiomas.
  - "Seja parceiro" (quem somos), "Sobre" (empresa) e **rodapé** ("2026 BipFix · RPyrus OÜ (registrikood 17628754)…") nos 6 idiomas.
  - `llms.txt`: "operated by RPyrus OÜ … https://rpyrus.com"; dados para buscadores (Organization): `parentOrganization` RPyrus OÜ com registrikood e endereço.
  - `checar-traducoes.mjs` ok; `tsc` ok.
- **rpyrus.com:** "registration in progress" → "Registry code 17628754"; CEP 10115 no contato e no rodapé; `identifier` e `postalCode` nos dados para buscadores.
- **Publicado** (commit 34596df, build OK; rpyrus.com enviado por scp). Conferido no ar: termos/privacidade/sobre em en, et, ru, it, pt-PT e pt (Brasil, com negrito só nos termos; nenhum `<strong>` cru na privacidade), rodapé com o registrikood, `parentOrganization` nos dados para buscadores, `llms.txt`; páginas 200. IndexNow 88 URLs (do servidor). **E-mail da RPyrus a criar pelo dono:** `info@rpyrus.com` (é o que o site mostra).

## 20/10 — E-mail do rpyrus.com no Zoho: DNS no Namecheap (com OK do dono)
- Zoho (conta no centro de dados .com, organização "bipfix" no Zoho Directory) pediu 4 TXT para o rpyrus.com. Feito no Namecheap:
  - TXT `@` `zoho-verification=zb48753305.zmverify.zoho.com`;
  - TXT `20102247177._domainkey` (DKIM e-mails comuns) e TXT `zc943509978._domainkey` (DKIM marketing) — conferidos pela impressão digital (SHA-256) contra a página do Zoho e depois no DNS público;
  - TXT `@` SPF `v=spf1 include:one.zoho.com -all` (o `one.zoho.com` inclui `spf.zoho.com`, `zeptomail.net` e `zcsend.net`).
- **Mail Settings:** "Email Forwarding" → **Custom MX** (o modo antigo criava um SPF próprio `include:spf.efwd.registrar-servers.com`, e um domínio só pode ter um SPF; não havia nenhuma caixa ativa no rpyrus.com). MX: `mx.zoho.com` 10, `mx2.zoho.com` 20, `mx3.zoho.com` 50 (valores genéricos da documentação do Zoho Mail para o centro .com).
- Falta: propagação (checagem automática rodando), clicar "Validate Records" no Zoho, criar a caixa `info@rpyrus.com` no Zoho Mail e, depois, um DMARC (`_dmarc`).
- **Propagado e validado (20/10):** DNS público (8.8.8.8) com os 3 MX do Zoho, SPF `include:one.zoho.com` (o SPF antigo do Namecheap saiu), verificação e os 2 DKIM. Zoho Directory: Ownership, DKIM (comuns e marketing) e SPF = **VERIFIED**. "Sender Email" = UNVERIFIED até a caixa `info@rpyrus.com` existir e confirmar o e-mail do Zoho.
- **BIMI (logo do remetente na caixa de entrada), 20/10:** o formulário do Zoho exige (1) DMARC `p=quarantine` ou `p=reject` a 100%, (2) logo em SVG Tiny PS por HTTPS e (3) **URL do certificado VMC (obrigatório)**. VMC: ~1.000–1.500 US$/ano (DigiCert/Entrust) e **exige marca registrada** do logo; a alternativa CMC dispensa a marca, mas pede o logo em uso há ≥ 1 ano. Sem o certificado, Gmail/Apple não mostram o logo e o Zoho não salva → **BIMI adiado** (decisão de custo/marca do dono). Não foi colocado nada no Namecheap para o BIMI.
- **DMARC já existe** (criado pelo dono/Zoho): `v=DMARC1; p=none; rua=mailto:info@rpyrus.com; ruf=mailto:info@rpyrus.com; sp=none; adkim=r; aspf=r`. Recomendação: manter `p=none` 1–2 semanas, conferir nos relatórios que os e-mails legítimos passam, depois subir para `p=quarantine` (requisito do BIMI e igual ao bipfix.com).
- Caixa `info@rpyrus.com` criada no Zoho Mail pelo dono.

## 20/10 — bipfix.com: preparação para mudar o e-mail do Private Email para o Zoho (passo 1, com OK do dono)
- Verificação de dono do `bipfix.com` no Zoho já existia (TXT `zoho-verification=zb79133156.zmverify.zoho.com`, posto pelo dono).
- **SPF combinado** (sugestão do próprio Zoho, para os dois funcionarem na transição; continua 1 SPF só): `v=spf1 include:one.zoho.com include:spf.privateemail.com ~all`.
- **DKIM do Zoho** `zmail._domainkey` adicionado (234 caracteres, conferido por SHA-256 com a página do Zoho e depois no DNS). DKIM `privateemail` e `resend` mantidos.
- **Recebimento NÃO mudou:** MX continuam `mx1/mx2.privateemail.com`; MX `send` (Amazon SES/Resend) intacto; DMARC `p=quarantine` intacto.
- Próximos passos: (2) criar no Zoho os endereços do bipfix.com (aliases da caixa ou caixa nova) e migrar os e-mails antigos; (3) trocar os MX para mx/mx2/mx3.zoho.com (10/20/50); (4) dias depois, tirar `spf.privateemail.com` do SPF e o DKIM `privateemail`, e cancelar o Private Email (renova 08/10/2027).
- **Passo 2 (20/10):** endereços do bipfix.com no Private Email = caixa `contato@` + 7 aliases (`admin@`, `commercial@`, `noreply@`, `privacidade@`, `privacy@`, `support@`, `vitor.pereira@`). **Criados no Zoho como aliases da caixa `info@rpyrus.com`** (sem licença extra; endereço principal continua `info@rpyrus.com`, "Set as Mailbox Address" desmarcado) — conferidos na lista de aliases: os 8.
- **Migração (Zoho Data Migration "Private Email bipfix.com"):** IMAP `mail.privateemail.com` SSL 993, todas as pastas menos Spam, todos os e-mails, sem POP, com aviso de status; origem `contato@bipfix.com` (senha digitada pelo dono) → destino `info@rpyrus.com`. Em andamento; o dono já vê os e-mails antigos no Zoho.
- Falta: passo 3 (trocar MX do bipfix.com para o Zoho, mantendo o MX `send` da Resend) quando a migração terminar e o dono der o OK.
- **Passo 3 (20/10, OK do dono): MX do bipfix.com trocados para o Zoho.** No Namecheap (Mail Settings = Custom MX) as linhas `mx1/mx2.privateemail.com` foram editadas para `mx.zoho.com` 10 e `mx2.zoho.com` 20 (preenchidas por mim, salvas pelo dono) e o dono acrescentou `mx3.zoho.com` 50. Conferido do servidor: `dns1.registrar-servers.com`, 8.8.8.8 e 1.1.1.1 já respondem os 3 MX do Zoho; MX `send` → `feedback-smtp.us-east-1.amazonses.com` (Resend) intacto; SPF combinado inalterado.
- A migração continua lendo direto da caixa antiga do Private Email (IMAP), então não é afetada pela troca.
- Falta: dono testar envio para `contato@` e `support@bipfix.com` (devem cair em `info@rpyrus.com` no Zoho); em 1–2 dias rodar a migração de novo (e-mails que ainda caíram no Private Email por cache de DNS); passo 4 (tirar `include:spf.privateemail.com` do SPF e o DKIM `privateemail`, cancelar o Private Email).
- **MTA-STS (pergunta do dono):** opcional (criptografia obrigatória na entrega, não afeta spam). Fica para depois do passo 4: registro A `mta-sts` → servidor, TXT `_mta-sts` `v=STSv1; id=...`, arquivo `https://mta-sts.bipfix.com/.well-known/mta-sts.txt` (nginx + certbot) com `mode: testing` e `mx: mx.zoho.com / mx2.zoho.com / mx3.zoho.com`; opcional TXT `_smtp._tls` (TLS-RPT). Depois de 1–2 semanas sem problemas, `mode: enforce`.

## 20/10 — Assinatura de e-mail BipFix + RPyrus
- Nova assinatura em `Documentos/Assinatura_Email_BipFix_RPyrus.html` (local, fora do repositório): a mesma da BipFix (logo, nome, cargo, e-mail, site) + linha final com o logo R·Pyrus e "BipFix is a product of RPyrus OÜ · Registrikood 17628754 · Tartu mnt 67/1-13b, 10115 Tallinn".
- Logo da RPyrus em PNG para e-mail (os programas de e-mail não mostram SVG): `rpyrus-site/assets/rpyrus-logo-email.png` (350×96, mostrado a 66×18), gerado do SVG com sharp; enviado para `/var/www/rpyrus/assets/` (https://rpyrus.com/assets/rpyrus-logo-email.png → 200) e commitado no repositório local `rpyrus-site` (23dde78). Logo da BipFix: `https://bipfix.com/logo.png`.
- Instalação: Zoho Mail → Settings → Signature (feita pelo dono).
- **Teste de entrega (20/10):** e-mail do bipfix.com pelo Zoho caiu no spam do destinatário. Conferido no Zoho Mail Admin: MX, SPF e DKIM `zmail` (Verified, ativo, padrão) ok. **mail-tester.com: 9,5/10**; só −0,5 por 1 imagem sem `alt` na assinatura (o editor do Zoho tirou o `alt` ao colar; corrigir no modo HTML da assinatura). Conclusão: autenticação ok; spam = reputação nova do domínio no Zoho → aquecer (marcar "não é spam", adicionar aos contatos, responder, e-mails com texto de verdade).

## 21/10 — Primeiro pedido real na Estônia sem oficina: contato com oficinas
- Pedido nº 100093 (21/10, EE, aberto, tipo "outro"): Škoda Superb 2007, troca da pinça de freio traseira direita + balanceamento, Tallinn Kesklinn, sem fotos. 0 oficinas ativas no banco. Lido do banco com permissão do dono, sem dados pessoais do cliente.
- Regra do sistema (hook `use-solicitacoes`, migração 056): a oficina vê o pedido se a especialidade for compatível e ele estiver no raio dela (padrão 30 km), mesmo que ela se cadastre depois do pedido, enquanto ele estiver aberto. Oficinas novas nascem `ativa=false` → o dono precisa ativar rápido quem se cadastrar.
- Em `Documentos/` (local, fora do repositório): `Email_Oficinas_Solicitacao_Cliente_2026-10-21.md` (e-mail ET/RU/EN com o resumo do pedido, link de cadastro por língua e linha STOPP) e `Marketing_Tallinn/Lista_10_Oficinas_Pedido_100093.xlsx` (10 oficinas de prioridade Alta, oficina geral, e-mail da empresa, Kesklinn/Lasnamäe/Kristiine, tiradas da planilha `Oficinas_Tallinn.xlsx`; a planilha principal não foi alterada porque estava aberta). Links de cadastro conferidos: 200.

## 21/10 — Página da BipFix no Facebook: imagens
- `Documentos/Marketing_Tallinn/facebook_perfil.png` (720×720, ícone `icon-512.png` sem margem, centralizado em fundo branco, cabe no círculo) e `facebook_capa.png` (1640×624: logo, "Võrdle autoremondi hinnapakkumisi Tallinnas", linha para oficinas, linha RU/EN, botão bipfix.com; texto dentro da área central que o celular mostra). Gerados com sharp (script no scratchpad).
- Sugestão de página: nome "BipFix", categorias Internet Company / Software Company (não "oficina", a BipFix não conserta carros), bio ET de 93 caracteres. Quando existir, o link entra no `sameAs` da Organization (precisa de deploy com OK).
- Post de boas-vindas: `Documentos/Marketing_Tallinn/facebook_post_tere_tulemast.png` (1080×1350, "Tere tulemast!", 3 passos, "Töökojad: liitu asutajapartnerina – tasuta", bipfix.com) + texto ET/RU/EN entregue no chat (sem promessas de rede: diz que as primeiras oficinas estão entrando).

## 21/10 — Revisão dos materiais impressos e estratégia de flyers
- Conferido: flyers A/B/C (ET/EN, 29/09) continuam coerentes com o site (0 € mensalidade, 0 % comissão na fase de fundador, 30 dias de aviso). QR antigo `bipfix.com/et/hakka-partneriks?utm_source=flyer_*` → 1 redirecionamento → `/ee/et/hakka-partneriks` (200, UTM mantido); endereços curtos `/et|en|ru/partner` → 2 redirecionamentos → página de cadastro certa (200).
- Faltam: versão **RU** dos flyers; numa reimpressão, QR direto para `/ee/...` e linha "RPyrus OÜ"; revisão de nativo no estoniano (já apontada no LEIA-ME).
- Estratégia sugerida ao dono: entrega em mãos pelo vendedor (prioridade Alta/Média dos bairros perto) + correio Omniva só para endereços confirmados + ligação/e-mail de seguimento. Selo de carta comum ~1,5 € (ERR, 2026); impressão A5 ~30–60 € por 500.

## 21/10 — Teste de correio: 10 flyers (frente ET, verso RU)
- Flyer A gerado em RU pela primeira vez ("Пустой подъёмник не приносит денег.") a partir do script original (`marketing.js` da sessão de 29/09, adaptado): QR direto para `/ee/et/hakka-partneriks` e `/ee/ru/stat-partnerom` com `utm_source=flyer_a_post&utm_medium=post&utm_campaign=tallinn_post_2026_10` (para medir o correio separado), linha "BipFix · RPyrus OÜ, registrikood 17628754". Sem estouro de texto.
- Arquivos (Documentos/Marketing_Tallinn, locais): `flyer_A_correio_ET.png/.pdf`, `flyer_A_correio_RU.png/.pdf`, **`flyer_A_correio_frente-ET_verso-RU.pdf`** (2 páginas A5, 420×596 pt, para a gráfica), `Lista_10_Oficinas_Correio_2026-10-21.xlsx` (10 oficinas de prioridade Alta diferentes das 10 do e-mail, sem endereço com nº de apartamento) e `Etiquetas_Correio_10_Oficinas.txt` (remetente RPyrus OÜ + 10 destinatários).

## 21/10 — Pastas privadas fora do git
- `.gitignore`: acrescentados `Documentos/` e `Docs Rpyrus/` (o ärakiri do registro tem o isikukood do dono; Documentos tem listas de oficinas e rascunhos). Nenhum arquivo dessas pastas estava no repositório (conferido com `git ls-files`), só não estavam protegidas.
- Comprovante de endereço da empresa para o Revolut: ärakiri do Äriregister (20/10) + fatura paga da Dalanta (endereço legal 1 ano).

## 21/10 — Capital social e pendências no e-Äriregister
- Revolut Business da RPyrus OÜ aberto (IBAN lituano do Revolut). **Capital de 100 € transferido em 21/10** pelo dono, descrição "Share capital contribution - RPyrus OU 17628754 - Vitor Rodrigues Pereira" (comprovante em Downloads/transaction-statement.pdf).
- Conferido no e-Äriregister (logado pelo dono): sem avisos, sem pedidos em preparação; registro público mostra "Osakapital on 100 €", osamaks 100 EUR, sem nota de capital não pago. Falta confirmar no `kandeavaldus` da fundação o que foi marcado no passo 13 ("Contribution into the share capital").
- **Domínio `rpyrus.ee` reservado com a fundação até 27.10.2026 23:59** (código de autorização no portal). Precisa ser registrado num registrador .ee até essa data ou a reserva cai — decisão do dono.
- Portal oferece e-Financials (contabilidade) grátis por 1 ano.
- `kandeavaldus` da fundação lido (com OK do dono): "Juhatus kinnitab, et sissemaksed on osaühingule tasutud" → capital declarado como pago; a transferência de 21/10 comprova; **nada a registrar no Äriregister**.
- e-Financials: pedida a apresentação (para admin@bipfix.com) e preenchido o formulário do contrato (endereço legal, e-mail); **dono aceitou e assinou** o contrato (1º ano grátis, prazo fixo de 12 meses, termina sozinho).
- Para a contabilidade: taxa estatal de 265 € (fundação) e fatura Dalanta 153,76 € foram pagas pelo dono antes da conta existir → lançar como dívida da empresa com o sócio (reembolsável sem imposto).

## PARA AMANHÃ (22/10) — combinado com o dono
1. **e-Financials, primeiros lançamentos** (junto com o dono, ele confirma cada um):
   - cadastrar a conta Revolut Business (IBAN do comprovante em Downloads/transaction-statement.pdf);
   - capital social 100 € (21/10, comprovante Revolut);
   - despesas de fundação pagas pelo dono: taxa estatal 265 € (19/10) e fatura Dalanta nº 7954 153,76 € (20/10) → contrapartida "võlg osanikule" (418,76 € reembolsável sem imposto).
2. **`rpyrus.ee`**: reserva vence 27/10 23:59 — decidir e registrar num registrador .ee com o código de autorização do portal.
3. Ver respostas/cadastros das 10 oficinas do e-mail (pedido 100093) e ativar quem entrar; seguir com a cliente do pedido 100093 se necessário.
4. Pendentes do e-mail: rodar de novo a migração Zoho (1–2 dias após 20/10); depois tirar `include:spf.privateemail.com` e o DKIM `privateemail`; cancelar Private Email.
- Correção: carta comum doméstica Omniva = **1,80 €** desde 01/02/2026 (omniva.ee, comunicado de tarifas), não ~1,5 €.
- Imprimir e enviar sem ir ao correio: **Pingen** (envia para "outros países" incl. Estônia via DHL; sem mensalidade/mínimo; ~US$1,43 envio + 0,22–0,44 envelope + 0,06/folha + 0,22/página colorida ≈ US$2,4 por carta A4 colorida frente e verso). Omniva tinha um serviço de carta pelo e-service (imprime, envelopa, selo), mas a página antiga dá 404 — confirmar com a Omniva. Para isso o flyer precisaria de versão **A4**.
- **Planilha principal atualizada** (`Oficinas_Tallinn.xlsx`, via exceljs mantendo formatação/listas; backup `Oficinas_Tallinn_backup_2026-10-21.xlsx`): 10 oficinas do e-mail → "E-mail 1 enviado", data 21/10, observação "pedido 100093"; 10 do correio → observação "carta/flyer ET-RU preparado (não enviado)"; 10 do lote de amanhã → observação "Lista e-mail 22/10".
- **Lote 2 para 22/10** pronto em `Documentos/Emails_Oficinas_2026-10-22.md`: Tõukur, VV Auto, Gold Selection (kummid24), Hybrid Remont, Rivare Auto, TopServ, ESRacing, RR Autokeskus, Socius (Fordikeskus), Korea Auto. Trocadas 3 inadequadas (Krooni Service = táxi, Jappa = revestimento cerâmico, Care Pro = estética). Texto genérico de parceiro fundador citando o pedido real da semana; link ET; linha RU/EN; STOPP.

## 22/10 — 1º relatório DMARC do rpyrus.com (Microsoft, dia 20/10)
- 1 e-mail de rpyrus.com para outlook.ie, IP 165.173.180.55 (Zoho): **SPF pass, DKIM pass (seletor `rpyrus`), DMARC alinhado**, política p=none. Tudo certo. Obs.: o seletor DKIM em uso é `rpyrus` (não os de 20/10 `20102247177`/`zc943509978`) — provavelmente criado no Zoho pelo dono; funciona.
- **Impacto dos 10 e-mails de 21/10 (checado 22/10):** 0 oficinas cadastradas (tabela `oficinas` vazia); só 1 perfil novo desde 21/10 (a cliente do pedido 100093). Log nginx (`fixauto-access.log`): acessos diretos à página de cadastro em 21/10 — 10:03 IP italiano (o dono); 10:15–10:17 dois IPs 72.145.83.x (Mac, abre ET e pula para EN em 2 s; padrão de verificador automático de links, provável); **10:28 IP estoniano 217.159.219.171 (Mac) abriu ET e trocou para a versão RU** — provavelmente uma oficina real que fala russo, sem cadastro. Respostas no Zoho não verificadas (grupo de abas do Chrome fechado).
- **Lote 3 (extra) para 22/10:** 5 e-mails ET + parágrafo RU com link `/ee/ru/stat-partnerom` em `Documentos/Emails_Oficinas_2026-10-22_extra.md` — Kassi Auto, Mäealuse Autobox, Mootori Meistrid, Autoco, Autohouse (prioridade Alta/Média, oficina geral, e-mail da empresa, com site, não contatadas). Marcadas na planilha "Lista e-mail 22/10 (extra ET+RU)".
- **22/10 enviados:** planilha atualizada — 15 oficinas (lote 2: 10 ET; lote 3: 5 ET+RU) como "E-mail 1 enviado", data 22/10. Total contatado por e-mail até agora: 25 (+10 com carta preparada, não enviada).

## 22/10 — SEO da página para oficinas a partir do que os donos buscam
- Pesquisa no autocompletar do Google (gl=ee, pelo servidor): ET quase sem volume B2B, mas aparecem "töökoja tarkvara", "autoremondi tarkvara", "hinnapakkumise (koostamise) programm", "uute klientide leidmine", "rehvivahetus online broneerimine", "broneerimissüsteem tasuta"; RU com muito volume: "программа для автосервиса (бесплатно / заказ-наряд / андроид)", "crm для автосервиса (бесплатно / в excel)", "как найти клиентов в автосервис", "реклама автосервиса", "учет в автосервисе / учет запчастей"; EN: "garage management software (free)", "auto repair shop software (free)", "how to get more customers in my auto repair shop". Padrão forte: **grátis/бесплатно/free**.
- Alterado (`messages/et|ru|en.json`, `paraOficinas`): metaTitle → ET "Tasuta töökoja tarkvara ja uued kliendid", RU "Бесплатная программа для автосервиса и новые клиенты", EN "Free Garage Management Software & More Customers"; metaDescription reescrita com os termos buscados; perguntas do FAQ 1 e 2 no formato da busca ("Kuidas saada autoteenindusele rohkem kliente?", "Как найти клиентов для автосервиса с BipFix?", "How can my auto repair shop get more customers?" e "…Excel…"); metaKeywords ampliadas. "Grátis" é verdade hoje (sem mensalidade nem comissão, aviso de 30 dias nos termos). Não usei "заказ-наряд"/"CRM"/agendamento online pelo cliente porque o sistema não tem essas funções. `checar-traducoes` ok. **Não publicado** — precisa de deploy com OK do dono.
