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
