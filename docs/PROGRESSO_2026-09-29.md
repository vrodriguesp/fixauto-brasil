# Progresso — 29/09/2026: SEO para todos os buscadores e IAs, português de Portugal e guias

## Problema relatado
No google.it, os resumos do BipFix apareciam em inglês, e o site tinha 0 cliques orgânicos.

## Causas encontradas (auditoria do HTML que os robôs recebem)
1. **A home entregava só "Carregando…"** (12–16 palavras) em todos os idiomas. O Google via `/it`, `/et` e `/en` como cópias vazias umas das outras e escolheu a inglesa como canônica. É a causa direta do resumo em inglês.
2. **`www.bipfix.com` era um segundo site** (200, sem redirecionamento). O Google indexou a versão `www`, com título antigo do Brasil.
3. Login e cadastro herdavam o canonical e o título da home.
4. x-default apontava para o Brasil; `hreflang` sem região (`pt`).
5. Seletor de idioma com botões (os robôs não descobriam as outras versões); rodapé só na home.
6. Português de Portugal inexistente: Portugal recebia a versão brasileira (LGPD, CPF).
7. Search Console: `/et` (mercado-piloto) **nem existia** para o Google; `/it` e `/en` estavam indexadas com o conteúdo antigo, rastreado em 26/09.

## O que foi feito (commits `10eadba`, `0039e9c`, `329ad59` e intermediários)
- **nginx (VM):** `www` → 301 para `bipfix.com`; HTTP/2; HSTS, nosniff e Referrer-Policy. Backups em `/root/nginx-fixauto-backup-20260929` e `…20260929b`. WebSocket do Supabase testado antes e depois (101).
- **Home renderizada no servidor** (400–517 palavras por idioma); respostas do FAQ sempre no HTML.
- **Novo idioma `pt-PT` (`/pt-pt`)**, com textos traduzidos do inglês (a versão da UE) pelo Fable 5.1 e validados (2.157 textos, 0 erros). Política RGPD e termos da UE. `pt` continua Brasil.
- **Sem redirecionamento automático por idioma** (prática recomendada pelo Google). Um aviso (`SugestaoIdioma`) sugere a versão do navegador.
- `hreflang` com região (pt-BR, pt-PT, en, et, it) e x-default → en; `Content-Language` por resposta (Bing); `<html lang>` com região.
- Mapas de idioma centralizados em `src/i18n/routing.ts` (`LOCALE_PREFIX`, `HREFLANG`, `OG_LOCALE`, `caminhoNoIdioma`, `isBrasil`).
- Rodapé comum com links para as páginas-chave e para as 5 versões (`<a hreflang>`); seletor de idioma com links.
- Login e cadastro com `noindex, follow` e fora do sitemap; 404 traduzido.
- **Guias** (`content/guias/*.json`, `/guias`, `/guias/[slug]`): 4 guias em 11 versões, pesquisados pelo Fable 5.1 em fontes oficiais estonianas e reconferidos:
  - pneus de inverno na Estônia;
  - o que fazer depois de um acidente na Estônia;
  - inspeção técnica (tehnoülevaatus);
  - como comparar orçamentos de oficina, em 5 idiomas.

  Cada guia tem Article + FAQPage + BreadcrumbList. O validador é `scripts/validar-guias.mjs`, com fallback para curl porque os sites do governo estoniano bloqueiam o cliente HTTP do Node.
- **Perfil da oficina renderizado no servidor** (`perfil-dados.ts`):
  - 404 real para oficina inexistente ou desativada;
  - só campos públicos do dono (antes, `profiles(*)` expunha o e-mail);
  - horário real, em vez do texto fixo "Seg–Sex 08–18" igual para todas;
  - sem `priceRange` inventado.
