# Auditoria de traduções — pt, pt-PT, en, it (2026-10-09)

Escopo: `apps/web/messages/{pt,pt-PT,en,it}{,.cliente,.oficina,.misc,.auth,.loja}.json`, `apps/mobile/i18n/locales/*.json`, `apps/mobile/i18n/permissoes/*.json`, `apps/web/src/lib/{notif-i18n,notif-servico,erro-pagina}.ts`, `apps/mobile/lib/notif-i18n.ts`, e strings fixas em JSX (`apps/web/src` fora de `/admin`, `apps/mobile/app` + `components`).
Somente leitura: nenhum arquivo além deste relatório foi alterado.

Verificação estrutural (scripts, 100 % das chaves): chaves faltantes, placeholders renomeados/ausentes, chaves ICU sem `other`, chaves desbalanceadas e chaves duplas `{{x}}` no app. Resultado: nenhum erro estrutural nas quatro línguas. A única diferença de estrutura é `termos`/`privacidade` em `*.misc.json` (pt usa chaves planas `title1…`; pt-PT/en/it usam `secoes[]`) — intencional, as páginas `termos/page.tsx` e `privacidade/page.tsx` escolhem o componente por `locale === 'pt'`.

(Resumos por língua ao final do arquivo — seção "Resumo".)

## Achados — site (`apps/web/messages`)

Formato: **ID · Severidade · arquivo + chave** — texto atual → texto proposto.

### pt (Brasil) — site

- **PT-01 · Baixo · pt.json / pt.loja.json / pt.misc.json / pt.oficina.json (13 ocorrências)** — artigo da marca oscila: "o BipFix" (maioria) vs. "a BipFix" (ex.: `lojaAprender.modulos.comissao.resumo`: "Hoje o uso da BipFix é gratuito"). → Padronizar em "o BipFix" no pt-BR (grep `a BipFix|da BipFix|à BipFix|na BipFix` nos arquivos pt.*).
- **PT-02 · Baixo · pt.json `home.heroTitulo`** — "Reparo do carro" (sem a vírgula que pt-PT/en/it têm antes de "sem surpresas."). Se o H1 concatena os dois trechos fica "Reparo do carro sem surpresas." — aceitável. Nenhuma ação obrigatória.
- **PT-03 · Baixo · pt.cliente.json `clienteOrcamentoDetalhe.backToDashboard` / `clienteAcompanhamento.backToDashboard`** — "Voltar ao Dashboard" (anglicismo; pt-PT usa "Painel"). → "Voltar ao painel". Opcional, pois `nav.dashboard` também é "Dashboard".

### pt-PT (Portugal) — site

- **PTPT-01 · Médio · pt-PT.json `constants.servicosPneu.balanceamento`, `constants.servicosRevisao.alinhamento_balanceamento`, `home.faqItems.5.resposta`** — "Calibragem de rodas" / "calibragem de rodas". Em Portugal "calibragem" é a pressão dos pneus (que já existe como `servicosPneu.calibragem` = "Verificação da pressão dos pneus"); o balanceamento chama-se **equilibragem**. → "Equilibragem de rodas" / "Alinhamento de direção e equilibragem de rodas" / "...alinhamento de direção, equilibragem...".
- **PTPT-02 · Baixo · pt-PT.json `constants.servicosMecanica.cambio_barulho_troca_marcha`** — "Caixa de velocidades - ruído ao mudar de mudança" (repetição estranha). → "Caixa de velocidades - ruído ao mudar de velocidade".
- **PTPT-03 · Baixo · pt-PT.json `login.erroNaoConfirmado`, `login.reenviarConfirmacao`, `login.confirmacaoReenviada`; pt-PT.auth.json `cadastro.verifiqueTexto1/2`, `cadastro.linkReenviado`, `confirmarEmail.*`** — usa "ligação" para *link*, enquanto `login.senhaEnviadaTitulo` ("Link enviado!"), `login.senhaEnviadaTexto2`, `resetPassword.verificandoLink` usam "link". → Escolher um termo; "link" é corrente em pt-PT e evita confusão com "ligação" (chamada telefónica).
- **PTPT-04 · Médio · pt-PT.auth.json `cadastro.placeholderCidade`** — "Lisboa", mas `cadastro.placeholderEstado` é "ex.: Condado de Harju" (Estónia). Exemplos incoerentes entre si. → "Tallinn" (o público pt-PT é quem vive na Estónia, como em `sejaParceiro.placeholderCidade`).
- **PTPT-05 · Baixo · pt-PT.cliente.json `clienteReagendar.pageTitle`** — "Remarcar marcação" (redundante). → "Remarcar" ou "Alterar a marcação".
- **PTPT-06 · Baixo · pt-PT.cliente.json `clienteVeiculos.placeholderColor`, `clienteNovaSolicitacao.placeholderColor`** — "Cinzento" para pt "Prata"/en "Silver". → "Prateado".
- **PTPT-07 · Baixo · pt-PT.loja.json `lojaPerfil.cepPlaceholder`** — "0000-000" (formato português). Público na Estónia usa 5 dígitos (ex.: 10111). → "10111" ou vazio. (ver também EN-02/IT-07.)

