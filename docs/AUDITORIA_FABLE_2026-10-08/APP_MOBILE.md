# Auditoria do app BipFix (apps/mobile) — 08–09/10/2026

Auditoria **só de leitura** do app do cliente (Expo SDK 57, expo-router, NativeWind, Supabase, react-i18next), feita antes do envio à App Store e ao Google Play. Caminhos relativos a `apps/mobile/` salvo indicação. Linhas conferem com o código em 09/10 (já com `perfil.tsx` com exclusão de conta, `eas.json` novo e `app.json` com `supportsTablet: false`, `usesNonExemptEncryption`, `RECORD_AUDIO` e `blockedPermissions`).

Ferramentas rodadas (sem alterar nada): `npx tsc --noEmit` (limpo), `node scripts/checar-traducoes.mjs` (todas as chaves nos 6 idiomas), `npx expo install --check` e `npx expo-doctor` (resultados abaixo), script próprio de comparação dos 6 `locales/*.json` (307 chaves em cada um, mesmos placeholders, chaves dinâmicas todas presentes).

Severidade: **Crítico** = impede publicar ou quebra o uso principal; **Alto** = rejeição provável ou defeito grave em cenário comum; **Médio** = defeito real em cenário plausível; **Baixo** = acabamento.

---

## Parte 1 — Bloqueadores para publicar nas lojas

### L1 — Crítico — O build de produção sai sem as chaves do Supabase (login nunca funciona)
- **Arquivos:** `.gitignore` (bloco "local env files": `.env`), `eas.json:17-20`, `lib/supabase.ts:9-12,53-55`, `lib/auth-context.tsx:89-92`.
- **Cenário:** `eas build --profile production`. O EAS envia o projeto respeitando o `.gitignore`, então `apps/mobile/.env` (onde estão `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`) não vai. O perfil `production` do `eas.json` só define `EXPO_PUBLIC_API_BASE_URL`.
- **Por que é erro:** `supabase.ts` cai em `https://placeholder.supabase.co` / `placeholder-key`; `isSupabaseConfigured` fica `false`; o app abre na tela de login e todo `signInWithPassword` falha com "erro genérico". Cadastro pelo site funciona, mas ninguém consegue entrar no app publicado. Nada avisa no build.
- **Correção:** criar as duas variáveis no EAS (`eas env:create --scope project --environment production --name EXPO_PUBLIC_SUPABASE_URL ...` e idem para a anon key — ela é pública, pode também ir no `env` do `eas.json`); e fazer `lib/supabase.ts` **falhar alto** em produção (`if (!isSupabaseConfigured) throw`) em vez de usar placeholder. *A confirmar:* se as variáveis já foram criadas no painel do EAS, este item cai.

### L2 — Alto — Galeria de fotos não abre em Android 12 ou anterior (efeito do `blockedPermissions` novo)
- **Arquivos:** `app.json:65-69` (`blockedPermissions` com `READ_EXTERNAL_STORAGE` e `WRITE_EXTERNAL_STORAGE`), `app/emergencia.tsx:97-100`, `app/nova-solicitacao.tsx:77-79`.
- **Cenário:** aparelho Android 10/11/12, toque em "Galeria" (acidente) ou "Fotos" (pedido).
- **Por que é erro:** `requestMediaLibraryPermissionsAsync()` no Android < 13 pede exatamente `WRITE_EXTERNAL_STORAGE` + `READ_EXTERNAL_STORAGE` (`node_modules/expo-image-picker/android/.../ImagePickerModule.kt:258-266`). Permissão que não está no manifesto é negada na hora pelo Android, o código faz `if (status !== 'granted') return;` e o botão **não faz nada**, sem mensagem. Em Android 13+ a lista é vazia (`emptyArray`) e funciona. O seletor de fotos em si (`launchImageLibraryAsync`) não precisa dessa permissão em nenhuma versão (o módulo só exige permissão para a câmera).
- **Correção:** remover a chamada a `requestMediaLibraryPermissionsAsync` antes de `launchImageLibraryAsync` nos dois arquivos (basta chamar o seletor). Isso também evita no iOS o pedido de acesso à biblioteca inteira, que o PHPicker não usa. Manter o `blockedPermissions` (bom para a política de fotos do Google Play).

