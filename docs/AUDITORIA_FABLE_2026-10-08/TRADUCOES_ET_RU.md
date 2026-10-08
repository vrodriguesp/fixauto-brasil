# Auditoria de tradução — Estoniano (et) e Russo (ru)

Data: 2026-10-09 · Escopo: site (`apps/web/messages/{et,ru}*.json`), app (`apps/mobile/i18n/locales/{et,ru}.json`, `apps/mobile/i18n/permissoes/{et,ru}.json`) e textos de servidor (`apps/web/src/lib/notif-i18n.ts`, `notif-servico.ts`, `erro-pagina.ts`, `apps/mobile/lib/notif-i18n.ts`). Referência de sentido: arquivos `pt`. Leitura completa chave a chave (≈2.600 chaves por idioma) + verificação automática de placeholders/ICU/chaves faltantes/vazamento Brasil-Rússia. Nenhum arquivo além deste relatório foi alterado.

Método: cada namespace foi extraído em blocos (pt / et / ru lado a lado) com um script Node e lido na íntegra; um segundo script comparou placeholders, sintaxe ICU, chaves ausentes/extras, chaves vazias, chaves iguais ao pt e termos brasileiros/russos.

Severidade: **Alto** = errado/enganoso ou quebra a tela · **Médio** = estranho/inconsistente · **Baixo** = estilo.

---

## Resumo

### Estoniano (et)
Qualidade geral **boa**: tradução feita por quem conhece a língua (declinação de marca "BipFixi/BipFixis" correta, compostos bem formados, localização real — 112, liikluskindlustus, kasko, omavastutus, avarii.lkk.ee, Harjumaa, +372). Placeholders e ICU todos corretos (plurais `one/other` presentes; nenhuma chave vazia ou faltando; estrutura termos/privacidade diferente do pt é intencional — texto UE/GDPR). Nenhum vazamento Brasil fora das chaves `_br` (que são deliberadamente sobre o Brasil).

**Registro adotado: *sina* (tu)** em ~95 % das strings. Problema principal: o lote de strings mais recente (08/10 — importação de orçamento por foto/PDF, seguradoras, check-in antecipado, entrega/concluído, docs, dicas de seguro para IT/PT/geral) foi escrito em ***teie*** (você formal), gerando mistura visível na mesma tela (ex.: "Kontrollige…" ao lado de "Proovi uuesti"). Lista completa em ET-01.

Segundo problema: termos inconsistentes para o mesmo conceito — *entregue* ("Üle antud" no cliente/constantes vs "Väljastatud" em todo o painel da oficina), *placa* (três palavras), *cotação de peça* vs *orçamento* no menu. Alguns erros reais de sentido/palavra (ET-02 a ET-07).

### Russo (ru)
Qualidade geral **muito boa**: russo natural, público da Estónia bem considerado (Таллинн, Харьюмаа, 112, liikluskindlustus, каско, omavastutus, avarii.lkk.ee, €, GDPR, KMKR). Placeholders/ICU corretos, plurais com `few/many` em todas as chaves plurais. Nenhum conteúdo específico da Rússia (sem ОСАГО/ГИБДД/рубли); única nota é "КАСКО" em maiúsculas (acrônimo russo) numa string.

**Registro adotado: *вы* (minúsculo)** — 100 % consistente, nenhuma ocorrência de *ты*.

Problema principal **não é de tradução, é de cobertura**: `ru` não existe em `email-i18n.ts`/`notif-i18n.ts` do site (russo cai para **inglês**) nem em `apps/mobile/lib/notif-i18n.ts` (cai para **português**). Segundo problema: termo *oficina* oscila entre **автосервис** (padrão, ~90 %) e **мастерская** (~25 strings, concentradas no lote de 08/10 e no app); e *orçamento* oscila entre **смета** (padrão) e **предложение** em 2 chaves. Uma mistradução com risco real (RU-02: placeholder que diz "passei no vermelho").

---

## Achados — Estoniano

### Alto

**ET-01 · Alto · Mistura de registro sina/teie** — o arquivo todo é em *sina*, mas estas strings usam *teie/‑ge* (todas devem passar para *sina*):