### en — site

- **EN-01 · Médio · en.auth.json `cadastro.placeholderCidade`** — "New York" num produto que opera em Tallinn (e `cadastro.placeholderEstado` = "e.g. Harju County"). → "Tallinn".
- **EN-02 · Médio · en.loja.json `lojaPerfil.labelCep`** — "Postal code (CEP)" — "CEP" é sigla brasileira, sem sentido para o leitor en. → "Postal code". Idem `lojaPerfil.cepPlaceholder` "00000-000" (formato BR) → "10111".
- **EN-03 · Baixo · en.auth.json `cadastro.labelCep` ("Zip code"), `cadastro.cepNaoEncontrado` ("Zip code not found…"), `cadastro.enderecoAjuda` ("Filled in from the zip code") vs. `cadastro.placeholderCep` ("Postal code"), en.loja.json ("Postal code")** — mistura "zip code"/"postal code". Na Europa, "postcode"/"postal code". → Padronizar "Postal code".
- **EN-04 · Baixo · en.json `damageAnalysis.erroSemFotos`, `erroGenerico` ("analyse"); en.cliente.json `clienteVeiculos.nicknameLabel`, `clienteNovaSolicitacao.nicknameLabel` ("recognise"); en.auth.json `cadastro.declaracaoResponsavel` ("authorised")** — grafia britânica em arquivo que usa grafia americana no resto ("analyze", "organize", "color", "neighborhood"). → "analyze", "recognize", "authorized" (ou decidir por UK em todo o site).
- **EN-05 · Baixo · en.cliente.json (várias) — terminologia "repair shop" / "workshop" / "garage" / "shop" misturada** (ex.: `clienteOrcamentoDetalhe.verOficina` "See the garage", `clienteMensagemDetalhe.escolherOficinaTitulo` "Which workshop?", en.json `garantia.falarComOficina` "Message the workshop", maioria "repair shop"). → Fixar "repair shop" (ou "garage") em todo o site e app; "shop" apenas como forma curta quando o contexto já é claro.
- **EN-06 · Baixo · en.json `home.mock1Texto`** — "3km from you" → "3 km from you".

### it — site

