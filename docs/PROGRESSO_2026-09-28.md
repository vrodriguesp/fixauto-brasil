# Progresso — 28/09/2026

## 1. Página pública `/oficinas` — pronta, commitada, publicada
Commit `5bbb125`.
- Listagem de oficinas ativas com filtro por cidade e por serviço, nos 4 idiomas. O link "Ver oficinas na plataforma" de `/para-oficinas` dava 404 e agora funciona.
- Com o banco de produção vazio, a página mostra um estado de "primeiras oficinas chegando", com botões para oficina fundadora e para cadastro de motorista. Nesse estado ela fica fora do Google (`noindex`) e fora do sitemap. Assim que existir uma oficina ativa, entra no índice sozinha.
- Achado do build: sem `force-dynamic`, o Next pré-renderizava a página como estática, e os filtros seriam ignorados em produção. Corrigido e confirmado (`Cache-Control: no-store` no `next start`).
- Achado de segurança: `StructuredData` não escapava `<` no JSON-LD. Um nome de oficina com `</script>` injetaria HTML na página de perfil. Corrigido e testado com um nome malicioso.
- Prints em `Documentos/Prints_Pagina_Oficinas/`. Os de 01 a 05 usam dados de demonstração só locais (nada foi para o banco); o 06 e o 07 mostram o estado real de hoje.

## 2. Marketing Tallinn (ET + EN) — `Documentos/Marketing_Tallinn/`
- 3 flyers A5 (PDF para a gráfica + PNG), 3 posts e 2 stories de Instagram, 2 outdoors 6×3 m, legendas e hashtags.
- `Oficinas_Tallinn.xlsx`: 1.470 empresas tiradas dos dados abertos oficiais do Äriregister (NACE 45.20/95.31, endereço em Tallinn, registro ativo), com prioridade, tipo de e-mail (genérico/pessoa/provedor gratuito) e coluna de status. O 1182.ee bloqueia coleta automática; o registro oficial é uma fonte melhor.
- `Emails_Oficinas.md`: sequência de 3 e-mails. A forma estoniana "em [bairro]" (inessivo) vem pronta na planilha, porque não é só acrescentar "s" (Lasnamäe**l**, Kesklinna**s**).

## 3. Monitoramento de visitas por e-mail — commits `d24b68f`, `fb411c6` e `8f52818`, publicado
- Manda um e-mail por visita, com as páginas visitadas e o tempo em cada, a origem (Google, Instagram, UTM, QR code), a cidade e o país (geoip-lite local), o dispositivo, o idioma e a duração.
- Filtra robôs pelo user-agent e ignora `/admin`, o admin logado e navegadores marcados com `?nao_monitorar=1`. Limite de 40 e-mails por hora.
- Testado localmente com visita simulada de um celular em Tallinn e no build de produção. Um e-mail de teste real foi enviado a vitor@outlook.ie pelo Resend (id `01a0e6b9-ce5e-74a2-9f49-827812d11be1`).
- Achado: o SDK do Resend v6 **não lança exceção** em falha, só devolve `{ error }`. O código novo confere isso. O `lib/notifications.ts` também não conferia e reportava sucesso mesmo quando o envio falhava. **Corrigido no commit `a90c07c`** (as 11 funções), testado com endereço inválido.

## 4. "Esqueci minha senha" seguro — commit `6a19a56`, publicado
- Antes: a rota trocava a senha na hora e mandava uma temporária por e-mail. Qualquer pessoa que soubesse o e-mail de outra conseguia trancá-la fora da conta.
- Agora a rota manda um link de confirmação (token do Supabase via `generateLink`, uso único, 1 h), pelo Resend e no idioma da pessoa. A senha só muda em `/reset-password`, depois de `verifyOtp`.
- Limite de 1 pedido por e-mail a cada 2 min. A resposta é igual exista ou não a conta. O app mobile passou a usar a mesma rota.
- Testado ponta a ponta com usuário temporário (apagado no fim): o pedido não altera a senha, o link troca a senha, a senha antiga deixa de valer, o link reutilizado é recusado.

## 5. Deploy — 28/09/2026, versão `8f52818`
- Na VM: `VISITAS_EMAIL_PARA=vitor@outlook.ie` acrescentado em `.env.production.local` (backup em `/root/env-fixauto-backup-20260928`), depois `git pull`, `npm install`, build e `pm2 restart --update-env`.
- O nginx seta `X-Real-IP` e acrescenta o IP real no fim do `X-Forwarded-For`. A rota de visitas usa `X-Real-IP`, porque o início do XFF pode ser forjado.
- Verificado por requisição real: `/oficinas` nos 4 idiomas (200, noindex, no-store), sitemap sem `/oficinas` (banco vazio), `/api/esqueci-senha` respondendo sem revelar contas, `/api/visita` ignorando robôs.

## Pendente — precisa de você
1. Política de privacidade: o monitoramento processa o IP do visitante (mascarado no e-mail, não fica gravado). Vale mencionar isso na política. Decisão legal, não alterei o texto.
2. Revisão por um nativo do estoniano nos materiais antes de imprimir ou enviar.
3. Android físico: o `adb` está em `C:\Android\platform-tools`. Basta conectar o celular por USB com a "Depuração USB" ligada.
