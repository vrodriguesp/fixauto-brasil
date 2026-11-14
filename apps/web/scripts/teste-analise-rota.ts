// Teste da ROTA /api/analisar-dano (cache, versao, pedido que mudou, IA fora do
// ar, lingua, sem nada para analisar) no banco LOCAL, chamando o handler direto
// (sem subir o site) e com o Gemini SIMULADO - nao gasta cota.
//   cd apps/web && npx tsx scripts/teste-analise-rota.ts    (le .env.local; so banco local)
import fs from 'node:fs';
import crypto from 'node:crypto';
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = l.indexOf('='); if (i > 0 && !l.startsWith('#')) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, '');
}
if (!/localhost|127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('so no banco local');
process.env.GEMINI_API_KEY = 'simulada';

import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

let falhas = 0;
const confere = (nome: string, ok: boolean, extra = '') => { if (!ok) falhas++; console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${extra ? ' — ' + String(extra).slice(0, 200) : ''}`); };

// Gemini simulado: cada chamada consome uma resposta da fila e guarda o pedido
const fetchReal = globalThis.fetch;
let fila: (() => Response)[] = [];
const pedidosIA: any[] = [];
const ok200 = (obj: unknown, cru?: string) => () => new Response(JSON.stringify({ modelVersion: 'simulado', candidates: [{ content: { parts: [{ text: cru ?? JSON.stringify(obj) }] } }] }), { status: 200 });
const ocupado = () => new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 });
globalThis.fetch = (async (url: any, init?: any) => {
  if (String(url).includes('generativelanguage.googleapis.com')) {
    pedidosIA.push(JSON.parse(init.body));
    const r = fila.shift();
    return r ? r() : ocupado();
  }
  return fetchReal(url, init);
}) as typeof fetch;

const RESPOSTA = {
  resumo: 'Parema veovõlli liigendi vahetus.', severidade: 'moderado',
  estimativa_custo: { pecas_min: 70, pecas_max: 250, mao_obra_min: 90, mao_obra_max: 225, horas_min: 2, horas_max: 3, min: 1, max: 2 },
  observacoes: ['Kontrollida mansetti.', 'Kontrollida rattalaagrit.'], perguntas_sugeridas: ['Mis aasta ja mootor?', 'Originaal või analoog?'],
  pecas_afetadas: ['Veovõlli liigend'], checklist_inspecao: ['Lõtk'], confianca: 0.9,
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tag = crypto.randomBytes(3).toString('hex');
const contas: string[] = []; const sols: string[] = []; let ofId: string | null = null;

async function conta(tipo: string, idioma: string | null) {
  const email = `ia-${tipo}${contas.length}-${tag}@example.test`; const senha = `Ia${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user!.id);
  // idioma null = coluna no padrao do banco ('pt' - como toda oficina que nunca trocou a lingua)
  const { error } = await sb.from('profiles').insert({ id: data.user!.id, tipo, nome: `TESTE IA ${tipo}`, email, ...(idioma ? { idioma } : {}) });
  if (error) throw error;
  const a = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: s } = await a.auth.signInWithPassword({ email, password: senha });
  return { id: data.user!.id, token: s.session!.access_token };
}

