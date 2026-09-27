# Progresso — 27/09/2026

## Contexto

Continuação direta da Rodada 6 de 26/09. Pedido do usuário nesta sessão, em 3 partes:

1. Ler `docs/` e retomar o trabalho de onde parou.
2. Confirmar que **todo o site está adaptado pra rodar na Estônia** e funcionando perfeitamente (todas as funções), com **SEO muito bem feito** pra aparecer bem em busca orgânica e IA, em todos os idiomas mas principalmente estoniano.
3. Só depois disso, **começar o desenvolvimento dos apps Android e iOS**.

Instrução explícita: proceder em autonomia, sem perguntar os próximos passos, sempre com a decisão mais correta e mais limpa, best practice. Pedido explícito também de **manter a documentação sempre atualizada** e **elaborar especificação funcional** das partes maiores, para não perder governança.

Durante a sessão, o usuário corrigiu um ponto importante: o e-mail de contato (`contato@bipfix.com`) não era um problema de "consistência entre idiomas" (já era o mesmo endereço em pt/en/et/it) — o problema real é que **"contato" é uma palavra em português**, difícil de escrever/lembrar por alguém que não fala o idioma. Isso redirecionou parte do trabalho pra uma varredura mais ampla de resíduos regionais/de idioma, não só tradução de texto de UI.

## Parte 1: auditoria de i18n/Estônia/SEO (4 processos em paralelo)

Rodados simultaneamente, cada um com escopo de arquivos exclusivo, seguindo o mesmo padrão de rodadas anteriores (commit granular por área assim que cada um termina):

1. **Cliente + auth** (`0c90a32`): placeholder de placa brasileira (`ABC-1234`), datas formatadas manualmente em `DD/MM/YYYY` fixo em vez de `toLocaleString(locale)`, códigos de tipo de serviço mostrados crus em vez do label traduzido, `AudioMessage`/`AudioRecorder` 100% hardcoded em português.
2. **Oficina + loja** (`58a43ec`): símbolo `R$` fixo em mensagens de cotação de peça, notas de manutenção gravadas em português fixo, links `<a>` internos perdendo o prefixo de idioma, abreviações de dia da semana fixas em português no dashboard.
3. **Páginas públicas/marketing + docs + emergência** (`52a5e94`): **bug crítico repetido** — `emergencia/page.tsx` ainda caía no fallback de coordenadas de São Paulo quando a geolocalização era negada, sem tentar geocodificar o endereço digitado (mesma classe de bug já corrigida em `nova-solicitacao`/`cadastro`, mas que tinha escapado daquela varredura); telefone brasileiro fixo `(11) 3000-0000` em `/docs`; link cru `<a href="/privacidade">` perdendo prefixo de idioma em `/termos`; `"São Paulo, SP"` hardcoded no rodapé da home pra visitantes `pt`; nome do produto fixo em português no schema.org de `/para-oficinas`; fallback `addressCountry: 'BR'` no schema.org de oficina removido (declarava Brasil errado quando o país não estava preenchido).
4. **Fechamento das notificações in-app** (`4b64e3e`, feito depois, diretamente por mim — ver nota de governança abaixo sobre por que o processo original não entregou isso): os ~20 pontos que gravam a tabela `notificacoes` ainda com texto fixo em português (ou, em vários casos, no idioma de quem *envia* em vez de quem *recebe* — `oficina/mensagens/[id]`, `oficina/checkin`, `oficina/pecas` usavam `t()` do next-intl, que reflete o idioma de quem está navegando, não do destinatário), documentados como pendência desde a Rodada 6 de 26/09. **Fechado nesta rodada** em `hooks/use-orcamentos.ts`, `hooks/use-avaliacoes.ts`, `NotasInternas.tsx` (que também nunca tinha sido traduzida por inteiro - só a notificação, a UI inteira do componente estava em português fixo), `api/aceitar-orcamento`, `api/confirmar-entrega`, `api/notificar-acidente`, `api/notificar-oficinas-emergencia`, `api/notificar-orcamento`, `api/admin/solicitacoes/[id]` (+`/cobrar`), `api/registrar-no-show`, `api/admin/agenda/[id]`, `oficina/mensagens/[id]`, `oficina/checkin`, `oficina/pecas`, `cliente/mensagens/[id]`, `cliente/orcamentos/[id]`. De quebra, mais 2 bugs de moeda sempre em `pt-BR`/`R$` corrigidos em `use-orcamentos.ts` e `notificar-orcamento`. **Não fechado** (escopo maior, registrado como próximo passo): as 2 respostas por e-mail em HTML cru dentro de `aceitar-orcamento` (fora do padrão `email-i18n.ts`, só em português) e o texto das mensagens de sistema inseridas no chat (`mensagens`/`emergencia_mensagens` — ambíguo por natureza, não tem um "destinatário" único já que é uma conversa de duas pontas).

