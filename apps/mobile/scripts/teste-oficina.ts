// App da oficina (27/11): regras puras sem aparelho - destino do aviso por papel, canal do push, caixa de
// pedidos (espelho do site), validacao e gravacao do orcamento, helpers de turnos portados do site.
//   cd apps/web && npx tsx ../mobile/scripts/teste-oficina.ts      (tsx resolve o @fixauto/shared em TS)
import { destinoDoAviso } from '../lib/destino-aviso';
import { canalDoAviso, prioridadeDoCanal } from '../lib/canal-aviso';
import { oficinaVePedido, paraResponder, agruparPedidos, corDaEspera, partesDaEspera, type PedidoCaixa, type OficinaCaixa } from '../lib/caixa-pedidos';
import { validarOrcamento, validadeMinima, itensParaGravar, slotsParaGravar, observacoesComComissao, percentualComissao } from '../lib/orcamento-form';
import { conflitoHorario, erroValidade, validadeSugerida, somarDias, maiorData } from '../lib/turnos';
import { destinoDoLinkCurto } from '../lib/link-curto';

let falhas = 0;
const ok = (nome: string, cond: boolean, extra?: unknown) => { if (!cond) { falhas++; console.log('FALHA', nome, extra ?? ''); } else console.log('ok   ', nome); };

// 1. destino do aviso: motorista x oficina
const sol = '11111111-1111-1111-1111-111111111111', of = '22222222-2222-2222-2222-222222222222', pag = '33333333-3333-3333-3333-333333333333';
ok('cliente: novo_orcamento -> pedido', destinoDoAviso({ tipo: 'novo_orcamento', dados: { solicitacao_id: sol } }) === `/solicitacao/${sol}`);
ok('cliente: nova_mensagem -> conversa com oficina', destinoDoAviso({ tipo: 'nova_mensagem', dados: { solicitacao_id: sol, oficina_id: of } }, 'cliente') === `/conversa/${sol}?oficina=${of}`);
ok('cliente: nova_mensagem pagador -> pagador=1', destinoDoAviso({ tipo: 'nova_mensagem', dados: { solicitacao_id: sol, oficina_id: of, pagador_id: pag } }, 'cliente') === `/conversa/${sol}?oficina=${of}&pagador=1`);
ok('cliente: pedido_novas_datas nao abre', destinoDoAviso({ tipo: 'pedido_novas_datas', dados: { solicitacao_id: sol } }, 'cliente') === null);
ok('cliente: pedido_fotos nao abre', destinoDoAviso({ tipo: 'pedido_fotos', dados: { solicitacao_id: sol } }) === null);
for (const t of ['nova_solicitacao', 'pedido_convite', 'cobranca_admin_solicitacao']) ok(`oficina: ${t} -> formulario do orcamento`, destinoDoAviso({ tipo: t, dados: { solicitacao_id: sol } }, 'oficina') === `/orcamento/${sol}`);
ok('oficina: nova_mensagem -> conversa (oficina + pagador uuid)', destinoDoAviso({ tipo: 'nova_mensagem', dados: { solicitacao_id: sol, oficina_id: of, pagador_id: pag } }, 'oficina') === `/conversa/${sol}?oficina=${of}&pagador=${pag}`);
ok('oficina: nova_mensagem sem pagador', destinoDoAviso({ tipo: 'nova_mensagem', dados: { solicitacao_id: sol, oficina_id: of } }, 'oficina') === `/conversa/${sol}?oficina=${of}`);
for (const t of ['orcamento_aceito', 'orcamento_recusado', 'pedido_novas_datas', 'pedido_fotos', 'revisao_orcamento_decidida', 'pedido_expirado', 'nova_avaliacao', 'emergencia'])
  ok(`oficina: ${t} -> pedido`, destinoDoAviso({ tipo: t, dados: { solicitacao_id: sol } }, 'oficina') === `/pedido-oficina/${sol}`);
ok('oficina: sem solicitacao_id -> nada (pecas, conta)', destinoDoAviso({ tipo: 'cotacao_peca_respondida', dados: { cotacao_id: 'x' } }, 'oficina') === null);
ok('oficina: emergencia sem pedido -> nada', destinoDoAviso({ tipo: 'emergencia', dados: { emergencia_id: 'x' } }, 'oficina') === null);
ok('dados nulos nao quebram', destinoDoAviso({ tipo: 'nova_solicitacao', dados: null }, 'oficina') === null);

