// Push da oficina (27/11) de ponta a ponta no banco LOCAL com um servidor FALSO da Expo (nada sai de verdade):
// token do aparelho da oficina -> aviso nova_solicitacao / nova_mensagem / pedido_novas_datas -> enviarPushDoAviso
// -> confere canal, prioridade, badge e os dados que o app usa para abrir a tela (lib/destino-aviso).
//   cd apps/web && npx tsx scripts/teste-push-oficina.ts        (le .env.local; recusa banco que nao seja local)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

for (const linha of fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(linha); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
if (!/localhost|127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '')) { console.error('banco nao e local - abortado'); process.exit(2); }

const recebidos: any[] = [];
async function main() {
const servidor = http.createServer((req, res) => {
  let corpo = ''; req.on('data', (c) => { corpo += c; });
  req.on('end', () => { const lote = JSON.parse(corpo); recebidos.push(...lote); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: lote.map(() => ({ status: 'ok' })) })); });
});
await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', () => r()));
process.env.EXPO_PUSH_URL = `http://127.0.0.1:${(servidor.address() as any).port}/push`;

const { supabaseAdmin } = await import('../src/lib/supabase-admin');
const { enviarPushDoAviso } = await import('../src/lib/push');

let falhas = 0;
const ok = (nome: string, cond: boolean, extra?: unknown) => { if (!cond) { falhas++; console.log('FALHA', nome, extra ?? ''); } else console.log('ok   ', nome); };

const { data: of } = await supabaseAdmin.from('oficinas').select('id, profile_id').eq('nome_fantasia', 'Kesklinna Autoteenindus (TEST)').maybeSingle();
if (!of) { console.error('oficina de teste nao existe (node ferramentas/semear.mjs)'); process.exit(2); }
const token = `ExponentPushToken[teste-oficina-${Date.now()}]`;
const tokenAntigo = `ExponentPushToken[teste-antigo-${Date.now()}]`;
// um aparelho 1.1.0 (migracao 118) e um 1.0.0 (sem versao): o antigo recebe como sempre
await supabaseAdmin.from('push_tokens').insert([{ profile_id: of.profile_id, token, plataforma: 'android', versao_app: '1.1.0' }, { profile_id: of.profile_id, token: tokenAntigo, plataforma: 'android' }]);
const { data: sol } = await supabaseAdmin.from('solicitacoes').select('id').limit(1).maybeSingle();
const solId = sol?.id || '00000000-0000-0000-0000-000000000001';

async function aviso(tipo: string, dados: Record<string, unknown>) {
  const { data } = await supabaseAdmin.from('notificacoes').insert({ profile_id: of!.profile_id, tipo, titulo: `t ${tipo}`, mensagem: 'm', dados }).select('id').single();
  const antes = recebidos.length;
  const r = await enviarPushDoAviso(data!.id);
  const novos = recebidos.slice(antes);
  return { r, msg: novos.find((m) => m.to === token), antigo: novos.find((m) => m.to === tokenAntigo), id: data!.id };
}

const a = await aviso('nova_solicitacao', { solicitacao_id: solId });
ok('nova_solicitacao: 2 enviados (1.1.0 e 1.0.0)', a.r.enviados === 2, a.r);
ok('app 1.0.0: canal avisos, alta, SEM badge (revisao S1/S5)', a.antigo?.channelId === 'avisos' && a.antigo?.priority === 'high' && a.antigo?.badge === undefined && a.antigo?.data?.tipo === 'nova_solicitacao', a.antigo);
ok('nova_solicitacao: canal pedidos, prioridade alta, som', a.msg?.channelId === 'pedidos' && a.msg?.priority === 'high' && a.msg?.sound === 'default', a.msg);
ok('nova_solicitacao: dados para o app (tipo, solicitacao_id, notificacao_id)', a.msg?.data?.tipo === 'nova_solicitacao' && a.msg?.data?.solicitacao_id === solId && a.msg?.data?.notificacao_id === a.id);
ok('badge >= 1', typeof a.msg?.badge === 'number' && a.msg.badge >= 1, a.msg?.badge);
const badgeAntes = a.msg?.badge;

