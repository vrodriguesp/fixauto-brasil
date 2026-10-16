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
