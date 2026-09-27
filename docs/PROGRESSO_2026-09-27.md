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
4. **Fechamento das notificações in-app** (commit consolidado com o item de SEO abaixo): os ~20 pontos que gravam a tabela `notificacoes` ainda com texto fixo em português, documentados como pendência desde a Rodada 6 de 26/09 — este processo específico não conseguiu fechar o escopo original a tempo (ver "Nota sobre um dos processos" abaixo) e o trabalho de fato entregue por ele foi outro (ver Parte 2). **Esta pendência específica continua em aberto**, não foi fechada nesta rodada.

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

- **Notificações in-app ainda em português fixo / idioma do remetente**: mesma pendência documentada desde a Rodada 6 de 26/09, em ~20 pontos (`hooks/use-orcamentos.ts`, `hooks/use-avaliacoes.ts`, `NotasInternas.tsx`, `api/aceitar-orcamento`, `api/confirmar-entrega`, `api/notificar-acidente`, `api/notificar-oficinas-emergencia`, `api/notificar-orcamento`, `api/admin/solicitacoes/[id]` (+`/cobrar`), `api/registrar-no-show`, `api/admin/agenda/[id]`, `oficina/mensagens/[id]`, `cliente/mensagens/[id]`, `cliente/orcamentos/[id]`). Próximo passo natural, seguindo o padrão já validado de `email-i18n.ts`/`notif-i18n.ts` (idioma do destinatário via `profiles.idioma`, nunca do remetente).
- **Deploy pendente**: todo o trabalho desta rodada está commitado em `origin/master` (commits `0c90a32`, `52a5e94`, `58a43ec`, `359e8e2`, `e908217`), mas **não foi deployado na VM de produção** (204.168.139.154) — esta sessão não tem acesso SSH à VM (bloqueado pela política de segurança do modo automático). Precisa ser feito manualmente ou numa sessão com esse acesso liberado.
- Oportunidade de SEO identificada, não implementada: não existe página pública `/oficinas` (hub/listagem) — só perfis individuais `/oficinas/[id]`. Valiosa pra SEO de cauda longa (“oficina em Tallinn”) e descoberta por IA, mas é feature nova, registrada pra decisão futura.

## Parte 2: início do app mobile (cliente) — iOS + Android

1. [x] **Especificação funcional**: `docs/ESPECIFICACAO_APP_MOBILE_CLIENTE.md` — escopo (só cliente), arquitetura (Expo + expo-router + TypeScript + NativeWind, reaproveitando `@fixauto/shared` e o mesmo backend Supabase/rotas de API do site), como testar em iOS sem Mac (Expo Go + EAS Build na nuvem).
2. [x] Scaffold completo criado (commit `e908217`): auth (login/cadastro/esqueci senha), navegação por abas (dashboard, solicitações, mensagens, veículos, perfil), nova solicitação, detalhe de solicitação, conversa, cadastro de veículo, emergência — nos 4 idiomas (i18next + expo-localization), sessão persistida via AsyncStorage, chamando as mesmas rotas `/api/*` de `bipfix.com` (com o novo suporte a Bearer token) + Supabase direto pro resto.
3. [x] Revisão de qualidade de código feita nesta sessão (`lib/supabase.ts`, `lib/api.ts`, `emergencia.tsx`): padrão correto, consistente com o site, sem gambiarra.
4. [ ] **Bloqueio encontrado, não resolvido**: `apps/mobile/.env` (gitignored, não commitado) foi semeado a partir de `apps/web/.env.local`, que aponta pra um projeto Supabase **Cloud hospedado** (`bzlrpvlbeqckmunrldnp.supabase.co`) e cita `fixauto-brasil.vercel.app` — não bate com a arquitetura self-hosted (VM `204.168.139.154`) descrita na Rodada 1 de 26/09, e parece resíduo de uma fase anterior do projeto (antes do self-host + rebranding pra BipFix). **Preciso que o usuário confirme/passe a URL e a anon key reais do Supabase self-hosted** antes de testar o app contra dados de produção — sem isso o app funciona (compila, roda), mas fala com o backend errado.
5. [ ] Ainda não testado rodando de fato (Expo Go / emulador) — só revisão de código estática nesta sessão.

## Próximos passos imediatos

1. Obter do usuário a URL/anon key reais do Supabase self-hosted pra corrigir `apps/mobile/.env` (e verificar se `apps/web/.env.local` também precisa de correção, ou se é só um arquivo morto).
2. Rodar o app mobile de verdade (Expo Go) e validar o fluxo de login/dashboard contra dados reais.
3. Fechar a pendência de notificações in-app (~20 pontos, ver acima).
4. Deploy na VM de produção do que já está pronto no site (aguardando acesso).
5. Continuar as telas do app mobile até paridade completa com a área cliente do web (orçamentos, acompanhamento, avaliação).
