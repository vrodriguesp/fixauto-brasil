// Texto enviado ao Gemini na analise do pedido (rota /api/analisar-dano).
// Separado da rota para o teste usar exatamente o mesmo texto.
//
// Manutencao/revisao nao e dano (dono 04/11: troca de oleo virou "manutencao
// planejada, nao relacionada a reparo de danos"). O texto e para a oficina:
// o que fazer e o que confirmar, sem repetir o pedido nem dizer o que ele nao e.
export function promptAnalise(p: { tipo: string | null | undefined; contexto: string; soTexto: boolean; mercado: string; moeda: string; nomeIdioma: string }): string {
  const instrucao = p.soTexto
    ? 'Nao ha fotos: analise so pela descricao do cliente, como hipoteses provaveis, e use confianca baixa (no maximo 0.5).'
    : 'Analise as fotos.';
  const foco = ['manutencao', 'revisao'].includes(String(p.tipo || ''))
    ? 'E um servico de manutencao (sem defeito relatado): severidade leve; resumo = o que a oficina deve fazer e o que confirmar com o cliente (ex.: tipo/especificacao do oleo, quais filtros); pecas = so as necessarias para o que o cliente pediu.'
    : 'resumo = o defeito/dano provavel e o que a oficina deve verificar primeiro.';
  return `Especialista em oficina mecanica (${p.mercado}). ${p.contexto}
${instrucao} ${foco} O texto e lido pela oficina. Nao repita a descricao do cliente, nao diga o que o pedido NAO e, nao invente servicos que o cliente nao pediu (coloque duvidas em perguntas_sugeridas). Responda JSON CURTO E DIRETO:
{"resumo":"max 2 frases","severidade":"leve|moderado|grave|severo","checklist_inspecao":["max 5 itens"],"pecas_afetadas":["max 5 pecas"],"estimativa_custo":{"min":0,"max":0},"confianca":0.8,"perguntas_sugeridas":["max 3 perguntas curtas que a oficina envia ao cliente pelo chat"]}
Seja BREVE. Escreva os textos (resumo, checklist_inspecao, pecas_afetadas, perguntas_sugeridas) em ${p.nomeIdioma}. O campo severidade deve ser EXATAMENTE um destes valores, sem traduzir: leve, moderado, grave, severo. Precos em ${p.moeda} do mercado de ${p.mercado}.`;
}