- **IT-01 · Médio · it.json `sejaParceiro.metaTitle/ogTitle/heroTag/beneficiosTitulo/enviar`, `paraOficinas.ctaFundador/heroFootnote/transparenciaTexto/faq.0.resposta`, `home.oficinasBadge/ctaFundador/parceiroTitulo/footerSejaParceiro/faqItems.2.resposta`** — "socio fondatore / soci fondatori". Em italiano "socio" sugere sócio de capital (quota societária); o próprio arquivo usa "partner fondatori" em `home.parceiroTexto` e `sobre.estagioTexto`. → "partner fondatore / partner fondatori" em todas as ocorrências.
- **IT-02 · Médio · it.cliente.json `clienteDashboard.deadline` ("Scadenza:"), `clienteHistorico.deadlineDays`, `clienteOrcamentos.deadlineDays`, `clienteOrcamentoDetalhe.deadlineDays` ("Scadenza: {days} giorni")** — "Prazo" aqui é o tempo de execução do serviço (en "Timeline"), não data de vencimento; "Scadenza" induz o cliente a pensar na validade do preventivo (que já tem `validUntil` = "Valido fino al"). → "Tempi: {days, plural, one {# giorno} other {# giorni}}" / "Durata: …".
- **IT-03 · Baixo · it.auth.json `cadastro.selecioneUf` ("Stato"), it.loja.json `lojaPerfil.labelEstado` ("Stato"), `lojaAprender.modulos.perfil.resumo` ("città, stato e CAP"), `…passosGuiados.1`** — "Stato" = país. Em `cadastro.labelEstado` já está "Provincia". → "Provincia / regione" (ou, para a Estónia, "Contea").
- **IT-04 · Baixo · it.auth.json `cadastro.politicaDePrivacidade`, `cadastro.errorTermos` ("Normativa sulla Privacy") vs. it.json `cookieBanner.linkPrivacidade`, `erros.TERMOS_OBRIGATORIOS` ("Informativa sulla privacy")** — → "Informativa sulla privacy" (termo padrão GDPR em Itália) em todos.
- **IT-05 · Baixo · it.loja.json `lojaPerfil.labelNomeFantasia` ("Ragione sociale"), `lojaAprender.modulos.perfil.passosGuiados.1`** vs. it.auth.json `cadastro.labelNomeFantasia` ("Nome commerciale") — "ragione sociale" é a denominação legal; "nome fantasia" = nome comercial/insegna. → "Nome commerciale".
- **IT-06 · Baixo · it.json `paraOficinas.funcCategorias.4.titulo`** — "Finanza" → "Finanze" (ou "Amministrazione").
- **IT-07 · Baixo · it.loja.json `lojaPerfil.labelCep` ("CAP (CEP)"), `lojaPerfil.cepPlaceholder` ("00000-000")** — sigla brasileira e formato BR. → "CAP" / "10111" (Estónia) ou "20100".
- **IT-08 · Baixo · it.json `home.mock1Texto`** — "a 3km da te" → "a 3 km da te".
- **IT-09 · Baixo · it.cliente.json `clienteOrcamentoDetalhe.backToDashboard`, `clienteAcompanhamento.backToDashboard`, `clienteReagendar.backToPanel` ("Torna alla tua area")** vs. `nav.dashboard` = "Dashboard" e it.loja.json "Vai alla mia dashboard". → "Torna alla dashboard" (coerência).
- **IT-10 · Baixo · it.auth.json `cadastro.placeholderCidade` ("Milano"), `cadastro.placeholderEstado` ("Es: Lombardia"), it.json `sejaParceiro.placeholderCidade/Regiao/Whatsapp` ("Milano", "Lombardia", "+39 333…")** — exemplos italianos para um público que vive na Estónia (en/pt-PT já usam Tallinn / Harju / +372). → "Tallinn", "Contea di Harju", "+372 5555 5555". Decisão de produto; registrado como Baixo.

### pt (Brasil) — site, continuação (oficina / misc)

- **PT-04 · Baixo · pt.oficina.json `oficinaMensagemDetalhe.notifNovaMensagemAudioTitulo` ("Nova mensagem de audio da oficina"), `notifMensagemAudioRecebida` ("Mensagem de audio recebida"), `enviandoAudio` ("Enviando audio..."), `gravarAudio` ("Gravar audio")** — "audio" sem acento (pt-PT já tem "áudio"). → "áudio" nas quatro chaves.
- **PT-05 · Baixo · pt.oficina.json `oficinaDistribuicao.subtitulo`** — "…Arraste mentalmente: escolha o responsável no seletor de cada card." — "Arraste mentalmente" não faz sentido para o usuário (as outras línguas já omitiram). → "Organize quem vai cuidar de cada veículo antes mesmo de ele chegar. Escolha o responsável no seletor de cada card."

### pt-PT — site, continuação (oficina / misc) e app

