# Checklist de deploy — ajustes do teste do dono de 31/10 + push

Branch `fix-feedback-31-10` (local, **não enviado ao GitHub, não publicado**). Commits:
`139e17b` conversa no iPhone · `94aff9d` orçamento fechado após a entrega · `e9bfaf2` idioma dos avisos ·
`219fdca` acidente (telefone opcional, login no formulário) · `15c2ab4` marca no lugar do "BF" ·
`a080899` app (localização, botão da oficina, cartões de escolha) · `f9080ec` push · `197a7c0` e-mails de aviso pelo ponto único.

**Migrações novas (NÃO aplicadas na produção):** `065_orcamento_fechado_apos_entrega.sql`, `066_push_tokens.sql`.

## O que entra
| # | Onde | Mudança |
|---|---|---|
| 1 | Site (oficina e cliente) | Conversa cabe na tela do iPhone: altura pela parte visível (`dvh`), menos a barra de baixo da oficina; a lista rola sozinha, a página não. A caixa de digitar ficava atrás da barra de baixo (`globals.css` `.altura-conversa`, páginas `*/mensagens/[id]`) |
| 2 | Site (oficina) + servidor + banco | Carro entregue (pedido `concluida`) ou cancelado: a tela de orçamento mostra "orçamento fechado" em vez do formulário; a conversa não mostra mais "Refazer orçamento"; o pedido mostra o aviso. `/api/orcamento-revisao` responde 409 `SERVICO_ENCERRADO`. Banco (065): navegador não muda itens de orçamento aceito/encerrado nem orçamento de pedido encerrado. Textos nos 6 idiomas |
| 3 | Site + avisos/e-mails | Causa: o site só gravava `profiles.idioma` no cadastro (ex.: conta criada em /ee/et ou /ee/en, depois usada em português → avisos e e-mails na língua do cadastro). Agora a conta segue o idioma em que a pessoa usa o site (`SincronizarIdioma`, mesma regra do app). Sem idioma, aviso/e-mail sai em **inglês** (antes português). Auditoria: os 34 pontos que gravam em `notificacoes` já usam textos nos 6 idiomas pelo idioma de quem recebe; nenhum gatilho do banco grava aviso com texto fixo |
| 3b | Servidor | E-mails de aviso (`lib/notifications.ts`) e de nova senha passam pelo `enviarEmail` (no teste local viram arquivo; produção igual, Resend) |
| 4 | Site + app | Acidente sem login: telefone **opcional** (site e app; servidor já aceitava); campos obrigatórios com `*` e legenda "* campo obrigatório" |
| 5 | Site | Acidente com e-mail que já tem conta: o próprio formulário pede a senha (e-mail preenchido) e envia logo depois do login. "Esqueceu a senha?" manda o link sem perder nada: rascunho no navegador por 24 h (texto no localStorage, **fotos no IndexedDB**; se o navegador não deixar guardar as fotos, a tela avisa). Depois da senha nova, volta ao acidente com tudo preenchido e é só tocar em Enviar. Para quem não é dono do e-mail só aparece "este e-mail já tem conta"; o servidor continua sem gravar nada na conta sem login |
| 6 | Site | Quadrado "BF" trocado pela marca BipFix: rodapé (logo claro novo `public/logo-dark-80.webp`), página de definir senha, painel do admin |
| 7 | App | Localização permitida nos Ajustes depois de negar: ao voltar para o app (ou para a tela) confere de novo e busca a posição sozinha — novo pedido e acidente (`useLocalizacaoAoVoltar`) |
| 8 | App | Conversa: botão "Oficina" com ícone, fundo azul, área de toque ≥ 44×44 (antes só o ícone) |
| 9 | App | Novo pedido (carro) e orçamento (horário sugerido): cartões de largura total, ≥ 56 pt, bolinha de rádio, selecionado com borda + fundo + check, cartão inteiro tocável, `accessibilityRole="radio"` |
| P | App + servidor + banco | **Push com o app fechado**: `expo-notifications` + `expo-device`; canal Android "avisos"; permissão pedida **depois do login** (não na 1ª abertura); token gravado na conta (`registrar_push_token`), atualizado se o sistema trocar, apagado ao sair. Cada linha nova em `notificacoes` (de qualquer origem) → gatilho do banco (pg_net) chama `/api/push/notificacao` → Expo; tokens `DeviceNotRegistered` apagados. Tocar no push abre a mesma tela do aviso no app. Com o app aberto não aparece aviso do sistema por cima (o app já mostra o seu) |

