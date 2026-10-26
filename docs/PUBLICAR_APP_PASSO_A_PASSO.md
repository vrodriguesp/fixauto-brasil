# Publicar o app BipFix (cliente) — passo a passo

Situação em 24/10/2026. App: `apps/mobile` (Expo SDK 57), nome **BipFix**, identificador **com.bipfix.cliente**, versão 1.0.0.

## Já resolvido no código (auditoria de 09/10)
- Chaves do Supabase no `eas.json` (L1) · galeria no Android ≤ 12 (L2) · tela de abertura com `expo-splash-screen` (L3) · `google-play-service-account.json` no `.gitignore` (L5) · versões do SDK (L6).
- Excluir conta no app e na web (`https://bipfix.com/ee/en/delete-account`), termos e privacidade no idioma do app, ícone 1024×1024 sem transparência, só celular (sem iPad).

## Ainda falta
| Item | Quem |
|---|---|
| D-U-N-S da RPyrus OÜ | dono |
| Conta Apple Developer (organização) | dono |
| ~~Conta Google Play Console (organização)~~ feito 26/10 (app BipFix criado, `com.bipfix.cliente`) | dono |
| ~~`eas login` + `eas init` (projectId)~~ feito 26/10 (`@rpyrus/bipfix-cliente`) | dono + Claude |
| Criar o app no App Store Connect → `ascAppId` no `eas.json` | dono + Claude |
| Chave de serviço do Google Play (`google-play-service-account.json`) | dono |
| Links do app (L4): `APPLE_TEAM_ID` e `ANDROID_SHA256` no servidor | Claude (com deploy OK) |
| Testar foto do acidente num celular de verdade (L7) | dono + Claude |
| Conta de teste com dados para o revisor | Claude |
| Capturas de tela, textos da loja, formulários de privacidade | Claude prepara, dono envia |

---

## Passo 1 — D-U-N-S (grátis; comece hoje, é o mais demorado)
A Apple exige o número D-U-N-S para contas de **organização**; o Google Play também pede para contas de organização.
1. Abra **developer.apple.com/enroll/duns-lookup** (ferramenta da Apple, grátis).
2. Procure "RPyrus OÜ", Estônia. Se não existir, peça o número ali mesmo com: nome legal **RPyrus OÜ**, endereço **Tartu mnt 67/1-13b, 10115 Tallinn**, registrikood **17628754**, telefone e e-mail de contato (o seu, como juhatuse liige).
3. A Dun & Bradstreet pode ligar ou mandar e-mail para confirmar. Prazo: em geral alguns dias úteis, às vezes mais.

> Alternativa sem D-U-N-S: conta Apple **individual** (no seu nome). Funciona, mas a loja mostra o seu nome em vez de "RPyrus OÜ" e mudar depois dá trabalho. Recomendo organização.

## Passo 2 — Apple Developer Program (99 US$/ano)
1. Com o D-U-N-S em mãos: **developer.apple.com/programs/enroll** → entre com um Apple ID (de preferência um novo, por exemplo `media@rpyrus.com` ou `admin@bipfix.com`, com verificação em 2 etapas).
2. Escolha **Organization**, informe RPyrus OÜ, D-U-N-S, site **https://rpyrus.com** e o seu cargo (juhatuse liige / board member).
3. Pague 99 US$. A Apple confere e aprova (alguns dias).
4. Depois de aprovado, anote o **Team ID** (Membership details) — vai para o servidor (passo 7).

## Passo 3 — Google Play Console (25 US$, uma vez)
1. **play.google.com/console/signup** com uma conta Google da empresa.
2. Escolha **Organização** (conta pessoal nova exige um teste fechado com 12 testadores por 14 dias antes de publicar; organização não exige).
3. Informe RPyrus OÜ, D-U-N-S, endereço, site, e-mail e telefone de contato. Pague 25 US$.
4. O Google confere a identidade e o telefone (pode levar alguns dias).