- **Sitemap:** homes sem barra final, `lastmod` real, guias só nos idiomas existentes.
- **`robots.txt`** com os prefixos públicos e buscadores e IAs explícitos; `llms.txt` gerado a partir dos guias.
- **Peso das páginas públicas:** 170 KB → 81 KB. Só os textos usados pelos componentes de navegador vão no HTML; os painéis logados recebem todos via `MensagensDaArea`.
- **IndexNow** (chave pública em `public/`, `npm run indexnow` depois de cada deploy): 61 URLs enviadas.
- **Search Console:** sitemap reenviado; indexação pedida para `/it`, `/pt-pt`, `/et`, `/en` e `/et/guias/winter-tyres-estonia`.
- **Verificação:** auditoria em produção de 60 páginas × 5 idiomas, 0 problemas; revisão independente de SEO pelo Fable 5.1, todos os achados de código resolvidos e reauditados.

## Noite de 29/09 — russo, flyers, comissão e correções do admin
- **Versão em russo `/ru`** no ar (commit `937d3ff`):
  - interface completa e os 4 guias;
  - revisão independente do Fable 5.1 (8→9/10, cerca de 70 correções, nenhum fato alterado);
  - seletor de idioma **sem bandeira** (idioma, não país) e `hreflang="ru"` no sitemap (69 URLs);
  - IndexNow: 75 URLs aceitas.
- **Flyers:** o endereço impresso era `bipfix.com/seja-parceiro` (sem idioma, abria a versão do Brasil). Agora é `bipfix.com/et/partner`, `/en/partner` (e `/ru`, `/it`, `/pt-pt`), um redirecionamento 307 para a página no idioma certo com `utm_source=endereco_curto`. Os 20 materiais foram regerados. O QR continua abrindo direto `/{idioma}/seja-parceiro` com `utm_source=flyer_a/b/c`.
- Termos e privacidade europeus listam todas as versões (inclui pt-PT e russo).
- **Comissão em hierarquia** (migração 027, `lib/comissao-regras.ts`, único lugar que decide a taxa):
  1. **Taxa individual** da oficina ou fornecedor, com prazo (`override_ate`) e motivo. Vale sobre a global.
  2. Senão, a **regra global** (`plataforma_config`): `isento` (0%, estado atual, como o site promete), `fixa` ou `desempenho` (5–15% serviços, 1–3% peças).

  Com 0% nada é lançado. A oficina vê de onde vem a taxa (fase sem comissão / condição especial até X / taxa fixa) nos 6 idiomas; o orçamento sem comissão mostra um aviso em vez da caixa "absorver/repassar". O teste `scripts/teste-comissao-hierarquia.ts` passa nos 9 cenários e limpa o que criou.
- **Parceiro fundador:** selo em `oficinas` e `lojas_pecas`, protegido por trigger (a oficina ou loja não consegue se marcar; só o admin). Em Admin → Comissões:
  - marcar/desmarcar o selo;
  - filtrar as fundadoras;
  - "Oferta para parceiras fundadoras", que aplica a mesma taxa individual, com prazo, a todas de uma vez.
- **Correções do admin** (`/api/admin/corrigir`, motivo obrigatório, cliente e oficina avisados):
  - status de orçamento;
  - agendamento (status e datas);
  - etapas do conserto (acrescentar/remover);
  - status de emergência e de pedido de peça.

  A troca de status da solicitação e o cancelamento de agendamento também passam a ser registrados. O registro fica em `admin_auditoria`, com a tela **Admin → Histórico do admin** e o histórico no detalhe de cada solicitação. Correção manual não dispara efeitos automáticos (por exemplo, marcar pedido como entregue não lança comissão).
- Bug corrigido: a página da oficina no admin lia `comissao_config` pelo navegador, que a RLS bloqueia para o admin. Por isso mostrava sempre a taxa padrão.

## Pendente — precisa do usuário
1. ~~Bing, Yandex e Search Console~~ **feito em 29/09 pelo navegador do usuário:**
   - **Bing:** sitemap enviado na propriedade `https://bipfix.com/` (processando).
   - **Yandex:** adicionada e verificada a propriedade certa, `https://bipfix.com` (antes só existia `http://www.bipfix.com`), com o sitemap na fila (1–2 semanas).
   - **Search Console:** indexação pedida para `/ru`, `/ru/guias` e `/ru/para-oficinas`.
