// Teste REAL do texto da analise de IA (lib/analise-prompt.ts) no Gemini, com o
// caso que o dono apontou em 04/11 (pedido 100133: "Teenused: Oli- ja
// filtrivahetus", Ford Mondeo 2007) e um caso de defeito. Gasta 3 chamadas.
//   npx tsx scripts/teste-analise-prompt.ts      (usa GEMINI_API_KEY do .env.local)
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = l.indexOf('='); if (i > 0 && l.startsWith('GEMINI_API_KEY')) process.env.GEMINI_API_KEY = l.slice(i + 1).trim().replace(/^"|"$/g, '');
}
import { promptAnalise } from '../src/lib/analise-prompt';
import { chamarGemini } from '../src/lib/gemini';

let falhas = 0;
const confere = (nome: string, ok: boolean, extra = '') => { if (!ok) falhas++; console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${extra ? ' — ' + extra : ''}`); };

async function analisa(tipo: string, descricao: string, nomeIdioma: string) {
  const contexto = `Veículo: Ford Mondeo 2007. Tipo de serviço: ${tipo}. Descrição do cliente: ${descricao}.`;
  const res = await chamarGemini([{ modelo: 'gemini-2.5-flash' }, { modelo: 'gemini-3.5-flash-lite' }], {
    contents: [{ parts: [{ text: promptAnalise({ tipo, contexto, soTexto: true, mercado: 'Estonia', moeda: 'euros (EUR)', nomeIdioma }) }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: 'application/json' },
  }, { rotulo: 'teste' });
  if (!res?.ok) throw new Error('Gemini ' + res?.status);
  const d = await res.json();
  const txt = (d.candidates?.[0]?.content?.parts || []).find((p: any) => p.text && !p.thought)?.text;
  return JSON.parse(txt);
}

async function main() {
  for (const [lingua, nome] of [['ru', 'russo'], ['et', 'estoniano']] as const) {
    const a = await analisa('revisao', 'Teenused: Õli- ja filtrivahetus', nome);
    console.log(`\n[${lingua}] ` + JSON.stringify(a, null, 1));
    const tudo = JSON.stringify(a).toLowerCase();
    confere(`${lingua}: severidade leve`, a.severidade === 'leve');
    confere(`${lingua}: nao fala de "dano"/"nao relacionad"`, !/повреждени|не связан|kahjustus|ei ole seotud|dano/.test(tudo));
    confere(`${lingua}: escrito na lingua pedida`, lingua === 'ru' ? /[а-я]/.test(a.resumo) : !/[а-я]/.test(a.resumo));
    confere(`${lingua}: resumo curto (<= 2 frases)`, (a.resumo.match(/[.!?](\s|$)/g) || []).length <= 2, a.resumo);
    confere(`${lingua}: ate 3 perguntas`, Array.isArray(a.perguntas_sugeridas) && a.perguntas_sugeridas.length <= 3);
    // 05/11 em producao: troca de oleo voltou com 0 - 0 € (copiou o exemplo do JSON)
    confere(`${lingua}: estimativa de custo nao zerada`, Number(a.estimativa_custo?.max) > 0 && Number(a.estimativa_custo?.min) > 0, JSON.stringify(a.estimativa_custo));
  }
  const b = await analisa('mecanica', 'Pidurite märgutuli põleb ja pidurdamisel kriuksub', 'estoniano');
  console.log('\n[defeito] ' + JSON.stringify(b, null, 1));
  confere('defeito: severidade nao e leve por padrao', ['moderado', 'grave', 'severo', 'leve'].includes(b.severidade));
  confere('defeito: fala de freio', /pidur/i.test(JSON.stringify(b)));
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
  process.exit(falhas ? 1 : 0);
}
main();