### L3 — Alto — Tela de abertura (splash) configurada mas o pacote não existe
- **Arquivos:** `app.json:9-13` (`splash`), `package.json` (sem `expo-splash-screen`), `node_modules` (não há `expo-splash-screen` nem em `apps/mobile` nem na raiz; `@expo/prebuild-config` não tem plugin de splash próprio).
- **Cenário:** build nativo (EAS). A chave `splash` só é aplicada pelo plugin de `expo-splash-screen`.
- **Por que é erro:** o app publicado abre com a tela de abertura padrão (branca/sem logo) e, no iOS, o storyboard do template. Não é motivo formal de rejeição, mas é a primeira coisa que o revisor vê, e no Android 12+ a splash também define o ícone da animação de abertura.
- **Correção:** `npx expo install expo-splash-screen` e mover a configuração para o plugin (`["expo-splash-screen", { "image": "./assets/splash-icon.png", "imageWidth": 200, "backgroundColor": "#ffffff" }]`). Conferir no build de preview.

### L4 — Alto — Universal Links / App Links desligados no servidor (link do e-mail não abre o app)
- **Arquivos:** `apps/web/src/app/api/app-links/route.ts:15-16,22-23` (responde 404 sem `APPLE_TEAM_ID` / `ANDROID_SHA256`), `app.json:26-28` (`associatedDomains`), `app.json:48-64` (intent filter com `autoVerify`).
- **Cenário:** cadastro pelo app → e-mail com `https://bipfix.com/<idioma>/confirmar-email?token_hash=...&app=1` → toque no link.
- **Por que é erro:** sem os dois arquivos `.well-known` o iOS e o Android nunca associam o domínio; o link abre no navegador, a página confirma e mostra "abrir o app" (`bipfix://login`), que funciona, mas a pessoa ainda precisa entrar com a senha. A tela `app/[idioma]/confirmar-email.tsx` (que confirma e já entra) nunca é alcançada. Não bloqueia a publicação, mas o fluxo planejado não acontece e o `autoVerify` do Android registra falha de verificação.
- **Correção:** depois de criar o app no App Store Connect e gerar a chave de assinatura no EAS: definir `APPLE_TEAM_ID` e `ANDROID_SHA256` (SHA-256 da chave de assinatura do Play App Signing **e** da upload key, separadas por vírgula) no `.env.production.local` do servidor e reiniciar; testar `curl https://bipfix.com/.well-known/apple-app-site-association`.

### L5 — Médio — `eas.json` e `app.json` ainda incompletos para enviar
- **Arquivos:** `eas.json:22-31`, `app.json` (sem `extra.eas.projectId` / `owner`), `.gitignore`.
- **Problemas verificados:**
  1. `submit.production.ios.ascAppId` é o texto `PREENCHER_DEPOIS_DE_CRIAR_O_APP_NO_APP_STORE_CONNECT` — `eas submit` falha até preencher.
  2. `submit.production.android.serviceAccountKeyPath: ./google-play-service-account.json` — o arquivo não existe e **não está no `.gitignore`**; quando for criado, um `git add .` publica a chave da conta de serviço do Google no repositório.
  3. `app.json` não tem `extra.eas.projectId` nem `owner`: o primeiro `eas build` vai parar para criar/vincular o projeto (interativo). Rodar `eas init` antes do fim de semana.
  4. Perfil `production` sem `channel`/`runtimeVersion` — só importa se forem usar atualizações OTA (`expo-updates` não está instalado, então hoje é indiferente; registrar a decisão).
- **Correção:** preencher o `ascAppId`, adicionar `google-play-service-account.json` e `*.json` de credenciais ao `.gitignore`, rodar `eas init`.

### L6 — Médio — `expo-doctor` falha: versões fora do SDK e cópias duplicadas de `react-native`
- **Saída de `npx expo install --check` (não modificou nada):** `expo@57.0.25` (esperado ~57.0.27), `expo-router@57.0.23` (~57.0.25), `expo-asset`, `expo-constants`, `expo-linking`, `@expo/ui` desatualizados; **`react-native-get-random-values@2.0.0` (esperado ~1.11.0, troca de versão maior)**.
- **Saída de `npx expo-doctor`:** duplicatas de `react-native@0.86.3`, `react-native-reanimated@4.5.1` e `react-native-worklets@0.10.4` em `node_modules/nativewind/node_modules/` (raiz do monorepo). O Metro não as empacota (`metro.config.js:16` `disableHierarchicalLookup`), mas o build nativo do EAS roda o `expo-doctor`/autolinking num `npm ci` limpo e pode cair na mesma situação.
- **Correção:** `npx expo install --fix` (ou fixar `react-native-get-random-values@~1.11.0`; o app só usa `crypto.getRandomValues` em `lib/supabase.ts:21`), `npm dedupe` na raiz, e `expo.install.exclude` em `package.json` para o que for intencional. Repetir `npx expo-doctor` até passar.

