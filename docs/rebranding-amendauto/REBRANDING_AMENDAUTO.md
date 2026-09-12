# Rebranding: BipFix → AmendAuto

Status em 2026-09-12: **decisão de nome e visual aprovada pelo usuário, execução ainda NÃO aplicada no site.** Este documento existe pra retomar o trabalho quando o usuário decidir seguir em frente (provavelmente depois de resolver onde abrir a empresa — Brasil, Estônia ou EUA).

Draft visual aprovado (Claude Design, pode não estar mais acessível dependendo de expiração): https://claude.ai/code/artifact/c2d9f2fd-fe66-41c7-a70a-9a91779ac3fc

---

## 1. Por que "AmendAuto"

Processo de naming levou a sessão inteira. Critério do usuário: nome universal (não preso a português/Brasil, já que a empresa pode ser aberta na Estônia ou nos EUA), com contexto automotivo presente, moderno.

**Nomes testados e descartados** (todos tinham concorrente direto ou adjacente no mesmo setor, achado via busca): SnapFix, Reparo/Repareo, Fixaro, Wrenzo, Garaj, Autofy, Amber, Flare, Beacon, Kiire, Traust (esse sobrou limpo mas foi substituído), Torvo (significa "carrancudo/sinistro" em italiano e português — descartado por significado ruim), Testigo (soa "testículo" em português — descartado).

**AmendAuto venceu porque:**
- "Amend" (inglês formal: corrigir, retificar) ecoa o verbo português "**emendar**" (consertar, remendar) — funciona nos dois idiomas sem forçar nada.
- "Auto" é praticamente universal (carro em PT/IT/EN, e literalmente a palavra usada em estoniano também).
- `amendauto.com` apareceu como **não registrado** numa checagem de DNS (`ENOTFOUND`) — melhor sinal de disponibilidade de todo o processo. **Precisa ser confirmado formalmente no registrador (Namecheap/Registro.br) antes de comprar** — o teste de DNS é forte indício, não garantia.
- Nenhum concorrente direto encontrado no setor de reparo automotivo/marketplace.

## 2. Direção visual aprovada

**Manter o site exatamente como está hoje** (cores azuis, layout, tipografia) — só trocar:
1. O nome "BipFix" → "AmendAuto" em todo o texto visível.
2. O símbolo/logo: **manter o carro com o check na "placa" exatamente como já existe**, só removendo as ondas de sinal sonoro do lado esquerdo (eram uma referência ao "bip"/beep, que não faz mais sentido sem esse nome).

Foram testadas e **rejeitadas** três direções de redesign completo (paleta escura+âmbar, editorial azul-marinho cheio, bento verde-claro) — o usuário preferiu manter a identidade visual atual do site. Não vale a pena revisitar essas direções a menos que o usuário peça explicitamente de novo.

## 3. Ícone novo (arquivos nesta pasta)

- `icon-light-bg.png` — carro + check, versão escura (pra fundo claro/branco), **recortado a partir do `apps/web/public/logo.png` original** (removidos só os pixels das ondas de sinal, nenhum traço foi redesenhado).
- `icon-dark-bg.png` — mesma coisa, a partir do `apps/web/public/logo-dark.png` (versão clara pra fundo escuro).

**Falta fazer antes de aplicar**: montar o logo completo (ícone + palavra "AmendAuto" escrita), já que hoje `logo.png`/`logo-dark.png` são UMA imagem só (ícone+wordmark combinados, não são elementos separados). A fonte exata usada no wordmark original não foi identificada — ao recriar, usar uma fonte bold/arredondada disponível (ex: Google Fonts "Baloo 2" ou similar) como aproximação, ou pedir pro usuário se tiver o arquivo de fonte original.

## 4. Checklist de execução (quando o usuário aprovar seguir)

### 4.1 Pré-requisito: domínio e infraestrutura
- [ ] Confirmar e comprar `amendauto.com` no Namecheap (mesma conta usada pra `bipfix.com`)
- [ ] Considerar também `.com.br` e/ou `.io` por segurança de marca
- [ ] Apontar DNS do novo domínio pra VM (`204.168.139.154`) — mesmo padrão A record que `bipfix.com`/`www.bipfix.com`
- [ ] Gerar certificado SSL (Certbot) pro novo domínio
- [ ] Verificar `amendauto.com` no Resend (DKIM/SPF) — **sem isso os e-mails transacionais não saem** (mesmo problema que já aconteceu uma vez com `bipfix.com`, ver Rodada 14 de 08/09 no `PROGRESSO_2026-09-08.md`)
- [ ] Atualizar `FROM_EMAIL` no `.env.production.local` da VM
- [ ] **Manter `bipfix.com` registrado e redirecionar (301) pro domínio novo** por um período de transição — não abandonar de imediato