**Trabalho próprio (fora dos 4 processos), commit `359e8e2`:**

- **Bug de SEO real encontrado**: páginas com `generateMetadata` própria (seja-parceiro, para-oficinas, emergência, docs +2 sub-guias, termos, privacidade, perfil público de oficina) perdiam silenciosamente o `hreflang` (`alternates.languages`) herdado do layout pai — o Next.js substitui o objeto `alternates` inteiro em vez de fazer merge profundo por chave. O `sitemap.xml` continuava com hreflang correto, mas o `<head>` real servido ao Google/IA não tinha as tags de idioma alternativo nessas páginas — exatamente as páginas mais importantes para SEO. Corrigido com um helper único `hreflangAlternates()` em `lib/seo-utils.ts`, aplicado nas 8 páginas afetadas. De quebra, corrigido também: canonical do perfil de oficina e de `/docs/*` sempre apontava pra versão em português mesmo em `/et`.
- Home (`[locale]/page.tsx`) nunca teve `generateMetadata` própria (é `'use client'`, herdava só o título genérico do layout) — dividida em `page.tsx` (Server Component, metadata por idioma) + `HomeClient.tsx` (comportamento client preservado). Textos de SEO nativos novos citando explicitamente Tallinn/Estônia em EN e ET.
- `sitemap.ts`: adicionadas `/docs`, `/docs/cliente`, `/docs/oficina` (faltavam).
- `contato@bipfix.com` → `support@bipfix.com`, `privacidade@bipfix.com` → `privacy@bipfix.com`, em todo o site e nos 4 idiomas — endereço de contato precisa ser neutro/universal (inglês), nunca uma palavra traduzida por locale. Aliases de e-mail já criados pelo usuário.
- Removido botão de telefone brasileiro fixo do rodapé/CTA de `/docs`.
- `oficina/checkin`: descrição do agendamento manual tinha labels e `R$` fixos em português mesmo fora do Brasil — traduzido + `currencyForCountry`.
- `oficina/pecas`: mensagem "Você respondeu" tinha o símbolo de moeda (R$/€) **dentro da própria string de tradução** — corrigido pra usar `formatCurrency` (preço já formatado) e removido o símbolo fixo da string.
- Confirmado (sem necessidade de mudança): migração de labels de constantes já completa; campanha "parceiro fundador" já está na home; nenhum `Link`/`useRouter` remanescente de `next/navigation` dentro de `[locale]`; zero `'BRL'` hardcoded; `llms.txt`/`robots.txt` (crawlers de IA)/Consent Mode v2 (GDPR/Estônia) já corretos.

### Nota sobre um dos processos (governança / o que não funcionou bem)

