# Estratégia de Cidade-Piloto — 2026-09-08

Relatório completo (com tabelas, cards e fontes) publicado como artifact interativo:
https://claude.ai/code/artifact/ffa67dd1-c4cf-4750-94e5-33a3fac0bfa7

## Resumo da recomendação

**Cidade-piloto recomendada: Ribeirão Preto (SP).** Alternativa forte: São José do Rio Preto.

Critérios cruzados: frota de veículos e idade (SENATRAN), densidade estimada de oficinas por veículo,
renda/vocação econômica local, penetração digital regional (CETIC.br) e concorrência já instalada
(Instauto, Sua Oficina Online). Cidades da Grande São Paulo/ABC foram excluídas por já operarem como
mercado da capital (mais caras, mais disputadas, motorista já habituado a redes de lá).

## Shortlist avaliado (frota SENATRAN, maio/2024)

| Cidade | População | Frota | Veíc./hab. | Nota |
|---|---|---|---|---|
| **Ribeirão Preto** | ~720.000 | 590.397 | 0,82 | **#1** — renda alta (agronegócio), mídia local própria, USP eleva letramento digital |
| **São José do Rio Preto** | ~504.000 | 435.904 | 0,86 | **#2** — maior intensidade veicular, polo de microrregião |
| Sorocaba | ~696.000 | 543.856 | 0,78 | #3a — escala, logística fácil a partir de SP |
| Piracicaba | ~407.000 | 349.979 | 0,86 | #3b — mercado menor e mais rápido de saturar |
| Franca | ~355.000 | 298.151 | 0,84 | Viável, mídia local menor |
| Bauru | ~379.000 | 306.462 | 0,81 | Viável, ajuste moderado |
| Jundiaí | ~423.000 | 365.131 | 0,86 | Descartada — 60km de SP, motorista já acessa a capital |
| São José dos Campos | ~729.000 | 489.782 | 0,67 | Descartada — frota mais corporativa, menor intensidade de reparo |

## Concorrência identificada

- **Instauto** e **Sua Oficina Online** — únicos marketplaces nacionais no mesmo modelo do BipFix (comparação
  de orçamentos entre oficinas), ambos ainda em expansão cidade a cidade.
- **Oficina.app, WSoft, MarketUP** e similares — softwares de gestão por assinatura (R$ 79–299/mês) vendidos
  direto à oficina, sem componente de geração de cliente novo. Confirma que o diferencial do BipFix deve ser
  a geração de demanda, não competir como "mais um sistema de OS".

## Plano de 90 dias (Ribeirão Preto)

1. **Semanas 1–3** — Base de oferta: contato com Sindirepa-SP (capítulo regional), visitas porta a porta às
   oficinas de maior movimento, comissão zero para os primeiros parceiros (conforme `/termos`). Meta: 15–25
   oficinas ativas antes de qualquer mídia paga.
2. **Semanas 3–8** — Captação de demanda: Google Ads e Meta Ads geolocalizados na cidade, grupos locais de
   WhatsApp/Facebook, parceria com autopeças e guinchos locais. Meta: 300–500 motoristas ativos.
3. **Semanas 8–13** — Prova social: coleta de avaliações reais (alimenta SEO local de `/oficinas/[id]`),
   parceria com 1–2 seguradoras/redes de guincho regionais. Ao final, decidir a segunda cidade com dados reais
   de CAC — São José do Rio Preto é o candidato natural.

## Orçamento mensal estimado (regime de piloto)

Google Ads R$500–900 + Meta Ads R$300–600 + parceria Sindirepa (custo ~zero) + horas de visita de campo ≈
**R$800–1.500/mês** em mídia paga, consistente com o piso de campanha local eficaz no Brasil.

## Lacunas de dado a fechar antes do compromisso final

1. **Densidade real de oficinas por cidade** — o número usado aqui é uma estimativa proporcional sobre a
   frota (Sindirepa-SP só divulga total estadual: 28.000+ oficinas, 4.000+ na capital). Contatar Sindirepa-SP
   diretamente para números reais por município.
2. **Acidentes de trânsito por município** — não localizado ranking público por cidade do interior paulista.
   O **INFOSIGA SP** (portal oficial de segurança viária do estado) é a fonte certa a consultar antes da
   decisão final.
3. **Idade média da frota por cidade** — SENATRAN publica frota por ano de fabricação, mas o corte por
   cidade não foi extraído nesta rodada.
4. **Presença local de Instauto/Sua Oficina Online** — checar manualmente se já operam ativamente em
   Ribeirão Preto antes do lançamento; muda a agressividade necessária da oferta inicial.

## Fontes

SENATRAN (frota de veículos), IBGE Cidades, Dados Abertos SP, Sebrae-SP/Sindirepa, Sindirepa Brasil,
Monitor Mercantil (acidentes 2024), Cetic.br (TIC Domicílios 2024), Instauto, Sua Oficina Online, guias de
custo Google Ads/Meta Ads Brasil 2026.
