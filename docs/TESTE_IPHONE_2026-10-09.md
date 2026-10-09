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
| 1 | Claude | Oficina → link direto do pedido | A Mootorikeskus (sem carroceria) não vê o pedido na lista, mas pelo link direto vê os dados (carro, descrição, fotos) e o botão "Saada hinnapakkumine". | A página do pedido deveria seguir a mesma regra da lista (especialidade e raio): sem acesso aos dados e sem poder orçar. | anotado |
| 2 | Dono | Cliente (app) → pedido enviado | Não vê a foto do pedido e não consegue editar para pôr o seguro e o número da apólice. | Ver as fotos enviadas e poder completar quem paga, a seguradora e o nº da apólice/sinistro. | anotado |
| 3 | Dono | Admin (computador) | "Administrador" fica escrito em cima do botão. | Texto e botão sem se sobrepor. | anotado |
| 4 | Dono | Oficina (Safari) → mensagens | O campo de escrever fica muito perto da barra de endereço do Safari. | Campo com espaço da borda e da área segura do iPhone. | anotado |
| 5 | Dono | Cliente (app) → aba Mensagens | A bolinha vermelha de mensagem nova só apareceu depois de fechar e reabrir o app. | Aparecer na hora (tempo real). | anotado |
| 6 | Dono | Cliente (app) → conversa → voltar | Ao voltar da conversa para a tela anterior aparece erro; acontece sempre. | Voltar sem erro. | anotado |
| 7 | Dono | Oficina (Safari) → enviar orçamento | Tirou foto de um PDF para a IA ler o orçamento e nada aconteceu. | A IA preenche os itens (ou mostra um erro claro). | anotado |
| 8 | Dono | Oficina → orçamento → horas de trabalho | Não dá para apagar o "1" e digitar "8"; precisa selecionar tudo. | O campo aceita apagar e digitar normalmente. | anotado |
| 9 | Dono | Oficina → Agenda → Quadro | A barra do carro parece ir além dos dias de reparo informados no orçamento. | A barra termina na entrega prevista (entrada + prazo do orçamento). | anotado |
| 10 | Dono | Oficina → Agenda → botões de visão | O último botão ("Lista") fica fora do alinhamento. | Botões alinhados, também no celular. | anotado |
| 11 | Dono | Cliente (app) → avisos | Apareceu um aviso escuro quando o carro ficou pronto, mas não nas mudanças de etapa nem no orçamento novo. | Mesmo tipo de aviso para todas as notificações importantes. | anotado |
| 12 | Dono | Cliente (app) → novo pedido | Ao tocar em "novo pedido", a tela fica carregando para sempre. | Abrir o formulário (ou o motivo do bloqueio, ex.: avaliação pendente). | anotado |
| 13 | Dono | Cliente → "Acabei de bater" | Sugestão: escolher o tipo de serviço, só os urgentes (funilaria, vidro, pane elétrica…). | O pedido chega só às oficinas habilitadas para aquele serviço. | anotado |