### 4.2 Texto "BipFix" → "AmendAuto" no código
39 arquivos referenciam "BipFix" hoje (levantado em 2026-09-12 via grep — reconferir na hora, pode ter mudado):

```
apps/web/src/app/(auth)/cadastro/page.tsx
apps/web/src/app/(auth)/definir-senha/page.tsx
apps/web/src/app/(auth)/escolher-tipo/page.tsx
apps/web/src/app/(auth)/login/page.tsx
apps/web/src/app/admin/layout.tsx
apps/web/src/app/admin/monitoramento/page.tsx
apps/web/src/app/api/aceitar-orcamento/route.ts
apps/web/src/app/api/admin/export/route.ts
apps/web/src/app/api/admin/solicitacoes/[id]/cobrar/route.ts
apps/web/src/app/api/criar-solicitacao-emergencia/route.ts
apps/web/src/app/api/esqueci-senha/route.ts
apps/web/src/app/api/notificar-acidente/route.ts
apps/web/src/app/docs/cliente/layout.tsx
apps/web/src/app/docs/cliente/page.tsx
apps/web/src/app/docs/layout.tsx
apps/web/src/app/docs/oficina/layout.tsx
apps/web/src/app/docs/oficina/page.tsx
apps/web/src/app/docs/page.tsx
apps/web/src/app/emergencia/layout.tsx
apps/web/src/app/layout.tsx
apps/web/src/app/loja/aprender/page.tsx
apps/web/src/app/loja/comissao/page.tsx
apps/web/src/app/loja/dashboard/page.tsx
apps/web/src/app/oficina/aprender/page.tsx
apps/web/src/app/oficina/comissao/page.tsx
apps/web/src/app/oficina/dashboard/page.tsx
apps/web/src/app/oficina/enviar-orcamento/[id]/page.tsx
apps/web/src/app/oficinas/[id]/page.tsx
apps/web/src/app/page.tsx
apps/web/src/app/para-oficinas/page.tsx
apps/web/src/app/privacidade/page.tsx
apps/web/src/app/robots.ts
apps/web/src/app/seja-parceiro/layout.tsx
apps/web/src/app/seja-parceiro/page.tsx
apps/web/src/app/sitemap.ts
apps/web/src/app/termos/page.tsx
apps/web/src/components/Analytics.tsx
apps/web/src/components/layout/Navbar.tsx
apps/web/src/components/tutorial/TutorialBanner.tsx
apps/web/src/lib/notifications.ts
apps/web/src/lib/seo-utils.ts
```

Dentro desses, **20 arquivos têm `bipfix.com` hardcoded** (metadata, JSON-LD, canonical URLs, sitemap, e-mails) — só trocar o domínio DEPOIS que o DNS/SSL/Resend do novo domínio estiverem prontos (seção 4.1), senão quebra SEO/e-mail em produção.

### 4.3 Assets visuais
- [ ] Montar `logo.png`/`logo-dark.png` novos (ícone desta pasta + wordmark "AmendAuto")
- [ ] Regenerar `favicon.ico`, `favicon-32x32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` a partir do ícone novo
- [ ] Atualizar `og:image` / imagem de compartilhamento social se existir

### 4.4 Outros lugares fora do código
- [ ] `package.json` (`name` do monorepo, hoje provavelmente ainda referencia fixauto-brasil — opcional, baixo impacto)
- [ ] Nome do repositório GitHub (`vrodriguesp/fixauto-brasil`) — opcional, quebra links antigos de commit se renomear, avaliar se compensa
- [ ] Google Analytics — não precisa mudar nada tecnicamente (o Measurement ID não depende do nome), só o nome de exibição da propriedade dentro do painel do GA4, cosmético
- [ ] Conta de e-mail institucional (Zoho/Namecheap Private Email) — se quiser um endereço `@amendauto.com`, precisa configurar separado do que já existe em `@bipfix.com`

### 4.5 Depois de aplicar
- [ ] Build + `tsc --noEmit` sem erros
- [ ] Testar em produção (fluxo de cadastro, e-mail transacional chegando de `@amendauto.com`, sitemap/robots com URLs novas)
- [ ] Avaliar registro formal de marca (INPI/USPTO/EUIPO — custos detalhados já levantados na conversa que gerou este documento, refazer a busca de marca formal antes de operar em escala)

## 5. O que NÃO fazer sem perguntar de novo
- Não trocar a paleta de cores nem o layout — usuário já rejeitou 3 alternativas de redesign e confirmou que quer manter o visual atual do BipFix.
- Não comprar domínio, mudar DNS, ou mexer em Resend/e-mail em produção sem confirmação explícita de que o usuário já decidiu a jurisdição da empresa e quer seguir com a troca de verdade.
