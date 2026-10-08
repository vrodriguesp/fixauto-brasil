# Especificação funcional — App mobile BipFix (Cliente), v1

Status: em desenvolvimento. Este documento é a fonte de verdade do escopo e das decisões de arquitetura do app mobile — atualizar sempre que uma decisão mudar, para não perder governança do que foi decidido e por quê.

## Contexto e decisão de escopo

Conforme acordado com o usuário e registrado em `docs/PROGRESSO_2026-09-26.md` (Rodada 5, "Próximo passo combinado"): construir primeiro o app mobile **apenas da versão CLIENTE** (não oficina, não loja de peças). Motoristas são o lado de maior volume/menor fricção de onboarding — oficina/loja continuam usando o painel web (uso mais parecido com um "back office" de mesa, menos crítico ter app nativo agora).

Pedido do usuário nesta rodada: "comece o desenvolvimento dos apps android e ios", em continuação direta ao trabalho de i18n/SEO da Estônia — mesmo produto, mesmo backend, agora em formato nativo.

## Por que Expo (React Native) e não nativo separado (Swift/Kotlin)

- Um único código-fonte TypeScript pra iOS + Android — equipe já é 100% TS/React (Next.js no web), sem curva de aprendizado de uma stack nova.
- Reaproveita `@fixauto/shared` (constants e types) do monorepo diretamente, sem duplicar `TIPOS_SERVICO`, `STATUS_SOLICITACAO`, etc.
- Fala com o **mesmo backend Supabase self-hosted** já em produção (mesmas tabelas, RLS, Storage) — nenhuma mudança de schema necessária para o app existir.
- **Resolve a limitação de macOS registrada na Rodada 5**: com Expo + EAS Build, o build de iOS acontece na nuvem (servidores da Expo), e o app pode ser testado num iPhone real via **Expo Go** (scan de QR code) sem precisar de Mac/Xcode local. Só a submissão final pra App Store e testes no **Simulador** exigem macOS — o ciclo de desenvolvimento e teste em dispositivo real não exige.
- `expo-router` (roteamento por arquivo, igual ao App Router do Next.js) mantém o mesmo modelo mental de navegação que a equipe já usa no web.

## Arquitetura

