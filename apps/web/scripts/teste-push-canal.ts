// Canal/prioridade do push por tipo de aviso (lib/push-canal.ts), espelho do app (apps/mobile/lib/canal-aviso.ts).
//   npx tsx apps/web/scripts/teste-push-canal.ts
import { canalDoAviso, prioridadeDoCanal, suportaCanaisNovos, entregaDoPush } from '../src/lib/push-canal';

let falhas = 0;
const ok = (nome: string, cond: boolean) => { if (!cond) { falhas++; console.log('FALHA', nome); } else console.log('ok   ', nome); };

// oficina: o que pede acao imediata vai no canal alto
for (const t of ['nova_solicitacao', 'pedido_convite', 'cobranca_admin_solicitacao', 'emergencia', 'orcamento_aceito']) ok(`${t} -> pedidos/high`, canalDoAviso(t) === 'pedidos' && prioridadeDoCanal(canalDoAviso(t)) === 'high');
// motorista
for (const t of ['novo_orcamento', 'revisao_orcamento', 'solicitacao_aceita']) ok(`${t} -> pedidos`, canalDoAviso(t) === 'pedidos');
ok('nova_mensagem -> mensagens/high', canalDoAviso('nova_mensagem') === 'mensagens' && prioridadeDoCanal('mensagens') === 'high');
// o resto nao interrompe
for (const t of ['pedido_novas_datas', 'pedido_fotos', 'data', 'servico_concluido', 'servico_atualizado', 'pedido_expirado', 'nova_avaliacao', 'cotacao_peca_respondida', 'lembrete', 'tipo_desconhecido'])
  ok(`${t} -> avisos/default`, canalDoAviso(t) === 'avisos' && prioridadeDoCanal('avisos') === 'default');

// token sem versao (app 1.0.0) ou mais antigo: tudo como antes - canal 'avisos', alta, sem badge (revisao Fable S1/S5)
for (const v of [null, undefined, '', '1.0.0', '1.0.9', '0.9.0']) ok('versao ' + JSON.stringify(v) + ' nao suporta canais novos', !suportaCanaisNovos(v));
for (const v of ['1.1.0', '1.1.1', '1.2.0', '2.0.0', '10.0.0']) ok('versao ' + v + ' suporta', suportaCanaisNovos(v));
for (const t of ['nova_solicitacao', 'nova_mensagem', 'novo_orcamento', 'servico_concluido', 'pedido_novas_datas'])
  ok('1.0.0: ' + t + ' -> avisos/high sem badge', JSON.stringify(entregaDoPush(t, null, 5)) === JSON.stringify({ channelId: 'avisos', priority: 'high' }));
ok('1.1.0: nova_solicitacao -> pedidos/high badge 5', JSON.stringify(entregaDoPush('nova_solicitacao', '1.1.0', 5)) === JSON.stringify({ channelId: 'pedidos', priority: 'high', badge: 5 }));
ok('1.1.0: servico_concluido -> avisos/default badge 1', JSON.stringify(entregaDoPush('servico_concluido', '1.1.0', 0)) === JSON.stringify({ channelId: 'avisos', priority: 'default', badge: 1 }));

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