| Arquivo | Chaves (texto atual → proposto) |
|---|---|
| `et.json` | `damageAnalysis.erroIaOcupada` "Proovige minuti pärast uuesti" → "Proovi minuti pärast uuesti" · `damageAnalysis.erroGenerico` "Proovige uuesti" → "Proovi uuesti" · `damageAnalysis.erroFotoInvalida` "Paluge kliendilt uus foto" → "Palu kliendilt uus foto" · `enderecoEstruturado.naoEncontrado` "Kontrollige tänavat…" → "Kontrolli tänavat, numbrit ja linna." |
| `et.cliente.json` | `clienteOrcamentoDetalhe.horariosVencidos` "Küsige töökojalt…" → "Küsi töökojalt sõnumiga uusi aegu." · `clienteMensagemDetalhe.escolherOficinaTexto` "…on teiega oma vestlus" → "…on sinuga oma vestlus" · `editarPedido.completarCarro` "Lisage auto andmed" → "Lisa auto andmed" · `editarPedido.completarCarroDica` "Puudutage lisamiseks" → "Puuduta lisamiseks" · `editarPedido.erro` "Proovige uuesti" → "Proovi uuesti" |
| `et.oficina.json` | `oficinaAgenda.checkinAntecipadoTexto` e `oficinaVeiculosEmServico.checkinAntecipadoTexto` "…ja saate jätkata" → "…ja saad jätkata" · `oficinaAgenda.confirmarEntregaTexto` e `oficinaVeiculosEmServico.confirmarEntregaTexto` "Kontrollige, et remont on lõpetatud" → "Kontrolli, et remont on lõpetatud" · `oficinaVeiculosEmServico.confirmarConcluidoTexto` "Kui te üleandmist ei märgi" → "Kui sa üleandmist ei märgi" · `oficinaVeiculosEmServico.erroAcao` "Proovige uuesti" → "Proovi uuesti" · `oficinaAprender.geral.solicitacoes.passosGuiados.4` "Vaadake … maksate selle" → "Vaata … maksad selle" · `oficinaEnviarOrcamento.horarioPassado` "Valige täna…" → "Vali täna veel lõppemata ajavahemik või hilisem päev." · `oficinaEnviarOrcamento.importarTexto` "Laadige üles… Kontrollige ja parandage" → "Laadi üles… Kontrolli ja paranda" · `oficinaEnviarOrcamento.importarConfira` "Kontrollige kogused" → "Kontrolli kogused" · `oficinaEnviarOrcamento.importarErro` / `importarOcupada` "Proovige" → "Proovi" · `oficinaEnviarOrcamento.garantiaAjuda` "saab klient teile sõnumeid saata" → "saab klient sulle sõnumeid saata" · `oficinaEnviarOrcamento.comissaoPagaNoFim` "maksate BipFixile" → "maksad BipFixile" · `oficinaEquipe.erroNomeObrigatorio` "Sisestage nimi." → "Sisesta nimi." · `oficinaPerfil.seguradorasTexto` "Märkige … teie pakkumisel" → "Märgi kindlustusseltsid, kellega töökojal on leping. Nende klient näeb sinu pakkumisel märki." · `oficinaPerfil.paginaPublicaAposAprovacao` "Teie avalik leht" → "Sinu avalik leht" · `oficinaSolicitacaoDetalhe.seuOrcamento` "Teie hinnapakkumine" → "Sinu hinnapakkumine" |
| `et.misc.json` | `docsCliente.s3Outro` "Kasutage… teiega… puudutage… teie kindlustusega" → "Kasuta filtreid… Igal töökojal on sinuga oma vestlus (puuduta…). Märk "Leping sinu kindlustusega"…" · `docsCliente.s5Items.0.desc` "te saate teate" → "sa saad teate" · `docsCliente.s5Outro` "teie avalehel" → "sinu avalehel" · `docsCliente.s7Steps.1.desc` "Pildistage… märkige" → "Pildista… märgi" · `docsCliente.s7Warning` "helistage… Teie ohutus" → "helista… Sinu ohutus" · `docsOficina.s1Steps.1.desc` "Sisestage… teid leiaksid" → "Sisesta… sind leiaksid" · `docsOficina.s1Steps.4.desc` "Lisage… teie pakkumisel" → "Lisa… sinu pakkumisel" · `docsOficina.s3Steps.0.desc` "Vaadake" → "Vaata" · `docsOficina.s3Steps.1.desc` "Lisage… laadige… teie kontrollite" → "Lisa… laadi… sina kontrollid" · `docsOficina.s3Steps.2.desc` "Märkige… teile" → "Märgi… sulle" · `docsOficina.s3Steps.3.desc` "Pakkuge" → "Paku" · `docsOficina.s4Items.0.desc` "Registreerige" → "Registreeri" · `docsOficina.s4Items.2.desc` "määrake" → "määra" · `docsOficina.s5Steps.0.desc` "Lisage… andke" → "Lisa… anna" · `docsOficina.s5Steps.2.desc` "Määrake" → "Määra" · `seguroReparo.passo_registro_ee` "Vormistage… märkige" → "Vormista koos teise juhiga… ja märgi" (texto da Estónia!) · `seguroReparo.passo_emergencia_it/_pt/_geral` "helistage… kutsuge" → "helista… kutsu" · `seguroReparo.passo_registro_it/_pt/_geral` "Täitke… allkirjastage… Saatke / Pange kirja… tehke… saate" → "Täida… allkirjastage mõlemad… Saada / Pane kirja… tee… saad" · `seguroReparo.dica_seguro_terceiro_it/_pt/_geral` "avate / teie enda / Teavitage" → "avad / sinu enda / Teavita" · `seguroReparo.dica_seguro_proprio_it/_pt/_geral` "teie auto… maksate / teie poliis" → "sinu auto… maksad / sinu poliis" |
| `apps/mobile/i18n/locales/et.json` | `emergencia.seuCarro` "Teie auto" → "Sinu auto" · `emergencia.seuCarroDica` "teie sõidukite hulka" → "sinu sõidukite hulka" · `emergencia.localEncontrada` "Kontrollige allolevat aadressi" → "Kontrolli allolevat aadressi" · `orcamentos.horariosVencidos` "Küsige" → "Küsi" · `mensagens.escolherOficinaTexto` "teiega" → "sinuga" · `mensagens.microfoneTexto` "lubage" → "luba" · `acompanhamento.completarCarro` "Lisage" → "Lisa" · `acompanhamento.completarCarroDica` "Puudutage" → "Puuduta" · `seguro.passo_registro_ee` e todos os `seguro.*_it/_pt/_geral` (mesmo texto do site) |
| `apps/web/src/lib/notif-servico.ts` | `TEXTOS.et.chegouTitulo` "Teie auto on töökojas" → "Sinu auto on töökojas" · `TEXTOS.et.chegou` "registreeris teie auto {carro} saabumise. Jälgige remonti siin." → "registreeris sinu auto {carro} saabumise. Jälgi remonti siin." · `PRONTO.et.titulo` "Teie auto on valmis" → "Sinu auto on valmis" · `PRONTO.et.mensagem` "saate selle kätte" → "saad selle kätte" |

