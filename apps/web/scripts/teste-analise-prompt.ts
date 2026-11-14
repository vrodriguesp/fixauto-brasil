// Teste do texto da analise de IA (lib/analise-prompt.ts) e da limpeza da
// resposta (normalizarAnalise).
//  1) sem IA: normalizarAnalise com respostas tortas (faixa invertida, zeros,
//     texto em vez de numero, campos faltando, analise antiga);
//  2) REAL no Gemini (dono 14/11: "a IA tem que dar retorno mesmo sem foto"):
//     pedido 100140 (so texto em russo, troca do homocinetico direito, VW
//     Passat) lido por oficina russa e estoniana, freio em estoniano, revisao
//     (caso de 04/11) e um caso COM foto. Gasta 5 chamadas (plano gratis).
//   npx tsx scripts/teste-analise-prompt.ts            (so a parte 1: SEM_IA=1)
//   GEMINI_API_KEY vem do ambiente ou do .env.local
import fs from 'node:fs';
import path from 'node:path';
if (!process.env.GEMINI_API_KEY && fs.existsSync('.env.local')) {
  for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const i = l.indexOf('='); if (i > 0 && l.startsWith('GEMINI_API_KEY')) process.env.GEMINI_API_KEY = l.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
}
import { promptAnalise, normalizarAnalise, analiseDesatualizada, VERSAO_ANALISE } from '../src/lib/analise-prompt';
import { chamarGemini } from '../src/lib/gemini';