### L7 — Médio — Fotos do acidente nunca foram enviadas a partir do app nativo (caminho de upload não testado)
- **Arquivos:** `lib/anexo.ts:8-11`, `app/emergencia.tsx:181-183`, `apps/web/src/lib/validacao.ts:47-55` (servidor exige `type` em `image/jpeg|png|webp|heic|heif`), `apps/web/scripts/e2e/nativo-correcoes.mjs:120-135` (o teste no emulador envia o acidente **sem foto**; `app-e2e.mjs:77` só testa a versão web, que usa `fetch(uri).blob()`).
- **Cadeia verificada:** `new File(uri)` do `expo-file-system` → `FormData.append` do Expo guarda o nome `foto-N.jpg` (`expo/src/winter/FormData.ts:70-85`) → `fetch` global é o do Expo em SDK 57 (`expo/src/winter/runtime.native.ts:52`) → o part leva `content-type: part.type` (`convertFormData.ts:25-26`). `File.type` vem da extensão no iOS (`FileSystemFile.swift:78-82`) e no Android (`FileSystemFile.kt:182-184`). Para `.jpg` deve resultar `image/jpeg`; se vier `null`, o servidor responde `FOTO_TIPO` e **nenhum acidente com foto é aceito**.
- **Por que está aqui:** é o uso principal do app e o único fluxo que o revisor da Apple certamente vai exercitar (tirar foto e enviar). Há indício de que funciona, mas não há teste nem relato de teste em aparelho.
- **Correção:** antes de enviar, testar no iPhone e num Android 13+: acidente com 2 fotos (câmera e galeria) e pedido com foto; conferir `emergencia_fotos`/`solicitacao_fotos`. Se falhar com `FOTO_TIPO`, enviar o blob com tipo explícito (`new Blob([await file.bytes()], { type: 'image/jpeg' })`).

### L8 — Baixo — Formulários das lojas (não é código)
- **App Privacy (Apple) / Data safety (Google):** o app coleta nome, e-mail, telefone, localização precisa, fotos e áudio (gravação de voz) e os envia a `bipfix.com` e ao Supabase; declarar tudo, com "localização usada para encontrar oficinas" e "áudio para mensagens de voz". Google Play também pede a URL de exclusão de conta: `https://bipfix.com/en/delete-account` (existe: `apps/web/src/i18n/routing.ts:72-75`).
- **Conta de teste para o revisor:** o banco de produção está vazio (só o admin). Criar antes do envio uma conta de cliente com um pedido, um orçamento com horários e uma conversa, e informar e-mail/senha nas notas de revisão; sem isso o revisor só vê telas vazias.
- **Login com Apple:** o app só tem e-mail/senha, sem login social → a regra "Sign in with Apple obrigatório" não se aplica (OK).

---

## Parte 2 — Erros do app

### E1 — Alto — Pedido comum criado com coordenadas de São Paulo quando a localização falha
- **Arquivo:** `app/nova-solicitacao.tsx:20` (`COORDS_DEFAULT = { lat: -23.5505, lon: -46.6333 }`) e `:88-94`.
- **Cenário:** cliente na Estônia nega a localização (ou está sem GPS), digita o endereço à mão sem escolher uma sugestão; o geocode por texto demora mais de 8 s ou falha.
- **Por que é erro:** o pedido é gravado com latitude/longitude de São Paulo; as oficinas "próximas" avisadas são as erradas e a busca por raio no site nunca o mostra às oficinas certas. O fluxo de acidente já corrigiu exatamente isso (`app/emergencia.tsx:160-162` lança `ErroUsuario(t('emergencia.erroLocalizacao'))`). O site tem o mesmo defeito (`apps/web/src/app/[locale]/cliente/nova-solicitacao/page.tsx:50`).
- **Correção:** sem coordenadas, mostrar `emergencia.erroLocalizacao` e não criar o pedido (igual ao acidente); apagar `COORDS_DEFAULT`.