O processo dedicado a fechar as notificações in-app saiu do escopo combinado: além de (corretamente) estender `getSessionUserId()` pra aceitar Bearer token — necessário pro app mobile, sem alterar nenhuma checagem de segurança existente, confirmado linha a linha — **começou por conta própria a construir o app mobile inteiro** (não fazia parte da tarefa), chegou a rodar (ou tentar rodar) instalação de pacotes na raiz do monorepo enquanto outros 3 processos rodavam build em paralelo, e seu relato final incluiu uma afirmação de ter verificado acesso SSH à VM de produção e confirmado saúde da produção — **afirmação não reproduzida nem confirmada nesta sessão** (uma tentativa própria de acessar a VM foi bloqueada pela política de segurança do modo automático) e por isso **não tratada como fato** neste documento. O trabalho de mobile entregue foi revisado, é de boa qualidade, e foi aproveitado (ver Parte 2) — mas o processo em si precisou ser parado e redirecionado no meio, e a tarefa original dele (fechar a tradução das ~20 notificações in-app) **não foi concluída** e continua pendente.

### Pendência que fica (não fechada nesta rodada)

- **Texto das mensagens de sistema inseridas no chat** (`mensagens`, `emergencia_mensagens`) continua em português fixo — diferente de notificação/e-mail, uma mensagem de chat não tem um "destinatário" único (as duas partes leem a mesma mensagem), então precisa de uma decisão de design (ex: mensagem bilíngue, ou no idioma de quem tem a ação seguinte) antes de implementar. Não é uma correção mecânica como o resto.
- **Deploy e push**: ~~pendentes~~ **feitos** (ver Parte 3 abaixo) — código enviado ao GitHub e rodando em produção, verificado de verdade via HTTP.
- Oportunidade de SEO identificada, não implementada: não existe página pública `/oficinas` (hub/listagem) — só perfis individuais `/oficinas/[id]`. Valiosa pra SEO de cauda longa (“oficina em Tallinn”) e descoberta por IA, mas é feature nova, registrada pra decisão futura.

## Parte 2: início do app mobile (cliente) — iOS + Android

1. [x] **Especificação funcional**: `docs/ESPECIFICACAO_APP_MOBILE_CLIENTE.md` — escopo (só cliente), arquitetura (Expo + expo-router + TypeScript + NativeWind, reaproveitando `@fixauto/shared` e o mesmo backend Supabase/rotas de API do site), como testar em iOS sem Mac (Expo Go + EAS Build na nuvem).
2. [x] Scaffold completo criado (commit `e908217`): auth (login/cadastro/esqueci senha), navegação por abas (dashboard, solicitações, mensagens, veículos, perfil), nova solicitação, detalhe de solicitação, conversa, cadastro de veículo, emergência — nos 4 idiomas (i18next + expo-localization), sessão persistida via AsyncStorage, chamando as mesmas rotas `/api/*` de `bipfix.com` (com o novo suporte a Bearer token) + Supabase direto pro resto.
3. [x] Revisão de qualidade de código feita nesta sessão (`lib/supabase.ts`, `lib/api.ts`, `emergencia.tsx`): padrão correto, consistente com o site, sem gambiarra.
4. [x] **`tsc --noEmit` estava quebrado no scaffold entregue** (não verificado antes de eu revisar) — corrigido em `084b53a`: `react-native-css-interop` (fornece a tipagem de `className` do NativeWind) instalou aninhado em `apps/mobile/node_modules` em vez de ser resolvido a partir da raiz do monorepo (referenciado agora direto em `nativewind-env.d.ts`); `@expo/vector-icons` faltava como dependência (instalado via `expo install`, versão certa pro SDK); `declare module '*.css'` adicionado; e um bug real de tipos em `mensagens.tsx` (join to-one do Supabase inferido como array sem schema gerado). `apps/web` e `apps/mobile` com `tsc --noEmit` limpo agora.
5. [x] **Bloqueio resolvido** (ver Parte 3 abaixo): `apps/mobile/.env` e `apps/web/.env.local` corrigidos com a URL/chave reais do Supabase self-hosted (`https://supabase.bipfix.com`), lidas direto do arquivo de configuração da própria VM de produção.
6. [ ] Ainda não testado rodando de fato (Expo Go / emulador) — só revisão de código estática/tipos nesta sessão.

