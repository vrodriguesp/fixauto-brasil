// Gera o grupo "oficina" (e push/auth) dos 6 idiomas do app a partir das traducoes JA REVISADAS do painel
// da oficina no site (apps/web/messages/<idioma>.oficina.json) + chaves novas do app. Rodado em 27/11;
// depois disso as chaves vivem nos locales do app como as outras (rodar de novo so repoe as mesmas).
//   node scripts/gerar-traducoes-oficina.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.resolve(RAIZ, '../web/messages');
const IDIOMAS = ['pt', 'pt-PT', 'en', 'et', 'it', 'ru'];

// oficina.<chave do app> <- <namespace do site>.<chave do site>  (par [destino, origem] quando o nome muda)
const DO_SITE = {
  oficinaPedidos: ['aba_responder', 'aba_respondidos', 'aba_encerrados', 'vazio_responder', 'vazio_respondidos', 'vazio_encerrados', 'cadastroEmAnalise', 'min', 'horasMin', 'horas', 'diasHoras', 'dias', 'acidente', 'fotos', 'semFotos', 'seguro', 'novo', 'clienteAceitou', 'chegaEm', 'manha', 'tarde', 'servicoEntregue', 'clienteRecusou', 'orcamentoVenceu', 'outraOficina', 'respondidoEm', 'clienteViu', 'clienteNaoDecidiu', 'fazerOrcamento', 'novoOrcamento', 'pedidoEm', 'orcamentoEm', 'naoTenhoInteresse', 'dispensarTitulo', 'dispensarAjuda', 'motivo_nao_faz', 'motivo_faz_parte', 'motivo_sem_agenda', 'motivo_longe', 'motivo_outro', 'comentarioOpcional', 'voceDispensou', 'convidada', 'recusaMotivos', ['voltarAtras', 'desfazerDispensa']],
  oficinaSolicitacaoDetalhe: [['pedidoNaoEncontrado', 'solicitacaoNaoEncontrada'], 'urgencia', 'mensagem', 'descricaoDoProblema', 'fotosCount', 'fotoNova', 'informacoesDoVeiculo', 'marca', 'modelo', 'ano', 'placa', 'cor', 'dadosVeiculoIndisponiveis', 'cliente', 'solicitadoEm', 'modificarOrcamento', 'seuOrcamento', 'prazoDias', 'statusOrcamento', 'orcamentoFechadoEntregue', 'ligarCliente', 'orcamentoVencidoTexto', 'convidadaTexto', 'nomeAposAceite', 'recusaMotivo'],
  oficinaEnviarOrcamento: ['orcamentoRevisado', 'orcamentoEnviado', 'clienteNotificadoAceite', 'enviarOrcamento', 'jaEnviouOrcamento', 'itensOrcamento', 'itemNumero', 'remover', 'placeholderDescricaoItem', ['tipoItem_mao_de_obra', 'maoDeObra'], ['tipoItem_peca', 'peca'], ['tipoItem_material', 'material'], ['tipoItem_outro', 'outro'], ['qtd', 'placeholderQtd'], 'adicionarItem', 'total', 'prazoTotalDias', 'validadeOrcamento', 'checkinJaRealizado', 'disponibilidadeCheckin', 'ofereceDatas', 'entregaAprox', 'erroDiaFechado', 'erroDiaFechadoEnvio', 'dicaMaisDatas', 'observacoesOpcional', 'placeholderObservacoes', 'atualizarOrcamento', 'semComissaoOrcamento', 'horarioPassado', 'garantia', ['semGarantia', 'garantiaSem'], 'verPedido', ['erroItemValor', 'itemSemValor'], 'erroEnvioOrcamento', 'erroSemCheckin', ['erroValidade_passado', 'validadePassadoErro'], ['erroValidade_vazia', 'validadeVaziaErro'], ['falta_valor', 'campo_valor'], ['falta_datas', 'campo_datas'], ['falta_validade', 'campo_validade'], ['validadeAjuda', 'validadeAutoDica']],
  oficinaConversas: ['semCarro', 'pagador', 'voce', ['semConversas', 'vazio']],
  oficinaNovasDatas: [['novasDatasPedidas', 'titulo']],
};

