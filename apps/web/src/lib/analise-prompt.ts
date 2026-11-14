// Texto enviado ao Gemini na analise do pedido (rota /api/analisar-dano) e a
// limpeza da resposta. Separado da rota para o teste usar exatamente o mesmo.
//
// Manutencao/revisao nao e dano (dono 04/11: troca de oleo virou "manutencao
// planejada, nao relacionada a reparo de danos"). O texto e para a oficina:
// o que fazer e o que confirmar, sem repetir o pedido nem dizer o que ele nao e.
//
// Dono 14/11: com ou sem foto, a oficina sempre recebe (quando possivel) 3
// blocos: estimativa APROXIMADA (pecas + mao de obra, horas), observacoes
// (causa provavel, pecas relacionadas, riscos) e perguntas para o cliente.
// Exemplo real: pedido 100140, so texto em russo ("нужна замена правого шруса").

// Sobe quando o formato muda: analise guardada com versao menor e refeita.
export const VERSAO_ANALISE = 2;

// Preco/hora de referencia por mercado (oficina independente, com imposto).
// So onde ha base; nos outros a IA usa o valor local que conhece.
const HORA_REFERENCIA: Record<string, string> = {
  Estonia: 'em Tallinn uma oficina independente cobra em geral 45-75 EUR/h com IVA',
};

export function promptAnalise(p: { tipo: string | null | undefined; contexto: string; soTexto: boolean; mercado: string; moeda: string; nomeIdioma: string }): string {
  const instrucao = p.soTexto
    ? 'Nao ha fotos: analise pela descricao do cliente e pelos dados do carro, como hipoteses provaveis, e use confianca baixa (no maximo 0.5). Mesmo sem foto, de estimativa, observacoes e perguntas.'
    : 'Analise as fotos junto com a descricao do cliente.';
  const foco = ['manutencao', 'revisao'].includes(String(p.tipo || ''))
    ? 'E um servico de manutencao (sem defeito relatado): severidade leve; resumo = o que a oficina deve fazer e o que confirmar com o cliente (ex.: tipo/especificacao do oleo, quais filtros); pecas e checklist = so o necessario para o que o cliente pediu; horas de tabela de manutencao sao curtas (troca de oleo e filtro em geral menos de 1 h).'
    : 'resumo = o defeito/dano provavel ou o servico pedido e o que a oficina deve verificar primeiro.';
  const hora = HORA_REFERENCIA[p.mercado] ? ` (${HORA_REFERENCIA[p.mercado]})` : '';
  return `Especialista em oficina mecanica (${p.mercado}). ${p.contexto}
${instrucao} ${foco} O texto e lido pela oficina, que vai fazer o orcamento. Nao repita a descricao do cliente, nao diga o que o pedido NAO e, nao invente servicos que o cliente nao pediu (duvidas vao em perguntas_sugeridas).
Responda SO este JSON, curto e direto (n = numero calculado por voce para ESTE caso):
{"resumo":"max 2 frases","severidade":"leve|moderado|grave|severo","estimativa_custo":{"pecas_min":n,"pecas_max":n,"mao_obra_min":n,"mao_obra_max":n,"horas_min":n,"horas_max":n,"min":n,"max":n},"observacoes":["2 a 4 itens"],"perguntas_sugeridas":["2 a 5 perguntas"],"pecas_afetadas":["max 5 pecas"],"checklist_inspecao":["max 5 itens"],"confianca":0.0-1.0}
Regras:
- estimativa_custo: sempre que possivel, faixa APROXIMADA e realista em ${p.moeda} para este carro no mercado de ${p.mercado}, valores com imposto: pecas (de alternativa de boa qualidade ate original), mao de obra = horas de tabela x preco/hora de oficina independente${hora}; min = pecas_min + mao_obra_min, max = pecas_max + mao_obra_max. Calcule para este carro e este servico (preco real da peca e horas de tabela), sem copiar numeros de exemplo; nunca 0, nunca preco unico (max maior que min). Use null so se o pedido nao der nenhuma ideia do servico; ai as perguntas pedem o que falta.
- observacoes: o que costuma causar isso ou o que normalmente e necessario neste carro, pecas relacionadas que vale verificar ou trocar junto, risco de continuar rodando. Frases curtas e uteis para quem orca.
- perguntas_sugeridas: perguntas concretas que a oficina manda ao cliente pelo chat para orcar com precisao (ex.: ano/motor/cambio se faltarem, sintomas e quando acontecem, barulho ao virar ou frear, peca original ou alternativa, se ja foi trocado antes). Nao pergunte o que ja esta na descricao ou nos dados do carro.
- Escreva todos os textos (resumo, observacoes, perguntas_sugeridas, pecas_afetadas, checklist_inspecao) em ${p.nomeIdioma}, mesmo que o cliente tenha escrito em outra lingua.
- severidade EXATAMENTE um destes valores, sem traduzir: leve, moderado, grave, severo.`;
}

