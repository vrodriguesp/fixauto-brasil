# Onde paramos e como testar — 27/09/2026

> Documento de referência rápida, pensado pra você ler sozinho ou seguir comigo depois que reconectar. Não substitui `docs/PROGRESSO_2026-09-27.md` (que tem todo o histórico detalhado do dia) — este aqui é só o "e agora, o que eu faço".

## Estado atual em uma frase

**O site (`bipfix.com`) está no ar, atualizado, testado e funcionando** nos 4 idiomas (pt/en/et/it). **O app mobile existe, compila sem erros, mas ainda nunca foi aberto de verdade num celular** — é o próximo passo.

## O que já está pronto e no ar (não precisa fazer nada)

- Site inteiro traduzido e revisado pra funcionar fora do Brasil (Estônia principalmente), com SEO otimizado (`hreflang`, `llms.txt`, dados estruturados).
- E-mails, notificações dentro do site, tudo no idioma de quem recebe.
- App mobile (só versão Cliente) com: login/cadastro, emergência ("Acabei de bater"), nova solicitação, orçamentos (ver/aceitar/recusar), acompanhamento do reparo (linha do tempo), avaliação da oficina, veículos, mensagens.
- Credenciais do app mobile já configuradas certas (mesmo banco de dados do site).

## O que falta (nesta ordem)

1. **Testar o app mobile de verdade** (ver passo a passo abaixo) — é o item mais importante agora, porque várias coisas só se confirmam rodando de verdade num aparelho, não só lendo o código.
2. Depois do teste, corrigir o que aparecer de errado.
3. Continuar as telas que faltam pro app mobile ficar 100% equivalente ao site (perfil completo, mensagem de áudio no chat).
4. Decidir: as mensagens de chat (entre cliente e oficina) devem ficar quais idiomas quando cliente e oficina falam idiomas diferentes? (pendência de design, não técnica — sua decisão).
5. Considerar criar uma página pública listando oficinas por cidade (bom pra aparecer em buscas tipo "oficina em Tallinn").

## Como testar o app mobile (passo a passo)

Não precisa instalar nada complicado nem ter Mac. Funciona em qualquer celular Android ou iPhone.

### 1. No seu celular
Instale o app **Expo Go** (gratuito, na App Store ou Google Play — procure por "Expo Go").

### 2. No computador (comigo, ou você mesmo se preferir)
Dentro da pasta do projeto, rodar:
```
cd apps/mobile
npx expo start
```
Isso abre um **QR code** no terminal.

### 3. Conectar
Abra o app Expo Go no celular e escaneie esse QR code (celular e computador precisam estar na mesma rede Wi-Fi). O app BipFix vai carregar direto no seu celular, sem precisar publicar em nenhuma loja.

### 4. O que testar (roteiro sugerido)
- Criar uma conta nova de cliente (ou entrar com uma já existente).
- Cadastrar um veículo.
- Criar uma "nova solicitação" de reparo com foto.
- Ver se a notificação/orçamento aparece quando uma oficina responder (pode precisar simular pelo site, entrando como uma oficina de teste).
- Aceitar um orçamento.
- Ver a tela de "acompanhamento" (linha do tempo).
- Testar o fluxo de "Acabei de bater" (emergência).
- Trocar o idioma do celular (Configurações do celular → Idioma) e reabrir o app, pra confirmar que ele muda pt/en/et/it sozinho.

### 5. Onde anotar o que der errado
Qualquer coisa estranha (erro na tela, texto errado, botão que não funciona), me mostra (print de tela ou descrição) que eu corrijo.

## Como testar o site (mais rápido, se quiser conferir também)

Só abrir no navegador:
- `https://bipfix.com` (português)
- `https://bipfix.com/et` (estoniano)
- `https://bipfix.com/en` (inglês)
- `https://bipfix.com/it` (italiano)

Conferir: o idioma trocando certo, o fluxo de cadastro/solicitação, e o link `https://bipfix.com/llms.txt` (deve mostrar um texto — é o resumo que a IA usa pra entender o site).

## Perguntas que vão surgir quando você testar

Guarde essas 2 decisões pendentes pra quando conversarmos de novo — não são bugs, são escolhas de produto que só você pode fazer:
1. **Idioma das mensagens de chat**: quando cliente e oficina falam idiomas diferentes, a mensagem de sistema ("novo orçamento", "orçamento aceito" etc. que aparece na conversa) deve aparecer em qual idioma?
2. **Página `/oficinas` pública**: vale a pena criar uma página listando todas as oficinas por cidade, pra aparecer melhor no Google quando alguém busca "oficina em Tallinn"?