// 2. canal do push (espelho do servidor)
for (const t of ['nova_solicitacao', 'pedido_convite', 'cobranca_admin_solicitacao', 'novo_orcamento', 'orcamento_aceito', 'emergencia']) ok(`canal ${t} = pedidos/high`, canalDoAviso(t) === 'pedidos' && prioridadeDoCanal('pedidos') === 'high');
ok('canal nova_mensagem = mensagens', canalDoAviso('nova_mensagem') === 'mensagens');
for (const t of ['pedido_novas_datas', 'data', 'servico_concluido', 'pedido_fotos', 'cotacao_peca_respondida', 'xpto']) ok(`canal ${t} = avisos/default`, canalDoAviso(t) === 'avisos' && prioridadeDoCanal('avisos') === 'default');

// 3. caixa de pedidos
const oficina: OficinaCaixa = { id: of, latitude: 59.4325, longitude: 24.7703, raio_atendimento_km: 30, especialidades: ['mecanica', 'funilaria'], pais: 'EE' };
const agora = Date.parse('2026-11-27T12:00:00Z');
const base = (x: Partial<PedidoCaixa>): PedidoCaixa => ({ id: 'p', status: 'aberta', tipo: 'mecanica', latitude: 59.44, longitude: 24.75, created_at: new Date(agora - 30 * 60e3).toISOString(), ...x });
ok('ve pedido no raio e da especialidade', oficinaVePedido(base({}), oficina));
ok('nao ve pedido de outra especialidade', !oficinaVePedido(base({ tipo: 'vidros' }), oficina));
ok('ve se convidada mesmo de outra especialidade', oficinaVePedido(base({ tipo: 'vidros', convites: [{ oficina_id: of }] }), oficina));
ok('nao ve pedido longe (Tartu)', !oficinaVePedido(base({ latitude: 58.38, longitude: 26.72 }), oficina));
ok('ve longe se o orcamento dela foi aceito', oficinaVePedido(base({ latitude: 58.38, longitude: 26.72, orcamentos: [{ oficina_id: of, status: 'aceito' }] }), oficina));
ok('paraResponder: aberto sem orcamento', paraResponder({ status: 'aberta', orcamentos: [] }, of, false));
ok('paraResponder: dispensado nao', !paraResponder({ status: 'aberta', orcamentos: [] }, of, true));
ok('paraResponder: ja orcado nao', !paraResponder({ status: 'em_orcamento', orcamentos: [{ oficina_id: of, status: 'enviado' }] }, of, false));
const hoje = '2026-11-27';
const lista: PedidoCaixa[] = [
  base({ id: 'novo-normal', created_at: new Date(agora - 10 * 60e3).toISOString() }),
  base({ id: 'novo-acidente', emergencia_id: 'e', created_at: new Date(agora - 5 * 60e3).toISOString() }),
  base({ id: 'novo-urgente', urgencia: 'alta', created_at: new Date(agora - 2 * 60e3).toISOString() }),
  base({ id: 'novo-velho', created_at: new Date(agora - 50 * 3600e3).toISOString() }),
  base({ id: 'enviado', status: 'em_orcamento', orcamentos: [{ oficina_id: of, status: 'enviado', created_at: new Date(agora - 3600e3).toISOString(), validade: '2026-12-05' }] }),
  base({ id: 'visto', status: 'em_orcamento', orcamentos: [{ oficina_id: of, status: 'visualizado', created_at: new Date(agora - 7200e3).toISOString(), validade: '2026-12-05' }] }),
  base({ id: 'aceito', status: 'aceita', orcamentos: [{ oficina_id: of, status: 'aceito', created_at: new Date(agora - 9000e3).toISOString(), validade: '2026-12-05' }] }),
  base({ id: 'vencido', status: 'em_orcamento', orcamentos: [{ oficina_id: of, status: 'enviado', created_at: new Date(agora - 9000e3).toISOString(), validade: '2026-11-20' }] }),
  base({ id: 'perdido', status: 'aceita', orcamentos: [{ oficina_id: of, status: 'enviado', created_at: new Date(agora - 9000e3).toISOString(), validade: '2026-12-05' }, { oficina_id: 'outra', status: 'aceito' }] }),
  base({ id: 'entregue', status: 'concluida', orcamentos: [{ oficina_id: of, status: 'aceito', created_at: new Date(agora - 9000e3).toISOString(), validade: '2026-12-05' }] }),
  base({ id: 'recusado', status: 'em_orcamento', orcamentos: [{ oficina_id: of, status: 'recusado', created_at: new Date(agora - 9000e3).toISOString(), validade: '2026-12-05', recusado_motivo: 'preco' }] }),
  base({ id: 'dispensado' }),
  base({ id: 'cancelado', status: 'cancelada' }),
  base({ id: 'fora', tipo: 'vidros' }),
];
const g = agruparPedidos(lista, oficina, new Map([['dispensado', { solicitacao_id: 'dispensado', motivo: 'longe', comentario: null, created_at: new Date(agora).toISOString() }]]), hoje, agora);
ok('responder: acidente > urgente > normal > velho', g.responder.map((x) => x.s.id).join(',') === 'novo-acidente,novo-urgente,novo-normal,novo-velho', g.responder.map((x) => x.s.id));
ok('respondidos: aceito primeiro, depois orcamento mais recente', g.respondidos.map((x) => `${x.s.id}:${x.estado}`).join(',') === 'aceito:aceito,enviado:enviado,visto:visto', g.respondidos.map((x) => x.s.id));
ok('encerrados: estados certos', g.encerrados.map((x) => x.estado).sort().join(',') === 'dispensado,entregue,expirado,perdido,recusado', g.encerrados.map((x) => `${x.s.id}:${x.estado}`));
ok('cancelado e fora do raio nao aparecem', ![...g.responder, ...g.respondidos, ...g.encerrados].some((x) => ['cancelado', 'fora'].includes(x.s.id)));
ok('cor da espera', corDaEspera(new Date(agora - 30 * 60e3).toISOString(), agora) === 'verde' && corDaEspera(new Date(agora - 2 * 3600e3).toISOString(), agora) === 'ambar' && corDaEspera(new Date(agora - 5 * 3600e3).toISOString(), agora) === 'vermelho' && corDaEspera(new Date(agora - 50 * 3600e3).toISOString(), agora) === 'cinza');
ok('partes da espera', JSON.stringify(partesDaEspera(26 * 3600e3 + 5 * 60e3)) === JSON.stringify({ d: 1, h: 2, m: 5 }));