**ET-02 · Alto · Sentido invertido** — `et.oficina.json` → `oficinaAprender.geral.solicitacoes.resumo`
Atual: "Klient näeb sinu nime ja fotot alles enne pakkumise tegemist — täielikud kontaktandmed ilmuvad alles siis, kui klient nõustub." ("alles enne" = "só então antes", não faz sentido; pt diz "só vê nome e foto até você orçar").
Proposto: "Enne pakkumise tegemist näeb klient ainult sinu nime ja fotot — täielikud kontaktandmed ilmuvad alles siis, kui klient nõustub."

**ET-03 · Alto · Verbo errado (trazido em vez de levado)** — `et.misc.json` → `docsOficina.s4Items.3.desc`
Atual: "Kui teenus on valmis ja sõiduk ära toodud, registreeri väljumine." ("ära toodud" = trazido para cá).
Proposto: "Kui teenus on valmis ja sõiduk ära viidud, registreeri check-out."

**ET-04 · Alto · Palavra inexistente "Vaheldel"** (4 ocorrências; o correto é "vahekaardil" = na aba) — `et.oficina.json` → `oficinaAprender.mecanico.meusVeiculos.passosGuiados.1`, `oficinaAprender.geral.checkin.passosGuiados.1`, `oficinaAprender.geral.pecas.passosGuiados.1`, `oficinaAprender.geral.pecas.passosGuiados.3`
Atual: "Vaheldel "Ootel" vajuta…" / "Vaheldel "Osta" vajuta…" / "Vaheldel "Müü ülejääki" lülita…"
Proposto: "Vahekaardil "Ootel" vajuta…" / "Vahekaardil "Osta" vajuta…" / "Vahekaardil "Müü ülejääki" lülita…"

**ET-05 · Alto · Palavra inexistente "kerekere"** — `et.misc.json` → `docsCliente.s2Steps.1.desc`, `docsOficina.s1Steps.2.desc`
Atual: "…teenuse kategooria: kerekere, värvimine, mehaanika, elektroonika, klaasid…"
Proposto: "…teenuse kategooria: keretööd, värvimine, mehaanika, elektritööd, klaasid…"

### Médio

**ET-06 · Médio · Etapa "concluído" = carro pronto para retirada** — `et.json` → `constants.statusManutencao.concluido` / `concluidoDesc`; `et.cliente.json` → `clienteAcompanhamento.progressConcluido`; `apps/mobile/i18n/locales/et.json` → `constants.statusManutencao.concluido`
Atual: "Lõpetatud" / "Teenus valmis" (lido como "serviço encerrado"; não comunica "venha buscar").
Proposto: "Valmis" / "Sõiduk on valmis kättesaamiseks" — alinhado ao que o painel da oficina já usa (`oficinaVeiculosEmServico.statusPronto` "Valmis", `prontosParaRetirada` "Valmis kättesaamiseks") e ao push `notif-servico.ts` ("Sinu auto on valmis"). Manter "Üle antud" para *entregue*.

