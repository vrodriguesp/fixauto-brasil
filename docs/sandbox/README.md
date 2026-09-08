# Sandbox de funcionalidades — material-base para o portal educativo

Documentação completa de todas as funcionalidades do BipFix, levantada em 08/09/2026 por 4 agentes trabalhando em paralelo (cada um lendo a fundo o código de uma área, sem tocar no navegador para não conflitar entre si). Serve como material-fonte para o futuro "portal educativo" que vai ensinar oficinas e lojas de peças a usarem o site — o próximo passo do projeto, ainda não construído.

## Documentos

- [`CLIENTE.md`](./CLIENTE.md) — motorista/dono do carro: cadastro, emergência, nova solicitação, orçamentos, mensagens, histórico, perfil, reagendamento, acompanhamento.
- [`OFICINA.md`](./OFICINA.md) — a mecânica/funilaria: dashboard, solicitações, orçamentos, veículos em serviço, agenda, check-in, capacidade (por tipo de serviço e por funcionário), peças (comprar e vender), equipe, comissão, avaliações, perfil, mensagens.
- [`LOJA_PECAS.md`](./LOJA_PECAS.md) — loja de peças: cadastro, catálogo, cotações, pedidos, comissão, perfil, chat.
- [`ADMIN.md`](./ADMIN.md) — painel administrativo: usuários, oficinas, performance ruim, comissões, monitoramento, peças.

Cada documento cobre, por tela: o que é e pra que serve (em português simples), passo a passo exato de uso, estados vazios, regras de negócio com a lógica/fórmula real do código, e uma seção final de bugs encontrados nessa área.

Ver também `docs/AUDITORIA_SEGURANCA_API_2026-09-08.md` — auditoria de segurança de toda a superfície de API feita na mesma rodada (a maioria dos problemas críticos já foi corrigida no mesmo dia, ver `docs/PROGRESSO_2026-09-08.md`).

## Backlog consolidado de bugs/inconsistências (não corrigidos ainda)

Os itens de segurança críticos/médios já foram corrigidos (ver `docs/PROGRESSO_2026-09-08.md` e o commit `f2729d2`). O que segue é o que restou, por área, para priorizar depois — nenhum é segurança, são bugs funcionais/UX ou dívida técnica:

### Cliente
- Nova Solicitação usa coordenadas fixas de São Paulo em vez do endereço real do cliente — quebra o matching por proximidade fora de SP.
- Link morto `/cliente/notificacoes` no dashboard (rota não existe).
- `/cliente/reagendar/[id]` é uma página órfã — funciona, mas nada no site linka pra ela.
- `/escolher-tipo` desatualizada: os dois cartões apontam pra `/login` em vez de `/cadastro?tipo=...`, e não tem opção de loja de peças.
- Dois fluxos de "esqueci senha" divergentes (um via API própria, outro via fluxo nativo do Supabase que parece não ser usado por nada).
- `primeiro_login` não é checado no login normal do cliente.
- `/docs/cliente` (Central de Ajuda) desatualizada em vários pontos (categoria inexistente, critérios de selo errados, etapas de manutenção que não batem com os status reais).
- Horário de funcionamento fixo (hardcoded) no perfil público de todas as oficinas.
- `STATUS_SOLICITACAO` nas constantes compartilhadas não inclui `no_show`.

### Oficina
- Restrição do cargo "mecânico" é só cosmética (esconde links, mas várias páginas não checam o cargo de fato).
- RLS de `oficinas` só permite update do dono — um funcionário que acesse `/oficina/perfil` direto provavelmente vê "salvo com sucesso" sem nada ser gravado de verdade.
- Pequenos erros de acentuação em `enviar-orcamento/[id]/page.tsx`.

### Loja de peças
- Cotação some da lista de todas as outras lojas assim que a primeira responde — mata a concorrência entre lojas (talvez intencional, mas vale confirmar).
- Texto da tela de comissão promete "até 1%" mas o desconto máximo real é 1,5% a mais que isso permite.
- Catálogo de peças cadastrado pela loja não é lido em nenhuma tela da oficina — a promessa de "navegar o catálogo" não existe ainda de fato.
- Ações de escrita da loja (responder cotação, CRUD do catálogo) não tratam erro do Supabase — falha pode ser silenciosa pro usuário.
- "Raio de atendimento" da loja é só cosmético — ela vê cotações do Brasil inteiro, sem filtro de fato (diferente da oficina-fornecedora, que agora filtra por raio de verdade).
- Campos numéricos (preço, prazo, estoque) sem `min="0"`, aceitam negativo.
- Loja que perde a cotação pra outro fornecedor nunca é avisada — só some da lista dela.

### Admin
- Ver `docs/sandbox/ADMIN.md` para detalhes das 7 telas — sem bugs de segurança pendentes (todas as 5 rotas corrigidas), itens levantados lá são majoritariamente de UX.

## Nota sobre o próximo passo (portal educativo)

Quando for construir o portal, os documentos acima já têm o passo a passo pronto pra virar tutorial — cada seção pode virar uma "lição" com prints/gifs da tela real. Sugestão de ordem lógica pra uma oficina nova: Cadastro → Perfil (especialidades, capacidade, horário, fotos) → Solicitações → Orçamento → Agenda/Check-in → Veículos em Serviço → Comissão → (opcional) Equipe → (opcional) Peças. Pra loja de peças: Cadastro → Catálogo → Cotações → Pedidos → Comissão.
