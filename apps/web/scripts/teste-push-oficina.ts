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
await supabaseAdmin.from('push_tokens').insert({ profile_id: of.profile_id, token, plataforma: 'android' });
const { data: sol } = await supabaseAdmin.from('solicitacoes').select('id').limit(1).maybeSingle();
const solId = sol?.id || '00000000-0000-0000-0000-000000000001';

async function aviso(tipo: string, dados: Record<string, unknown>) {
  const { data } = await supabaseAdmin.from('notificacoes').insert({ profile_id: of!.profile_id, tipo, titulo: `t ${tipo}`, mensagem: 'm', dados }).select('id').single();
  const antes = recebidos.length;
  const r = await enviarPushDoAviso(data!.id);
  return { r, msg: recebidos[antes], id: data!.id };
}

const a = await aviso('nova_solicitacao', { solicitacao_id: solId });
ok('nova_solicitacao: 1 enviado', a.r.enviados === 1, a.r);
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

// lido: o badge nao conta
await supabaseAdmin.from('notificacoes').update({ lida: true }).eq('profile_id', of.profile_id);
const d = await aviso('orcamento_aceito', { solicitacao_id: solId, orcamento_id: 'o' });
ok('orcamento_aceito: canal pedidos; badge volta a 1 (so o novo)', d.msg?.channelId === 'pedidos' && d.msg?.badge === 1, d.msg?.badge);

// limpeza
await supabaseAdmin.from('push_tokens').delete().eq('token', token);
await supabaseAdmin.from('notificacoes').delete().in('id', [a.id, b.id, c.id, d.id]);
servidor.close();
console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
