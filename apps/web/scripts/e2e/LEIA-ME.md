# Testes de ponta a ponta (tela de celular, em producao)

Clicam nas telas como uma pessoa, em varios idiomas, e conferem o banco.
Criam contas de teste e **apagam tudo no fim**. Precisam do `.env.local` do site
(chave de servico) e do Chromium do Playwright (`npx playwright install chromium`,
`npm i -D playwright-core` na pasta onde rodar).

| Script | O que testa |
|---|---|
| `site-varredura.mjs` | Todas as paginas das areas logadas (cliente, oficina, loja, admin) nos 6 idiomas: texto sem traducao, codigo interno na tela, elemento saindo da tela, erro no console, 404/login, links |
| `site-fluxos.mjs` | Oficina se cadastra -> confirma -> admin ativa pela tela -> cliente se cadastra -> veiculo -> pedido -> oficina manda orcamento -> cliente aceita |
| `site-pecas.mjs` | Loja se cadastra -> admin ativa -> catalogo -> oficina pede peca -> loja responde -> oficina fecha pedido |
| `e2e-cadastro.mjs`, `e2e-acidente.mjs`, `e2e-seguro.mjs`, `teste-idioma-painel.mjs` | Cadastro com confirmacao, acidente, "quem paga o reparo", idioma dos paineis |
| `site-mensagens.mjs` | Conversa separada por oficina (duas oficinas, uma nao ve a outra), tempo real, login vencido |
| `site-pagador.mjs` | Acidente: o outro motorista que paga tem conversa particular com a oficina |
| `site-correcoes.mjs` | Troca de conta no mesmo navegador, sair em outro aparelho, sininho, lista/pedido no celular, horarios de hoje, dicas do acidente pelo pais, carro do acidente |
| `site-servico.mjs` | Check-in antecipado (aviso ao cliente), etapa em nome do mecanico, mecanico sem acesso, historico, foto do acidente antes do aceite, IA, endereco com numero, seguradoras, tempo das paginas |
| `nativo-correcoes.mjs` | APP no emulador Android (Expo Go): pedido sem "[TIPO", completar carro, audio (ouvir e gravar), horario vencido, localizacao com rua, dicas da Italia |
| `app-e2e.mjs` | O APP (mesmo codigo, versao web, tela de iPhone): telas de entrada nos 6 idiomas, acidente sem conta, cadastro/confirmacao/login, veiculo, pedido, orcamento com data, mensagem, idioma, sair |

App: `cd apps/mobile && EXPO_PUBLIC_API_BASE_URL=http://localhost:8090 npx expo export --platform web --clear --output-dir <pasta>`,
depois `APP_WEB=<pasta> node servir-app-web.mjs` e `node app-e2e.mjs <.env.local> it`.

Uso: `node site-fluxos.mjs apps/web/.env.local`
Traducoes (rapido, sem navegador): `node apps/web/scripts/checar-traducoes.mjs` e `node apps/mobile/scripts/checar-traducoes.mjs`.
