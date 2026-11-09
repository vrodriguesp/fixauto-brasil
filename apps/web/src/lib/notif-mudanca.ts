import { idiomaDoSite } from './site-url';

// Mudanca de data unificada (migracao 077, dono 08/11): avisos no app/site e linhas do chat.
// {oficina} nome da oficina, {carro} marca+modelo, {quando} data/hora no fuso da oficina.
type M = {
  combinadoTitulo: string; combinadoMsg: string; chatCombinado: string;
  contestadaTitulo: string; contestadaMsg: string;
  mantidaTitulo: string; mantidaMsg: string;
  canceladoClienteTitulo: string; canceladoClienteMsg: string; chatCanceladoCliente: string;
  aceitaMsg: string;
  lembreteTitulo: string; lembreteMsg: string;
  vesperaTitulo: string; vesperaMsgCliente: string; vesperaMsgOficina: string;
  propostaNaoServeMsg: string;
};
const MX: Record<string, M> = {
  pt: {
    combinadoTitulo: 'Data alterada (combinada com você)', combinadoMsg: '{oficina} mudou para {quando}, como combinado com você. Não combinou? Abra o pedido e toque em "Não combinei isso".', chatCombinado: '📅 Nova data combinada: {quando}. Motivo: {motivo}',
    contestadaTitulo: 'O cliente diz que não combinou a nova data', contestadaMsg: '{carro}: a data voltou para {quando}. Fale com o cliente ou proponha outra data.',
    mantidaTitulo: 'O cliente mantém a data atual', mantidaMsg: '{carro}: continua {quando}. Se não puder nessa data, fale com o cliente ou cancele o agendamento.',
    canceladoClienteTitulo: 'O cliente cancelou o agendamento', canceladoClienteMsg: '{carro}: depois da proposta de nova data, o cliente preferiu cancelar com a sua oficina.', chatCanceladoCliente: '❌ Cancelei o agendamento depois da proposta de nova data.',
    aceitaMsg: '{carro}: nova data confirmada, {quando}.',
    lembreteTitulo: 'A oficina espera a sua resposta', lembreteMsg: '{oficina} propôs {quando}. Responda no pedido.',
    vesperaTitulo: 'Data ainda não confirmada', vesperaMsgCliente: '{oficina}: a mudança de data ainda espera a sua resposta. A data marcada é {quando}.', vesperaMsgOficina: '{carro}: o cliente ainda não respondeu à nova data. A data marcada é {quando}.',
    propostaNaoServeMsg: '{oficina} não pode mais na data marcada e propõe {quando}. Motivo: {motivo}',
  },
  'pt-PT': {
    combinadoTitulo: 'Data alterada (combinada consigo)', combinadoMsg: '{oficina} mudou para {quando}, como combinado consigo. Não combinou? Abra o pedido e toque em "Não combinei isto".', chatCombinado: '📅 Nova data combinada: {quando}. Motivo: {motivo}',
    contestadaTitulo: 'O cliente diz que não combinou a nova data', contestadaMsg: '{carro}: a data voltou para {quando}. Fale com o cliente ou proponha outra data.',
    mantidaTitulo: 'O cliente mantém a data atual', mantidaMsg: '{carro}: continua {quando}. Se não puder nessa data, fale com o cliente ou cancele a marcação.',
    canceladoClienteTitulo: 'O cliente cancelou a marcação', canceladoClienteMsg: '{carro}: depois da proposta de nova data, o cliente preferiu cancelar com a sua oficina.', chatCanceladoCliente: '❌ Cancelei a marcação depois da proposta de nova data.',
    aceitaMsg: '{carro}: nova data confirmada, {quando}.',
    lembreteTitulo: 'A oficina aguarda a sua resposta', lembreteMsg: '{oficina} propôs {quando}. Responda no pedido.',
    vesperaTitulo: 'Data ainda não confirmada', vesperaMsgCliente: '{oficina}: a mudança de data ainda aguarda a sua resposta. A data marcada é {quando}.', vesperaMsgOficina: '{carro}: o cliente ainda não respondeu à nova data. A data marcada é {quando}.',
    propostaNaoServeMsg: '{oficina} já não pode na data marcada e propõe {quando}. Motivo: {motivo}',
  },
  en: {
    combinadoTitulo: 'Date changed (agreed with you)', combinadoMsg: '{oficina} moved it to {quando}, as agreed with you. Didn’t agree? Open the request and tap "I didn’t agree to this".', chatCombinado: '📅 New date agreed: {quando}. Reason: {motivo}',
    contestadaTitulo: 'The customer says they didn’t agree to the new date', contestadaMsg: '{carro}: the date is back to {quando}. Talk to the customer or propose another date.',
    mantidaTitulo: 'The customer keeps the current date', mantidaMsg: '{carro}: still {quando}. If you can’t make it, talk to the customer or cancel the booking.',
    canceladoClienteTitulo: 'The customer cancelled the booking', canceladoClienteMsg: '{carro}: after the new date proposal, the customer chose to cancel with your shop.', chatCanceladoCliente: '❌ I cancelled the booking after the new date proposal.',
    aceitaMsg: '{carro}: new date confirmed, {quando}.',
    lembreteTitulo: 'The repair shop is waiting for your answer', lembreteMsg: '{oficina} proposed {quando}. Answer in your request.',
    vesperaTitulo: 'Date not confirmed yet', vesperaMsgCliente: '{oficina}: the date change is still waiting for your answer. The booked date is {quando}.', vesperaMsgOficina: '{carro}: the customer hasn’t answered the new date yet. The booked date is {quando}.',
    propostaNaoServeMsg: '{oficina} can no longer do the booked date and proposes {quando}. Reason: {motivo}',
  },
  et: {
    combinadoTitulo: 'Aeg muudetud (sinuga kokku lepitud)', combinadoMsg: '{oficina} muutis aja: {quando}, nagu sinuga kokku lepiti. Ei leppinud kokku? Ava päring ja vajuta "Ma ei leppinud seda kokku".', chatCombinado: '📅 Kokkulepitud uus aeg: {quando}. Põhjus: {motivo}',
    contestadaTitulo: 'Klient ütleb, et uut aega ei lepitud kokku', contestadaMsg: '{carro}: aeg on jälle {quando}. Räägi kliendiga või paku uus aeg.',
    mantidaTitulo: 'Klient jätab praeguse aja', mantidaMsg: '{carro}: jääb {quando}. Kui sa ei saa, räägi kliendiga või tühista broneering.',
    canceladoClienteTitulo: 'Klient tühistas broneeringu', canceladoClienteMsg: '{carro}: pärast uue aja ettepanekut otsustas klient sinu töökojaga tühistada.', chatCanceladoCliente: '❌ Tühistasin broneeringu pärast uue aja ettepanekut.',
    aceitaMsg: '{carro}: uus aeg kinnitatud, {quando}.',
    lembreteTitulo: 'Töökoda ootab sinu vastust', lembreteMsg: '{oficina} pakkus aega {quando}. Vasta päringus.',
    vesperaTitulo: 'Aeg pole veel kinnitatud', vesperaMsgCliente: '{oficina}: aja muutmine ootab endiselt sinu vastust. Broneeritud aeg on {quando}.', vesperaMsgOficina: '{carro}: klient pole uuele ajale vastanud. Broneeritud aeg on {quando}.',
    propostaNaoServeMsg: '{oficina} ei saa enam broneeritud ajal ja pakub {quando}. Põhjus: {motivo}',
  },
  ru: {
    combinadoTitulo: 'Дата изменена (согласовано с вами)', combinadoMsg: '{oficina} перенёс на {quando}, как договорились с вами. Не договаривались? Откройте заявку и нажмите «Я не соглашался».', chatCombinado: '📅 Согласована новая дата: {quando}. Причина: {motivo}',
    contestadaTitulo: 'Клиент говорит, что не соглашался на новую дату', contestadaMsg: '{carro}: дата снова {quando}. Свяжитесь с клиентом или предложите другую дату.',
    mantidaTitulo: 'Клиент оставляет текущую дату', mantidaMsg: '{carro}: остаётся {quando}. Если не получается, свяжитесь с клиентом или отмените запись.',
    canceladoClienteTitulo: 'Клиент отменил запись', canceladoClienteMsg: '{carro}: после предложения новой даты клиент решил отменить запись в вашем автосервисе.', chatCanceladoCliente: '❌ Я отменил запись после предложения новой даты.',
    aceitaMsg: '{carro}: новая дата подтверждена, {quando}.',
    lembreteTitulo: 'Автосервис ждёт вашего ответа', lembreteMsg: '{oficina} предложил {quando}. Ответьте в заявке.',
    vesperaTitulo: 'Дата ещё не подтверждена', vesperaMsgCliente: '{oficina}: перенос даты всё ещё ждёт вашего ответа. Назначенная дата — {quando}.', vesperaMsgOficina: '{carro}: клиент ещё не ответил на новую дату. Назначенная дата — {quando}.',
    propostaNaoServeMsg: '{oficina} больше не может в назначенную дату и предлагает {quando}. Причина: {motivo}',
  },
  it: {
    combinadoTitulo: 'Data cambiata (concordata con te)', combinadoMsg: '{oficina} l’ha spostata a {quando}, come concordato con te. Non eri d’accordo? Apri la richiesta e tocca "Non l’ho concordato".', chatCombinado: '📅 Nuova data concordata: {quando}. Motivo: {motivo}',
    contestadaTitulo: 'Il cliente dice di non aver concordato la nuova data', contestadaMsg: '{carro}: la data è tornata a {quando}. Parla con il cliente o proponi un’altra data.',
    mantidaTitulo: 'Il cliente mantiene la data attuale', mantidaMsg: '{carro}: resta {quando}. Se non puoi, parla con il cliente o annulla la prenotazione.',
    canceladoClienteTitulo: 'Il cliente ha annullato la prenotazione', canceladoClienteMsg: '{carro}: dopo la proposta di nuova data il cliente ha scelto di annullare con la tua officina.', chatCanceladoCliente: '❌ Ho annullato la prenotazione dopo la proposta di nuova data.',
    aceitaMsg: '{carro}: nuova data confermata, {quando}.',
    lembreteTitulo: 'L’officina aspetta la tua risposta', lembreteMsg: '{oficina} ha proposto {quando}. Rispondi nella richiesta.',
    vesperaTitulo: 'Data non ancora confermata', vesperaMsgCliente: '{oficina}: il cambio di data aspetta ancora la tua risposta. La data prenotata è {quando}.', vesperaMsgOficina: '{carro}: il cliente non ha ancora risposto alla nuova data. La data prenotata è {quando}.',
    propostaNaoServeMsg: '{oficina} non può più nella data prenotata e propone {quando}. Motivo: {motivo}',
  },
};
export const textosMudanca = (idioma: string | null | undefined) => MX[idiomaDoSite(idioma)] || MX.en;
