# Teste do dono no iPhone — 09/10/2026

Pontos anotados durante o teste. **Nenhuma mudança é feita antes de o dono terminar a lista.**

## Cenário
- Pedido do dono (conta em estoniano): acidente "acabei de bater", Tööstuse 5, Tallinn; Honda Civic; "Batida lateral - farol quebrado"; quem causou: o outro motorista.
- Oficinas de demonstração, ativas e a ~2 km do pedido. Os acessos estão no arquivo local do teste, não no repositório.
  - **Kereremont Kesklinn**: faz tudo, inclusive colisão, funilaria e pintura.
  - **Mootorikeskus**: só mecânica, elétrica, revisão, pneus e manutenção.
- Feito pela tela (robô):
  - a Kereremont vê o pedido na lista e a Mootorikeskus não;
  - a Kereremont mandou uma mensagem em estoniano e um orçamento de €285;
  - o cliente recebeu os dois avisos em estoniano ("Uus sõnum", "Uus hinnapakkumine saabus").

## Pontos

| # | Quem achou | Tela | O que acontece | O que deveria acontecer | Situação |
|---|---|---|---|---|---|
| 1 | Claude | Oficina → link direto do pedido | A Mootorikeskus (sem carroceria) não vê o pedido na lista, mas pelo link direto vê os dados (carro, descrição, fotos) e o botão "Saada hinnapakkumine". | A página do pedido deveria seguir a mesma regra da lista (especialidade e raio): sem acesso aos dados e sem poder orçar. | corrigido — regra única no banco (056) + site + app; teste `site-atendimento.mjs` 16/16 |
| 2 | Dono | Cliente (app) → pedido enviado | Não vê a foto do pedido e não consegue editar para pôr o seguro e o número da apólice. | Ver as fotos enviadas e poder completar quem paga, a seguradora e o nº da apólice/sinistro. | corrigido — fotos com link assinado e bloco "Seguro e pagamento" editável no app; teste do app OK |
| 3 | Dono | Admin (computador) | "Administrador" fica escrito em cima do botão. | Texto e botão sem se sobrepor. | corrigido — no menu do site, nome e papel numa linha cada; rótulo inteiro do idioma só em tela larga; espaço depois do selo |
| 4 | Dono | Oficina (Safari) → mensagens | O campo de escrever fica muito perto da barra de endereço do Safari. | Campo com espaço da borda e da área segura do iPhone. | corrigido — área segura do iPhone no campo de mensagem (oficina e cliente) |
| 5 | Dono | Cliente (app) → aba Mensagens | A bolinha vermelha de mensagem nova só apareceu depois de fechar e reabrir o app. | Aparecer na hora (tempo real). | corrigido — a bolinha ouve as mensagens em tempo real; ao voltar ao app, reconecta e recarrega |
| 6 | Dono | Cliente (app) → conversa → voltar | Ao voltar da conversa para a tela anterior aparece erro; acontece sempre. | Voltar sem erro. | corrigido — a limpeza da tela lia o gravador já liberado (erro introduzido por mim na rodada anterior) |
| 7 | Dono | Oficina (Safari) → enviar orçamento | Tirou foto de um PDF para a IA ler o orçamento e nada aconteceu. | A IA preenche os itens (ou mostra um erro claro). | corrigido em 2 rodadas — (1ª) botões "Tirar foto" / "Escolher arquivo ou PDF", foto reduzida, erro claro; (2ª, ponto 16) a IA demorava mais de 60 s e a tela ficava carregando |
| 8 | Dono | Oficina → orçamento → horas de trabalho | Não dá para apagar o "1" e digitar "8"; precisa selecionar tudo. | O campo aceita apagar e digitar normalmente. | corrigido — campo numérico novo (orçamento e check-in manual) |
| 9 | Dono | Oficina → Agenda → Quadro | A barra do carro parece ir além dos dias de reparo informados no orçamento. | A barra termina na entrega prevista (entrada + prazo do orçamento). | causa no ponto 8 — prazo gravado como 11 dias; o Quadro mostrou certo |
| 10 | Dono | Oficina → Agenda → botões de visão | O último botão ("Lista") fica fora do alinhamento. | Botões alinhados, também no celular. | corrigido — visões em grade de largura total no celular |
| 11 | Dono | Cliente (app) → avisos | Apareceu um aviso escuro quando o carro ficou pronto, mas não nas mudanças de etapa nem no orçamento novo. | Mesmo tipo de aviso para todas as notificações importantes. | corrigido junto com o 5 (aviso perdido aparece ao voltar ao app) |
| 12 | Dono | Cliente (app) → novo pedido | Ao tocar em "novo pedido", a tela fica carregando para sempre. | Abrir o formulário (ou o motivo do bloqueio, ex.: avaliação pendente). | corrigido — causa real: no iPhone a tela do modal era recriada sem parar (cabeçalho ligado de dentro da tela); cabeçalho agora fixo no layout (commit b6c1e9b) — confirmar no iPhone |
| 13 | Dono | Cliente → "Acabei de bater" | Sugestão: escolher o tipo de serviço, só os urgentes (funilaria, vidro, pane elétrica…). | O pedido chega só às oficinas habilitadas para aquele serviço. | dono desistiu: "acabei de bater" só carroceria; conferido que só oficinas de carroceria próximas recebem |
| 14 | Dono | App → entrar | Depois de entrar, o app foi direto para o estoniano. | Regra de hoje: idioma escolhido no app > idioma da conta > idioma do aparelho; país nunca vem do idioma. A conta de teste foi criada no site em estoniano (/ee/et), por isso "et". | conforme a regra — decisão do dono se prefere o idioma do aparelho |
| 15 | Claude | Admin → painel | Serviços entregues em € e comissão em R$ no mesmo painel. | Cada valor na moeda do país do serviço. | corrigido — sem valor mostra traço, cada moeda separada |
| 16 | Dono | Oficina (Safari) → orçamento por PDF (2ª vez) | Ficou carregando e não preencheu nada. Registro do servidor: 19:00 cancelado, 19:02 cortado em 60 s, 19:02:30 resposta chegou com a tela já fechada. | Ler em segundos ou mostrar erro. | corrigido — modelo de reserva da IA (3.5-flash) levava 82 s; agora modelos rápidos primeiro, prazo total de 50 s no servidor e 70 s na tela (`lib/gemini.ts`, vale também para análise de dano e transcrição). Orçamento real do dono em PDF de 2 páginas lido em 6,6 s, 18 itens, total €1797,01 igual ao documento |
| 17 | Claude | Oficina → orçamento lido pela IA | Quantidade fracionada (3,50 L de óleo) era arredondada para 4 e o total mudava. | Total igual ao documento. | corrigido — linha vira 1 × valor total da linha, com "(3.5×)" na descrição (a quantidade no banco é inteira) |
| 18 | Dono | Cliente (app) → contador da garantia | O cartão abria só a conversa. | Abrir o pedido da garantia com todo o histórico e poder mandar mensagem à oficina. | corrigido — cartão abre o pedido (orçamento, etapas, fotos); botão "Falar com a oficina" no cartão e no bloco da garantia do pedido; teste `app-garantia.mjs` 7/7 |
| 19 | Dono | Oficina (computador) → menu | "Workshop" escrito em cima do botão "Dashboard". | Nenhum texto sobre outro, em todos os tipos de conta. | corrigido — medido em oficina/cliente/loja × 6 idiomas × 360–1920 px: antes 56 combinações com sobreposição (papel sobre "Painel" em todas as larguras, nome sobre "Sair", menu do cliente saindo da tela); depois 0. Menu de links a partir de 1280 px (abaixo, ☰); idioma só com o código quando logado; "Perfil" pelo avatar; "Sair" dentro do ☰ no celular. Teste `site-menu-sobreposto.mjs` |
| 20 | Dono | Visitante (iPhone) → seletor de idioma | Lista de idiomas cortada à esquerda (imagem em `Issues/`). | Lista inteira na tela. | já corrigido antes — conferido em 390 px na produção |
| 21 | Dono | Oficina → perfil → capacidade por serviço | Só existe limite de carros por tipo de serviço. | Limite por serviço **ou** geral da oficina. | anotado — entra no projeto do Quadro (ponto 22); o campo vazio também virava "0" |
| 22 | Dono | Oficina → Agenda → Quadro | Carro já atendido pintado nos dias planejados; falta visão detalhada do dia; "Box" e "Lugar" não são claros. | Barra no tempo real (do check-in ao check-out); visão do dia hora a hora para reservar o elevador; modo de monitoramento opcional; nomes claros. | em projeto — pesquisa e proposta com o Fable (`docs/PROJETO_QUADRO_OFICINA_2026-10-09.md`), depois implementação e testes |