const b = await aviso('nova_mensagem', { solicitacao_id: solId, oficina_id: of.id, pagador_id: 'p' });
ok('nova_mensagem: canal mensagens, alta', b.msg?.channelId === 'mensagens' && b.msg?.priority === 'high', b.msg);
ok('nova_mensagem: oficina_id e pagador_id seguem nos dados', b.msg?.data?.oficina_id === of.id && b.msg?.data?.pagador_id === 'p');
ok('badge cresce com o 2o aviso nao lido', b.msg?.badge === badgeAntes + 1, [badgeAntes, b.msg?.badge]);

const c = await aviso('pedido_novas_datas', { solicitacao_id: solId });
ok('pedido_novas_datas: canal avisos, prioridade normal', c.msg?.channelId === 'avisos' && c.msg?.priority === 'default', c.msg);
ok('app 1.0.0: pedido_novas_datas segue alta, sem badge', c.antigo?.channelId === 'avisos' && c.antigo?.priority === 'high' && c.antigo?.badge === undefined, c.antigo);

// lido: o badge nao conta
await supabaseAdmin.from('notificacoes').update({ lida: true }).eq('profile_id', of.profile_id);
const d = await aviso('orcamento_aceito', { solicitacao_id: solId, orcamento_id: 'o' });
ok('orcamento_aceito: canal pedidos; badge volta a 1 (so o novo)', d.msg?.channelId === 'pedidos' && d.msg?.badge === 1, d.msg?.badge);