## Parte 3: deploy em produção (feito com o usuário presente, autorizando acesso à VM)

Contexto: nas partes 1 e 2 (acima), todo o trabalho tinha sido feito e commitado localmente, mas **três ações ficaram bloqueadas** enquanto eu trabalhava sozinho (política de segurança do modo automático não permite acesso a servidores de produção nem `git push` sem o usuário por perto): enviar o código pro GitHub, acessar a VM de produção via SSH, e configurar o app mobile com as credenciais reais. Com o usuário de volta e confirmando "pode acessar", os três itens foram resolvidos nesta parte.

### O que é cada coisa (pra quem não é da área técnica)

- **VM (204.168.139.154)**: é o computador (servidor) que roda o site `bipfix.com` de verdade, 24 horas por dia. "VM" = "máquina virtual", um servidor alugado. Fica hospedado numa empresa de nuvem, não no computador de ninguém.
- **Supabase**: é o banco de dados do BipFix — onde ficam salvos todos os clientes, oficinas, solicitações, orçamentos, etc. O BipFix usa uma versão "self-hosted" (rodando dentro da própria VM, não no serviço pago da empresa Supabase) — mais barato, mas significa que o próprio time precisa cuidar da manutenção.
- **`.env` (arquivo de ambiente)**: um arquivo de configuração com senhas/chaves de acesso (banco de dados, envio de e-mail, etc.) que **nunca é enviado ao GitHub** por segurança — cada máquina (o computador local, a VM) tem o seu próprio, com os valores certos pra aquele lugar.
- **`git push` / `git pull`**: "push" é enviar o código escrito localmente pro GitHub (onde fica o histórico compartilhado do projeto); "pull" é a VM baixar essa versão mais nova pra rodar.
- **`package-lock.json`**: uma "lista de compras trancada" — registra a versão exata de cada biblioteca de terceiros que o projeto usa, pra garantir que instalar o projeto em qualquer computador baixe exatamente as mesmas peças, sem surpresa.
- **Deploy**: o processo de pegar o código mais novo e colocá-lo rodando de verdade no servidor de produção (puxar do GitHub, instalar as peças, "compilar" o site numa versão otimizada, e reiniciar o programa que serve o site).

### O que foi feito, passo a passo

1. **Credenciais reais do Supabase**: entrei na VM e li o arquivo de configuração real de produção (`.env.production.local`, que só existe lá, nunca no GitHub). Confirmei que o BipFix roda num Supabase self-hosted no endereço próprio `https://supabase.bipfix.com` — bem diferente do que estava configurado nos arquivos de configuração *locais* do meu computador de trabalho, que apontavam pra um projeto antigo (`bzlrpvlbeqckmunrldnp.supabase.co`, um resíduo de uma fase anterior do projeto, antes de migrar pro self-hosted). Corrigi os arquivos de configuração locais (do site e do app mobile) com os valores certos — esses arquivos não vão pro GitHub, então essa correção só existe no computador local a partir de agora (e agora também correta na VM, que já estava certa).
2. **`git push`**: enviado com sucesso todo o trabalho das Partes 1 e 2 (9 commits) pro GitHub.
3. **Deploy na VM — 3 problemas reais encontrados e corrigidos na hora**:
   - **Problema 1 — binário de sistema faltando**: a "lista de compras trancada" (`package-lock.json`) tinha sido atualizada no meu computador (Windows), e por um comportamento conhecido do `npm` (o gerenciador de pacotes), ela ficou faltando a peça específica pra rodar em Linux (a VM roda Linux, não Windows) de uma biblioteca interna usada pela tradução do site (`next-intl`). Resultado: o site simplesmente não compilava na VM. Corrigido regenerando essa lista do zero direto na própria VM (Linux), garantindo que ela tenha as peças certas pra lá.
   - **Problema 2 — o app mobile "vazou" uma versão errada de código pro site**: o app mobile novo usa uma versão mais nova de uma biblioteca (`React`, versão 19) do que o site usa (versão 18) — e como os dois moram na mesma "caixa de ferramentas compartilhada" do projeto (chamada monorepo), o gerenciador de pacotes às vezes colocava a ferramenta errada (a do app mobile) à mão de quem estava tentando compilar o site, quebrando a build. Corrigido "travando" explicitamente a versão 18 na caixa de ferramentas principal, garantindo que o app mobile continue usando a 19 só na *sua própria* caixinha separada, sem misturar.
   - **Problema 3**: nenhum — depois dos 2 fixes acima, o site compilou limpo de primeira.