- **PTPT-08 · Baixo · pt-PT.oficina.json `oficinaAgenda.dataDia`** — "{dia} {mes} {ano}" (pt tem "{dia} de {mes} {ano}"). Em pt-PT escreve-se "5 de março de 2026". → "{dia} de {mes} de {ano}".
- **PTPT-09 · Baixo · pt-PT (site + app) — artigo da marca** — o site pt-PT trata a marca no feminino ("a BipFix", 72 ocorrências) mas tem 8 masculinas (`pt-PT.json` 2, `pt-PT.oficina.json` 2, `pt-PT.auth.json` 2, `pt-PT.loja.json` 1, `pt-PT.misc.json` 1), e o app pt-PT usa só o masculino (`orcamentos.semAvaliacoes` "Nova no BipFix", `perfil.excluirContaFeita` "Obrigado por ter usado o BipFix"). → Padronizar "a BipFix" em pt-PT (site e app). Grep: `\b(o|do|ao|no) BipFix` nos arquivos pt-PT.
- **PTPT-10 · Baixo · pt-PT.misc.json `emergencia.emailPlaceholder` ("voce@email.com"), `emergenciaAcidenteDetalhe.youFallback` ("Você")** — "você" é evitado em todo o resto do pt-PT. → "nome@email.com" e "Eu" (rótulo do próprio utilizador na lista de envolvidos).
- **PTPT-06 (complemento) · pt-PT.oficina.json `oficinaCheckin.placeholderCor`** — "Cinzento" → "Prateado".
- **PTPT-03 (complemento, app) · apps/mobile/i18n/locales/pt-PT.json `auth.verifiqueTexto`, `auth.naoConfirmado`, `auth.reenviarLink`, `auth.linkReenviado`, `auth.linkInvalidoTitulo`, `auth.linkInvalidoTexto`, `emergencia.contatoTexto`, `emergencia.sucessoSemConta`** — "ligação" vs. "link" em `auth.recuperarTexto`/`auth.linkEnviado`. → mesmo termo no app e no site ("link").
- **PTPT-11 · Alto · `apps/web/src/lib/email-i18n.ts:6-14` (`EmailLocale = 'pt'|'en'|'et'|'it'`, `resolveEmailLocale`: `locale.startsWith('pt') → 'pt'`), `apps/web/src/lib/notif-i18n.ts` (usa `resolveEmailLocale`, 27 dicionários sem `pt-PT`), `apps/mobile/lib/notif-i18n.ts:5-9` (`NotifLocale` sem `pt-PT`), `apps/web/src/app/api/registrar-no-show/route.ts:87` (`veiculoFallback` sem `pt-PT`)** — todo utilizador com `profiles.idioma = 'pt-PT'` recebe **e-mails, notificações in-app, push e mensagens automáticas de chat em português do Brasil**: "Seu veículo está pronto!", "placa", "você", "Orçamento aceito", "registrou", "Reparo agendado", "Falta registrada", "pedido de reparo"… O resto da camada servidor já tem pt-PT (`email-cadastro.ts`, `notif-servico.ts`, `erro-pagina.ts`), por isso a experiência fica mista. → Acrescentar `'pt-PT'` a `EmailLocale`/`NotifLocale` e um bloco pt-PT em cada dicionário (ex.: "O seu veículo está pronto!", "matrícula", "Orçamento aceite", "registou", "Reparação marcada", "Falta registada", "pedido de reparação"), e em `registrar-no-show` `'pt-PT': 'o seu veículo'`.

### en — site, continuação (oficina / misc) e app

