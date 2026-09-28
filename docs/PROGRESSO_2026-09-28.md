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

## 6. Política de privacidade separada por jurisdição — commits `204109d` e `aab56c5`, publicada
- `pt` (Brasil): continua a política LGPD, agora com o item "Dados de navegação" (registro de visitas).
- `en`/`et`/`it` (Europa): política nova escrita com base no GDPR (namespace `privacidade` com lista `secoes`, renderizada pelo componente compartilhado `components/legal/DocumentoLegalSecoes.tsx`).
  - Controlador: BipFix, em registro como OÜ na Estônia; até lá, o fundador como pessoa física (sem citar o nome). **Quando a OÜ sair, completar a seção 1 com ärinimi, registrikood e endereço.**
  - Base legal do art. 6 por finalidade; destinatários com país; transferências (DPF/SCC, adequação do Reino Unido); direitos dos arts. 15–22; reclamação à Andmekaitse Inspektsioon (Tatari 39, 10134 Tallinn, info@aki.ee).
- Rotação de logs do PM2 ligada na VM (`pm2-logrotate`: diária, retém 14 dias, comprime, corta em 50 MB). A política promete "logs do servidor até 14 dias" e antes os logs do PM2 nunca eram apagados.
- **Promessas da política que precisam ser cumpridas na prática:** apagar a conta em até 30 dias após o pedido; apagar os e-mails de resumo de visita com mais de 12 meses da caixa de entrada; parar de contatar e esquecer oficinas prospectadas em até 24 meses; responder pedidos de privacidade em até 1 mês; o endereço privacy@bipfix.com precisa receber e-mail de verdade.

## 7. E-mail de visita só com consentimento — commit `f84041d`, publicado
- Pedido do usuário: o registro de visita (e o e-mail) só acontece depois do clique em "Aceitar" no aviso de cookies, no site todo (Brasil e Europa).
- `VisitTracker` confere `bipfix_cookie_consent === 'accepted'` antes de gravar no `sessionStorage` e antes de enviar. `Analytics.tsx` dispara o evento `bipfix-consentimento` no clique, para a página atual já contar.
- Políticas atualizadas: pt "Dados de navegação (somente se você aceitar os cookies)"; en/et/it 3.7 e 9 com base legal = consentimento (art. 6(1)(a)).
- Testado em produção com duas visitas reais: recusou → nada guardado no navegador; aceitou → 2 páginas guardadas e um único e-mail.

## 8. Avaliação só da oficina que executou o serviço — commit `79580f9`, migração `026` aplicada em produção
- Pedido do usuário: o cliente só avalia a oficina que executou o serviço.
- Achado: a policy de INSERT de `avaliacoes` só conferia `auth.uid() = cliente_id`, então pela API qualquer cliente logado avaliava qualquer oficina. E **não existia policy de UPDATE**: a edição de avaliação (permitida pela tela por 2 meses) falhava em silêncio.
- Migração `026_avaliacao_so_servico_concluido.sql`: função `pode_avaliar()` (pedido do próprio cliente, `status = 'concluida'`, orçamento `aceito` daquela oficina); policies de INSERT e UPDATE usando a função.
- Testada no banco de produção dentro de uma transação com ROLLBACK (7 casos, todos com o resultado esperado) antes de aplicar. Havia 0 avaliações em produção.
- Removida a opção de avaliar oficina de orçamento **recusado** (página do orçamento e histórico). O app mobile já só avaliava a oficina aceita; agora mostra o erro se o banco recusar.

## 9. Termos de uso separados por jurisdição — commit `8069386`, publicado
- `pt` (Brasil): termos brasileiros de sempre (CDC, foro de São Paulo), sem mudança.
- `en`/`et`/`it` (Europa): termos novos com base no direito da UE e da Estônia:
  - prestador identificado (OÜ em registro);
  - Partners declarados como profissionais (Omnibus);
  - parâmetros de distribuição e ordenação, sem posição paga (P2B art. 5 / Omnibus);
  - taxas com 30 dias de aviso;
  - restrição/suspensão com motivação e encerramento com 30 dias (P2B art. 4);
  - avaliações verificadas (só com serviço concluído, garantido pela migração 026);
  - denúncia de conteúdo ilegal e ponto de contato único (DSA arts. 11, 12, 16, 17);
  - comissão de disputas de consumo da TTJA;
  - lei estoniana com proteção do consumidor do país de residência;
  - foro Harju Maakohus para empresas;
  - isenção de mediadores P2B por ser pequena empresa (Recomendação 2003/361).
- Links internos do texto (`href="/privacidade"`) ganham o prefixo do idioma no componente, senão o leitor europeu cairia na versão brasileira.

## 10. Documentos atualizados
- `Documentos/`: PDFs novos gerados do site no ar: política e termos Brasil (pt) e Europa (en e et). Os PDFs de 08/09 foram movidos para `Documentos/Versoes_antigas_2026-09-08/` (nada apagado).
- Os PDFs "Cidade Piloto" (Ribeirão Preto/SP) são um estudo de estratégia anterior à decisão de começar por Tallinn: não foram reescritos (documento de negócio).
- `docs/PROXIMOS_PASSOS_E_COMO_TESTAR.md` e `docs/SINTESE_2026-09-28.md` atualizados.

## Pendente — precisa de você
1. Revisão jurídica da política GDPR e dos termos europeus por advogado estoniano (os textos foram escritos por mim, com base no GDPR, P2B, Omnibus e DSA).
2. Revisão por um nativo do estoniano nos materiais antes de imprimir ou enviar.
3. Android físico: o `adb` está em `C:\Android\platform-tools`. Basta conectar o celular por USB com a "Depuração USB" ligada.