## Passo 4 — Expo / EAS (no computador)
```
cd apps/mobile
npx eas-cli@latest login   # entra na conta Expo (o pacote se chama eas-cli)
npx eas-cli@latest init    # liga o projeto e grava o projectId no app.json
```
Me avise quando terminar: eu confiro o `app.json` e salvo no git. (Plano grátis da Expo: builds na nuvem com fila mais lenta e limite mensal; confira no site da Expo.)

## Passo 5 — Primeira versão de teste (antes das lojas)
```
npx eas-cli@latest build --platform android --profile preview
```
Gera um **APK** para instalar direto num Android. Testamos juntos: cadastro, login, veículo, pedido com **foto da câmera e da galeria**, acidente com 2 fotos, mensagem de voz, troca de idioma. (Para iPhone, o teste é pelo TestFlight, no passo 8.)

## Passo 6 — Criar o app nas lojas
**App Store Connect** (appstoreconnect.apple.com → Apps → +):
- Nome: **BipFix** · Idioma principal: English (UK) ou Eesti · Bundle ID: **com.bipfix.cliente** · SKU: `bipfix-cliente`.
- Copie o **Apple ID do app** (número) → eu coloco no `eas.json` (`ascAppId`).

**Google Play Console** → Criar app:
- Nome **BipFix**, app gratuito, aceitar as declarações.
- Para o envio automático: Configuração → Acesso à API → criar **conta de serviço** no Google Cloud com permissão de lançamento → baixar a chave JSON → salvar como `apps/mobile/google-play-service-account.json` (fica fora do git).

## Passo 7 — Links do app (abrir o app pelo link do e-mail) — Claude, com o seu OK
- `APPLE_TEAM_ID` (passo 2) e `ANDROID_SHA256` (Play Console → Integridade do app → Assinatura do app: SHA-256 da chave de assinatura **e** da chave de upload) no `.env.production.local` do servidor, reiniciar e conferir `https://bipfix.com/.well-known/apple-app-site-association` e `assetlinks.json`.

## Passo 8 — Builds de produção e envio
```
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform ios --profile production      # vai para o TestFlight
npx eas-cli@latest submit --platform android --profile production  # vai para o teste interno (rascunho)
```
- iPhone: instale pelo **TestFlight** e repita o teste do passo 5.
- Android: teste interno no Play Console.

## Passo 9 — Ficha da loja (Claude prepara os textos e as imagens)
- **Nome/subtítulo**, descrição curta e longa em **estoniano, russo e inglês** (as outras línguas depois).
- **Capturas de tela**: iPhone 6,9" (1320×2868) e Android (telefone); 4–6 telas: início, pedido com foto, orçamentos, acompanhamento, acidente.
- **Ícone** já pronto; Google também pede **imagem de destaque 1024×500**.
- Categoria: **Auto e veículos** (Google) / **Navigation** ou **Utilities** (Apple — "Auto" não existe na App Store).
- Links: privacidade `https://bipfix.com/ee/en/privacy`, suporte `https://bipfix.com/ee/en/help` ou `support@bipfix.com`, excluir conta `https://bipfix.com/ee/en/delete-account`.
- **Privacidade (Apple "App Privacy" / Google "Data safety")**: nome, e-mail, telefone, localização precisa (encontrar oficinas), fotos (danos), áudio (mensagens de voz), identificador do usuário; vinculados à conta; sem rastreamento para publicidade; dados criptografados em trânsito; o usuário pode pedir exclusão.
- **Classificação etária**: questionário (sem conteúdo sensível → 4+ / Livre).
- **Conta de teste para o revisor**: Claude cria uma conta de cliente com veículo, pedido, orçamento e conversa (o banco está vazio) e informa e-mail/senha nas notas de revisão.

## Passo 10 — Enviar para revisão
- Apple: em App Store Connect, escolher o build do TestFlight → "Enviar para revisão" (em geral 1–3 dias).
- Google: promover o teste interno para **Produção** → "Enviar para revisão" (de horas a alguns dias na primeira vez).
- Se pedirem correções, mande o texto para o Claude.

## Custos
Apple 99 US$/ano · Google 25 US$ uma vez · D-U-N-S grátis · Expo plano grátis (ou pago se precisar de builds mais rápidos).