- **EN-07 · Médio · en.oficina.json `oficinaDashboard.statNaAgenda`** — "On schedule" (= "dentro do prazo") para pt "Na agenda" (contador de serviços agendados). → "Scheduled".
- **EN-08 · Baixo · en.oficina.json `oficinaAprender.geral.perfil.passosGuiados.1` ("Body work"), `oficinaEquipe.placeholderEspecialidade` ("Body work")** — a categoria chama-se "Bodywork" (`constants.tiposServico.funilaria` = "Bodywork & Paint"). → "Bodywork".
- **EN-09 · Baixo · en.oficina.json `oficinaVeiculosEmServico.hist_etapa` ("Step recorded"), `oficinaEquipe.darAcessoPortalDica` ("records the steps"); en.misc.json `docsOficina.s5Steps.0.desc`, `s5Steps.2.desc` ("record steps")** — a UI usa "stage" ("+ Stage", "Log Stage", "No stages logged"). → "Stage logged" / "logs the stages" / "log stages".
- **EN-10 · Baixo · en.oficina.json `oficinaSolicitacoes.subtitulo` ("within {raio}km"), `oficinaPecas.ativeParaReceberAvisos` ("within {raio}km")** — → "{raio} km" (pt-PT já tem o espaço).
- **EN-11 · Baixo · en.misc.json `oficinaPerfilPublico.hoursWeekdays` ("Mon to Fri: 8:00 AM - 6:00 PM"), `hoursSaturday` ("8:00 AM - 12:00 PM")** — único lugar em formato 12 h; o resto do en usa 24 h ("08:00 - 12:00" em `oficinaCheckin.manha`, "Morning (8-12)"), e a Estónia usa 24 h. → "Mon–Fri: 08:00–18:00", "Sat: 08:00–12:00".
- **EN-04 (complemento)** — en.oficina.json `oficinaPerfil.descricaoPlaceholder` ("specialising"), en.misc.json `seguroReparo.oficinaDica_nao_sei` ("finalising"), app `veiculos.apelido` ("recognise"). → grafia americana ("specializing", "finalizing", "recognize").
- **EN-05 (complemento, app) · apps/mobile/i18n/locales/en.json `orcamentos.verOficina` ("See the garage"), `mensagens.escolherOficina` ("Which workshop?"), `mensagens.semConversaAinda`, `garantia.falarComOficina` ("workshop")** — o app usa "repair shop" em todo o resto. → "See the repair shop", "Which repair shop?".

### it — site, continuação (oficina / misc), app e servidor

- **IT-11 · Médio · it.oficina.json `oficinaCapacidade.statusEmExecucao` ("In esecuzione"), `oficinaAprender.mecanico.meusVeiculos.passosGuiados.2`, `oficinaAprender.geral.checkin.passosGuiados.2` ("es: In diagnosi, In esecuzione…")** vs. it.json `constants.statusManutencao.em_execucao` = "In lavorazione" (rótulo real da etapa, também usado nas notificações por `notif-servico.ts` e no app `constants.statusManutencao.em_execucao`) — o tutorial manda clicar numa etapa que não existe com esse nome. → "In lavorazione" nas três chaves (ou mudar tudo para "In esecuzione").
- **IT-12 · Baixo · "taxa de comissão" com três termos**: it.json `comissaoPecasCard.suaTaxaAtual/colTaxa` ("aliquota"), it.oficina.json `oficinaComissao.subtitulo/suaTaxaAtual/taxaBase/suaTaxaFinal/colTaxa/taxaVaria/condicaoEspecialTexto` ("tariffa"), it.loja.json `lojaAprender.modulos.comissao.passosGuiados.1` ("percentuale"), it.oficina.json `oficinaAprender.geral.comissao.passosGuiados.1/2` ("tariffa"). → um só termo; sugestão "aliquota" (percentual) e "commissione" (valor).
- **IT-13 · Baixo · it.oficina.json `oficinaEquipe.placeholderEspecialidade`** — "Es: Motore, Carrozzeria, Elettronica..." — "Elétrica" é a especialidade de elettrauto, não "Elettronica". → "Es: Motore, Carrozzeria, Impianto elettrico...".
- **IT-14 · Baixo · it.oficina.json `oficinaVeiculosEmServico.respLabel` ("Resp") → "Resp."; `oficinaPecas.conversar` ("Chatta") → "Chat"** (todas as outras chaves de chat usam "Chat").
- **IT-15 · Baixo · it.misc.json `emergenciaAcidenteDetalhe.observationsLabel`** — "Osservazioni"; todas as outras chaves de observações usam "Note". → "Note".
- **IT-16 · Baixo · "avaliação" = "recensione" vs. "valutazione"** — site: `clienteHistorico.*`, `oficinaAvaliacoes.*`, `notificationBell`, notificações ("recensione"); mas `avaliacaoPendente.texto/bloqueioTitulo` ("valutazione"), `docsCliente.s3Intro` ("valutazione dell'officina"); app: `avaliacao.enviar` ("Invia valutazione"), `avaliacao.pendenteTexto`, `avaliacao.jaAvaliado` ("valutato"), `perfil.avaliacoes` ("Le mie recensioni"). → "recensione" para a avaliação publicada (estrelas + comentário); "valutazione"/"voto" só para a nota. Ex.: app `avaliacao.enviar` → "Invia recensione".
- **IT-17 · Baixo · `apps/web/src/lib/notif-i18n.ts:60`** — "Una officina vicino a te ha aperto…" → "Un'officina vicino a te ha aperto…" (elisão obrigatória).
- **IT-18 · Baixo · apps/mobile/i18n/locales/it.json `dashboard.emergenciaBotao` ("Ho appena avuto un incidente", 28 caracteres) e site it.json `naoEncontrado.emergencia`, it.cliente.json `avaliacaoPendente.acidente`** — rótulo de botão vermelho de emergência longo demais para 390 px (pt tem 15 caracteres, en 17). → "Ho avuto un incidente" (21) ou "Incidente adesso". Também `auth.reenviarLink` it (34) / pt-PT (41) / en (32): aceitável se o botão quebrar linha; se for `numberOfLines={1}`, encurtar ("Reinvia il link", "Reenviar o link", "Resend link").