// revisao do orcamento feita no app (S3): aviso "revisado" ao motorista + resumo no chat + push
const { avisarRevisaoOrcamento } = await import('../src/lib/avisar-revisao-orcamento');
const { data: orc } = await supabaseAdmin.from('orcamentos').select('id, solicitacao_id, solicitacao:solicitacoes(cliente_id)').eq('oficina_id', of.id).neq('status', 'aceito').order('created_at', { ascending: false }).limit(1).maybeSingle();
if (orc) {
  const clienteId = (orc as any).solicitacao.cliente_id as string;
  const tokenCliente = 'ExponentPushToken[teste-cliente-' + Date.now() + ']';
  await supabaseAdmin.from('push_tokens').insert({ profile_id: clienteId, token: tokenCliente, plataforma: 'ios', versao_app: '1.1.0' });
  const { count: msgsAntes } = await supabaseAdmin.from('mensagens').select('id', { count: 'exact', head: true }).eq('solicitacao_id', orc.solicitacao_id).eq('oficina_id', of.id);
  const negado = await avisarRevisaoOrcamento(orc.id, '00000000-0000-0000-0000-000000000000', false);
  ok('revisao: outra conta nao avisa (403)', !negado.ok && negado.status === 403);
  const r1 = await avisarRevisaoOrcamento(orc.id, of.profile_id, false);
  ok('revisao: aviso criado', r1.ok, r1);
  if (r1.ok) {
    const { data: av } = await supabaseAdmin.from('notificacoes').select('tipo, profile_id, dados, titulo').eq('id', r1.avisoId).single();
    ok('revisao: novo_orcamento para o motorista com orcamento_id, revisao e textos nas 6 linguas', av?.tipo === 'novo_orcamento' && av?.profile_id === clienteId && (av?.dados as any)?.orcamento_id === orc.id && (av?.dados as any)?.revisao === true && !!(av?.dados as any)?.textos?.et, av);
    const { count: msgsDepois } = await supabaseAdmin.from('mensagens').select('id', { count: 'exact', head: true }).eq('solicitacao_id', orc.solicitacao_id).eq('oficina_id', of.id);
    ok('revisao: resumo no chat', (msgsDepois || 0) === (msgsAntes || 0) + 1, [msgsAntes, msgsDepois]);
    const antes = recebidos.length;
    const p = await enviarPushDoAviso(r1.avisoId);
    const m = recebidos.slice(antes).find((x) => x.to === tokenCliente);
    ok('revisao: push ao motorista no canal pedidos com os dados do pedido', p.enviados === 1 && m?.channelId === 'pedidos' && m?.data?.solicitacao_id === orc.solicitacao_id, m);
    await supabaseAdmin.from('notificacoes').delete().eq('id', r1.avisoId);
    await supabaseAdmin.from('mensagens').delete().eq('solicitacao_id', orc.solicitacao_id).eq('oficina_id', of.id).gt('created_at', new Date(Date.now() - 20000).toISOString()).like('texto', '%📋%');
  }
  // mesma revisao de novo (nada mudou): nao repete sino nem chat (A3-c)
  const rRep1 = await avisarRevisaoOrcamento(orc.id, of.profile_id, false);
  const { count: msgsRep } = await supabaseAdmin.from('mensagens').select('id', { count: 'exact', head: true }).eq('solicitacao_id', orc.solicitacao_id).eq('oficina_id', of.id);
  const rRep2 = await avisarRevisaoOrcamento(orc.id, of.profile_id, false);
  const { count: msgsRep2 } = await supabaseAdmin.from('mensagens').select('id', { count: 'exact', head: true }).eq('solicitacao_id', orc.solicitacao_id).eq('oficina_id', of.id);
  ok('revisao repetida sem mudanca: semMudanca, mesmo aviso, sem mensagem nova', rRep1.ok && rRep2.ok && (rRep2 as any).semMudanca === true && (rRep2 as any).avisoId === (rRep1 as any).avisoId && msgsRep === msgsRep2, [rRep1, rRep2, msgsRep, msgsRep2]);
  if (rRep1.ok) { await supabaseAdmin.from('notificacoes').delete().eq('id', rRep1.avisoId); await supabaseAdmin.from('mensagens').delete().eq('solicitacao_id', orc.solicitacao_id).eq('oficina_id', of.id).gt('created_at', new Date(Date.now() - 20000).toISOString()).like('texto', '%📋%'); }
  // pedido fechado para esta oficina (aceito por outra / cancelado): 409, nada avisado (M13, caso 284)
  const { data: solAntes } = await supabaseAdmin.from('solicitacoes').select('status').eq('id', orc.solicitacao_id).single();
  await supabaseAdmin.from('solicitacoes').update({ status: 'cancelada' }).eq('id', orc.solicitacao_id);
  const rFechado = await avisarRevisaoOrcamento(orc.id, of.profile_id, true);
  await supabaseAdmin.from('solicitacoes').update({ status: solAntes!.status }).eq('id', orc.solicitacao_id);
  ok('pedido cancelado: 409 SERVICO_ENCERRADO', !rFechado.ok && rFechado.status === 409 && (rFechado as any).codigo === 'SERVICO_ENCERRADO', rFechado);
  const r2 = await avisarRevisaoOrcamento(orc.id, of.profile_id, true);
  const d2 = r2.ok ? (await supabaseAdmin.from('notificacoes').select('dados').eq('id', r2.avisoId).single()).data : null;
  ok('novo depois de recusado: aviso "novo", sem revisao', r2.ok && (d2?.dados as any)?.revisao === false, d2);
  if (r2.ok) await supabaseAdmin.from('notificacoes').delete().eq('id', r2.avisoId);
  await supabaseAdmin.from('push_tokens').delete().eq('token', tokenCliente);
} else ok('revisao: ha um orcamento da oficina de teste para testar', false);

// limpeza
await supabaseAdmin.from('push_tokens').delete().in('token', [token, tokenAntigo]);
await supabaseAdmin.from('notificacoes').delete().in('id', [a.id, b.id, c.id, d.id]);
servidor.close();
console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