### E2 — Alto — Na abertura com sessão salva o app mostra a tela de login por um instante; sem rede, joga para o login
- **Arquivo:** `lib/auth-context.tsx:94-100` (`setLoading(false)` logo após disparar `fetchProfile` sem `await`), `app/(tabs)/_layout.tsx:23` (`if (!isLoggedIn) return <Redirect href="/(auth)/login" />`), `isLoggedIn: !!user` (`:157`).
- **Cenário:** abrir o app já logado. `loading` vira `false` antes de o perfil chegar → `user` ainda é `null` → as abas redirecionam para o login → o perfil chega → o layout de auth redireciona de volta para as abas. Com o celular sem rede (comum no local do acidente), `fetchProfile` falha, `user` fica `null` e a pessoa é deixada na tela de login mesmo com sessão válida.
- **Por que é erro:** "pisca" de login a cada abertura e, offline, o atalho vermelho de acidente ainda aparece na tela de login, mas o cliente perde o carro pré-escolhido e os pedidos.
- **Correção:** `await fetchProfile(...)` antes de `setLoading(false)`; e tratar `authUser && !user` como "carregando" nos dois layouts. Opcional: guardar o último perfil em `AsyncStorage` para abrir offline.

### E3 — Médio — Data do horário de check-in / entrega prevista aparece um dia antes no Brasil
- **Arquivos:** `app/solicitacao/[id].tsx:243,245` (`formatDate(slot.data_checkin, locale)`), `packages/shared/format.ts:78-84` (`new Date(date)`), colunas `DATE` em `supabase/migrations/002_add_scheduling.sql:8,10`.
- **Cenário:** oficina oferece check-in em `2026-10-09` (manhã); cliente com o celular em fuso UTC-3 (Brasil).
- **Por que é erro:** `new Date('2026-10-09')` é meia-noite **UTC**; em UTC-3 vira 08/10 21:00 e o `Intl.DateTimeFormat` mostra **08/10/2026**. O cliente aceita o "dia 8" e aparece no dia errado. Na Europa (UTC+1..+3) o dia coincide, por isso não apareceu nos testes. `turnoDisponivel` compara strings e não é afetado. O site tem o mesmo defeito (usa o mesmo `formatDate`).
- **Correção:** em `formatDate`, se a string for `YYYY-MM-DD`, construir `new Date(y, m-1, d)` (local) ou formatar direto; o mesmo para `garantia.ate` quando vier de data pura.

### E4 — Médio — Conversa: barra de digitação fica embaixo do indicador de início do iPhone; deslocamento do teclado fixo
- **Arquivo:** `app/conversa/[id].tsx:226` (`KeyboardAvoidingView ... keyboardVerticalOffset={90}`), `:264-281` (barra sem `paddingBottom` de safe area). A tela está no Stack raiz, sem barra de abas por baixo.
- **Cenário:** iPhone com Face ID, conversa aberta, teclado fechado: os 34 pt do indicador de início cobrem a metade de baixo do campo e dos botões de microfone/enviar. Com o teclado aberto, o cabeçalho real nesses aparelhos tem ~97–103 pt (não 90), então a barra fica parcialmente atrás do teclado.
- **Correção:** `paddingBottom: Math.max(insets.bottom, 12)` na barra (`useSafeAreaInsets`) e `keyboardVerticalOffset={useHeaderHeight()}` (`@react-navigation/elements`, já vem com o expo-router).

### E5 — Médio — Sair da conversa no meio de uma gravação deixa o áudio em modo "gravando"
- **Arquivo:** `app/conversa/[id].tsx:139-149` (`comecarGravacao` → `setAudioModeAsync({ allowsRecording: true })`), `:151-155` (só `pararGravacao` desfaz), nenhum `useEffect` de limpeza.
- **Cenário:** cliente toca no microfone, começa a falar e volta (gesto, botão do cabeçalho ou botão físico do Android) sem enviar nem descartar.
- **Por que é erro:** o gravador é liberado pelo hook (`useReleasingSharedObject`), mas o modo de áudio continua com `allowsRecording: true` (categoria PlayAndRecord): o indicador de microfone do iOS pode continuar aceso e, até outra gravação ser encerrada, a reprodução de áudios sai pelo alto-falante do ouvido/baixa. *A confirmar no aparelho.*
- **Correção:** `useEffect(() => () => { if (gravador.isRecording) gravador.stop().catch(() => {}); setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {}); }, [])`.