// 4. helpers de turnos portados
const horario = { seg: { aberto: true, inicio: '08:00', fim: '18:00' }, ter: { aberto: true, inicio: '08:00', fim: '18:00' }, qua: { aberto: true, inicio: '08:00', fim: '18:00' }, qui: { aberto: true, inicio: '08:00', fim: '18:00' }, sex: { aberto: true, inicio: '08:00', fim: '18:00' }, sab: { aberto: false }, dom: { aberto: false } };
ok('conflitoHorario: sabado fechado', conflitoHorario('2026-11-28', 'manha', horario) === 'fechado');
ok('conflitoHorario: segunda aberta', conflitoHorario('2026-11-30', 'manha', horario) === null);
ok('conflitoHorario: sem horario = null', conflitoHorario('2026-11-28', 'manha', null) === null);
ok('somarDias', somarDias('2026-11-27', 5) === '2026-12-02' && somarDias('2026-12-30', 2) === '2027-01-01');
ok('maiorData', maiorData(['2026-12-01', null, '2026-12-10', '2026-11-30']) === '2026-12-10');
ok('validadeSugerida pula fim de semana', validadeSugerida('2026-11-28', horario) === '2026-12-07'); // 28/11 + 7 = sab 05/12 -> seg 07/12
ok('erroValidade', erroValidade('', [], hoje) === 'vazia' && erroValidade('2026-11-20', [], hoje) === 'passado' && erroValidade('2026-12-01', ['2026-12-03'], hoje) === 'antes' && erroValidade('2026-12-10', ['2026-12-03'], hoje) === null);

// 5. validacao do orcamento (mesmas regras do site)
const agoraD = new Date('2026-11-27T10:00:00Z'); // 12:00 em Tallinn
const itensOk = [{ descricao: 'Reparo', tipo: 'mao_de_obra' as const, quantidade: 1, valor_unitario: 120 }];
const slotOk = [{ data: '2026-11-30', hora_inicio: '08:00', hora_fim: '10:00' }];
let e = validarOrcamento({ itens: itensOk, slots: slotOk, validade: '2026-12-07', horario, pais: 'EE', datasVisiveis: true, agora: agoraD });
ok('orcamento valido passa', e.faltas.length === 0, e);
e = validarOrcamento({ itens: [{ descricao: '', tipo: 'peca', quantidade: 1, valor_unitario: 0 }], slots: [], validade: '', horario, pais: 'EE', datasVisiveis: true, agora: agoraD });
ok('tudo em falta: valor, datas, validade (nessa ordem)', e.faltas.join(',') === 'valor,datas,validade' && e.semValor && e.semCheckin && e.validade === 'vazia');
e = validarOrcamento({ itens: itensOk, slots: [{ data: '2026-11-27', hora_inicio: '08:00', hora_fim: '10:00' }], validade: '2026-12-07', horario, pais: 'EE', datasVisiveis: true, agora: agoraD });
ok('janela de hoje que ja acabou = horario passado', e.horarioPassado && e.faltas.join(',') === 'datas');
e = validarOrcamento({ itens: itensOk, slots: [{ data: '2026-11-28', hora_inicio: '08:00', hora_fim: '10:00' }], validade: '2026-12-07', horario, pais: 'EE', datasVisiveis: true, agora: agoraD });
ok('dia fechado pelo perfil bloqueia', e.diaFechado && e.faltas.join(',') === 'datas');
e = validarOrcamento({ itens: itensOk, slots: slotOk, validade: '2026-11-27', horario, pais: 'EE', datasVisiveis: true, agora: agoraD });
ok('validade hoje = passado (minimo amanha)', e.validade === 'passado' || e.validade === 'antes');
e = validarOrcamento({ itens: itensOk, slots: slotOk, validade: '2026-11-29', horario, pais: 'EE', datasVisiveis: true, agora: agoraD });
ok('validade antes da ultima data de check-in', e.validade === 'antes');
e = validarOrcamento({ itens: itensOk, slots: [], validade: '2026-12-07', horario, pais: 'EE', datasVisiveis: false, agora: agoraD });
ok('carro ja na oficina: sem datas e passa', e.faltas.length === 0);
e = validarOrcamento({ itens: itensOk, slots: [], validade: '', horario, pais: 'EE', datasVisiveis: false, agora: agoraD });
ok('carro ja na oficina: validade vazia ainda conta', e.faltas.join(',') === 'validade');
ok('validadeMinima = amanha ou ultima data', validadeMinima([], 'EE', agoraD) === '2026-11-28' && validadeMinima([{ data: '2026-12-03', hora_inicio: '08:00', hora_fim: '10:00' }], 'EE', agoraD) === '2026-12-03');

