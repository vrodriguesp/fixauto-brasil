# Onde paramos e como testar — 08/10/2026

> Referência rápida do "e agora, o que eu faço". O que mudou de 01 a 08/10 está em `docs/PROGRESSO_2026-10-08.md`; o histórico anterior nos arquivos `PROGRESSO_*`.

## Estado em 08/10/2026

- Site e app corrigidos com base nos testes no iPhone, publicados e testados em produção (6 idiomas). **Banco limpo: só a conta admin.**
- Para testar de novo no iPhone: `npx expo start -c` (entrou a biblioteca de áudio) e criar as contas do zero.
- Decisões pendentes: valores da comissão (hoje isento); chave `GEOAPIFY_KEY` para sugestões de endereço rápidas; push no celular (precisa do app como versão própria, EAS Build).

---

## Situação em 28/09/2026 (anterior)

> Referência rápida do "e agora, o que eu faço". O histórico detalhado está em `docs/PROGRESSO_2026-09-28.md` (e nos arquivos `PROGRESSO_*` anteriores).

## Estado atual em uma frase

**O site (`bipfix.com`) está no ar, testado e publicado com tudo o que foi feito até 28/09**, nos 4 idiomas, com política de privacidade e termos de uso separados para Brasil (português) e Europa (inglês, estoniano e italiano). **O banco de produção ainda não tem nenhuma oficina nem cliente real**: o próximo passo é comercial, trazer as primeiras oficinas de Tallinn.

## O que já está pronto e no ar

- Site inteiro nos 4 idiomas, com SEO (`hreflang`, sitemap, `llms.txt`, dados estruturados).
- Página pública **`/oficinas`**, com lista de oficinas e filtro por cidade e serviço. Hoje mostra "as primeiras oficinas parceiras estão chegando" e fica fora do Google; entra no Google sozinha quando houver oficina ativa.
- **"Esqueci minha senha" seguro**: manda um link de confirmação e só troca a senha quando o dono abre o link.
- **E-mail a cada visita** para vitor@outlook.ie, só de quem clicar em "Aceitar" no aviso de cookies.
- **Avaliações verificadas**: o cliente só avalia a oficina que executou o serviço dele (orçamento aceito + serviço concluído). Isso é garantido pelo banco de dados, não só pela tela.
- Política de privacidade e termos de uso: Brasil (LGPD/CDC) e Europa (GDPR e direito da UE/Estônia).
- App mobile (versão Cliente) compila e foi testado no emulador Android.

## O que falta (nesta ordem)

1. **Trazer as primeiras oficinas de Tallinn.** Tudo está em `Documentos/Marketing_Tallinn/`: planilha com 1.470 oficinas (comece pelas 109 de prioridade alta com e-mail tipo A), sequência de 3 e-mails, flyers para entregar em mãos e posts de Instagram.
2. **Revisão por nativo do estoniano** dos flyers, e-mails e textos legais, antes de imprimir ou enviar.
3. **Revisão jurídica** da política GDPR e dos termos europeus por um advogado estoniano.
4. **Quando a OÜ for registrada**: passar o nome jurídico, o código de registro (registrikood) e o endereço, para completar a seção 1 da política e dos termos europeus.
5. **Testar o app num Android físico**: ligar a "Depuração USB" no celular e conectar no PC (o `adb` está em `C:\Android\platform-tools`).
6. **App no iPhone**: precisa de um Mac ou do EAS Build, o serviço pago da Expo, com conta Apple de desenvolvedor.
7. **Outdoor e anúncios para motoristas**: só depois de ter umas 10 a 15 oficinas ativas.

## Promessas feitas nas políticas (cumprir na prática)

- Apagar a conta de quem pedir em até 30 dias.
- Responder pedidos sobre dados pessoais em até 1 mês.
- Apagar da caixa de entrada os e-mails de resumo de visita com mais de 12 meses.
- Não voltar a contatar oficina que responder "STOPP"; descartar contatos de prospecção após 24 meses.
- Os endereços **privacy@bipfix.com** e **support@bipfix.com** precisam receber e-mail de verdade (o domínio tem caixa de e-mail na Private Email; conferir se essas caixas ou redirecionamentos existem).

## Como testar o app mobile (passo a passo)

Funciona em qualquer celular Android ou iPhone, sem publicar em loja.

1. **No celular:** instale o app **Expo Go** (gratuito, App Store ou Google Play).
2. **No computador:**
   ```
   cd apps/mobile
   npx expo start
   ```
   Isso mostra um **QR code** no terminal.
3. **Conectar:** abra o Expo Go e escaneie o QR code (celular e computador na mesma rede Wi-Fi).
4. **Roteiro sugerido:** criar conta de cliente, cadastrar veículo, criar "nova solicitação" com foto, aceitar um orçamento (simulando a oficina pelo site), ver o acompanhamento, testar "Acabei de bater" e trocar o idioma do celular para conferir pt/en/et/it.

Qualquer coisa estranha, mande print ou descrição.

## Como conferir o site

- `https://bipfix.com` (português), `/et`, `/en`, `/it`
- `https://bipfix.com/et/tookojad`: lista pública de oficinas
- `https://bipfix.com/et/privaatsus` e `/et/tingimused`: versões europeias; sem `/et` são as brasileiras
- Para o seu próprio navegador nunca gerar e-mail de visita: abra uma vez qualquer página com `?nao_monitorar=1` no fim do endereço

## Decisão de produto ainda pendente

- **Idioma das mensagens de sistema no chat** quando cliente e oficina falam idiomas diferentes ("novo orçamento", "orçamento aceito" etc.).