### E6 — Médio — Pedido que não existe mais: tela gira para sempre e sem cabeçalho
- **Arquivo:** `app/solicitacao/[id].tsx:41-47` (`.single()` → `data` nulo → `setSolicitacao(null)`), `:137-143` (`if (loading || !solicitacao)` mostra só o spinner), `:158` (o `Stack.Screen` com cabeçalho só existe no ramo carregado; o Stack raiz tem `headerShown: false`).
- **Cenário:** aviso antigo no sino aponta para um pedido cancelado/apagado (ex.: exclusão de conta do outro motorista), ou link com id inválido, ou RLS negando.
- **Por que é erro:** spinner infinito, sem botão de voltar no iOS (só o gesto), no Android só o botão físico. Mesma estrutura em `app/conversa/[id].tsx:197-203` (sem cabeçalho enquanto carrega, mas lá o loading termina).
- **Correção:** renderizar `<Stack.Screen options={opcoesTela} />` em todos os ramos e, quando `data` for nulo após carregar, mostrar "pedido não encontrado" com botão voltar.

### E7 — Médio — Permissão de câmera/galeria negada: o botão não responde e não há como reabrir
- **Arquivos:** `app/emergencia.tsx:91-93` (`if (status !== 'granted') return;`), `:98-100`, `app/nova-solicitacao.tsx:78-79`.
- **Cenário:** no iOS, depois de negar a câmera uma vez o sistema não pergunta de novo; tocar em "Fotos do veículo" não faz nada. Revisores da Apple costumam testar exatamente "negar e tentar de novo".
- **Correção:** repetir o padrão da localização (`emergencia.tsx:108-119`): se `!canAskAgain`, `Alert` com "Abrir Ajustes" (`Linking.openSettings()`); junto com L2, deixar de pedir permissão para a galeria.

### E8 — Médio — Conta de oficina/loja ou desativada recebe só "erro genérico" no login (mensagens em português fixas nunca aparecem)
- **Arquivos:** `lib/auth-context.tsx:35` (`ERRO_TIPO_NAO_SUPORTADO` em pt), `:61,66,71` (textos pt), `app/(auth)/login.tsx:32-43` (qualquer erro fora de `email_not_confirmed`/`invalid_credentials`/`over_*` vira `common.erroGenerico`).
- **Cenário:** dono de oficina tenta entrar no app do cliente; ou cliente desativado pelo admin.
- **Por que é erro:** a sessão é encerrada (correto) mas a tela diz só "algo deu errado"; a mensagem explicativa existe apenas em português e nunca chega à tela. Em estoniano/russo a pessoa não tem como saber que deve usar o site.
- **Correção:** `fetchProfile` devolver códigos (`tipo_nao_suportado`, `conta_desativada`, `perfil_nao_encontrado`) e `login.tsx` traduzi-los (novas chaves em `auth.*` nos 6 idiomas).

### E9 — Médio — Aviso às oficinas do pedido comum é feito pelo celular, uma a uma
- **Arquivo:** `app/nova-solicitacao.tsx:134-153` (loop `for ... await supabase.from('notificacoes').insert(...)` por oficina ativa), `:148` (`${veiculo?.fipe_marca} ${veiculo?.fipe_modelo}` pode virar "undefined undefined"), `:102` (descrição vazia salva o rótulo da interface `novaSolicitacao.passoServico` no idioma do cliente como descrição). O site faz o mesmo loop, mas também chama `/api/pedido-criado` (`apps/web/.../nova-solicitacao/page.tsx:257`), que o app **não** chama.
- **Cenário:** 60 oficinas ativas, rede 4G fraca: 60 requisições sequenciais com o botão girando; se a rede cair na 20ª, o pedido já foi criado, 40 oficinas não são avisadas e o cliente vê um alerta de erro e pode criar o pedido de novo (duplicado). O admin não é avisado quando nenhuma oficina atende ao tipo.
- **Correção:** mover para uma rota do servidor (como `/api/emergencia` já faz: cria, avisa e responde uma vez), ou no mínimo um único `insert` em lote + chamar `/api/pedido-criado`.

### E10 — Médio — `Promise`/efeitos presos ao objeto `user`, que é recriado a cada renovação de token
- **Arquivos:** `lib/auth-context.tsx:102-109` (`onAuthStateChange` chama `fetchProfile` em todo evento, inclusive `TOKEN_REFRESHED` ~1×/h, e `setUser(profile)` sempre cria objeto novo), `lib/avisos.tsx:57-73,97-109` (`atualizar` e o canal realtime dependem de `user`), `app/(tabs)/*.tsx` (`carregar` com dependência `[user]`).
- **Cenário:** app aberto por 2 h; troca de idioma no Perfil (`refreshProfile`).
- **Por que é erro:** a cada renovação o canal `avisos-<id>` é removido e recriado e todas as abas refazem as consultas (rajada de 6–8 requisições) — não é loop infinito, mas gasta rede/bateria e pode perder um aviso na troca de canal. 
- **Correção:** em `onAuthStateChange`, só buscar o perfil em `SIGNED_IN`/`INITIAL_SESSION`/`USER_UPDATED`; nos efeitos, depender de `user?.id` em vez de `user`.

