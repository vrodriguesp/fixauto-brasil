// Canal/prioridade do push por tipo de aviso (lib/push-canal.ts), espelho do app (apps/mobile/lib/canal-aviso.ts).
//   npx tsx apps/web/scripts/teste-push-canal.ts
import { canalDoAviso, prioridadeDoCanal } from '../src/lib/push-canal';

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

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