let falhas = 0;
const confere = (nome: string, ok: boolean, extra = '') => { if (!ok) falhas++; console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${extra ? ' — ' + extra : ''}`); };

function semIA() {
  const a = normalizarAnalise({ resumo: ' x ', severidade: 'grave', estimativa_custo: { pecas_min: 160, pecas_max: '80', mao_obra_min: 60, mao_obra_max: 120, horas_min: 2, horas_max: 1, min: 1, max: 2 }, observacoes: ['a', '', null, 'b'], perguntas_sugeridas: ['1', '2', '3', '4', '5', '6'], confianca: 0.9 }, true);
  confere('faixa de pecas invertida e desvirada', a.estimativa_custo?.pecas_min === 80 && a.estimativa_custo?.pecas_max === 160);
  confere('total = pecas + mao de obra', a.estimativa_custo?.min === 140 && a.estimativa_custo?.max === 280, JSON.stringify(a.estimativa_custo));
  confere('horas invertidas desviradas', a.estimativa_custo?.horas_min === 1 && a.estimativa_custo?.horas_max === 2);
  confere('textos vazios saem, max 5 perguntas', a.observacoes.join() === 'a,b' && a.perguntas_sugeridas.length === 5);
  confere('sem foto: confianca no maximo 0.5', a.confianca === 0.5);
  confere('resumo aparado', a.resumo === 'x');
  const z = normalizarAnalise({ resumo: 'r', severidade: 'médio', estimativa_custo: { min: 0, max: 0 } }, false);
  confere('0 - 0 vira sem estimativa', z.estimativa_custo === null);
  confere('severidade fora da lista vira moderado', z.severidade === 'moderado');
  confere('campos faltando viram listas vazias', z.observacoes.length === 0 && z.perguntas_sugeridas.length === 0 && z.confianca === null);
  const s = normalizarAnalise({ resumo: 'r', estimativa_custo: { min: '120 €', max: '200' } }, false);
  confere('so total (texto com moeda) e aceito', s.estimativa_custo?.min === 120 && s.estimativa_custo?.max === 200 && s.estimativa_custo?.pecas_min === null);
  const m = normalizarAnalise({ resumo: 'r', estimativa_custo: { mao_obra_min: 50, mao_obra_max: 90 } }, false);
  confere('so mao de obra vira o total', m.estimativa_custo?.min === 50 && m.estimativa_custo?.max === 90);
  confere('confianca em escala 0-10 / 0-100 vira 0-1', normalizarAnalise({ confianca: 4 }, false).confianca === 0.4 && normalizarAnalise({ confianca: 70 }, false).confianca === 0.7);
  confere('analise antiga (sem versao) = desatualizada', analiseDesatualizada({ raw_response: { perguntas_sugeridas: [] } }) && analiseDesatualizada({ raw_response: null }));
  confere('analise nova nao e desatualizada', !analiseDesatualizada({ raw_response: { versao: VERSAO_ANALISE } }));
}

async function analisa(o: { carro: string; tipo: string; descricao: string; nomeIdioma: string; foto?: string }) {
  const contexto = `Veículo: ${o.carro}. Tipo de serviço: ${o.tipo}. Descrição do cliente: ${o.descricao}.`;
  const partes: any[] = [];
  if (o.foto) partes.push({ inline_data: { mime_type: o.foto.endsWith('.webp') ? 'image/webp' : 'image/jpeg', data: fs.readFileSync(o.foto).toString('base64') } });
  partes.push({ text: promptAnalise({ tipo: o.tipo, contexto, soTexto: !o.foto, mercado: 'Estonia', moeda: 'euros (EUR)', nomeIdioma: o.nomeIdioma }) });
  const inicio = Date.now();
  const res = await chamarGemini([{ modelo: 'gemini-2.5-flash' }, { modelo: 'gemini-3.5-flash-lite' }], {
    contents: [{ parts: partes }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: 'application/json' },
  }, { rotulo: 'teste' });
  if (!res?.ok) throw new Error('Gemini ' + res?.status + ' ' + (await res?.text().catch(() => '')));
  const d = await res.json();
  const txt = (d.candidates?.[0]?.content?.parts || []).find((p: any) => p.text && !p.thought)?.text;
  const a = normalizarAnalise(JSON.parse(txt), !o.foto);
  console.log(`  (${d.modelVersion}, ${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
  return a;
}

// os 3 blocos que o dono pediu + lingua certa
function blocos(nome: string, a: ReturnType<typeof normalizarAnalise>, lingua: 'ru' | 'et', divisao = true) {
  console.log(`\n[${nome}] ` + JSON.stringify(a, null, 1));
  const e = a.estimativa_custo;
  confere(`${nome}: estimativa em faixa (min < max, > 0)`, !!e && e.min > 0 && e.max > e.min, JSON.stringify(e));
  if (divisao) confere(`${nome}: pecas e mao de obra separadas`, !!e && e.pecas_max != null && e.mao_obra_max != null);
  confere(`${nome}: 2-4 observacoes`, a.observacoes.length >= 2 && a.observacoes.length <= 4, String(a.observacoes.length));
  confere(`${nome}: 2-5 perguntas`, a.perguntas_sugeridas.length >= 2 && a.perguntas_sugeridas.length <= 5, String(a.perguntas_sugeridas.length));
  const textos = [a.resumo, ...a.observacoes, ...a.perguntas_sugeridas].join(' ');
  const cirilico = (textos.match(/[а-яё]/gi) || []).length, latino = (textos.match(/[a-zõäöü]/gi) || []).length;
  confere(`${nome}: escrito em ${lingua}`, lingua === 'ru' ? cirilico > latino : cirilico === 0, `${cirilico} cirilicas / ${latino} latinas`);
  confere(`${nome}: resumo curto (<= 2 frases)`, (a.resumo.match(/[.!?](\s|$)/g) || []).length <= 2, a.resumo);
}

// CASOS=ru,et,pid,rev,foto escolhe quais rodar (IA ocupada num caso nao para os outros)
const CASOS = (process.env.CASOS || 'ru,et,pid,rev,foto').split(',');
async function caso(id: string, f: () => Promise<void>) {
  if (!CASOS.includes(id)) return;
  try { await f(); } catch (e) { confere(`${id}: IA respondeu`, false, String((e as Error).message).slice(0, 120)); }
}

async function comIA() {
  await caso('ru', async () => {
  const ru = await analisa({ carro: 'Volkswagen Passat', tipo: 'outro', descricao: 'Здравствуйте нужна замена правого шруса.', nomeIdioma: 'russo' });
  blocos('100140 oficina RU', ru, 'ru');
  confere('100140 RU: fala de ШРУС/привод', /шрус|привод|пыльник/i.test(JSON.stringify(ru)));
  confere('100140 RU: faixa plausivel para Tallinn (total entre 80 e 900 EUR)', !!ru.estimativa_custo && ru.estimativa_custo.min >= 80 && ru.estimativa_custo.max <= 900, JSON.stringify(ru.estimativa_custo));
  });

  await caso('et', async () => {
  const et = await analisa({ carro: 'Volkswagen Passat', tipo: 'outro', descricao: 'Здравствуйте нужна замена правого шруса.', nomeIdioma: 'estoniano' });
  blocos('100140 oficina ET (cliente escreveu em russo)', et, 'et');
  });

  await caso('pid', async () => {
  const pid = await analisa({ carro: 'Toyota Corolla 2015', tipo: 'mecanica', descricao: 'Pidurid kriuksuvad', nomeIdioma: 'estoniano' });
  blocos('pidurid ET', pid, 'et');
  confere('pidurid: fala de freio', /pidur/i.test(JSON.stringify(pid)));
  });

  await caso('rev', async () => {
  // regressao 04/11: revisao nao e dano, severidade leve, sem "nao relacionado"
  const rev = await analisa({ carro: 'Ford Mondeo 2007', tipo: 'revisao', descricao: 'Teenused: Õli- ja filtrivahetus', nomeIdioma: 'russo' });
  console.log('\n[revisao RU] ' + JSON.stringify(rev, null, 1));
  confere('revisao: severidade leve', rev.severidade === 'leve');
  confere('revisao: nao fala de "dano"/"nao relacionado"', !/повреждени|не связан/.test(JSON.stringify(rev).toLowerCase()));
  confere('revisao: estimativa nao zerada', !!rev.estimativa_custo && rev.estimativa_custo.max > 0, JSON.stringify(rev.estimativa_custo));
  confere('revisao: tem perguntas (ex.: oleo/filtros)', rev.perguntas_sugeridas.length >= 2);
  confere('revisao: horas curtas (<= 1.5 h)', (rev.estimativa_custo?.horas_max ?? 0) <= 1.5, JSON.stringify(rev.estimativa_custo));
  });

  await caso('foto', async () => {
  const foto = path.resolve('public/images/motoristas/foto-painel.webp');
  const ft = await analisa({ carro: 'Volkswagen Passat 2016', tipo: 'eletrica', descricao: 'Armatuurlaual põleb oranž tuli', nomeIdioma: 'estoniano', foto });
  // luz no painel: pode ser so diagnostico (sem peca) - a divisao nao e exigida
  blocos('com foto (painel) ET', ft, 'et', false);
  confere('com foto: fala da luz/painel', /tuli|märgutul|armatuur|hoiatus/i.test(JSON.stringify(ft)));
  });
}

async function main() {
  semIA();
  if (!process.env.SEM_IA) {
    if (!process.env.GEMINI_API_KEY) { console.log('sem GEMINI_API_KEY: parte real pulada'); falhas++; }
    else await comIA();
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