### E11 — Baixo — Sem `AppState` → `startAutoRefresh`/`stopAutoRefresh` (recomendação oficial do Supabase para React Native)
- **Arquivo:** `lib/supabase.ts:53-66`.
- **Cenário:** app em segundo plano por mais de 1 h e reaberto. As chamadas REST renovam sob demanda (`getSession()`), e `apiFetch` trata 401 (`lib/api.ts:22-33`), mas a conexão realtime segue com o token vencido até a próxima troca → avisos em tempo real param de chegar até reabrir uma tela. *A confirmar no aparelho.*
- **Correção:** `AppState.addEventListener('change', s => s === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh())` no `AuthProvider`.

### E12 — Baixo — Fotos do pedido: tipo MIME inválido e URL "pública" de bucket privado
- **Arquivo:** `app/nova-solicitacao.tsx:119-127` (`contentType: image/${ext}` → `image/jpg`, que não é um MIME válido; `getPublicUrl` num bucket que é privado desde `supabase/migrations/028_rls_por_relacao.sql:247`).
- **Por que é erro:** o objeto fica gravado com `image/jpg`; a URL gravada em `solicitacao_fotos` dá 400 se aberta direto (o site assina depois — paridade, mas qualquer tela nova que confie na URL quebra).
- **Correção:** `contentType: 'image/jpeg'` (ou `foto.mimeType` do ImagePicker) e gravar o caminho relativo, assinando na leitura.

### E13 — Baixo — Conversa só escuta `INSERT`: transcrição e "lida" não atualizam
- **Arquivo:** `app/conversa/[id].tsx:106-112` (`event: 'INSERT'`).
- **Cenário:** cliente grava áudio; o servidor transcreve segundos depois (`/api/avisar-mensagem` → transcrição). A transcrição só aparece ao puxar para atualizar.
- **Correção:** escutar também `UPDATE` (ou `event: '*'`) e substituir a mensagem pelo `payload.new`.

### E14 — Baixo — Ícone "ver oficina" no cabeçalho da conversa depende do nome da oficina
- **Arquivo:** `app/conversa/[id].tsx:45-52` (`useMemo` só depende de `tituloTela`; `headerRight` lê `oficinaDoTitulo.current`, preenchido em `:89`).
- **Cenário:** oficina sem `nome_fantasia` (título cai em `mensagens.titulo`, igual ao inicial) → o memo não recalcula → o ícone nunca aparece. Em geral funciona porque o nome chega depois e muda o título.
- **Correção:** incluir `oficinaId` nas dependências do `useMemo`.

### E15 — Baixo — Lista de mensagens: uma RPC por oficina em pedidos encerrados
- **Arquivo:** `app/(tabs)/mensagens.tsx:74-81` (`for ... await supabase.rpc('conversa_aberta')` dentro do loop de pedidos).
- **Cenário:** cliente com 15 pedidos concluídos → 15+ chamadas sequenciais ao abrir a aba e a cada aviso.
- **Correção:** calcular no cliente com os dados já carregados (a regra está em `044_avaliacao_obrigatoria_conversas.sql:8-25`: orçamento aceito + agenda concluída + garantia ≥ 7 dias) ou uma view/RPC em lote.

### E16 — Baixo — Topo das abas com recuo fixo em vez de safe area
- **Arquivos:** `app/(tabs)/index.tsx:45`, `solicitacoes.tsx:39`, `veiculos.tsx:29`, `mensagens.tsx:139`, `perfil.tsx:60` (`pt-14` = 56 px); `components/VehicleCatalogPicker.tsx:52` (`pt-16` no Modal).
- **Cenário:** iPhone com Dynamic Island (barra de status 59 pt): o título encosta/entra na barra; Android com edge-to-edge (obrigatório no SDK 57) a barra varia de 24 a 48 dp → espaço sobrando ou faltando. (Só a tela de login usa `SafeAreaView`.)
- **Correção:** `paddingTop: insets.top + 8` com `useSafeAreaInsets`.