// chaves novas do app (sem equivalente no site), nos 6 idiomas
const NOVAS = {
  abaPedidos: { pt: 'Pedidos', 'pt-PT': 'Pedidos', en: 'Requests', et: 'Päringud', it: 'Richieste', ru: 'Заявки' },
  pedidoTitulo: { pt: 'Pedido', 'pt-PT': 'Pedido', en: 'Request', et: 'Päring', it: 'Richiesta', ru: 'Заявка' },
  orcamentoTitulo: { pt: 'Orçamento', 'pt-PT': 'Orçamento', en: 'Quote', et: 'Pakkumine', it: 'Preventivo', ru: 'Предложение' },
  dona: { pt: 'Dono(a) da oficina', 'pt-PT': 'Dono(a) da oficina', en: 'Workshop owner', et: 'Töökoja omanik', it: "Titolare dell'officina", ru: 'Владелец автосервиса' },
  cargo_admin: { pt: 'Administrador(a)', 'pt-PT': 'Administrador(a)', en: 'Administrator', et: 'Administraator', it: 'Amministratore', ru: 'Администратор' },
  cargo_mecanico: { pt: 'Mecânico(a)', 'pt-PT': 'Mecânico(a)', en: 'Mechanic', et: 'Mehaanik', it: 'Meccanico', ru: 'Механик' },
  dadosNoSite: { pt: 'Endereço, horário, serviços e fotos da oficina: edite no site bipfix.com.', 'pt-PT': 'Morada, horário, serviços e fotos da oficina: edite no site bipfix.com.', en: 'Workshop address, opening hours, services and photos: edit them on bipfix.com.', et: 'Töökoja aadress, lahtiolekuajad, teenused ja fotod: muuda neid veebis bipfix.com.', it: "Indirizzo, orari, servizi e foto dell'officina: modificali su bipfix.com.", ru: 'Адрес, часы работы, услуги и фото автосервиса: редактируйте на сайте bipfix.com.' },
  linkPedidoNaoEncontrado: { pt: 'Pedido não encontrado', 'pt-PT': 'Pedido não encontrado', en: 'Request not found', et: 'Päringut ei leitud', it: 'Richiesta non trovata', ru: 'Заявка не найдена' },
  linkPedidoNaoEncontradoTexto: { pt: 'Este link não corresponde a um pedido que esta conta possa ver. Veja a sua lista de pedidos.', 'pt-PT': 'Esta ligação não corresponde a um pedido que esta conta possa ver. Veja a sua lista de pedidos.', en: 'This link does not match a request this account can see. Check your request list.', et: 'See link ei vasta ühelegi päringule, mida see konto näeb. Vaata oma päringute loendit.', it: 'Questo link non corrisponde a una richiesta visibile a questo account. Controlla il tuo elenco di richieste.', ru: 'Эта ссылка не соответствует заявке, доступной этому аккаунту. Посмотрите свой список заявок.' },
  verPedidos: { pt: 'Ver pedidos', 'pt-PT': 'Ver pedidos', en: 'View requests', et: 'Vaata päringuid', it: 'Vedi richieste', ru: 'К заявкам' },
  novasDatasPedidasTexto: { pt: 'Responda pelo site bipfix.com: confirme uma das datas sugeridas ou envie outras.', 'pt-PT': 'Responda pelo site bipfix.com: confirme uma das datas sugeridas ou envie outras.', en: 'Reply on bipfix.com: confirm one of the suggested dates or offer others.', et: 'Vasta veebis bipfix.com: kinnita üks pakutud kuupäevadest või paku teisi.', it: 'Rispondi su bipfix.com: conferma una delle date proposte o proponi altre.', ru: 'Ответьте на сайте bipfix.com: подтвердите одну из предложенных дат или предложите другие.' },
  validadeAte: { pt: 'Válido até {data}', 'pt-PT': 'Válido até {data}', en: 'Valid until {data}', et: 'Kehtib kuni {data}', it: 'Valido fino al {data}', ru: 'Действует до {data}' },
  datasOferecidas: { pt: 'Datas oferecidas', 'pt-PT': 'Datas oferecidas', en: 'Offered dates', et: 'Pakutud kuupäevad', it: 'Date proposte', ru: 'Предложенные даты' },
  revisaoNoSite: { pt: 'Para propor uma revisão deste orçamento aceito, use o site bipfix.com.', 'pt-PT': 'Para propor uma revisão deste orçamento aceite, use o site bipfix.com.', en: 'To propose a revision of this accepted quote, use bipfix.com.', et: 'Vastuvõetud pakkumise muutmise ettepaneku tegemiseks kasuta veebi bipfix.com.', it: 'Per proporre una revisione di questo preventivo accettato usa bipfix.com.', ru: 'Чтобы предложить изменение принятого предложения, используйте сайт bipfix.com.' },
  preferenciaMotorista: { pt: 'Quando o motorista pode levar o carro', 'pt-PT': 'Quando o condutor pode levar o carro', en: 'When the driver can bring the car', et: 'Millal juht saab auto tuua', it: "Quando il conducente può portare l'auto", ru: 'Когда водитель может привезти машину' },
  prefUrgente: { pt: 'o quanto antes', 'pt-PT': 'o quanto antes', en: 'as soon as possible', et: 'võimalikult kiiresti', it: 'il prima possibile', ru: 'как можно скорее' },
  prefQualquerDia: { pt: 'qualquer dia útil', 'pt-PT': 'qualquer dia útil', en: 'any weekday', et: 'ükskõik milline tööpäev', it: 'qualsiasi giorno lavorativo', ru: 'любой будний день' },
  valorUnitario: { pt: 'Valor ({moeda})', 'pt-PT': 'Valor ({moeda})', en: 'Price ({moeda})', et: 'Hind ({moeda})', it: 'Prezzo ({moeda})', ru: 'Цена ({moeda})' },
  comissaoInfo: { pt: 'Comissão BipFix: {pct}% do total, paga no fim do serviço.', 'pt-PT': 'Comissão BipFix: {pct}% do total, paga no fim do serviço.', en: 'BipFix commission: {pct}% of the total, paid when the job is done.', et: 'BipFixi vahendustasu: {pct}% kogusummast, makstakse töö lõpus.', it: 'Commissione BipFix: {pct}% del totale, pagata a fine lavoro.', ru: 'Комиссия BipFix: {pct}% от суммы, оплачивается после завершения работы.' },
  dia_um: { pt: '1 dia', 'pt-PT': '1 dia', en: '1 day', et: '1 päev', it: '1 giorno', ru: '1 день' },
  ano_um: { pt: '1 ano', 'pt-PT': '1 ano', en: '1 year', et: '1 aasta', it: '1 anno', ru: '1 год' },
  anos: { pt: '{n} anos', 'pt-PT': '{n} anos', en: '{n} years', et: '{n} aastat', it: '{n} anni', ru: '{n} года' },
  escolhaDia: { pt: 'Escolha o dia', 'pt-PT': 'Escolha o dia', en: 'Choose the day', et: 'Vali päev', it: 'Scegli il giorno', ru: 'Выберите день' },
  escolhaPeriodo: { pt: 'Escolha o período de chegada', 'pt-PT': 'Escolha o período de chegada', en: 'Choose the arrival window', et: 'Vali saabumise ajavahemik', it: 'Scegli la fascia di arrivo', ru: 'Выберите время приезда' },
  diaCurto: { pt: 'dia', 'pt-PT': 'dia', en: 'day', et: 'päev', it: 'giorno', ru: 'день' },
  erroValidade_antes: { pt: 'A validade precisa ser pelo menos o último dia de check-in.', 'pt-PT': 'A validade tem de ser pelo menos o último dia de check-in.', en: 'The validity must be at least the last check-in day.', et: 'Kehtivus peab olema vähemalt viimane vastuvõtupäev.', it: "La validità deve arrivare almeno all'ultimo giorno di check-in.", ru: 'Срок действия должен быть не раньше последней даты приёма.' },
  faltam: { pt: 'Falta', 'pt-PT': 'Falta', en: 'Missing', et: 'Puudu', it: 'Manca', ru: 'Не хватает' },
  bloqueado_fechado: { pt: 'Este pedido está encerrado. O orçamento não pode mais ser alterado.', 'pt-PT': 'Este pedido está encerrado. O orçamento já não pode ser alterado.', en: 'This request is closed. The quote can no longer be changed.', et: 'See päring on lõpetatud. Pakkumist ei saa enam muuta.', it: 'Questa richiesta è chiusa. Il preventivo non può più essere modificato.', ru: 'Эта заявка закрыта. Предложение больше нельзя изменить.' },
  bloqueado_equipe: { pt: 'Só a conta do dono da oficina envia orçamentos pelo app (a equipe não tem essa permissão). Peça ao dono para orçar.', 'pt-PT': 'Só a conta do dono da oficina envia orçamentos pela app (a equipa não tem essa permissão). Peça ao dono para orçar.', en: "Only the workshop owner's account can send quotes in the app (staff accounts do not have this permission). Ask the owner to quote.", et: 'Pakkumisi saab rakenduses saata ainult töökoja omaniku konto (meeskonna kontodel seda õigust pole). Palu omanikul pakkumine teha.', it: "Solo l'account del titolare dell'officina può inviare preventivi nell'app (gli account del personale non hanno questo permesso). Chiedi al titolare di fare il preventivo.", ru: 'Отправлять предложения в приложении может только аккаунт владельца автосервиса (у сотрудников нет такого права). Попросите владельца составить предложение.' },
  bloqueado_mecanico: { pt: 'Só o dono ou um administrador da oficina envia orçamentos.', 'pt-PT': 'Só o dono ou um administrador da oficina envia orçamentos.', en: 'Only the workshop owner or an administrator can send quotes.', et: 'Pakkumisi saab saata ainult töökoja omanik või administraator.', it: "Solo il titolare o un amministratore dell'officina può inviare preventivi.", ru: 'Отправлять предложения может только владелец или администратор автосервиса.' },
};
const AUTH = {
  semOficina: { pt: 'Esta conta de oficina ainda não tem uma oficina ativa. Fale com o dono da oficina ou com a BipFix.', 'pt-PT': 'Esta conta de oficina ainda não tem uma oficina ativa. Fale com o dono da oficina ou com a BipFix.', en: 'This workshop account has no active workshop yet. Contact the workshop owner or BipFix.', et: 'Sellel töökoja kontol pole veel aktiivset töökoda. Võta ühendust töökoja omaniku või BipFixiga.', it: "Questo account officina non ha ancora un'officina attiva. Contatta il titolare dell'officina o BipFix.", ru: 'У этого аккаунта автосервиса пока нет активного автосервиса. Свяжитесь с владельцем автосервиса или BipFix.' },
  tipoNaoSuportado: { pt: 'Esta conta não pode usar o app. Lojas de peças e administradores entram pelo site bipfix.com.', 'pt-PT': 'Esta conta não pode usar a app. Lojas de peças e administradores entram pelo site bipfix.com.', en: 'This account cannot use the app. Parts shops and administrators sign in at bipfix.com.', et: 'See konto ei saa rakendust kasutada. Varuosapoed ja administraatorid logivad sisse veebis bipfix.com.', it: "Questo account non può usare l'app. Negozi di ricambi e amministratori accedono su bipfix.com.", ru: 'Этот аккаунт не может использовать приложение. Магазины запчастей и администраторы входят на сайте bipfix.com.' },
};
const PUSH = {
  canal_pedidos: { pt: 'Pedidos e orçamentos', 'pt-PT': 'Pedidos e orçamentos', en: 'Requests and quotes', et: 'Päringud ja pakkumised', it: 'Richieste e preventivi', ru: 'Заявки и предложения' },
  canal_mensagens: { pt: 'Mensagens', 'pt-PT': 'Mensagens', en: 'Messages', et: 'Sõnumid', it: 'Messaggi', ru: 'Сообщения' },
  canal_avisos: { pt: 'Outros avisos', 'pt-PT': 'Outros avisos', en: 'Other notifications', et: 'Muud teated', it: 'Altri avvisi', ru: 'Другие уведомления' },
};
const INTL = { pt: 'pt-BR', 'pt-PT': 'pt-PT', en: 'en-GB', et: 'et-EE', it: 'it-IT', ru: 'ru-RU' };