**ET-07 · Médio · "Entregue" com dois termos** — `et.oficina.json` → `oficinaDashboard.statusEntregue`, `oficinaAgenda.statusEntregue`, `cardEntregue`, `entregueLabel`, `entregueCount`, `btnEntrega`, `oficinaVeiculosEmServico.entregaLabel`, `entregaBtn`, `entregueLabel`, `oficinaAprender.*` ("Väljastamine/Väljastatud"); vs `et.json` `constants.statusManutencao.entregue`, `et.cliente.json` `progressEntregue`, `oficinaVeiculosEmServico.hist_entregue`, `notaVeiculoEntregue` ("Üle antud").
Atual: "Väljastatud"/"Väljastamine" (oficina) × "Üle antud" (cliente, constantes, histórico).
Proposto: um só termo em todo lado — sugestão "Üle antud" (estado) / "Üleandmine" (botão/ação), já que é o que o cliente vê e o que a notificação usa.

**ET-08 · Médio · "Punktsiooni parandus"** (punktsioon = punção médica) — `et.json` → `constants.servicosPneu.conserto_furo`
Proposto: "Rehviaugu parandus"

**ET-09 · Médio · "Töötasu" = salário, não mão de obra** — `et.json` → `constants.tiposItem.mao_de_obra`; `et.oficina.json` → `oficinaEnviarOrcamento.maoDeObra`
Atual: "Töötasu". Proposto: "Töö" (ou "Tööjõukulu").

**ET-10 · Médio · "Teejuhtum" não existe** — `et.json` → `constants.tiposOcorrencia.sem_outro`
Atual: "🚨 Teejuhtum (teist sõidukit polnud)". Proposto: "🚨 Juhtum teel (teist sõidukit polnud)".

**ET-11 · Médio · Banner de cookies sem sentido** — `et.json` → `cookieBanner.texto` + `cookieBanner.linkPrivacidade`
Atual: "…Nõustudes lähtud meie" + "privaatsuspoliitikast" (= "ao aceitar, você parte da nossa política").
Proposto: "…Nõustudes kinnitad, et oled tutvunud meie" + "privaatsuspoliitikaga".

**ET-12 · Médio · Agramatical** — `et.json` → `constants.statusManutencao.pausa_cliente`
Atual: "Peatatud - klienti ootel". Proposto: "Peatatud – ootab klienti".

**ET-13 · Médio · Menu: dois itens com o mesmo rótulo** — `et.json` → `nav.cotacoes`
Atual: "Hinnapakkumised" (igual a `nav.orcamentos`; cotação de peças é outro conceito). Proposto: "Hinnapäringud" (termo já usado em `paraOficinas.funcCategorias.3` e em `oficinaPecas.*`).

**ET-14 · Médio · "Elektroonika" para "Elétrica"** — `et.json` → `constants.tiposServico.eletrica`; `home.faqItems.5.resposta` ("autoelektroonika"); `et.oficina.json` → `oficinaEquipe.placeholderEspecialidade`; `apps/mobile/i18n/locales/et.json` → `constants.tiposServico.eletrica`; `apps/mobile/lib/notif-i18n.ts` → `tiposServico.et.eletrica`
Atual: "Elektroonika" (eletrônica). Proposto: "Elektritööd" (e "autoelektrika" na FAQ) — ru já usa "Электрика".

**ET-15 · Médio · Placa: três termos** — `Registreerimisnumber` (cliente), `Registreerimismärk`/"Reg.märk" (oficina, misc, app), `Numbrimärk` (editarPedido, emergencia.fotoDica, seguro)
Proposto: padronizar "Numbrimärk" (mais curto, usual) em `clienteVeiculos.plateLabel`, `clienteNovaSolicitacao.plateLabel`, `oficinaAgenda.placa`, `oficinaCheckin.placa`, `oficinaCheckin.descricaoLabelPlaca`, `oficinaSolicitacaoDetalhe.placa`, `emergencia.plateLabel`, `emergenciaAcidenteDetalhe.plateLabel/plateFieldLabel/chatNoPlateFallback`, `veiculos.placa` (app). De quebra, `clienteVeiculos.plateLabel` "Registreerimisnumber (valikuline)" (33 caracteres) fica curto no celular.

**ET-16 · Médio · Partitivo após número** — `et.oficina.json` → `oficinaSolicitacoes.fotosCount`
Atual: "{count} foto" (3 foto ✗). Proposto: "{count, plural, one {# foto} other {# fotot}}".

