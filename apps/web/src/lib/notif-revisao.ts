// Avisos da revisao de orcamento aceito, no idioma de quem recebe.
type Idioma = 'pt' | 'pt-PT' | 'en' | 'et' | 'it' | 'ru';
const idiomaDe = (l?: string | null): Idioma =>
  (l && ['pt', 'pt-PT', 'en', 'et', 'it', 'ru'].includes(l) ? l : l?.startsWith('pt') ? 'pt' : 'en') as Idioma;
const preencher = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

const PROPOSTA: Record<Idioma, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'A oficina propôs uma revisão do orçamento', mensagem: '{oficina}: {de} → {para}. Motivo: {motivo}. Aprove, recuse ou retire o carro.' },
  'pt-PT': { titulo: 'A oficina propôs uma revisão do orçamento', mensagem: '{oficina}: {de} → {para}. Motivo: {motivo}. Aprove, recuse ou levante o carro.' },
  en: { titulo: 'The garage proposed a quote revision', mensagem: '{oficina}: {de} → {para}. Reason: {motivo}. Approve, decline or collect your car.' },
  et: { titulo: 'Töökoda pakkus hinnapakkumise muudatust', mensagem: '{oficina}: {de} → {para}. Põhjus: {motivo}. Kinnita, keeldu või vii auto ära.' },
  it: { titulo: "L'officina ha proposto una revisione del preventivo", mensagem: '{oficina}: {de} → {para}. Motivo: {motivo}. Approva, rifiuta o ritira l\'auto.' },
  ru: { titulo: 'Автосервис предложил изменить смету', mensagem: '{oficina}: {de} → {para}. Причина: {motivo}. Одобрите, откажитесь или заберите автомобиль.' },
};

const DECISAO: Record<Idioma, Record<'aprovada' | 'recusada' | 'retirada', { titulo: string; mensagem: string }>> = {
  pt: {
    aprovada: { titulo: 'Revisão aprovada pelo cliente', mensagem: '{carro}: novo valor {para}. Pode seguir com o serviço.' },
    recusada: { titulo: 'Revisão recusada pelo cliente', mensagem: '{carro}: o cliente mantém o orçamento original ({de}). Siga com o serviço combinado.' },
    retirada: { titulo: 'Cliente recusou a revisão e vai retirar o carro', mensagem: '{carro}: o serviço foi encerrado. Combine a retirada com o cliente pela conversa.' },
  },
  'pt-PT': {
    aprovada: { titulo: 'Revisão aprovada pelo cliente', mensagem: '{carro}: novo valor {para}. Pode avançar com o serviço.' },
    recusada: { titulo: 'Revisão recusada pelo cliente', mensagem: '{carro}: o cliente mantém o orçamento original ({de}). Avance com o serviço combinado.' },
    retirada: { titulo: 'O cliente recusou a revisão e vai levantar o carro', mensagem: '{carro}: o serviço foi encerrado. Combine o levantamento com o cliente na conversa.' },
  },
  en: {
    aprovada: { titulo: 'Revision approved by the customer', mensagem: '{carro}: new amount {para}. You can carry on with the job.' },
    recusada: { titulo: 'Revision declined by the customer', mensagem: '{carro}: the customer keeps the original quote ({de}). Carry on with the agreed job.' },
    retirada: { titulo: 'Customer declined the revision and will collect the car', mensagem: '{carro}: the job has been closed. Arrange the collection with the customer in the chat.' },
  },
  et: {
    aprovada: { titulo: 'Klient kinnitas muudatuse', mensagem: '{carro}: uus summa {para}. Võid tööga jätkata.' },
    recusada: { titulo: 'Klient keeldus muudatusest', mensagem: '{carro}: klient jääb algse hinnapakkumise juurde ({de}). Jätka kokkulepitud tööga.' },
    retirada: { titulo: 'Klient keeldus muudatusest ja viib auto ära', mensagem: '{carro}: töö on lõpetatud. Lepi auto äraviimine kliendiga vestluses kokku.' },
  },
  it: {
    aprovada: { titulo: 'Revisione approvata dal cliente', mensagem: '{carro}: nuovo importo {para}. Puoi proseguire con il lavoro.' },
    recusada: { titulo: 'Revisione rifiutata dal cliente', mensagem: '{carro}: il cliente mantiene il preventivo originale ({de}). Prosegui con il lavoro concordato.' },
    retirada: { titulo: "Il cliente ha rifiutato la revisione e ritirerà l'auto", mensagem: "{carro}: il servizio è chiuso. Concorda il ritiro con il cliente nella chat." },
  },
  ru: {
    aprovada: { titulo: 'Клиент одобрил изменение сметы', mensagem: '{carro}: новая сумма {para}. Можно продолжать работу.' },
    recusada: { titulo: 'Клиент отказался от изменения сметы', mensagem: '{carro}: клиент остаётся при исходной смете ({de}). Продолжайте согласованную работу.' },
    retirada: { titulo: 'Клиент отказался от изменения и заберёт автомобиль', mensagem: '{carro}: работа закрыта. Договоритесь с клиентом о выдаче в чате.' },
  },
};

export function notifRevisaoProposta(idioma: string | null | undefined, v: { oficina: string; de: string; para: string; motivo: string }) {
  const tx = PROPOSTA[idiomaDe(idioma)];
  return { titulo: tx.titulo, mensagem: preencher(tx.mensagem, { ...v, motivo: v.motivo.slice(0, 160) }) };
}

export function notifRevisaoDecidida(idioma: string | null | undefined, decisao: 'aprovada' | 'recusada' | 'retirada', v: { carro: string; de: string; para: string }) {
  const tx = DECISAO[idiomaDe(idioma)][decisao];
  return { titulo: tx.titulo, mensagem: preencher(tx.mensagem, v) };
}