for (const l of IDIOMAS) {
  const arq = path.join(RAIZ, 'i18n/locales', `${l}.json`);
  const app = JSON.parse(fs.readFileSync(arq, 'utf8'));
  const site = JSON.parse(fs.readFileSync(path.join(WEB, `${l}.oficina.json`), 'utf8'));
  const siteBase = JSON.parse(fs.readFileSync(path.join(WEB, `${l}.json`), 'utf8'));
  const of = {};
  for (const [ns, chaves] of Object.entries(DO_SITE)) for (const c of chaves) {
    const [destino, origem] = Array.isArray(c) ? c : [c, c];
    if (site[ns]?.[origem] === undefined) throw new Error(`${l}: ${ns}.${origem} nao existe no site`);
    of[destino] = site[ns][origem];
  }
  for (const [k, v] of Object.entries(NOVAS)) of[k] = v[l];
  of.bloqueado_aceito = of.revisaoNoSite;
  // dias da semana curtos pelo Intl (segunda = 1 ... sabado = 6; 30/11/2026 e segunda)
  const fmt = new Intl.DateTimeFormat(INTL[l], { weekday: 'short', timeZone: 'UTC' });
  for (let d = 1; d <= 6; d++) of[`diaSemana_${d}`] = fmt.format(new Date(Date.UTC(2026, 10, 29 + d)));
  app.oficina = of;
  app.push = Object.fromEntries(Object.entries(PUSH).map(([k, v]) => [k, v[l]]));
  app.auth.semOficina = AUTH.semOficina[l];
  app.auth.tipoNaoSuportado = AUTH.tipoNaoSuportado[l];
  app.constants.tiposOcorrencia = siteBase.constants.tiposOcorrencia;
  fs.writeFileSync(arq, JSON.stringify(app, null, 2) + '\n');
  console.log(l, Object.keys(of).length, 'chaves em oficina');
}