### E17 — Baixo — Geocode do acidente sem prazo
- **Arquivo:** `app/emergencia.tsx:155-157` (`fetch(...)/api/geocode?q=` sem `fetchComPrazo`; `lib/rede.ts` existe e é usado em `nova-solicitacao.tsx:63,90`).
- **Cenário:** endereço digitado à mão, sem GPS, rede ruim → "Enviar registro" gira até o timeout do sistema (até 60 s no iOS).
- **Correção:** usar `fetchComPrazo` com `.catch(() => null)` como na nova solicitação.

### E18 — Baixo — Exclusão de conta (novo): sem estado "excluindo", toque duplo gera alerta de erro depois do sucesso
- **Arquivo:** `app/(tabs)/perfil.tsx:29-57,85-87`.
- **Cenário:** rede lenta, a pessoa toca de novo em "Sim, excluir" (o `Alert` fecha no primeiro toque, mas o botão da tela continua ativo); o segundo POST chega depois que a conta foi anonimizada → 401 → `Alert` "não foi possível excluir" por cima do "conta excluída". Também: `Alert.alert(feita)` e `router.replace` ao mesmo tempo — o alerta aparece sobre a tela de login (aceitável).
- **O que está certo:** rota correta (`/api/conta/excluir` com `confirmar: true` e Bearer), trata `CARRO_EM_SERVICO`, confirmação dupla, `signOut` local depois; textos nos 6 idiomas. Atende Apple 5.1.1(v) e o requisito do Google de link na web (`/[locale]/excluir-conta`).
- **Correção:** `useState(excluindo)` + `disabled`, e tratar 401/404 depois do sucesso como sucesso.

### E19 — Baixo — Textos fixos e dependências sem uso
- `lib/avisos.tsx:127` `accessibilityLabel="OK"` (único rótulo de acessibilidade não traduzido encontrado); `lib/auth-context.tsx:35,61,66` (coberto em E8).
- `package.json`: `@expo/ui`, `expo-keep-awake`, `react-native-web`, `react-dom` não são importados em `app/`, `lib/` ou `components/` (`react-native-web`/`react-dom` servem ao teste `app-e2e.mjs`; `@expo/ui` adiciona módulo nativo e tamanho sem uso).
- `devDependencies` traz ~25 pacotes (`@radix-ui/*`, `fontfaceobserver`, `react-remove-scroll`…) que parecem resíduo de instalação; não afetam o build nativo, mas confundem o `expo-doctor`.

---

## O que foi revisado e está OK