**ET-17 · Médio · Plurais com "(t)"/"(a)" em vez de ICU** — `et.oficina.json` → `oficinaDashboard.fotosCount` "{count} foto(t)", `oficinaEnviarOrcamento.diasUteis` "~{count} tööpäev(a)", `oficinaDistribuicao.veiculosCount` "{count} sõiduk(it)", `oficinaPecas.prazoDias` / `oficinaSolicitacaoDetalhe.prazoDias` "{dias} päev(a)", `oficinaPecas.vocesRespondeu`, `oficinaDashboard.avaliacoesCount` / `oficinaAvaliacoes.avaliacoesCount` "{count} hinnangut" (1 hinnangut ✗); `et.misc.json` → `emergencia.summaryPhotos` "{count} foto(t) avariist"; `et.loja.json` → `lojaCotacoes.respostaEnviada` "{prazo} päev(a)"
Proposto: `{n, plural, one {# päev} other {# päeva}}` etc. (o cliente.json já faz isso certo).

**ET-18 · Médio · Check-in traduzido de forma diferente em cada lugar** — `et.json` → `nav.checkinManual` "Käsitsi registreerimine"; `et.oficina.json` → `oficinaAgenda.checkinAntecipadoTexto`/`checkinAntecipadoConfirmar` e `oficinaVeiculosEmServico.*` "Kas registreerida saabumine kohe?" / "Jah, registreeri kohe", `oficinaVeiculosEmServico.hist_checkin` "Saabumine", `oficinaCheckin.titulo` "Registreeri sõiduki saabumine"; `et.misc.json` → `docsOficina.s6Items.2.desc` "Saabumine ja iga etapp…"
Atual: mistura "check-in" (mantido em ~20 chaves) com "saabumise registreerimine". Proposto: manter "check-in" em todo lado: "Käsitsi check-in", "Kas teha check-in kohe?", "Jah, tee check-in kohe", "Check-in", "Check-in ja iga etapp…".

**ET-19 · Médio · Orçamento aceito: "kinnitatud" × "vastu võetud"** — `et.cliente.json` → `clienteOrcamentoDetalhe.quoteAccepted`, `clienteMensagens.statusAccepted`; `et.oficina.json` → `oficinaDashboard.statAceitas`, `orcamentoAceito`, `solicitacoesAceitasTitulo`, `oficinaSolicitacaoDetalhe.statusOrcamento.aceito`; `et.misc.json` → `emergenciaAcidenteDetalhe.quoteAcceptedBadge`; app `orcamentos.statusAceito`
Atual: "Vastu võetud" aqui, "Kinnitatud" em `constants.statusOrcamento.aceito`, `home.mock2Titulo`, notificações. Proposto: "Kinnitatud" em todo lado (ou "Vastu võetud" em todo lado — mas as notificações já dizem "kinnitatud").

**ET-20 · Médio · Dois termos para "avaliação" na lista pública** — `et.misc.json` → `oficinasLista.reviewsCount` "(# arvustus/arvustust)", `oficinasLista.heroText` "…arvustusi…"
Proposto: "hinnang/hinnangut", "hinnanguid" (termo usado em todo o resto).

### Baixo