export interface EstimativaAnalise {
  min: number; max: number;
  pecas_min?: number | null; pecas_max?: number | null;
  mao_obra_min?: number | null; mao_obra_max?: number | null;
  horas_min?: number | null; horas_max?: number | null;
}

export interface AnaliseNormalizada {
  resumo: string;
  severidade: 'leve' | 'moderado' | 'grave' | 'severo';
  estimativa_custo: EstimativaAnalise | null;
  observacoes: string[];
  perguntas_sugeridas: string[];
  pecas_afetadas: string[];
  checklist_inspecao: string[];
  confianca: number | null;
}

const SEVERIDADES = ['leve', 'moderado', 'grave', 'severo'] as const;

function positivo(v: unknown, casas = 0): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.').replace(/[^\d.]/g, '')) : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// faixa: um lado so vira os dois; invertida e desvirada
function faixa(a: unknown, b: unknown, casas = 0): [number, number] | null {
  let x = positivo(a, casas), y = positivo(b, casas);
  if (x == null && y == null) return null;
  if (x == null) x = y; if (y == null) y = x;
  return x! <= y! ? [x!, y!] : [y!, x!];
}

function textos(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean).slice(0, max);
}

// Resposta da IA -> formato guardado/mostrado. Numeros viram numeros, faixa
// zerada some (05/11: '0 - 0 €'), total = pecas + mao de obra quando os dois
// vem (a tela mostra os tres e eles precisam bater).
export function normalizarAnalise(bruto: any, soTexto: boolean): AnaliseNormalizada {
  const e = bruto?.estimativa_custo && typeof bruto.estimativa_custo === 'object' ? bruto.estimativa_custo : null;
  let estimativa: EstimativaAnalise | null = null;
  if (e) {
    const pecas = faixa(e.pecas_min, e.pecas_max);
    const mao = faixa(e.mao_obra_min, e.mao_obra_max);
    const horas = faixa(e.horas_min, e.horas_max, 1);
    let total = faixa(e.min, e.max);
    if (pecas && mao) total = [pecas[0] + mao[0], pecas[1] + mao[1]];
    else if (!total && (pecas || mao)) total = pecas || mao;
    if (total) {
      estimativa = {
        min: total[0], max: total[1],
        pecas_min: pecas?.[0] ?? null, pecas_max: pecas?.[1] ?? null,
        mao_obra_min: mao?.[0] ?? null, mao_obra_max: mao?.[1] ?? null,
        horas_min: horas?.[0] ?? null, horas_max: horas?.[1] ?? null,
      };
    }
  }
  let confianca = Number(bruto?.confianca);
  if (!Number.isFinite(confianca) || confianca <= 0) confianca = NaN;
  // escala trocada (0.04 no teste de 14/11 com 'n' no modelo): 1-10 ou 1-100
  else if (confianca > 10) confianca = confianca / 100;
  else if (confianca > 1) confianca = confianca / 10;
  if (soTexto && confianca > 0.5) confianca = 0.5;
  return {
    resumo: typeof bruto?.resumo === 'string' ? bruto.resumo.trim() : '',
    severidade: (SEVERIDADES as readonly string[]).includes(bruto?.severidade) ? bruto.severidade : 'moderado',
    estimativa_custo: estimativa,
    observacoes: textos(bruto?.observacoes, 4),
    perguntas_sugeridas: textos(bruto?.perguntas_sugeridas, 5),
    pecas_afetadas: textos(bruto?.pecas_afetadas, 5),
    checklist_inspecao: textos(bruto?.checklist_inspecao, 5),
    confianca: Number.isFinite(confianca) ? Math.round(confianca * 100) / 100 : null,
  };
}

// Analise guardada antes do formato atual (sem observacoes/perguntas): a tela
// mostra o que tem e o hook pede para refazer.
export function analiseDesatualizada(a: { raw_response?: unknown } | null | undefined): boolean {
  const r = a?.raw_response as { versao?: unknown } | null | undefined;
  return !!a && Number(r?.versao || 0) < VERSAO_ANALISE;
}
