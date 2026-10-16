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