3. **Perfis em redes sociais** (LinkedIn, Facebook, Instagram), para os dados estruturados `sameAs`, e endereço da OÜ quando registrada.
4. **Google Business Profile:** um marketplace só online **não é elegível**. A alavanca é ajudar cada oficina parceira a completar o próprio perfil, com link para a página dela no BipFix.
5. Revisão por um nativo do estoniano dos títulos novos ("Autoremont Tallinnas, ilma üllatusteta.") e dos guias.
6. **Ao mudar o texto de uma página estática:** atualizar a data em `MUDOU` no `src/app/sitemap.ts`.

## 30/09 — endereços no idioma do público, home internacional, menu no celular
Método (pedido do usuário): 1) identificar o problema; 2) documentação oficial + como grandes sites fazem; 3) implementar; 4) testar tudo.
- **Documentação seguida:** Google "Managing multi-regional sites" (evitar redirecionar uma versão de idioma para outra), posts do Google sobre x-default (2013, também válido para o Yandex, e 2023: "página para onde você redireciona o usuário" / "versão padrão") e "URL structure" ("use palavras no idioma do seu público na URL, e se aplicável transliteradas").
- **Estrutura nova:**
  - todo idioma com prefixo (Brasil em `/pt-br`);
  - a raiz `/` é a home internacional: encaminha pela escolha salva no seletor (cookie `bipfix_idioma`), senão pelo idioma do navegador, senão para o inglês; sem olhar o navegador/robô;
  - x-default de cada página = inglês.
- **Nomes das páginas no idioma** (`PATHNAMES` em `src/i18n/routing.ts`): en `/for-repair-shops`, et `/tookodadele`, ru `/dlya-avtoservisov` (transliterado) etc. Os guias têm slug por idioma (`versoes.<idioma>.slug`, com o índice gerado no prebuild por `scripts/indice-guias.mjs`). **Mudar um nome ali muda URL indexada.**
- **301 permanente:** todos os endereços antigos sem prefixo (`/termos` → `/pt-br/termos`), os nomes antigos em português dentro de outro idioma (`/et/seja-parceiro` → `/et/hakka-partneriks`) e os slugs antigos de guia.
- **Links de e-mail** no idioma de quem recebe (`lib/site-url.ts`); antes sempre abriam a versão do Brasil.
- **Seletor de idioma:**
  - código do idioma (PT-BR, ET, RU…) em vez de bandeira (o Windows mostrava só letras do país e o russo ficava vazio);
  - no celular, com a largura da tela (antes saía 53px pela esquerda).
- **Testes** (scripts no scratchpad da sessão; recriar se precisar):
  - rotas/SEO do sitemap: 75 URLs e 99 links internos, 0 problemas (em produção);
  - visual no celular em 390px e 360px, com menus abertos: 0 problemas (em produção);
  - ponta a ponta das áreas logadas (cliente, oficina, loja) em et e ru com contas temporárias apagadas no fim: achou e corrigiu links de idioma duplicados nas áreas logadas, a consulta quebrada da comissão da oficina (400) e da loja (406) e o link de voltar das mensagens.
- **Buscadores:**
  - Google: sitemap reenviado e indexação pedida para `/et`, `/pt-br`, `/en` (`/et`, `/en` e `/ru` já estavam indexadas);
  - IndexNow: 75 URLs aceitas (avisa Bing e Yandex);
  - Yandex: propriedade certa `https://bipfix.com` adicionada e verificada, com sitemap enviado.
- **Materiais:** 20 peças regeradas (QR → `/et/hakka-partneriks`, `/en/become-a-partner`; endereço impresso `bipfix.com/et/partner`). E-mails, legendas e LEIA-ME atualizados.