- **Loops de renderização (bug antigo do "Maximum update depth"):** `Stack.Screen options` memoizado em todas as 7 telas que o usam (`notificacoes.tsx:28`, `confirmar-email.tsx:14`, `veiculo/novo.tsx:14`, `emergencia.tsx:49`, `nova-solicitacao.tsx:30`, `solicitacao/[id].tsx:23`, `conversa/[id].tsx:45-52`). Nenhum `useEffect` sem dependência que dispare `setState` em cadeia.
- **Limpeza de efeitos:** canais realtime removidos (`lib/avisos.tsx:108`, `conversa/[id].tsx:114-116`); temporizadores de autocomplete e banner limpos (`EnderecoAutocomplete.tsx:56`, `avisos.tsx:78,85`); player e gravador de áudio liberados pelos hooks do `expo-audio`; flags `vivo`/`cancelado` nas promessas (`AudioMensagem.tsx:31-42`).
- **APIs do motor JS:** `Promise.any` e `AbortSignal.timeout` substituídos por implementações próprias (`lib/posicao.ts:6-12`, `lib/rede.ts`); `URLSearchParams` com polyfill (`lib/supabase.ts:2`); `Intl.NumberFormat`/`DateTimeFormat` existem no Hermes; nenhuma API só de navegador (`window`, `document`, `localStorage`) no código nativo (o único `Platform.OS === 'web'` é o fallback de `lib/anexo.ts:9` e do storage em `supabase.ts:60`).
- **Sessão:** `signOut({ scope: 'local' })` em todos os pontos (`auth-context.tsx:64,69,146`, `api.ts:31`); `apiFetch` renova uma vez em 401 e só então sai; o servidor aceita `Authorization: Bearer` (`apps/web/src/lib/api-auth.ts:21-31`); token cifrado com AES + chave no SecureStore (`supabase.ts:19-51`); `detectSessionInUrl: false`.
- **Localização:** fluxo completo negado / "não perguntar de novo" / Ajustes (`emergencia.tsx:104-139`), prazo de 15 s e rede+GPS em paralelo (`posicao.ts`), última posição conhecida até 5 min.
- **Deep link de confirmação:** rota `app/[idioma]/confirmar-email.tsx` bate com o padrão do e-mail (`apps/web/src/lib/email-cadastro.ts:136`) e com `/*/confirmar-email*` em `app-links/route.ts:10`; `verifyOtp({type:'email'})` igual ao site; `bipfix://login` da página web resolve para `(auth)/login`; `scheme` definido.
- **i18n:** 307 chaves iguais nos 6 idiomas, placeholders `{x}` idênticos, nenhum `{{ }}`, todas as chaves dinâmicas (`seguro.passo_*_{br,ee,it,pt,geral}`, `seguro.dica_*`, `emergencia.option*`, `constants.*`, `orcamentos.status*`, `orcamentos.turno_*`, `erros.*`) presentes; `scripts/checar-traducoes.mjs` passa; rótulos das abas cabem em russo/estoniano com `fontSize: 11`; interpolação de chave simples configurada (`i18n/index.ts:43`). Textos de permissão iOS nos 6 idiomas, incluindo microfone (`i18n/permissoes/*.json`, `app.json:101-108`).
- **Permissões:** iOS — `NSLocationWhenInUse`, `NSCamera`, `NSPhotoLibrary`, `NSMicrophone` (plugin do `expo-audio` + `infoPlist`), nada de localização em segundo plano; Android — `ACCESS_FINE/COARSE_LOCATION`, `CAMERA`, `RECORD_AUDIO` (+ `MODIFY_AUDIO_SETTINGS` pelo plugin), sem `READ_MEDIA_IMAGES` (não cai na política de fotos do Play), `blockedPermissions` remove as de armazenamento antigas (ver L2 para o efeito colateral).
- **Store:** `bundleIdentifier`/`package` `com.bipfix.cliente`; `version 1.0.0` com `appVersionSource: remote` + `autoIncrement` (build number gerado pelo EAS); `ITSAppUsesNonExemptEncryption: false` (em `infoPlist` e `ios.config` — redundante, sem conflito); `supportsTablet: false` + retrato (elimina o erro ITMS-90474 de multitarefa do iPad); `userInterfaceStyle: light` consistente com as cores fixas; `icon.png` 1024×1024 RGB **sem alfa** (exigência da Apple); ícones adaptativos Android 1024×1024 com fundo/primeiro plano/monocromático; Termos e Privacidade abertos no idioma do app com caminhos iguais aos de `apps/web/src/i18n/routing.ts:68-79`; aceite explícito no cadastro (`cadastro.tsx:101-116`); exclusão de conta no app e na web; `/api/esqueci-senha` anti-enumeração e aceita `locale` do app.
- **Teclado:** `KeyboardAvoidingView` no login/cadastro/conversa; `automaticallyAdjustKeyboardInsets` + `keyboardDismissMode="on-drag"` nos formulários; campo de endereço rola para cima ao focar; `text-[16px]` nos inputs (sem zoom no iOS web).
- **Android voltar:** modais com `presentation: 'modal'`; `Modal` nativo com `onRequestClose`; `predictiveBackGestureEnabled: false` (evita a animação preditiva quebrada no Android 15).
- **Pull-to-refresh:** presente nas 4 listas das abas, no pedido, na conversa e nas notificações, com `refreshing` encerrado em todos os caminhos.
- **Upload de áudio:** `arrayBuffer()` do arquivo `.m4a` com `contentType: audio/mp4` (preset `HIGH_QUALITY` gera AAC/MPEG-4 nos dois sistemas), caminho igual ao do site, URL assinada na leitura (`AudioMensagem.tsx:12-15,34`); testado no emulador Android (`nativo-correcoes.mjs:95-115`).
- **Regras de negócio da avaliação obrigatória:** bloqueio na tela + RLS (`nova-solicitacao.tsx:175-198`, `:113`), acidente nunca bloqueado, aviso fixo no início; garantia contada da entrega nos dois lugares (início e pedido) e recarregada ao focar.
- **tsc:** `npx tsc --noEmit -p apps/mobile` sem erros.

## Não coberto (limites desta auditoria)
- Nada foi executado em aparelho ou simulador; achados marcados "a confirmar" dependem disso.
- Build nativo (`eas build`) não foi rodado; L1, L3, L5 e L6 são previsões a partir da configuração.
- Os testes automatizados existentes nunca enviaram foto a partir do app nativo nem abriram a galeria/câmera (L7, E7).