async function main() {
  const { POST } = await import('../src/app/api/analisar-dano/route');
  const chama = async (token: string, corpo: Record<string, unknown>) => {
    const r = await POST(new NextRequest('http://localhost/api/analisar-dano', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }));
    return { status: r.status, d: await r.json().catch(() => ({})) as any };
  };
  try {
    const cli = await conta('cliente', 'ru');
    const ofi = await conta('oficina', null); // perfil no padrao 'pt': antes a analise saia em portugues do Brasil para oficina de Tallinn
    const outro = await conta('cliente', 'et');
    const { data: of, error: eOf } = await sb.from('oficinas').insert({ profile_id: ofi.id, nome_fantasia: `IA SHOP ${tag}`, endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: 59.43, longitude: 24.75, ativa: true, raio_atendimento_km: 50 }).select('id').single();
    if (eOf) throw eOf;
    ofId = of!.id;
    const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Volkswagen', fipe_modelo: 'Passat', fipe_ano: '', placa: `IA${tag}` }).select('id').single();
    const novo = async (tipo: string, descricao: string) => {
      const { data: s, error } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v!.id, tipo, descricao, urgencia: 'media', latitude: 59.40, longitude: 24.68, endereco: 'Mustamäe, Tallinn', pais: 'EE' }).select('id').single();
      if (error) throw error;
      sols.push(s!.id); return s!.id as string;
    };

    // 1) so texto (100140), oficina com tela em estoniano
    const s1 = await novo('outro', 'Здравствуйте нужна замена правого шруса.');
    fila = [ok200(RESPOSTA)];
    let r = await chama(ofi.token, { solicitacao_id: s1, idioma: 'et' });
    const p1 = pedidosIA.at(-1);
    const texto1 = p1?.contents?.[0]?.parts?.at(-1)?.text || '';
    confere('1 sem foto: analisa (200)', r.status === 200 && !!r.d.analise, `${r.status} ${JSON.stringify(r.d).slice(0, 150)}`);
    confere('1 so texto, sem imagem no pedido a IA', p1?.contents?.[0]?.parts?.length === 1);
    confere('1 perfil no padrao pt + tela em estoniano: texto pede estoniano', /em estoniano/.test(texto1));
    confere('1 texto tem o carro e a descricao em russo', texto1.includes('Volkswagen Passat') && texto1.includes('шруса'));
    confere('1 texto pede estimativa, observacoes e perguntas', /estimativa_custo/.test(texto1) && /observacoes/.test(texto1) && /perguntas_sugeridas/.test(texto1));
    const a1 = r.d.analise;
    confere('1 total = pecas + mao de obra (160 - 475)', a1?.estimativa_custo?.min === 160 && a1?.estimativa_custo?.max === 475, JSON.stringify(a1?.estimativa_custo));
    confere('1 observacoes e perguntas guardadas', a1?.raw_response?.observacoes?.length === 2 && a1?.raw_response?.perguntas_sugeridas?.length === 2);
    confere('1 versao 2 + entrada guardadas', a1?.raw_response?.versao === 2 && /^[0-9a-f]{16}$/.test(a1?.raw_response?.entrada || ''));
    confere('1 sem foto: confianca no maximo 0.5', Number(a1?.confianca) <= 0.5, a1?.confianca);

    // 2) abrir de novo: cache, sem chamar a IA
    const n2 = pedidosIA.length;
    r = await chama(ofi.token, { solicitacao_id: s1, idioma: 'et' });
    confere('2 segunda abertura usa a guardada (sem IA)', r.status === 200 && pedidosIA.length === n2 && r.d.analise?.id === a1?.id && !r.d.desatualizada);

    // 3) cliente editou o texto: refaz
    await sb.from('solicitacoes').update({ descricao: 'Нужна замена правого шруса, щелкает при повороте.' }).eq('id', s1);
    fila = [ok200({ ...RESPOSTA, resumo: 'Uus kirjeldus.' })];
    r = await chama(ofi.token, { solicitacao_id: s1, idioma: 'et' });
    confere('3 pedido editado: analise refeita', r.status === 200 && r.d.analise?.resumo === 'Uus kirjeldus.' && pedidosIA.length === n2 + 1);
    const { count } = await sb.from('analise_dano').select('id', { count: 'exact', head: true }).eq('solicitacao_id', s1);
    confere('3 continua uma linha por pedido', count === 1, String(count));

    // 4) analise antiga (antes de 14/11) + IA ocupada: mostra a antiga, sem erro
    const s4 = await novo('mecanica', 'Pidurid kriuksuvad');
    await sb.from('analise_dano').insert({ solicitacao_id: s4, resumo: 'Vana analüüs', severidade: 'moderado', checklist_inspecao: [], pecas_afetadas: [], estimativa_custo: { min: 100, max: 200 }, raw_response: { perguntas_sugeridas: ['?'] } });
    fila = []; // so 503
    r = await chama(ofi.token, { solicitacao_id: s4, idioma: 'et' });
    confere('4 IA ocupada com analise antiga: 200 com a antiga + desatualizada', r.status === 200 && r.d.analise?.resumo === 'Vana analüüs' && r.d.desatualizada === true, `${r.status} ${JSON.stringify(r.d).slice(0, 120)}`);
    // ... e quando a IA volta, a antiga vira versao 2
    fila = [ok200(RESPOSTA)];
    r = await chama(ofi.token, { solicitacao_id: s4, idioma: 'et' });
    confere('4 IA de volta: antiga refeita no formato novo', r.d.analise?.raw_response?.versao === 2 && r.d.analise?.raw_response?.observacoes?.length === 2);

    // 5) revisao sem descricao e sem foto; sem lingua no corpo (app/versao antiga): lingua do perfil
    const s5 = await novo('revisao', '');
    fila = [ok200(RESPOSTA)];
    r = await chama(ofi.token, { solicitacao_id: s5 });
    const texto5 = pedidosIA.at(-1)?.contents?.[0]?.parts?.at(-1)?.text || '';
    confere('5 revisao sem descricao e sem foto: analisa pelo tipo + carro', r.status === 200 && !!r.d.analise);
    confere('5 sem lingua no corpo: usa a do perfil (pt)', /em portugues do Brasil/.test(texto5));

    // 6) 'outro' sem descricao e sem foto: nada para analisar
    const s6 = await novo('outro', '');
    const n6 = pedidosIA.length;
    r = await chama(ofi.token, { solicitacao_id: s6, idioma: 'et' });
    confere('6 outro sem nada: 404 SEM_FOTOS sem chamar a IA', r.status === 404 && r.d.codigo === 'SEM_FOTOS' && pedidosIA.length === n6);

    // 7) resposta cortada: guarda o que deu, sem a versao atual -> refaz depois
    const s7 = await novo('mecanica', 'Mootor müriseb');
    fila = [ok200(null, '{"resumo":"Lõigatud vastus","severidade":"grave","observacoes":["a","b"')];
    r = await chama(ofi.token, { solicitacao_id: s7, idioma: 'et' });
    confere('7 resposta cortada: mostra o que veio', r.status === 200 && r.d.analise?.resumo === 'Lõigatud vastus' && r.d.analise?.severidade === 'grave');
    confere('7 ... sem versao atual (sera refeita)', r.d.analise?.raw_response?.versao === 1);

    // 8) quem nao pode ver o pedido
    r = await chama(outro.token, { solicitacao_id: s1 });
    confere('8 outro cliente: 403', r.status === 403);

    // 9) o cliente russo (perfil ru), lingua da tela ru
    const s9 = await novo('mecanica', 'Стучит подвеска');
    fila = [ok200(RESPOSTA)];
    await chama(cli.token, { solicitacao_id: s9, idioma: 'ru' });
    confere('9 tela em russo: texto pede russo', /em russo/.test(pedidosIA.at(-1)?.contents?.[0]?.parts?.at(-1)?.text || ''));
  } finally {
    for (const sid of sols) { await sb.from('analise_dano').delete().eq('solicitacao_id', sid); await sb.from('solicitacoes').delete().eq('id', sid); }
    for (const id of contas) await sb.from('veiculos').delete().eq('profile_id', id);
    if (ofId) await sb.from('oficinas').delete().eq('id', ofId);
    for (const id of contas) { await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