**ET-21 · Baixo** — `et.json` → `home.metaKeywords.1` "auto remondi hinnapakkumine" → "autoremondi hinnapakkumine"; `home.metaKeywords.4` "auto remont Tallinn" → "autoremont Tallinn" (compostos).
**ET-22 · Baixo** — `et.json` → `paraOficinas.faq.4.resposta` "läbirääkida" → "läbi rääkida".
**ET-23 · Baixo** — `et.json` → `constants.servicosMecanica.direcao_dura_folga` "Roolimine - jäik või mängus" → "Rool - raske või lõtkuga".
**ET-24 · Baixo** — `et.json` → `constants.servicosMecanica.cambio_dificuldade_engatar` "Käigukast - raskustega käigu sisselülitamine" → "Käigukast - käik läheb raskelt sisse".
**ET-25 · Baixo** — `et.json` → `constants.servicosEletrica.alternador_luz_painel` "Generaator - armatuurlaua tuli" → "Generaator - hoiatustuli armatuurlaual"; `bateria_nao_liga` "Aku - ei käivitu" → "Aku - auto ei käivitu".
**ET-26 · Baixo** — `et.json` → `damageAnalysis.tituloInicial` "AI kahjustuse analüüs" → "Kahjustuse AI-analüüs".
**ET-27 · Baixo** — `et.json` → `home.oficinasTexto` "Korralda oma teenused ühele platvormile" → "Koonda oma teenused ühele platvormile".
**ET-28 · Baixo** — `et.json` → `garantia.documento` "Ava pakkumise dokument" → "Ava hinnapakkumise dokument"; `et.cliente.json` → `clienteOrcamentoDetalhe.escolhido` "Valitud pakkumine" → "Valitud hinnapakkumine"; app `orcamentos.escolhido` idem; `et.misc.json` → `guias.cta.pedido.titulo/botao` "remondipakkumist"/"Küsi pakkumist" → "hinnapakkumist".
**ET-29 · Baixo** — CTA de emergência com três rótulos: `et.json` `home.footerAcabeiDeBater`/`home.emergenciaTitulo` "Sain just avarii", `naoEncontrado.emergencia` "Juhtus liiklusõnnetus", app `emergencia.titulo`/`dashboard.emergenciaBotao` "Sattusin avariisse", `et.misc.json` `guias.cta.emergencia.titulo` "Juhtus liiklusõnnetus?" → usar "Sain just avarii" em todos (site e app).
**ET-30 · Baixo** — `et.cliente.json` → `clienteHistorico.howWasService` / `clienteOrcamentoDetalhe.howWasService` "Milline oli teenus?" → "Kuidas teenusega rahule jäid?".
**ET-31 · Baixo** — `et.cliente.json` → `clienteOrcamentoDetalhe.confirmRefuseInProgress` "…töökojast kätte saada… vormistada väljaregistreerimine" → "…töökojast ära viia. Töökoda saab teate, et teha check-out."
**ET-32 · Baixo** — `et.cliente.json` → `clienteReagendar.appointmentNotFound` "Vastuvõttu ei leitud" → "Broneeringut ei leitud"; `et.oficina.json` → `oficinaCheckin.agendamento` "Ajastamine" → "Broneering"; `oficinaCheckin.turno` "Ajavahemik" × `clienteReagendar.shiftLabel` "Vahetus" → "Ajavahemik" nos dois.
**ET-33 · Baixo** — `et.oficina.json` → `oficinaCapacidade.statusEmExecucao` "Teostuses" → "Töös" (como `constants.statusManutencao.em_execucao`).
**ET-34 · Baixo** — `et.oficina.json` → `notasInternas.titulo` "Sisemärkused" → "Sisemärkmed" (termo dos tutoriais).
**ET-35 · Baixo** — `et.oficina.json` → `oficinaEnviarOrcamento.importarBotao` "Laadi foto või PDF" → "Laadi üles foto või PDF".
**ET-36 · Baixo** — `et.oficina.json` → `oficinaSolicitacaoDetalhe.statusOrcamento.visualizado` "Klient nägi" → "Klient on näinud".
**ET-37 · Baixo** — `et.misc.json` → `emergenciaAcidenteDetalhe.legacyIndividual` "Igaüks maksab enda oma" → "Igaüks maksab oma remondi ise".
**ET-38 · Baixo** — `et.misc.json` → `docsCliente.s5Items.3.label` "Valmis järele tulemiseks" → "Valmis kättesaamiseks" (igual ao painel).
**ET-39 · Baixo** — `et.misc.json` → `docsCliente.s1Steps.0.desc`, `s1Steps.2.desc`, `s4Steps.0.desc`; `et.loja.json` → `lojaAprender.*.passosGuiados` "Kliki"/"Klõpsa" → "Vajuta" (verbo usado em todos os outros tutoriais).
**ET-40 · Baixo** — `apps/mobile/i18n/locales/et.json` → `emergencia.voltarInicio` "Tagasi algusesse" → "Tagasi avalehele".

---

## Achados — Russo

### Alto

**RU-01 · Alto · Russo não existe nas notificações/e-mails do servidor** — `apps/web/src/lib/email-i18n.ts` (`EmailLocale = 'pt'|'en'|'et'|'it'`; `resolveEmailLocale` manda `ru` para **inglês**), `apps/web/src/lib/notif-i18n.ts` (usa o mesmo `EmailLocale`: ~25 dicionários de push/in-app sem `ru`), `apps/mobile/lib/notif-i18n.ts` (`NotifLocale` sem `ru`; `resolveLocale` manda `ru` para **português** → a oficina russa recebe "Nova solicitação!" e o tipo "Colisão"/"Elétrico" em português).
Atual: usuário russo recebe e-mails e avisos em inglês (site) e em português (app).
Proposto: adicionar `ru` nos três arquivos (e `pt-PT`, que também cai em `pt`), reutilizando os textos já existentes em `ru.json`/`ru.oficina.json` (ex.: "Новая заявка!", "Смета принята!", "Новая смета: {oficinaNome} отправил смету на {valor}", "Автомобиль готов…"). `notif-servico.ts` e `erro-pagina.ts` já têm `ru`.

**RU-02 · Alto · Placeholder diz que o cliente passou no vermelho** — `ru.misc.json` → `emergencia.descriptionPlaceholder`
Atual: "Напр.: Я въехал в машину впереди на красный свет..." (= "bati no carro da frente no sinal vermelho" — admite infração; pt: "no semáforo").
Proposto: "Напр.: Въехал в стоящую впереди машину на светофоре..."

