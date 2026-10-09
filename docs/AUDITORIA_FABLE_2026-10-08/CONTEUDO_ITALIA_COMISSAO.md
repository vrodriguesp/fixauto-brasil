# Conteúdo: site italiano para a Itália, "sem comissão" e guia de pneus (en) — 09/10/2026

Alterações só em JSON (mensagens e guias). Nada commitado, nada publicado. Chaves nunca renomeadas nem removidas; placeholders ICU mantidos.

**Verificação:** `node apps/mobile/scripts/checar-traducoes.mjs` OK; `npx tsc --noEmit -p apps/web` OK; `node apps/web/scripts/checar-traducoes.mjs` — paridade entre os 6 idiomas OK; os 18 "problemas" que restam são chaves novas usadas em código **de outro trabalho em andamento** (não commitado): `emergenciaAcidenteDetalhe.aguardandoRegistro`, `oficinaEnviarOrcamento.orcamentoJaAceito`, `oficinaEnviarOrcamento.abrirConversa` (faltam nos 6 idiomas; não existem no HEAD). Não são destas alterações.

## A) Site italiano fala com a Itália

`apps/web/messages/it.json`
- home › metaTitle, metaDescription, metaKeywords (+1 termo "confronto preventivi officina Italia"), ogDescription, comoFuncionaSubtitulo, porQueTexto2, parceiroTexto (Tallinn → Itália, parceiros fundadores por cidade), faqItems[1].resposta (verificação: partita IVA / Camera di Commercio, GDPR), faqItems[4].resposta (CAI, 112/118), faqItems[7].resposta (RC auto, risarcimento diretto, kasko/furto-incendio-collisione, CAI, IVASS — sem citar Estônia)
- home › **avvisoEstonia (nova)**: "Vivi in Estonia? BipFix funziona anche a Tallinn, in italiano: le richieste vanno alle officine vicine all'auto."
- sejaParceiro › metaDescription, ogDescription, beneficio3Texto (Milano, Roma, Napoli, Torino), placeholderCidade ("Es: Milano"), placeholderRegiao ("Es: Lombardia"), placeholderWhatsapp ("Es: +39 …"), depois2, quemSomosTexto (empresa nascida em Tallinn, OÜ em registro, agora também para a Itália)
- paraOficinas › metaDescription, ogDescription, heroTexto, faq[1].resposta
- sobre › metaDescription, intro, estagioTexto (nasceu em Tallinn; versão italiana abre o mercado italiano; sem rede grande na Itália ainda), empresaTexto (mantém o fato da OÜ estoniana; "per l'Italia non abbiamo ancora una sede locale")

`apps/web/messages/it.auth.json`
- cadastro › placeholderCidade ("Tallinn" → "Milano")

`home.avvisoEstonia` (nova) também em: `pt.json`, `pt-PT.json`, `en.json`, `et.json`, `ru.json` (traduzida; o checador exige a chave nos 6).

Não alterados de propósito: `termos`/`privacidade` (dono trata à parte); dicas de seguro por país (`seguroReparo`, `emergencia*` — já são por país do acidente, não por idioma); docsCliente/docsOficina em italiano não citavam Estônia/Tallinn; app mobile em italiano não cita Tallinn.

Guias: nenhum guia só da Estônia tinha versão "it" (apenas `compare-car-repair-quotes.json` tem "it") — nada a remover.

## B) Comissão: "hoje é gratuito" + aviso de 30 dias corridos

Mesmas chaves nos 6 idiomas (pt, pt-PT, en, et, it, ru). Textos conditionais que só aparecem quando o admin configura uma taxa (`comissaoPagaNoFim`, `taxaVaria`, `dicaTexto`, `condicaoEspecialTexto`, `taxaFixaTexto`, `valorPorServicoTexto`, `comoTaxaCalculada`…) e rótulos de tabela foram mantidos — não afirmam cobrança hoje.

`apps/web/messages/{idioma}.json`
- paraOficinas › funcCategorias[1].itens[0] ("a comissão é paga pela oficina" → "o cliente paga só o valor do orçamento — sem custo extra")
- paraOficinas › funcCategorias[4].itens (Finanças: "comissão configurável…/extrato de comissão…" → gratuito hoje; aviso de 30 dias corridos; transparência)
- comissaoPecasCard › infoTaxa (mantém `{base}`, `{min}`, `{media}`; agora: gratuito para fornecedores + aviso de 30 dias; a faixa só valeria se uma cobrança por desempenho fosse ativada)
- home › faqItems[2].resposta ("Quanto custa": gratuito para motoristas, oficinas e fornecedores hoje + aviso de 30 dias)

`apps/web/messages/{idioma}.loja.json`
- lojaAprender › modulos › como-funciona › resumo (remove "cobra uma pequena comissão"), desafio (remove "→ comissão")
- lojaAprender › modulos › cotacoes › dica (responder rápido → mais chance de ser escolhido, em vez de "reduz sua taxa")
- lojaAprender › modulos › comissao › passosGuiados[1]
- lojaComissao › pageSubtitle ("Taxa cobrada sobre pedidos…" → gratuito hoje + aviso de 30 dias)