## Testes feitos (ambiente local isolado, banco do Docker, site deste branch em `next start` :3100)
- `Documentos/_teste_local/ferramentas/feedback-31-10/teste-31-10.mjs` — **TUDO OK** (todas as verificações):
  - 1: iPhone 13 (emulação do Chromium; o WebKit não está instalado): caixa de digitar inteira na tela, acima da barra da oficina, página sem rolar — oficina e cliente
  - 2: pedido entregue → tela de orçamento fechada, sem "Refazer orçamento" na conversa, aviso no pedido, API 409 `SERVICO_ENCERRADO`, banco recusa item novo/apagar itens/mudar valor
  - 3: cliente com conta em `et` usa o site em `/br/pt` → `profiles.idioma` vira `pt`; avisos "carro chegou" e "serviço concluído" e e-mail "Seu veículo está pronto!" em português
  - 4: acidente sem telefone enviado e gravado; `*` nos obrigatórios; "(valikuline)" no telefone
  - 5: e-mail com conta → 409 + cartão de login com e-mail preenchido; nada gravado sem login; senha errada avisa; login envia o acidente com descrição e foto; rascunho apagado. "Esqueceu a senha?" → e-mail com link → link aberto noutra aba → senha nova → volta ao acidente com dados **e foto** → envio ok
  - 6: nenhum "BF" em 21 páginas públicas nos 6 idiomas; rodapé com a marca nos 6
  - Push: token registrado pela conta; outra conta não vê nem grava token alheio; a entrega gerou chamada ao servidor falso da Expo com título em pt, `channelId` e `solicitacao_id`; token "desinstalado" apagado; rota recusa chamada sem a chave
- `site-revisao` e `site-mensagens` (bateria local) — TUDO OK
- `checar-traducoes` do site e do app ok; `tsc --noEmit` do site e do app sem erros; `npx expo config` lê o plugin de notificações

## Deploy do site (precisa do OK do dono no chat)
1. Banco da produção (antes do site): aplicar `065_orcamento_fechado_apos_entrega.sql` e `066_push_tokens.sql`. Conferir que o `pg_net` existe no Supabase próprio (`select * from pg_available_extensions where name='pg_net'`); a 066 cria a extensão.
2. Escolher uma chave longa aleatória e gravar no banco (fora do git):
   `insert into push_config (url, chave) values ('https://bipfix.com/api/push/notificacao', '<CHAVE>');`
   Conferir que o contêiner do banco alcança `https://bipfix.com` (senão usar o endereço interno do site).
3. VM: no `.env` do site, `PUSH_CHAVE=<CHAVE>` (a mesma). Opcional: `EXPO_ACCESS_TOKEN` só se ligar a "segurança reforçada" de push na Expo.
4. `ssh root@204.168.139.154` → `cd /root/fixauto-brasil && git pull` → `cd apps/web && npm run build` → `pm2 restart fixauto-brasil --update-env`
5. Conferir: conversa da oficina no iPhone; pedido entregue sem "Refazer orçamento"; `/ee/et/avarii` com `*` e telefone opcional; rodapé com a marca; PM2 sem erros novos.

## App (precisa de APK novo — módulo nativo novo, não vai por OTA)
`npm install` na raiz já atualiza o `package-lock.json` (expo-notifications ~57.0.22, expo-device ~57.0.2). Build `preview` (APK) no EAS; o `google-services.json` vem da variável `GOOGLE_SERVICES_JSON` e a chave FCM V1 já está nas credenciais.

O que o dono testa no APK novo:
1. Instalar, entrar com a conta de cliente de teste → o app pede para **permitir notificações** (só depois do login) → Permitir.
2. **Fechar o app** (tirar da lista de recentes). Pela oficina "Test" no site: mandar um orçamento / uma mensagem / fazer check-in. Deve chegar a notificação do sistema, no idioma da conta. Tocar → abre o pedido (ou a conversa, se for mensagem).
3. Com o app aberto: o aviso aparece só no alto do app (sem duplicar).
4. Sair da conta → mandar outra mensagem pela oficina → **não** deve chegar push.
5. Localização: novo pedido → negar a localização → Ajustes do Android → permitir → voltar ao app: o endereço aparece sozinho. Repetir no "Acidente".
6. Conversa: o botão "Oficina" no alto à direita abre a página da oficina com um toque.
7. Novo pedido: escolher o carro (cartão inteiro, bolinha + check); orçamento: escolher o horário sugerido (mesmo estilo) e aceitar.
8. Acidente sem login: dá para enviar sem telefone.

## Decisões / pendências para o dono
- A conta agora segue o idioma do último lugar usado (site ou app). Se o dono preferir que só a escolha explícita mude a conta, trocar `SincronizarIdioma` por gravar só no seletor de idioma.
- Push no iPhone: precisa da chave APNs no EAS antes do build iOS (não testado).
- No teste local o servidor de testes do `_teste_local` (porta 3100) foi parado para subir este branch.