### Todas as línguas (conteúdo / consistência)

- **ALL-01 · Baixo · *.misc.json `docsOficina.s8Intro`, `s8Items.0-2`, `s8Note`** — o Guia da Oficina afirma, nas 4 línguas, que "o BipFix cobra uma comissão… cobrança mensal com relatório", contradizendo `oficinaComissao.faseFundadorTexto`, `paraOficinas.transparenciaTexto` e os Termos (cl. 4: hoje gratuito, aviso de 30 dias). Não é erro de tradução, mas o leitor en/it/pt-PT recebe informação conflitante. → Alinhar o guia ao texto da fase fundadora.
- **ALL-02 · Baixo · *.misc.json `docsCliente.s3Outro`** — cita o botão "Mensagem para oficina"; o rótulo real (`clienteOrcamentoDetalhe.messageToWorkshop`) é "Mensagem para oficina" (pt ✓), mas "Enviar mensagem à oficina" (pt-PT), "Message the repair shop" (en) e "Scrivi all'officina" (it). → Citar o rótulo exato em cada língua.
- **ALL-03 · Baixo · `apps/web/src/lib/notif-i18n.ts:53`** — `fornecedorNome || 'O fornecedor'`: fallback em português injetado na notificação de qualquer idioma. → fallback por idioma ("The supplier", "Il fornitore", "Tarnija", "O fornecedor").

### Strings fixas no código (fora do admin)

- **HC-01 · Médio · `apps/mobile/lib/auth-context.tsx:35`** — `'Este app é exclusivo para clientes. Acesse sua conta de oficina ou loja pelo site.'` e **`:66`** — `'Esta conta foi desativada. Entre em contato com o suporte.'` — devolvidos como `error` e mostrados no login do app em qualquer idioma. → chaves `auth.tipoNaoSuportado` / `auth.contaDesativada` nos 6 locales (site já tem `login.erroDesativado`).
- **HC-02 · Baixo · `apps/web/src/components/pecas/ChatCotacaoPeca.tsx:153`** — `alt="Foto enviada"`; **`:183`** — `title="Enviar foto"` (tooltip visível). → `t('chatCotacaoPeca.fotoEnviada')` / `t('chatCotacaoPeca.enviarFoto')`.
- **HC-03 · Baixo · `apps/web/src/components/layout/Navbar.tsx:66-69` e `:191-194`** — links "Usuários", "Oficinas", "Comissões", "Interessados" fixos em pt na Navbar partilhada (só o admin os vê; `t('dashboard')` ao lado já é traduzido). Aceitável por design (admin pt-only); registrado para decisão.
- **HC-04 · Baixo · `apps/web/src/hooks/use-orcamentos.ts:112`** — exibe `data.error` cru da API (`api/aceitar-orcamento/route.ts:56` devolve `'Orçamento não encontrado'`). As demais rotas também devolvem `error` em pt (`api/emergencia/route.ts:33,194`, `api/funcionarios/route.ts:110,158`, `api/consultar-placa/route.ts:79`…), mas a UI usa `codigo` via `lib/erro-api.ts` — padrão correto. → devolver `codigo` em `aceitar-orcamento` e mapear por `erros.<codigo>`.