### Médio

**RU-03 · Médio · "мастерская" × "автосервис"** — termo padrão é **автосервис** (~400 ocorrências); estas usam **мастерская** (trocar para автосервис/автосервису/автосервисом):
- `ru.json`: `paraOficinas.funcCategorias.1.itens.0` "комиссию платит мастерская", `garantia.falarComOficina` "Написать мастерской", `garantia.conversaEncerrada` "эта мастерская не была выбрана"
- `ru.cliente.json`: `clienteOrcamentoDetalhe.horariosVencidos` "Попросите мастерскую…", `clienteMensagemDetalhe.escolherOficinaTitulo` "С какой мастерской?", `escolherOficinaTexto`, `semConversaAinda` (2×), `editarPedido.completarCarroDica` "помогут мастерской"
- `ru.oficina.json`: `oficinaEquipe.darAcessoPortalDica` "мастерская назначает", `oficinaPerfil.seguradorasTexto` "работает мастерская", `oficinaPerfil.paginaPublicaAposAprovacao` "после одобрения мастерской", `oficinaVeiculosEmServico.feitoPorOficina` "Мастерская"
- `ru.misc.json`: `docsCliente.s3Outro` (3×), `s5Items.0.desc` "приезжает в мастерскую", `s5Outro` (2×), `s7Steps.2.desc` "ближайшие мастерские", `docsOficina.s3Steps.0.desc` "у каждой мастерской", `s4Items.2.desc` "мастерская всё делает сама", `s5Steps.2.desc` "Владелец мастерской"
- app `ru.json`: `emergencia.seuCarroDica` "Поможет мастерской", `orcamentos.horariosVencidos`, `mensagens.escolherOficina`, `escolherOficinaTexto`, `semConversaAinda` (2×), `acompanhamento.completarCarroDica`, `garantia.falarComOficina`, `garantia.conversaEncerrada`; `permissoes/ru.json` → `ios.NSMicrophoneUsageDescription` "голосовые сообщения мастерской" → "…автосервису"
- `apps/web/src/lib/notif-servico.ts` → `TEXTOS.ru.chegouTitulo` "Ваша машина в мастерской" → "Ваша машина в автосервисе"
Exceção aceitável: `nav.oficina`, `oficinaVeiculosEmServico.oficina` e os «Мастерская» dos tutoriais (`oficinaAprender.*`) são o **nome do item de menu** "Oficina" (= chão de oficina); podem ficar, desde que todos digam o mesmo.

**RU-04 · Médio · Push "carro chegou" concorda errado e usa termo errado** — `apps/web/src/lib/notif-servico.ts` → `TEXTOS.ru.chegou`, `PRONTO.ru.mensagem`
Atual: "{oficina} приняла вашу машину {carro}" (feminino fixo; o nome da oficina pode ser "Autoremont Tamm") · "{carro} готова: её можно забрать…" ("VW Golf готова").
Proposto: "Автосервис {oficina} принял вашу машину {carro}. Следите за ремонтом здесь." · "Автомобиль {carro} готов: его можно забрать в {oficina}{endereco}."

**RU-05 · Médio · "предложение" em vez de "смета"** — `ru.cliente.json` → `clienteOrcamentoDetalhe.escolhido`; app `orcamentos.escolhido`
Atual: "Выбранное предложение". Proposto: "Выбранная смета". (`oficinaPecas.*` usa "предложение" para cotação de peça — isso está certo e deve ficar.)

**RU-06 · Médio · "запрос" para solicitação** — `ru.json` → `damageAnalysis.erroSemFotos` "В этом запросе пока нет фото", `erroFotoInvalida` "фото этого запроса"; `ru.cliente.json` → `editarPedido.editar` "Изменить запрос"; app `acompanhamento.editarPedido` "Изменить запрос"
Proposto: "В этой заявке…", "фото этой заявки", "Изменить заявку" ("запрос" fica reservado para cotação de peças, como em `nav.cotacoes`).

**RU-07 · Médio · "После обеда" para turno da tarde** — `ru.cliente.json` → `clienteReagendar.afternoonShift`; `ru.oficina.json` → `oficinaCheckin.tarde`, `oficinaEnviarOrcamento.tardeHorario`; app `orcamentos.turno_tarde`
Atual: "После обеда (13:00–18:00)" / "после обеда". Proposto: "День (13:00–18:00)" / "день" (padrão de agendamento).

**RU-08 · Médio · Concordância/termo inconsistente em "Выдан"** — `ru.oficina.json` → `oficinaVeiculosEmServico.hist_entregue` "Выдана" (× "Выдан" em todas as outras 8 chaves), `hist_checkin` "Приём" (× "Приёмка"); `ru.misc.json` → `docsOficina.s6Note` "«Выдано»" (× rótulo real "Выдан")
Proposto: "Выдан" / "Приёмка" / "«Выдан»".