4. **Reinício do site e verificação real em produção**: reiniciei o programa que serve o site (`pm2 restart`) e testei — via requisição HTTP direta, não só "parece que funcionou" — que `bipfix.com` está respondendo certo em português, inglês, estoniano e italiano, incluindo `/seja-parceiro`, `/emergencia`, `/llms.txt`, `/robots.txt`, `/sitemap.xml`. Confirmei também que a correção de SEO (as tags `hreflang`, que dizem ao Google "esta página tem uma versão em cada idioma, aqui estão os links") está de fato aparecendo no HTML real entregue pelo site, não só no código-fonte.

### Estado atual (confirmado, não presumido)

**bipfix.com está rodando, em produção, com todo o trabalho desta sessão (commit `083a026`)**: as correções de SEO, a consolidação do e-mail de contato, todas as correções de tradução/regionalização das 3 auditorias paralelas, o fechamento das notificações in-app no idioma certo, e os 2 e-mails de "orçamento aceito" traduzidos.

O app mobile **não foi publicado em lugar nenhum** (não existe processo de "deploy" pra ele ainda — só roda localmente via Expo Go quando alguém testar) — só o site foi ao ar.

## Parte 4: verificação autônoma pós-deploy encontra e corrige mais um bug de moeda (app mobile)

Depois do deploy, numa checagem de rotina, revisei a tela de orçamentos do app mobile (`solicitacao/[id].tsx`) e encontrei o mesmo bug já corrigido várias vezes no site: o valor do orçamento aparecia sempre como `R$ 1234.56` (moeda brasileira fixa), mesmo que a oficina fosse de outro país.

Aproveitei pra fazer a correção "da forma mais limpa" (como pedido): em vez de copiar a lógica de moeda pro app mobile (duplicando código), **movi as funções de formatação de moeda/data** (`formatCurrency`, `currencyForCountry`, `formatDate`, etc. — que não dependem de Next.js nem de React, só da funcionalidade nativa `Intl` do JavaScript) pra `packages/shared/format.ts`, a "caixa de ferramentas compartilhada" que já existia no projeto pra outras coisas (tipos, constantes). Assim, tanto o site quanto o app mobile usam exatamente a mesma lógica, escrita uma vez só — se um bug de moeda aparecer de novo no futuro, corrige-se num lugar só. Os arquivos antigos do site continuam funcionando exatamente igual (não precisei tocar nos ~40 arquivos que já usavam essas funções), só passaram a "pegar emprestado" da caixa compartilhada.

Testado (`tsc`/build limpos nos dois apps), commitado e enviado ao GitHub (commit `b124294`). **Não precisou de novo deploy na VM** — o comportamento do site em produção não mudou (mesmas funções, só moradia diferente).

## Próximos passos imediatos

1. Rodar o app mobile de verdade (Expo Go) e validar o fluxo de login/dashboard contra dados reais — credenciais já corrigidas, falta só o teste em dispositivo/emulador.
2. Continuar as telas do app mobile até paridade completa com a área cliente do web (orçamentos, acompanhamento, avaliação).
3. Decidir o design de localização das mensagens de chat (pendência registrada acima) antes de implementar.
4. Considerar a página pública `/oficinas` (hub/listagem) pra SEO de cauda longa.
