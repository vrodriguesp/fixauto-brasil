import { idiomaDoSite } from './site-url';

// Avisos da mudanca de data e do cancelamento de agendamento (migracao 076):
// notificacao no app/site e a linha que entra no chat do pedido (a conversa e
// traduzida automaticamente para quem le, entao vai no idioma de quem escreve).
type T = {
  dataMudadaTitulo: string; dataMudadaMsg: string;
  canceladoTitulo: string; canceladoMsg: string;
  propostaTitulo: string; propostaMsg: string;
  aceitaTitulo: string; recusadaTitulo: string; decididaMsg: string;
  chatData: string; chatCancelado: string; chatProposta: string;
};
const X: Record<string, T> = {
  pt: {
    dataMudadaTitulo: 'Nova data do agendamento', dataMudadaMsg: '{oficina}: {quando}. Motivo: {motivo}',
    canceladoTitulo: 'Agendamento cancelado', canceladoMsg: '{oficina} cancelou o agendamento. Motivo: {motivo}',
    propostaTitulo: 'Proposta de nova data', propostaMsg: '{oficina} propõe {quando}. Motivo: {motivo}',
    aceitaTitulo: 'Nova data aceita', recusadaTitulo: 'Nova data recusada', decididaMsg: '{carro}: {quando}',
    chatData: '📅 Nova data para levar o carro: {quando}. Motivo: {motivo}', chatCancelado: '❌ Agendamento cancelado pela oficina. Motivo: {motivo}', chatProposta: '📅 Proposta de nova data: {quando}. Motivo: {motivo}',
  },
  'pt-PT': {
    dataMudadaTitulo: 'Nova data da marcação', dataMudadaMsg: '{oficina}: {quando}. Motivo: {motivo}',
    canceladoTitulo: 'Marcação cancelada', canceladoMsg: '{oficina} cancelou a marcação. Motivo: {motivo}',
    propostaTitulo: 'Proposta de nova data', propostaMsg: '{oficina} propõe {quando}. Motivo: {motivo}',
    aceitaTitulo: 'Nova data aceite', recusadaTitulo: 'Nova data recusada', decididaMsg: '{carro}: {quando}',
    chatData: '📅 Nova data para entregar o carro: {quando}. Motivo: {motivo}', chatCancelado: '❌ Marcação cancelada pela oficina. Motivo: {motivo}', chatProposta: '📅 Proposta de nova data: {quando}. Motivo: {motivo}',
  },
  en: {
    dataMudadaTitulo: 'New booking date', dataMudadaMsg: '{oficina}: {quando}. Reason: {motivo}',
    canceladoTitulo: 'Booking cancelled', canceladoMsg: '{oficina} cancelled the booking. Reason: {motivo}',
    propostaTitulo: 'New date proposed', propostaMsg: '{oficina} proposes {quando}. Reason: {motivo}',
    aceitaTitulo: 'New date accepted', recusadaTitulo: 'New date declined', decididaMsg: '{carro}: {quando}',
    chatData: '📅 New drop-off date: {quando}. Reason: {motivo}', chatCancelado: '❌ Booking cancelled by the repair shop. Reason: {motivo}', chatProposta: '📅 Proposed new date: {quando}. Reason: {motivo}',
  },
  et: {
    dataMudadaTitulo: 'Broneeringu uus aeg', dataMudadaMsg: '{oficina}: {quando}. Põhjus: {motivo}',
    canceladoTitulo: 'Broneering tühistatud', canceladoMsg: '{oficina} tühistas broneeringu. Põhjus: {motivo}',
    propostaTitulo: 'Uue aja ettepanek', propostaMsg: '{oficina} pakub aega {quando}. Põhjus: {motivo}',
    aceitaTitulo: 'Uus aeg võeti vastu', recusadaTitulo: 'Uuest ajast keelduti', decididaMsg: '{carro}: {quando}',
    chatData: '📅 Auto toomise uus aeg: {quando}. Põhjus: {motivo}', chatCancelado: '❌ Töökoda tühistas broneeringu. Põhjus: {motivo}', chatProposta: '📅 Uue aja ettepanek: {quando}. Põhjus: {motivo}',
  },
  ru: {
    dataMudadaTitulo: 'Новая дата записи', dataMudadaMsg: '{oficina}: {quando}. Причина: {motivo}',
    canceladoTitulo: 'Запись отменена', canceladoMsg: '{oficina} отменил запись. Причина: {motivo}',
    propostaTitulo: 'Предложена новая дата', propostaMsg: '{oficina} предлагает {quando}. Причина: {motivo}',
    aceitaTitulo: 'Новая дата принята', recusadaTitulo: 'Новая дата отклонена', decididaMsg: '{carro}: {quando}',
    chatData: '📅 Новая дата, когда привезти машину: {quando}. Причина: {motivo}', chatCancelado: '❌ Автосервис отменил запись. Причина: {motivo}', chatProposta: '📅 Предложение новой даты: {quando}. Причина: {motivo}',
  },
  it: {
    dataMudadaTitulo: 'Nuova data della prenotazione', dataMudadaMsg: '{oficina}: {quando}. Motivo: {motivo}',
    canceladoTitulo: 'Prenotazione annullata', canceladoMsg: '{oficina} ha annullato la prenotazione. Motivo: {motivo}',
    propostaTitulo: 'Proposta di nuova data', propostaMsg: '{oficina} propone {quando}. Motivo: {motivo}',
    aceitaTitulo: 'Nuova data accettata', recusadaTitulo: 'Nuova data rifiutata', decididaMsg: '{carro}: {quando}',
    chatData: '📅 Nuova data per portare l’auto: {quando}. Motivo: {motivo}', chatCancelado: '❌ Prenotazione annullata dall’officina. Motivo: {motivo}', chatProposta: '📅 Proposta di nuova data: {quando}. Motivo: {motivo}',
  },
};
const LOC: Record<string, string> = { et: 'et-EE', ru: 'ru-RU', en: 'en-GB', it: 'it-IT', 'pt-PT': 'pt-PT', pt: 'pt-BR' };

export const textosAgenda = (idioma: string | null | undefined) => X[idiomaDoSite(idioma)] || X.en;
export const preencher = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
/** data e hora no idioma de quem le, no fuso da oficina */
export const dataHora = (iso: string | Date, idioma: string | null | undefined, fuso: string) =>
  new Date(iso).toLocaleString(LOC[idiomaDoSite(idioma)] || 'en-GB', { timeZone: fuso, weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
