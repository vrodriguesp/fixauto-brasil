# Checklist de deploy — ajustes do feedback de 27/10

Commits: `92eefe3`, `ab5fde8`, `1468718` (já no GitHub). **Sem migração de banco**: só código do site e do app.

## O que entra
| Onde | Mudança |
|---|---|
| App | Teclado não cobre mais o campo (conversa, avaliação/pedido, novo pedido, acidente, veículo, login, cadastro) — `react-native-keyboard-controller` (precisa do APK novo, não vai por atualização OTA) |
| App + site | Revisão de orçamento: antes do carro chegar (sem check-in e horário ainda não passou) o botão é **"Recusar novo valor"**; depois do check-in continua **"Recusar e retirar o carro"** |
| App | Pedido com revisão pendente vira o cartão principal do Início ("Novo valor para aprovar") e ganha selo âmbar na lista |
| App | Cartão de situação sem sombra (no Android desenhava um retângulo branco atrás) |
| Site (oficina) | Página **Mensagens** (`/oficina/mensagens`): pedidos ativos; serviço entregue só aparece na garantia e depois que o cliente escreve |
| Site (oficina) | Conversa de serviço entregue em **modo resposta**: a oficina só escreve depois que o cliente reabrir |
| Site (oficina) | Página **Garantias** (`/oficina/garantias`): em vigor (dias restantes) e encerradas nos últimos 90 dias |
| Site (oficina) | Menu "Mais" com Mensagens e Garantias; textos nos 6 idiomas |

## Testes feitos (ambiente local isolado, banco do Docker)
- `teste-feedback-27-10.mjs` — 11/11 OK (revisão antes/depois do check-in, lista de conversas, modo resposta, garantias, celular sem transbordo, menu)
- `site-revisao` OK (teste atualizado para a regra nova), `site-mensagens` OK, `site-menu-sobreposto` OK
- `site-painel-oficina` TUDO OK (28/10; a falha da 1ª rodada foi a virada do dia, 00:09 em Tallinn)
- Type check do site e do app sem erros

## Deploy do site (precisa do OK do dono no chat)
1. `ssh root@204.168.139.154`
2. `cd /root/fixauto-brasil && git pull`
3. `cd apps/web && npm run build` (avisos ENOWORKSPACES / lockfile são normais)
4. `pm2 restart fixauto-brasil --update-env`
5. Conferir: `/ee/et`, `/ee/et/oficina/mensagens`, `/ee/et/oficina/garantias` (logado como oficina), página de orçamento do cliente; PM2 sem erros novos

## App
1. APK de teste: build EAS `f572eda4-e5e6-4a48-b728-1911ef9c0a91` (link no PROGRESSO quando terminar)
2. Teste no celular (sessão de amanhã): digitar na conversa e na avaliação com o teclado aberto; revisão antes/depois do check-in; cartão "Agendado"
3. Loja: depois do teste, build `production` (.aab) e enviar ao Play Console (teste interno/fechado)

## Depois do deploy
- Reabrir a oficina de teste só se for testar de novo (hoje produção tem só admin, a cliente real e o revisor do Google)
- Notificações push: ainda não existem (ver proposta no PROGRESSO)