- **Monorepo**: `apps/mobile` como novo workspace npm, ao lado de `apps/web`. `packages/shared` importado via `@fixauto/shared` (mesmo caminho já usado no web).
- **Stack**: Expo SDK (managed workflow) + TypeScript + `expo-router` + NativeWind (Tailwind-in-RN, pra manter consistência visual com o design system do web sem reescrever tudo em StyleSheet).
- **Backend**: `@supabase/supabase-js` direto (sem `@supabase/ssr`, que é específico de Next.js) — sessão persistida via `AsyncStorage` (não `expo-secure-store`: o SecureStore tem limite de 2KB por valor e o JWT + refresh token do Supabase costuma passar disso — AsyncStorage é a recomendação oficial do próprio Supabase para React Native).
- **i18n**: `i18next` + `react-i18next` + `expo-localization` (detecção automática do idioma do dispositivo). Os 4 idiomas (pt/en/et/it) recomeçam como dicionários próprios do app (não dá pra importar os `.json` do next-intl direto porque a estrutura de namespaces é diferente e o conteúdo do site ≠ conteúdo do app), mas seguem a mesma exigência do usuário: tradução nativa, não literal.
- **Roteamento protegido**: como não existe middleware de servidor num app nativo, o guard de rota (usuário logado vs. não logado) vive num layout raiz do `expo-router`, análogo ao que o `middleware.ts` do web faz.
- **Upload de imagem** (fotos de dano): `expo-image-picker` + mesmo bucket do Supabase Storage já usado pelo web.
- **Geolocalização**: `expo-location`, com fallback pro endpoint já existente `/api/geocode` (Nominatim, funciona no mundo todo) quando o usuário nega permissão — mesmo padrão do fallback já implementado no web.
- **Catálogo de veículo**: reaproveita os endpoints já publicados `/api/vehicle-catalog` (mundo) e `/api/fipe` (Brasil), consumidos via HTTPS — nenhuma lógica duplicada no app.
- **Notificações**: v1 usa a tabela `notificacoes` já existente (polling/realtime via Supabase Realtime). Push notification nativo (Expo Push + APNs/FCM) é a extensão natural do sistema de notificação já existente — ver seção "Fora do escopo do v1".
- **Ambiente**: `app.config.ts` lê `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (mesmo projeto Supabase do web, variáveis só renomeadas pro prefixo que o Expo exige) — não é um backend separado, é o mesmo produto.

## Escopo do v1 (paridade com a área `/cliente` do web)

1. **Auth**: login, cadastro (só tipo cliente), esqueci senha, definir senha (primeiro login).
2. **Emergência** ("Acabei de bater"): fluxo crítico do produto — acesso sem precisar já estar logado, câmera nativa pra foto do acidente, geolocalização, criação de conta automática se necessário.
3. **Nova solicitação**: seleção de veículo (ou cadastro novo), tipo de serviço (revisão/mecânica/elétrica/pneu + sintomas específicos), fotos do dano, endereço/geolocalização, urgência.
4. **Dashboard**: lista de solicitações ativas + atalhos.
5. **Orçamentos**: ver, comparar, aceitar/recusar orçamentos recebidos.
6. **Acompanhamento**: linha do tempo do reparo em andamento (mesmas etapas do `STATUS_MANUTENCAO` já usado no web).
7. **Mensagens**: chat texto (+ áudio, já existe no web) com a oficina.
8. **Veículos**: cadastro/edição/histórico por veículo.
9. **Perfil**: dados da conta, idioma preferido (grava em `profiles.idioma`, mesma coluna já usada pelos e-mails/notificações localizados).
10. **Avaliação** do serviço pós-conclusão.

Todas as 4 línguas (pt/en/et/it) desde o v1 — não é aceitável lançar o app só em português e traduzir depois, mesma exigência já aplicada ao site.

## Fora do escopo do v1 (decisão registrada, não esquecida)

- App de oficina/loja (fica só no web painel por enquanto).
- Push notifications nativas (Expo Push Token + tabela nova pra guardar o token por `profile_id` + Edge Function/rota que dispara push nos mesmos pontos que já criam linha em `notificacoes`) — vem numa v1.1, depois que o fluxo core estiver validado. Sem isso, o app depende do usuário abrir o app pra ver notificação nova (mesmo comportamento do sino de notificação do web hoje).
- Pagamento in-app (o produto hoje não processa pagamento nem no web — orçamento é combinado direto com a oficina).
- Modo offline / cache local de solicitações.
- Publicação nas lojas (Google Play / App Store) — o v1 é validado via Expo Go / build interno (APK direto + TestFlight) antes de qualquer submissão pública.

## Pendência aberta: credenciais Supabase do app apontam pra projeto errado

O `apps/mobile/.env` foi criado copiando `apps/web/.env.local` (única credencial Supabase encontrada localmente no checkout) — mas essa URL (`https://bzlrpvlbeqckmunrldnp.supabase.co`, domínio do Supabase **Cloud hospedado**) não bate com a arquitetura self-hosted descrita em `docs/PROGRESSO_2026-09-26.md` (produção roda self-hosted na VM `204.168.139.154`, credenciais reais só em `.env.production.local` **na própria VM**, fora do repo). `apps/web/.env.local` também cita `fixauto-brasil.vercel.app`, o que sugere ser resíduo de uma fase anterior do projeto (antes do self-host + rebranding pra BipFix), não a config atual.

**Não corrigido ainda**: não há acesso à VM de produção a partir desta sessão (bloqueado por política de segurança) pra buscar a URL/chave real. Até o usuário confirmar/colar a URL e a anon key corretas do Supabase self-hosted, tanto `apps/mobile/.env` quanto (potencialmente) `apps/web/.env.local` local continuam apontando pro projeto errado — isso não afeta a produção do site (que usa `.env.production.local` na VM, não este arquivo), mas impede testar o app mobile contra dados reais.

## Rollout local nesta máquina (Windows, sem macOS)

- Desenvolvimento e teste do dia a dia: `npx expo start`, testado via app **Expo Go** no celular do usuário (Android e iOS) escaneando o QR code — não depende de emulador nem de macOS.
- Emulador Android: possível localmente se o usuário instalar Android Studio (não obrigatório pro fluxo acima).
- Simulador iOS: **não é possível nesta máquina** (exige macOS/Xcode) — build via `eas build --platform ios` roda na nuvem da Expo e gera um `.ipa` instalável via TestFlight ou registrado em dispositivo físico, sem precisar do simulador.


## Atualização 08/10/2026 (já implementado)
- **Mensagens:** uma conversa por oficina; áudio (gravar com `expo-audio`, ouvir com link temporário, transcrição); aviso à oficina via `/api/avisar-mensagem`.
- **Avisos dentro do app** (`lib/avisos.tsx`): aviso no alto da tela em tempo real (tabela `notificacoes`), números nas abas Pedidos/Mensagens, lista "Avisos" no início. Push com o app fechado: só em versão própria (EAS Build) — o Expo Go não recebe push desde o SDK 54.
- **Acabei de bater:** localização com rua (geocodificação do próprio aparelho), rede + GPS, "Tentar de novo"/"Abrir Ajustes"; "Seu carro" opcional; dicas pelo país do acidente (`lib/regiao.ts`).
- **Pedido:** completar/editar carro e descrição (`components/EditarPedido.tsx`); horários vencidos não aparecem.