**RU-09 · Médio · Menu "Запросы" ambíguo** — `ru.json` → `nav.cotacoes` "Запросы" ao lado de `nav.solicitacoes` "Заявки"
Proposto: "Запросы запчастей" (ou "Запчасти: запросы").

**RU-10 · Médio · Etapa "concluído"** — `ru.json` → `constants.statusManutencao.concluido` / `concluidoDesc`; `ru.cliente.json` → `clienteAcompanhamento.progressConcluido`; app `constants.statusManutencao.concluido`
Atual: "Завершено" / "Работы закончены" (não diz "pode buscar").
Proposto: "Готов к выдаче" / "Автомобиль готов, можно забирать" — igual ao painel (`oficinaVeiculosEmServico.statusPronto` "Готов", `prontosParaRetirada` "Готовы к выдаче") e ao push "Ваша машина готова". Manter "Выдан" para *entregue*.

### Baixo

**RU-11 · Baixo** — `ru.json` → `home.faqItems.7.resposta` "при КАСКО" → "при каско" (na Estónia escreve-se minúsculo, como em `seguroReparo.*`).
**RU-12 · Baixo** — `ru.json` → `home.step4Titulo` "Выберите и ремонтируйте" → "Выберите и отремонтируйте".
**RU-13 · Baixo** — `ru.json` → `excluirConta.item1` e app `perfil.excluirContaTexto` "Ваш вход перестаёт существовать: войти с этим e-mail…" (decalque) → "Ваш доступ будет закрыт: войти с этим адресом больше не получится."; `excluirConta.item2` "e-mail" → "эл. почту" (resto do arquivo usa "эл. почта").
**RU-14 · Baixo** — `ru.misc.json` → `emergencia.emailPlaceholder` "you@email.com" (inglês) → "imya@email.com".
**RU-15 · Baixo** — `ru.oficina.json` → `oficinaEnviarOrcamento.horarioPassado` "Одно из времён уже прошло." → "Один из выбранных слотов уже прошёл."
**RU-16 · Baixo** — `ru.oficina.json` → `oficinaPerfil.seguradorasTitulo`, `ru.misc.json` → `oficinaPerfilPublico.seguradorasConvencionadas`, `docsOficina.s1Steps.4.desc` "Страховые-партнёры" → "Страховые компании-партнёры".
**RU-17 · Baixo** — app `ru.json` → `emergencia.titulo` / `dashboard.emergenciaBotao` "Я только что попал в ДТП" (24 caracteres num botão de 390 px; o site usa o mesmo texto no cabeçalho, ok lá) → "Я попал в ДТП" no botão.
**RU-18 · Baixo** — app `ru.json` → `orcamentos.semAvaliacoes` "Новый на BipFix" × site `oficinasLista.newOnPlatform` "Недавно в BipFix" → um só ("Новый в BipFix").
**RU-19 · Baixo** — `ru.misc.json` → `docsOficina.s4Title` "4. Ведите расписание" (único título em imperativo; os outros são substantivos) → "4. Расписание".
**RU-20 · Baixo** — `ru.json` → `constants.statusManutencao.pausaPecasDesc` "Работы остановлены из-за отсутствия запчастей" (45 caracteres para subtítulo de etapa) → "Остановлено: нет запчастей".

---

## Verificações automáticas (sem achados)
- Chaves faltando/extras: 0 em todos os pares (exceto `termos`/`privacidade` em `misc`, estrutura UE intencional e já tratada por `DocumentoLegalSecoes`).
- Placeholders renomeados/traduzidos/ausentes: 0. Chaves duplas `{{` no app: 0. Plurais ICU sem `other`: 0. Plurais ru sem `few`: 0.
- Chaves idênticas ao pt: só "BipFix", "Check-in", "Tel: {phone}", "Foto {n}", "+{count}", "email@email.com" (ok).
- Brasil (CPF/FIPE/R$/LGPD/CNPJ/SAMU): 0 fora das chaves `*_br` (deliberadamente sobre o Brasil) e da menção "a versão brasileira tem termos próprios" nos textos legais. Rússia (ОСАГО/ГИБДД/рубли/Россия): 0.
- Textos legais et/ru (termos/privacidade, 166 chaves): jurisdição UE/Estónia, GDPR, osaühing, KMKR; et em *sina* (40 ocorrências, 0 *teie*); ru em *вы*. Boa qualidade.
- Comprimento de rótulos: nada quebra; os maiores são labels de formulário "(valikuline)/(необязательно)" com 33–39 caracteres (coberto em ET-15) e o botão do app em RU-17.