// 6. payloads como o site grava
const itens = itensParaGravar([{ descricao: '', tipo: 'mao_de_obra', quantidade: 2, valor_unitario: 50 }, { descricao: '', tipo: 'peca', quantidade: 1, valor_unitario: 0 }], 'Kere ja värvimine');
ok('item sem nome ganha o rotulo do tipo; item vazio sai', itens.length === 1 && itens[0].descricao === 'Kere ja värvimine' && itens[0].valor_total === 100);
const slots = slotsParaGravar([{ data: '2026-11-30', hora_inicio: '13:00', hora_fim: '15:00' }, { data: '', hora_inicio: '', hora_fim: '' }], 3);
ok('slot: turno derivado, previsao = data + prazo', slots.length === 1 && slots[0].turno === 'tarde' && slots[0].data_previsao_entrega === '2026-12-03' && slots[0].hora_inicio === '13:00');
ok('observacoes com prefixo da comissao', observacoesComComissao('  Garantia 90 dias ', 'absorver', 10) === '[COMISSAO:absorver:10]\nGarantia 90 dias' && observacoesComComissao('', 'absorver', 8.5) === '[COMISSAO:absorver:8.5]');
ok('percentual da comissao: padrao 10%, fixo limitado ao total', percentualComissao(200, null) === 10 && percentualComissao(200, { tipo: 'percentual', taxa: 0.08 }) === 8 && percentualComissao(100, { tipo: 'valor_fixo', valorFixo: 150 }) === 100 && percentualComissao(0, null) === 0);

// 7. link curto /r/<numero>: so o puro e o ?o= ficam no app; as variantes que o site resolve sem login vao ao navegador (S2)
ok('link puro -> app', destinoDoLinkCurto({ numero: '111595' }).tipo === 'app');
ok('link ?o=et (e-mail da oficina) -> app', destinoDoLinkCurto({ numero: '111595', o: 'et' }).tipo === 'app');
const variantes: [string, Record<string, string>][] = [
  ['?s= parar lembretes', { s: 'abc123', l: 'et' }], ['?k= acesso sem senha', { k: 'tok', o: 'et' }], ['?k=&d=1 nao tenho interesse', { k: 'tok', o: 'et', d: '1' }],
  ['?c=1 chat', { c: '1' }], ['?c=1&g=1&of= chat do pagador', { c: '1', g: '1', of: '22222222-2222-2222-2222-222222222222' }], ['?o=&p=1 novas datas', { o: 'et', p: '1' }],
  ['?l= outro motorista', { l: 'ru' }], ['?k= com c', { k: 'tok', c: '1' }],
];
for (const [nome, p] of variantes) {
  const r = destinoDoLinkCurto({ numero: '111595', ...p });
  const q = r.tipo === 'navegador' ? new URLSearchParams(r.query) : null;
  ok(nome + ' -> navegador com a mesma query', !!q && !q.has('numero') && Object.keys(p).every((k) => q.get(k) === p[k]), r);
}
ok('parametro vazio nao conta', destinoDoLinkCurto({ numero: '1', s: '' }).tipo === 'app');
ok('params nulos -> app', destinoDoLinkCurto(null).tipo === 'app');

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
