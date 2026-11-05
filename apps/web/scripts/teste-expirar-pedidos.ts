// Teste da expiracao de pedidos (migracao 072) contra o banco LOCAL: regra pura
// venceu(), a tarefa expirarPedidos() com datas reais no banco, os avisos no sino
// (cliente + oficinas que orcaram) e reabrir_pedido() executado COMO o cliente
// (papel authenticated com o id dele) e como outra pessoa. Desfaz tudo no fim.
//
//   npx tsx scripts/teste-expirar-pedidos.ts   (usa Documentos/_teste_local/site/apps/web/.env.local)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ENV = '../../Documentos/_teste_local/site/apps/web/.env.local';
for (const l of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
  const i = l.indexOf('='); if (i < 1 || l.startsWith('#')) continue;
  process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, '');
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '')) { console.error('banco nao e o local - parado'); process.exit(1); }

let falhas = 0;
const confere = (nome: string, obtido: unknown, esperado: unknown) => {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado); if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}: ${JSON.stringify(obtido)}${ok ? '' : ` (esperado ${JSON.stringify(esperado)})`}`);
};
// SQL como um usuario logado (o mesmo que o site faz com o login do cliente)
const comoUsuario = (uid: string, sql: string) => {
  try {
    return execFileSync('docker', ['exec', '-i', 'supabase_db_bipfix-teste', 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], {
      input: `begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); ${sql}; commit;`, encoding: 'utf8',
    }).split('\n').map((l) => l.trim()).filter((l) => l && !/^(BEGIN|COMMIT|SET|ROLLBACK)$/.test(l) && !l.includes('"sub"')).pop();
  } catch (e: any) { return 'ERRO: ' + String(e.stderr || e.message).match(/ERROR:\s*(\S+)/)?.[1]; }
};

async function main() {
  const { venceu } = await import('../src/lib/expirar-pedidos');
  const agora = Date.parse('2026-12-10T12:00:00Z');
  const dia = 86400000; const iso = (ms: number) => new Date(ms).toISOString();
  // regra pura
  confere('aberto ha 30 dias -> vence', venceu({ status: 'aberta', created_at: iso(agora - 30 * dia), reaberta_em: null }, 30, agora), true);
  confere('aberto ha 29 dias e 23 h -> nao', venceu({ status: 'aberta', created_at: iso(agora - 30 * dia + 3600000), reaberta_em: null }, 30, agora), false);
  confere('em_orcamento ha 45 dias -> vence', venceu({ status: 'em_orcamento', created_at: iso(agora - 45 * dia), reaberta_em: null }, 30, agora), true);
  confere('criado ha 60, reaberto ha 10 -> nao', venceu({ status: 'aberta', created_at: iso(agora - 60 * dia), reaberta_em: iso(agora - 10 * dia) }, 30, agora), false);
  confere('reaberto ha 31 -> vence', venceu({ status: 'aberta', created_at: iso(agora - 90 * dia), reaberta_em: iso(agora - 31 * dia) }, 30, agora), true);
  for (const st of ['aceita', 'em_andamento', 'concluida', 'cancelada', 'no_show', 'expirada']) confere(`${st} antigo -> nao`, venceu({ status: st, created_at: iso(agora - 99 * dia), reaberta_em: null }, 30, agora), false);
  confere('data invalida -> nao', venceu({ status: 'aberta', created_at: 'lixo', reaberta_em: null }, 30, agora), false);

  // banco
  const { supabaseAdmin: db } = await import('../src/lib/supabase-admin');
  const { expirarPedidos } = await import('../src/lib/expirar-pedidos');
  const { data: sols } = await db.from('solicitacoes').select('id, numero, status, created_at, reaberta_em, expirada_em, cliente_id, orcamentos(id, status, oficina_id)').in('status', ['aberta', 'em_orcamento']).order('created_at');
  const comOrc = (sols || []).find((s: any) => s.orcamentos?.some((o: any) => ['enviado', 'visualizado'].includes(o.status)));
  const outros = (sols || []).filter((s: any) => s.id !== comOrc?.id);
  if (!comOrc || outros.length < 2) { console.error('faltam pedidos abertos de teste no banco local'); process.exit(1); }
  const novo = outros[0], reaberto = outros[1];
  const guardados = [comOrc, novo, reaberto].map((s: any) => ({ id: s.id, status: s.status, created_at: s.created_at, reaberta_em: s.reaberta_em, expirada_em: s.expirada_em }));
  const inicio = new Date().toISOString();
  const agoraReal = Date.now();
  try {
    await db.from('solicitacoes').update({ created_at: iso(agoraReal - 31 * dia), reaberta_em: null }).eq('id', comOrc.id);
    await db.from('solicitacoes').update({ created_at: iso(agoraReal - 5 * dia), reaberta_em: null }).eq('id', novo.id);
    await db.from('solicitacoes').update({ created_at: iso(agoraReal - 60 * dia), reaberta_em: iso(agoraReal - 10 * dia) }).eq('id', reaberto.id);

    const r = await expirarPedidos(agoraReal);
    const st = async (id: string) => (await db.from('solicitacoes').select('status, expirada_em').eq('id', id).single()).data;
    const a = await st(comOrc.id);
    confere('31 dias com orcamento -> expirada', a?.status, 'expirada');
    confere('expirada_em preenchido', !!a?.expirada_em, true);
    confere('5 dias -> continua aberto', (await st(novo.id))?.status, novo.status);
    confere('reaberto ha 10 dias -> continua aberto', (await st(reaberto.id))?.status, reaberto.status);
    confere('tarefa conta pelo menos 1 expirado', r.expirados >= 1, true);
    const { data: orcsDepois } = await db.from('orcamentos').select('status').eq('solicitacao_id', comOrc.id);
    confere('orcamentos nao mudaram', (orcsDepois || []).map((o: any) => o.status).sort(), (comOrc as any).orcamentos.map((o: any) => o.status).sort());
    const { data: avisos } = await db.from('notificacoes').select('profile_id, titulo').eq('tipo', 'pedido_expirado').gte('created_at', inicio).eq('dados->>solicitacao_id', comOrc.id);
    confere('aviso ao cliente', (avisos || []).some((n: any) => n.profile_id === comOrc.cliente_id), true);
    const oficinasComOrc = new Set((comOrc as any).orcamentos.filter((o: any) => ['enviado', 'visualizado'].includes(o.status)).map((o: any) => o.oficina_id));
    confere('aviso a cada oficina que orcou', (avisos || []).length, 1 + oficinasComOrc.size);
    confere('titulo com o numero do pedido', (avisos || []).every((n: any) => n.titulo.includes(String(comOrc.numero))), true);

    // rodar de novo nao repete nada
    const r2 = await expirarPedidos(agoraReal);
    confere('2a execucao: nada novo para este pedido', (await db.from('notificacoes').select('id', { count: 'exact', head: true }).eq('tipo', 'pedido_expirado').gte('created_at', inicio).eq('dados->>solicitacao_id', comOrc.id)).count, (avisos || []).length);
    confere('2a execucao nao expira os outros', r2.expirados, 0);

    // oficina nao muda o orcamento de pedido expirado (so depois de reaberto)
    const orcVivo = (comOrc as any).orcamentos.find((o: any) => ['enviado', 'visualizado'].includes(o.status));
    const { data: ofProf } = await db.from('oficinas').select('profile_id').eq('id', orcVivo.oficina_id).single();
    const mudaOrc = `update orcamentos set observacoes = coalesce(observacoes, '') where id='${orcVivo.id}'`;
    confere('oficina muda orcamento de pedido expirado -> recusado', comoUsuario(ofProf!.profile_id, mudaOrc), 'ERRO: SERVICO_ENCERRADO');
    // oficina nao ve mais o pedido na lista "para responder" (status fora de aberta/em_orcamento)
    // reabrir: outra pessoa nao consegue; o cliente consegue
    confere('reabrir por outra pessoa -> recusado', comoUsuario('00000000-0000-0000-0000-000000000001', `select reabrir_pedido('${comOrc.id}')`), 'ERRO: PEDIDO_NAO_REABRIVEL');
    confere('reabrir pelo cliente -> em_orcamento (tem orcamento)', comoUsuario(comOrc.cliente_id, `select reabrir_pedido('${comOrc.id}')`), 'em_orcamento');
    const depois = (await db.from('solicitacoes').select('status, reaberta_em, expirada_em').eq('id', comOrc.id).single()).data;
    confere('reaberto: status, reaberta_em e expirada_em limpo', [depois?.status, !!depois?.reaberta_em, depois?.expirada_em], ['em_orcamento', true, null]);
    confere('depois de reaberto a oficina muda o orcamento de novo', comoUsuario(ofProf!.profile_id, mudaOrc), 'UPDATE 1');
    confere('reabrir de novo (ja aberto) -> recusado', comoUsuario(comOrc.cliente_id, `select reabrir_pedido('${comOrc.id}')`), 'ERRO: PEDIDO_NAO_REABRIVEL');
    const r3 = await expirarPedidos(agoraReal);
    confere('depois de reaberto o prazo recomeca (nao expira de novo)', (await st(comOrc.id))?.status, 'em_orcamento');
    void r3;
    // sem orcamento valido reabre como "aberta"
    await db.from('solicitacoes').update({ status: 'expirada' }).eq('id', novo.id);
    confere('reabrir sem orcamento -> aberta', comoUsuario(novo.cliente_id, `select reabrir_pedido('${novo.id}')`), (novo as any).orcamentos?.some((o: any) => ['enviado', 'visualizado'].includes(o.status)) ? 'em_orcamento' : 'aberta');
    // cliente nao tira o pedido de "expirada" mudando o status direto (so pela funcao)
    await db.from('solicitacoes').update({ status: 'expirada' }).eq('id', novo.id);
    const tentativa = comoUsuario(novo.cliente_id, `update solicitacoes set status='aberta' where id='${novo.id}'`);
    const ficou = (await db.from('solicitacoes').select('status').eq('id', novo.id).single()).data?.status;
    confere('cliente muda status direto expirada->aberta -> nao muda', [ficou, /ERRO|UPDATE 0/.test(String(tentativa))], ['expirada', true]);
    // cliente ainda pode cancelar o proprio pedido aberto (regra antiga intacta)
    await db.from('solicitacoes').update({ status: 'aberta' }).eq('id', novo.id);
    confere('cliente cancela pedido aberto (regra 045 intacta)', comoUsuario(novo.cliente_id, `update solicitacoes set status='cancelada' where id='${novo.id}'`), 'UPDATE 1');
    // anonimo nao executa
    try {
      execFileSync('docker', ['exec', '-i', 'supabase_db_bipfix-teste', 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { input: `begin; set local role anon; select reabrir_pedido('${novo.id}'); commit;`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      confere('anonimo nao executa reabrir_pedido', 'executou', 'permission denied');
    } catch (e: any) { confere('anonimo nao executa reabrir_pedido', /permission denied/.test(String(e.stderr)) ? 'permission denied' : String(e.stderr).slice(0, 80), 'permission denied'); }
  } finally {
    for (const g of guardados) await db.from('solicitacoes').update({ status: g.status, created_at: g.created_at, reaberta_em: g.reaberta_em, expirada_em: g.expirada_em }).eq('id', g.id);
    await db.from('notificacoes').delete().eq('tipo', 'pedido_expirado').gte('created_at', inicio);
    console.log('(banco local restaurado)');
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
  process.exit(falhas ? 1 : 0);
}
main();