`apps/web/messages/{idioma}.oficina.json`
- oficinaAprender › geral › solicitacoes › passosGuiados[4] ("veja quanto será a comissão…" → "hoje o BipFix não cobra comissão da oficina"), dica
- oficinaAprender › geral › comissao › passosGuiados[1]
- oficinaComissao › subtitulo ("Sua taxa de comissão e como reduzi-la" → "Como funciona a cobrança da plataforma para a sua oficina")

`apps/web/messages/{idioma}.misc.json`
- docsOficina › s8Title ("Comissão BipFix" → "Custos da plataforma"), s8Intro, s8Items (3 itens: sem comissão / sem mensalidade / aviso prévio de 30 dias corridos), s8ReduceTitle ("Onde acompanhar:"), s8ReduceList (2 itens), s8Note ("nunca há cobrança para o motorista")

Frase do compromisso por idioma (usada em todos os textos acima):
- pt: "Se mudarmos a forma como a plataforma cobra motoristas ou oficinas, avisaremos com pelo menos 30 dias corridos de antecedência."
- pt-PT: "… avisaremos com pelo menos 30 dias de calendário de antecedência."
- en: "If we change how the platform charges drivers or garages, we will inform you at least 30 calendar days in advance."
- et (sina): "Kui muudame seda, kuidas platvorm autojuhtidelt või töökodadelt tasu võtab, teatame sulle sellest vähemalt 30 kalendripäeva ette."
- it: "Se cambieremo il modo in cui la piattaforma fa pagare automobilisti o officine, ti informeremo con almeno 30 giorni di calendario di anticipo."
- ru (вы): "Если мы изменим то, как платформа взимает плату с водителей или автосервисов, мы сообщим вам об этом не менее чем за 30 календарных дней."
(Nos textos de fornecedores de peças a frase inclui "oficinas ou fornecedores".)

App mobile (`apps/mobile/i18n/locales/*.json`): varredura por comissão/mensalidade/percentual nos 6 idiomas — **nenhuma ocorrência**; nada alterado.

Já estavam corretos (não mexi): `oficinaComissao.faseFundadorTexto`, `paraOficinas.transparenciaTexto`, `paraOficinas.faq[0]`, `sejaParceiro.beneficio1*`, `oficinaAprender.geral.comissao.resumo`, `lojaAprender.modulos.comissao.resumo`, `oficinaEnviarOrcamento.semComissaoOrcamento`.

## C) Guias (`apps/web/content/guias`)

`winter-tyres-estonia.json`
- `versoes.en` reescrita inteira para **2026/27** (inglês britânico), com os fatos, a estrutura e as fontes das versões et/ru já revisadas: tabela de datas com dias da semana (1/15 out 2026, 1 dez 2026, 1 mar / 31 mar / 30 abr 2027), categorias de veículos (M1, N1, O2, L6e/L7e; O1, L3e, M2/M3), naastrehvid em todas as rodas, 3PMSF / POR / M+S, 3 mm (código 503) vs 1,6 mm, multa (§ 242: até 20 unidades = 160 €; 40 € no procedimento rápido; até 800 € / 6 meses), liikluskindlustus vs kasko (minuraha.ee), carros com placa finlandesa/estrangeira, preços de troca de pneus em Tallinn (out/2026, mesmas faixas do et), quando reservar, checklist. 11 seções, 8 FAQ, 15 fontes (as 14 do et + a notícia em inglês do Transpordiamet que já existia).
- titulo / tituloSeo / descricao / resumo com "2026/27".
- Links para `/oficinas` removidos (eram 1 no texto); único link interno: `/guias/car-accident-estonia-what-to-do` (os guias de preços e de kasko não têm versão en).
- `atualizado`: 2026-10-09 (já estava).

`compare-car-repair-quotes.json` (versão "it" adaptada à Itália; demais idiomas intactos)
- versoes.it › descricao (IVA 22%, garanzia legale)
- versoes.it › secoes[5].paragrafos[0] (IVA ordinaria 22%)
- versoes.it › secoes[6].paragrafos[1] (Codice del Consumo d.lgs. 206/2005: garanzia legale 2 anni; Codice civile para appalto; RC auto / kasko)
- versoes.it › secoes[9].paragrafos[1] (Milano, Roma, Napoli, Torino)
- versoes.it › faq[3].resposta (Codice civile: variazioni só com autorização do committente)
- versoes.it › fontes (+ Normattiva – Codice del Consumo)
- `atualizado`: 2026-09-30 → 2026-10-09

## Dúvidas para o dono
1. `home.avvisoEstonia` nos outros 5 idiomas é a mesma frase traduzida ("Mora na Estônia? …"); em **et** fica estranho num site estoniano — se o aviso só for exibido em `/it`, pode ignorar.
2. `comissaoPecasCard.infoTaxa` ainda recebe `{base}`/`{min}` do código e a tela mostra "X %" como "sua taxa atual" (número vindo do código, não do texto). O texto agora explica que a faixa só valeria se uma cobrança fosse ativada; esconder o número exige mudança de código.
3. `sobre.empresaTexto` e `sejaParceiro.quemSomosTexto` (it) mantêm o fato de a empresa ser uma OÜ estoniana em registro, com sede em Tallinn — achei mais honesto do que omitir.
4. No guia italiano, as referências legais (IVA 22%, Codice del Consumo 2 anos, Codice civile art. 1659 sobre variações) são gerais; não inventei preços nem números de oficinas.