Verificados e OK: `apps/web/src/app/layout.tsx:29` (título pt é sobrescrito por `[locale]/layout.tsx` `generateMetadata`); `SugestaoIdioma.tsx` (6 idiomas); `notif-servico.ts`, `erro-pagina.ts`, `email-cadastro.ts` (têm pt-PT); `apps/mobile/i18n/permissoes/*.json` (corretos nas 4 línguas; "câmara" em pt-PT ✓); o comentário em `notif-i18n.ts:4-7` sobre "~27 pontos com texto fixo em português" está desatualizado — o grep não encontrou mais inserts de `notificacoes` com título literal fora de `mock-data.ts`.

## Resumo

| Língua | Alto | Médio | Baixo | Total |
|---|---|---|---|---|
| pt (Brasil) | 0 | 0 | 5 | 5 |
| pt-PT | 1 | 2 | 8 | 11 |
| en | 0 | 3 | 8 | 11 |
| it | 0 | 3 | 15 | 18 |
| Todas / código | 0 | 1 (HC-01) | 6 (ALL-01..03, HC-02..04) | 7 |
| **Total** | **1** | **9** | **42** | **52** |

**pt (Brasil)** — Referência sólida. Só detalhes: artigo "o/a BipFix" oscila (13×), "audio" sem acento em 4 chaves, uma frase estranha ("Arraste mentalmente"). Nenhum vazamento de conteúdo EU indevido: as menções a Tallinn/OÜ são factuais (empresa), e os blocos de seguro `_ee/_it/_pt` são por país do acidente, por design.

**pt-PT** — Tradução de alta qualidade (terminologia de Portugal consistente: matrícula, viatura, bate-chapa, palavra-passe, registo, equipa, telemóvel, ecrã; registo formal sem "você"). Problemas: (1) **Alto**: e-mails, notificações in-app e mensagens automáticas de chat chegam em pt-BR porque `email-i18n.ts`/`notif-i18n.ts` (web e app) não têm `pt-PT`; (2) "calibragem de rodas" por "equilibragem"; (3) exemplos incoerentes (Lisboa + Condado de Harju); (4) "link/ligação", artigo da marca e "Cinzento" por "Prateado".

**en** — Natural e idiomático, sem texto não traduzido. Problemas: "On schedule" (sentido errado), placeholder "New York", "CEP"/formato BR no perfil da loja, mistura UK/US ("analyse/recognise/authorised/specialising" vs. "organize/color"), mistura "repair shop / workshop / garage / shop", "step/stage", horário 12 h num único lugar, "{raio}km" sem espaço.

**it** — Fluente, registo "tu" consistente, sem inglês residual. Problemas: "socio fondatore" (implica sócio de capital; o próprio arquivo usa "partner fondatori"), "Scadenza" para prazo de execução (confunde com validade do preventivo), etapa "In esecuzione" no tutorial vs. "In lavorazione" na UI, três termos para "taxa", "Stato" por "Provincia", "Normativa/Informativa sulla privacy", "ragione sociale/nome commerciale", "recensione/valutazione", exemplos de Milão/Lombardia/+39 para um público na Estónia, botão de emergência longo demais.

**Estrutura / placeholders / ICU** — 100 % OK nas 4 línguas (site e app): nenhuma chave faltante, nenhum placeholder renomeado, nenhum plural sem `other`, nenhuma chave dupla `{{ }}` no app. As únicas "diferenças" vs. pt são melhorias (pt usa "(s)"; as outras usam `{count, plural, …}`).

## Nota sobre edições concorrentes

Durante a auditoria, outro processo acrescentou chaves aos arquivos de idioma (`constants.statusSolicitacao.no_show`, `erros.CONTA_EXISTENTE`, site e app) e alterou `lib/entrega.ts` e rotas de API. Não há conflito com os achados acima (todas as strings apontadas continuam presentes). Uma observação sobre o texto novo: **en `constants.statusSolicitacao.no_show` = "Did not show up"** enquanto `constants.noShow.no_show` / `oficinaAgenda.naoCompareceu` já usam "No-show" — padronizar em "No-show" (Baixo). As demais línguas novas estão coerentes ("Não compareceu", "Non si è presentato").
