# Progresso — 28/09/2026

## 1. Página pública `/oficinas` — pronta, commitada, **ainda não publicada**
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

## 3. Monitoramento de visitas por e-mail — commits `d24b68f` e `fb411c6`, **ainda não publicado**
- Manda um e-mail por visita, com as páginas visitadas e o tempo em cada, a origem (Google, Instagram, UTM, QR code), a cidade e o país (geoip-lite local), o dispositivo, o idioma e a duração.
- Filtra robôs pelo user-agent e ignora `/admin`, o admin logado e navegadores marcados com `?nao_monitorar=1`. Limite de 40 e-mails por hora.
- Testado localmente com visita simulada de um celular em Tallinn e no build de produção. Um e-mail de teste real foi enviado a vitor@outlook.ie pelo Resend (id `01a0e6b9-ce5e-74a2-9f49-827812d11be1`).
- Achado: o SDK do Resend v6 **não lança exceção** em falha, só devolve `{ error }`. O código novo confere isso. **O `lib/notifications.ts` existente não confere** e reporta sucesso mesmo quando o envio falha; fica para corrigir.

## Pendente — precisa de você
1. **Deploy.** O acesso SSH à VM foi bloqueado pela regra de segurança do modo automático. Na VM:
   - acrescentar `VISITAS_EMAIL_PARA=vitor@outlook.ie` em `.env.production.local`;
   - rodar `git pull`, `npm install` (entra o `geoip-lite`), `npm run build` e `pm2 restart fixauto-brasil --update-env`.
2. Conferir se o nginx repassa o IP real do visitante (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`). Sem isso, a localização no e-mail sai "desconhecida".
3. Política de privacidade: o monitoramento processa o IP (mascarado no e-mail, não fica gravado). Vale mencionar isso na política. Decisão legal, não alterei o texto.
4. Revisão por um nativo do estoniano nos materiais antes de imprimir ou enviar.
5. Android físico: o `adb` está em `C:\Android\platform-tools`. Basta conectar o celular por USB com a "Depuração USB" ligada.
