// Strings dos e-mails/WhatsApp transacionais, por idioma do DESTINATARIO
// (profiles.idioma) - nunca do idioma de quem disparou a acao. E-mail e
// enviado de forma assincrona/server-side, entao nao da pra usar
// next-intl (React) aqui; interpolacao simples com {chave}.

export type EmailLocale = 'pt' | 'pt-PT' | 'en' | 'et' | 'it' | 'ru';

export function resolveEmailLocale(locale: string | null | undefined): EmailLocale {
  if (locale === 'pt-PT' || locale === 'en' || locale === 'et' || locale === 'it' || locale === 'ru') return locale;
  // Outra variante de portugues -> pt (Brasil). Sem idioma ou idioma sem
  // textos proprios -> ingles (regra unica: idioma de quem recebe, senao en;
  // antes, sem idioma saia em portugues - feedback do dono 31/10).
  if (locale?.startsWith('pt')) return 'pt';
  return 'en';
}

function fmt(str: string, vars: Record<string, string | number> = {}): string {
  return str.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}

// "N dias" com singular/plural por idioma, para e-mails e mensagens de chat
// do sistema (fmt() nao tem plural ICU): antes saia "1 päeva", "1 days",
// "1 giorni" (Fable 14/11). RU usa a abreviacao invariavel "дн." (correta).
const DIAS: Record<EmailLocale, [string, string]> = {
  pt: ['dia', 'dias'],
  'pt-PT': ['dia', 'dias'],
  en: ['day', 'days'],
  et: ['päev', 'päeva'],
  it: ['giorno', 'giorni'],
  ru: ['дн.', 'дн.'],
};

export function diasTexto(locale: string | null | undefined, n: number): string {
  const l = resolveEmailLocale(locale);
  return `${n} ${DIAS[l][Number(n) === 1 ? 0 : 1]}`;
}

// Varios templates de e-mail interpolam texto livre digitado por quem nao
// necessariamente tem conta (ex: nome do "outro motorista" no fluxo de
// acidente, preenchido num formulario publico sem login) direto no HTML do
// e-mail via fmt() - sem isso, alguem podia colocar `<img src=x
// onerror=...>` ou um link falso no proprio nome e o Resend mandaria esse
// HTML de verdade, assinado como um e-mail legitimo da BipFix. Use sempre
// que o valor interpolado vier de um campo de texto livre (nome,
// descricao, comentario), nunca necessario pra valores que a propria
// aplicacao gera (datas, moeda ja formatada, textos fixos dos dicionarios
// abaixo).
export function escapeHtml(value: string | null | undefined): string {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { fmt };

type Dict = Record<string, string>;

const accidentNotification: Record<EmailLocale, Dict> = {
  pt: {
    subject: 'Registro de acidente - Veículo {placa}',
    headerTag: 'Registro de Acidente',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: '<strong>{fromName}</strong> registrou um acidente envolvendo seu veículo (placa <strong>{placa}</strong>) na plataforma BipFix.',
    canList: 'Através da plataforma, você pode:',
    li1: 'Completar o registro do seu veículo',
    li2: 'Trocar mensagens com o outro motorista',
    li3: 'Receber orçamentos de oficinas próximas para o reparo',
    li4: 'Enviar um orçamento para o reparo do seu veículo',
    li5: 'Entrar em acordo sobre a reparação',
    nextStepsLabel: 'Próximos passos:',
    nextStepsText: 'Acesse a plataforma, complete os dados do seu veículo e solicite orçamentos de oficinas para reparar os danos.',
    ctaRegistered: 'Ver detalhes do acidente',
    ctaUnregistered: 'Definir senha e acessar',
    accountCreatedNote: 'Criamos uma conta para você. Defina sua senha para acessar e acompanhar tudo.',
    automatedFooter: 'Este email foi enviado automaticamente pela plataforma BipFix. Se você não reconhece este acidente, ignore este email.',
  },
  en: {
    subject: 'Accident report - Vehicle {placa}',
    headerTag: 'Accident Report',
    greeting: 'Hi <strong>{name}</strong>,',
    intro: '<strong>{fromName}</strong> reported an accident involving your vehicle (plate <strong>{placa}</strong>) on the BipFix platform.',
    canList: 'On the platform, you can:',
    li1: 'Complete your vehicle registration',
    li2: 'Exchange messages with the other driver',
    li3: 'Receive quotes from nearby repair shops',
    li4: 'Send a quote for your vehicle repair',
    li5: 'Agree on the repair terms',
    nextStepsLabel: 'Next steps:',
    nextStepsText: 'Log in to the platform, complete your vehicle details, and request quotes from repair shops for the damage.',
    ctaRegistered: 'View accident details',
    ctaUnregistered: 'Set your password and log in',
    accountCreatedNote: "We've created an account for you. Set your password to log in and follow everything.",
    automatedFooter: "This email was sent automatically by the BipFix platform. If you don't recognize this accident, please ignore this email.",
  },
  et: {
    subject: 'Avarii registreerimine - sõiduk {placa}',
    headerTag: 'Avarii registreerimine',
    greeting: 'Tere, <strong>{name}</strong>,',
    intro: '<strong>{fromName}</strong> registreeris avarii, milles osales sinu sõiduk (registreerimismärk <strong>{placa}</strong>), BipFixi platvormil.',
    canList: 'Platvormi kaudu saad:',
    li1: 'Täiendada oma sõiduki andmeid',
    li2: 'Vahetada sõnumeid teise juhiga',
    li3: 'Saada hinnapakkumisi lähedal asuvatelt töökodadelt',
    li4: 'Saata hinnapakkumise oma sõiduki remondiks',
    li5: 'Leppida kokku remondi tingimustes',
    nextStepsLabel: 'Järgmised sammud:',
    nextStepsText: 'Logi platvormile sisse, täienda oma sõiduki andmeid ja küsi töökodadelt hinnapakkumisi kahjustuse parandamiseks.',
    ctaRegistered: 'Vaata avarii detaile',
    ctaUnregistered: 'Määra parool ja logi sisse',
    accountCreatedNote: 'Lõime sulle konto. Määra oma parool, et sisse logida ja kõike jälgida.',
    automatedFooter: 'See e-kiri saadeti automaatselt BipFixi platvormilt. Kui sa seda avariid ei tunne, siis eira seda kirja.',
  },
  it: {
    subject: 'Segnalazione incidente - Veicolo {placa}',
    headerTag: 'Segnalazione Incidente',
    greeting: 'Ciao <strong>{name}</strong>,',
    intro: '<strong>{fromName}</strong> ha segnalato un incidente che coinvolge il tuo veicolo (targa <strong>{placa}</strong>) sulla piattaforma BipFix.',
    canList: 'Sulla piattaforma puoi:',
    li1: 'Completare la registrazione del tuo veicolo',
    li2: "Scambiare messaggi con l'altro conducente",
    li3: 'Ricevere preventivi dalle officine vicine',
    li4: 'Inviare un preventivo per la riparazione del tuo veicolo',
    li5: 'Metterti d\'accordo sulla riparazione',
    nextStepsLabel: 'Prossimi passi:',
    nextStepsText: 'Accedi alla piattaforma, completa i dati del tuo veicolo e richiedi preventivi alle officine per riparare i danni.',
    ctaRegistered: "Vedi i dettagli dell'incidente",
    ctaUnregistered: 'Imposta la password e accedi',
    accountCreatedNote: 'Abbiamo creato un account per te. Imposta la tua password per accedere e seguire tutto.',
    automatedFooter: "Questa email è stata inviata automaticamente dalla piattaforma BipFix. Se non riconosci questo incidente, ignora questa email.",
  },
  'pt-PT': {
    subject: 'Registo de acidente - Veículo {placa}',
    headerTag: 'Registo de Acidente',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: '<strong>{fromName}</strong> registou um acidente que envolve o seu veículo (matrícula <strong>{placa}</strong>) na plataforma BipFix.',
    canList: 'Através da plataforma, pode:',
    li1: 'Completar o registo do seu veículo',
    li2: 'Trocar mensagens com o outro condutor',
    li3: 'Receber orçamentos de oficinas próximas para a reparação',
    li4: 'Enviar um orçamento para a reparação do seu veículo',
    li5: 'Chegar a acordo sobre a reparação',
    nextStepsLabel: 'Próximos passos:',
    nextStepsText: 'Aceda à plataforma, complete os dados do seu veículo e peça orçamentos a oficinas para reparar os danos.',
    ctaRegistered: 'Ver detalhes do acidente',
    ctaUnregistered: 'Definir palavra-passe e aceder',
    accountCreatedNote: 'Criámos uma conta para si. Defina a sua palavra-passe para aceder e acompanhar tudo.',
    automatedFooter: 'Este e-mail foi enviado automaticamente pela plataforma BipFix. Se não reconhece este acidente, ignore este e-mail.',
  },
  ru: {
    subject: 'Регистрация ДТП - автомобиль {placa}',
    headerTag: 'Регистрация ДТП',
    greeting: 'Здравствуйте, <strong>{name}</strong>!',
    intro: '<strong>{fromName}</strong> зарегистрировал(а) на платформе BipFix ДТП с участием вашего автомобиля (госномер <strong>{placa}</strong>).',
    canList: 'На платформе вы можете:',
    li1: 'Дополнить данные своего автомобиля',
    li2: 'Обмениваться сообщениями с другим водителем',
    li3: 'Получать сметы на ремонт от ближайших автосервисов',
    li4: 'Отправить смету на ремонт своего автомобиля',
    li5: 'Договориться об условиях ремонта',
    nextStepsLabel: 'Следующие шаги:',
    nextStepsText: 'Войдите на платформу, дополните данные автомобиля и запросите у автосервисов сметы на ремонт повреждений.',
    ctaRegistered: 'Посмотреть детали ДТП',
    ctaUnregistered: 'Задать пароль и войти',
    accountCreatedNote: 'Мы создали для вас аккаунт. Задайте пароль, чтобы войти и следить за всем.',
    automatedFooter: 'Это письмо отправлено автоматически платформой BipFix. Если вы не знаете об этом ДТП, просто проигнорируйте письмо.',
  },
};

const funcionarioNovaSenha: Record<EmailLocale, Dict> = {
  pt: {
    subject: '{oficinaNome} redefiniu sua senha - BipFix',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: '<strong>{oficinaNome}</strong> gerou uma nova senha temporária para sua conta.',
    tempPasswordLabel: 'Sua senha temporária:',
    nextLoginNote: 'No próximo login, você será solicitado a escolher uma nova senha.',
    cta: 'Acessar minha conta',
    footer: 'Equipe BipFix',
  },
  en: {
    subject: '{oficinaNome} reset your password - BipFix',
    greeting: 'Hi <strong>{name}</strong>,',
    intro: '<strong>{oficinaNome}</strong> generated a new temporary password for your account.',
    tempPasswordLabel: 'Your temporary password:',
    nextLoginNote: "On your next login, you'll be asked to choose a new password.",
    cta: 'Log in to my account',
    footer: 'The BipFix Team',
  },
  et: {
    subject: '{oficinaNome} lähtestas sinu parooli - BipFix',
    greeting: 'Tere, <strong>{name}</strong>,',
    intro: '<strong>{oficinaNome}</strong> lõi sinu kontole uue ajutise parooli.',
    tempPasswordLabel: 'Sinu ajutine parool:',
    nextLoginNote: 'Järgmisel sisselogimisel palutakse sul valida uus parool.',
    cta: 'Logi oma kontole sisse',
    footer: 'BipFixi meeskond',
  },
  it: {
    subject: '{oficinaNome} ha reimpostato la tua password - BipFix',
    greeting: 'Ciao <strong>{name}</strong>,',
    intro: '<strong>{oficinaNome}</strong> ha generato una nuova password temporanea per il tuo account.',
    tempPasswordLabel: 'La tua password temporanea:',
    nextLoginNote: 'Al prossimo accesso ti verrà chiesto di scegliere una nuova password.',
    cta: 'Accedi al mio account',
    footer: 'Il team BipFix',
  },
  'pt-PT': {
    subject: '{oficinaNome} redefiniu a sua palavra-passe - BipFix',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: '<strong>{oficinaNome}</strong> gerou uma nova palavra-passe temporária para a sua conta.',
    tempPasswordLabel: 'A sua palavra-passe temporária:',
    nextLoginNote: 'No próximo início de sessão, ser-lhe-á pedido que escolha uma nova palavra-passe.',
    cta: 'Aceder à minha conta',
    footer: 'Equipa BipFix',
  },
  ru: {
    subject: '{oficinaNome} сбросил ваш пароль - BipFix',
    greeting: 'Здравствуйте, <strong>{name}</strong>!',
    intro: '<strong>{oficinaNome}</strong> создал новый временный пароль для вашего аккаунта.',
    tempPasswordLabel: 'Ваш временный пароль:',
    nextLoginNote: 'При следующем входе вам будет предложено выбрать новый пароль.',
    cta: 'Войти в мой аккаунт',
    footer: 'Команда BipFix',
  },
};

const quoteNotification: Record<EmailLocale, Dict> = {
  pt: {
    subject: 'Novo orçamento recebido - {oficinaNome}',
    headerTag: 'Novo Orçamento',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: 'A oficina <strong>{oficinaNome}</strong> enviou um orçamento para sua solicitação:',
    prazo: 'Prazo do conserto: {prazoDias}',
    cta: 'Ver orçamento completo',
  },
  en: {
    subject: 'New quote received - {oficinaNome}',
    headerTag: 'New Quote',
    greeting: 'Hi <strong>{name}</strong>,',
    intro: 'Repair shop <strong>{oficinaNome}</strong> sent a quote for your request:',
    prazo: 'Repair time: {prazoDias}',
    cta: 'View full quote',
  },
  et: {
    subject: 'Uus hinnapakkumine - {oficinaNome}',
    headerTag: 'Uus hinnapakkumine',
    greeting: 'Tere, <strong>{name}</strong>,',
    intro: 'Töökoda <strong>{oficinaNome}</strong> saatis sinu päringule hinnapakkumise:',
    prazo: 'Remondi kestus: {prazoDias}',
    cta: 'Vaata täielikku hinnapakkumist',
  },
  it: {
    subject: 'Nuovo preventivo ricevuto - {oficinaNome}',
    headerTag: 'Nuovo Preventivo',
    greeting: 'Ciao <strong>{name}</strong>,',
    intro: "L'officina <strong>{oficinaNome}</strong> ha inviato un preventivo per la tua richiesta:",
    prazo: 'Durata della riparazione: {prazoDias}',
    cta: 'Vedi preventivo completo',
  },
  'pt-PT': {
    subject: 'Novo orçamento recebido - {oficinaNome}',
    headerTag: 'Novo Orçamento',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: 'A oficina <strong>{oficinaNome}</strong> enviou um orçamento para o seu pedido:',
    prazo: 'Prazo da reparação: {prazoDias}',
    cta: 'Ver orçamento completo',
  },
  ru: {
    subject: 'Новая смета - {oficinaNome}',
    headerTag: 'Новая смета',
    greeting: 'Здравствуйте, <strong>{name}</strong>!',
    intro: 'Автосервис <strong>{oficinaNome}</strong> отправил смету по вашей заявке:',
    prazo: 'Срок ремонта: {prazoDias}',
    cta: 'Посмотреть смету полностью',
  },
};

const servicoConcluido: Record<EmailLocale, Dict> = {
  pt: {
    subject: 'Seu veículo está pronto! - {oficinaNome}',
    headerTag: 'Serviço concluído',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: 'Seu veículo <strong>{veiculoNome}</strong> já foi finalizado na oficina <strong>{oficinaNome}</strong> e está pronto para retirada.',
    cta: 'Ver detalhes e avaliar',
  },
  en: {
    subject: 'Your vehicle is ready! - {oficinaNome}',
    headerTag: 'Service completed',
    greeting: 'Hi <strong>{name}</strong>,',
    intro: 'Your vehicle <strong>{veiculoNome}</strong> has been finished at <strong>{oficinaNome}</strong> and is ready for pickup.',
    cta: 'View details and rate',
  },
  et: {
    subject: 'Sinu sõiduk on valmis! - {oficinaNome}',
    headerTag: 'Teenus lõpetatud',
    greeting: 'Tere, <strong>{name}</strong>,',
    intro: 'Sinu sõiduk <strong>{veiculoNome}</strong> on töökojas <strong>{oficinaNome}</strong> valmis ja ootab kättesaamist.',
    cta: 'Vaata detaile ja hinda',
  },
  it: {
    subject: 'Il tuo veicolo è pronto! - {oficinaNome}',
    headerTag: 'Servizio completato',
    greeting: 'Ciao <strong>{name}</strong>,',
    intro: 'Il tuo veicolo <strong>{veiculoNome}</strong> è stato completato presso <strong>{oficinaNome}</strong> ed è pronto per il ritiro.',
    cta: 'Vedi i dettagli e valuta',
  },
  'pt-PT': {
    subject: 'O seu veículo está pronto! - {oficinaNome}',
    headerTag: 'Serviço concluído',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: 'O seu veículo <strong>{veiculoNome}</strong> já está concluído na oficina <strong>{oficinaNome}</strong> e pronto para ser levantado.',
    cta: 'Ver detalhes e avaliar',
  },
  ru: {
    subject: 'Ваш автомобиль готов! - {oficinaNome}',
    headerTag: 'Работы завершены',
    greeting: 'Здравствуйте, <strong>{name}</strong>!',
    intro: 'Ваш автомобиль <strong>{veiculoNome}</strong> готов в автосервисе <strong>{oficinaNome}</strong>, его можно забирать.',
    cta: 'Посмотреть детали и оставить отзыв',
  },
};

const cotacaoPecaDisponivel: Record<EmailLocale, Dict> = {
  pt: {
    subject: 'Oficina próxima precisa de: {pecaDescricao}',
    headerTag: 'Nova cotação de peça próxima',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: 'A oficina <strong>{oficinaCompradoraNome}</strong>, perto de você, precisa de:',
    callToAction: 'Se tiver em estoque, responda com preço e prazo pra ganhar a venda.',
    cta: 'Ver cotação e responder',
  },
  en: {
    subject: 'A nearby shop needs: {pecaDescricao}',
    headerTag: 'New nearby part request',
    greeting: 'Hi <strong>{name}</strong>,',
    intro: 'Repair shop <strong>{oficinaCompradoraNome}</strong>, near you, needs:',
    callToAction: 'If you have it in stock, respond with a price and delivery time to win the sale.',
    cta: 'View request and respond',
  },
  et: {
    subject: 'Lähedal asuv töökoda vajab: {pecaDescricao}',
    headerTag: 'Uus lähedane varuosa päring',
    greeting: 'Tere, <strong>{name}</strong>,',
    intro: 'Sinu lähedal asuv töökoda <strong>{oficinaCompradoraNome}</strong> vajab:',
    callToAction: 'Kui sul on see laos, vasta hinna ja tarneajaga, et müük võita.',
    cta: 'Vaata päringut ja vasta',
  },
  it: {
    subject: "Un'officina vicina ha bisogno di: {pecaDescricao}",
    headerTag: 'Nuova richiesta di ricambi vicina',
    greeting: 'Ciao <strong>{name}</strong>,',
    intro: "L'officina <strong>{oficinaCompradoraNome}</strong>, vicino a te, ha bisogno di:",
    callToAction: "Se lo hai in magazzino, rispondi con prezzo e tempi per aggiudicarti la vendita.",
    cta: 'Vedi richiesta e rispondi',
  },
  'pt-PT': {
    subject: 'Oficina próxima precisa de: {pecaDescricao}',
    headerTag: 'Nova cotação de peça perto de si',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: 'A oficina <strong>{oficinaCompradoraNome}</strong>, perto de si, precisa de:',
    callToAction: 'Se tiver em stock, responda com preço e prazo para ganhar a venda.',
    cta: 'Ver cotação e responder',
  },
  ru: {
    subject: 'Автосервису рядом нужно: {pecaDescricao}',
    headerTag: 'Новый запрос запчасти рядом с вами',
    greeting: 'Здравствуйте, <strong>{name}</strong>!',
    intro: 'Автосервису <strong>{oficinaCompradoraNome}</strong> рядом с вами нужно:',
    callToAction: 'Если есть в наличии, ответьте с ценой и сроком поставки, чтобы получить заказ.',
    cta: 'Посмотреть запрос и ответить',
  },
};

const cotacaoPecaRespondida: Record<EmailLocale, Dict> = {
  pt: {
    subject: 'Nova resposta de cotação: {pecaDescricao}',
    headerTag: 'Resposta de cotação de peça',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: '<strong>{fornecedorNome}</strong> respondeu sua cotação de "{pecaDescricao}":',
    prazo: 'Prazo: {prazoDias}',
    cta: 'Ver resposta completa',
  },
  en: {
    subject: 'New quote response: {pecaDescricao}',
    headerTag: 'Part quote response',
    greeting: 'Hi <strong>{name}</strong>,',
    intro: '<strong>{fornecedorNome}</strong> responded to your quote request for "{pecaDescricao}":',
    prazo: 'Delivery time: {prazoDias}',
    cta: 'View full response',
  },
  et: {
    subject: 'Uus vastus hinnapäringule: {pecaDescricao}',
    headerTag: 'Varuosa hinnapäringu vastus',
    greeting: 'Tere, <strong>{name}</strong>,',
    intro: '<strong>{fornecedorNome}</strong> vastas sinu hinnapäringule "{pecaDescricao}":',
    prazo: 'Tarneaeg: {prazoDias}',
    cta: 'Vaata täielikku vastust',
  },
  it: {
    subject: 'Nuova risposta al preventivo: {pecaDescricao}',
    headerTag: 'Risposta preventivo ricambio',
    greeting: 'Ciao <strong>{name}</strong>,',
    intro: '<strong>{fornecedorNome}</strong> ha risposto alla tua richiesta di preventivo per "{pecaDescricao}":',
    prazo: 'Tempi di consegna: {prazoDias}',
    cta: 'Vedi risposta completa',
  },
  'pt-PT': {
    subject: 'Nova resposta à cotação: {pecaDescricao}',
    headerTag: 'Resposta à cotação de peça',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: '<strong>{fornecedorNome}</strong> respondeu à sua cotação de "{pecaDescricao}":',
    prazo: 'Prazo: {prazoDias}',
    cta: 'Ver resposta completa',
  },
  ru: {
    subject: 'Новый ответ на запрос: {pecaDescricao}',
    headerTag: 'Ответ на запрос запчасти',
    greeting: 'Здравствуйте, <strong>{name}</strong>!',
    intro: '<strong>{fornecedorNome}</strong> ответил на ваш запрос «{pecaDescricao}»:',
    prazo: 'Срок поставки: {prazoDias}',
    cta: 'Посмотреть ответ полностью',
  },
};

const pedidoPecaConfirmado: Record<EmailLocale, Dict> = {
  pt: {
    subject: 'Pedido de peça confirmado: {pecaDescricao}',
    headerTag: 'Pedido confirmado!',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: '<strong>{oficinaCompradoraNome}</strong> confirmou o pedido de "{pecaDescricao}":',
    deliveryNote: 'Combine a entrega diretamente com a oficina e marque como entregue no seu painel quando concluir.',
    cta: 'Ver pedido',
  },
  en: {
    subject: 'Part order confirmed: {pecaDescricao}',
    headerTag: 'Order confirmed!',
    greeting: 'Hi <strong>{name}</strong>,',
    intro: '<strong>{oficinaCompradoraNome}</strong> confirmed the order for "{pecaDescricao}":',
    deliveryNote: 'Arrange delivery directly with the shop and mark it as delivered in your dashboard once done.',
    cta: 'View order',
  },
  et: {
    subject: 'Varuosa tellimus kinnitatud: {pecaDescricao}',
    headerTag: 'Tellimus kinnitatud!',
    greeting: 'Tere, <strong>{name}</strong>,',
    intro: '<strong>{oficinaCompradoraNome}</strong> kinnitas tellimuse "{pecaDescricao}":',
    deliveryNote: 'Lepi tarne osas kokku otse töökojaga ja märgi see oma töölaual tarnituks, kui oled valmis.',
    cta: 'Vaata tellimust',
  },
  it: {
    subject: 'Ordine ricambio confermato: {pecaDescricao}',
    headerTag: 'Ordine confermato!',
    greeting: 'Ciao <strong>{name}</strong>,',
    intro: '<strong>{oficinaCompradoraNome}</strong> ha confermato l\'ordine per "{pecaDescricao}":',
    deliveryNote: "Concorda la consegna direttamente con l'officina e segnalo come consegnato nella tua dashboard una volta completato.",
    cta: "Vedi l'ordine",
  },
  'pt-PT': {
    subject: 'Encomenda de peça confirmada: {pecaDescricao}',
    headerTag: 'Encomenda confirmada!',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: '<strong>{oficinaCompradoraNome}</strong> confirmou a encomenda de "{pecaDescricao}":',
    deliveryNote: 'Combine a entrega diretamente com a oficina e marque como entregue no seu painel quando concluir.',
    cta: 'Ver encomenda',
  },
  ru: {
    subject: 'Заказ запчасти подтверждён: {pecaDescricao}',
    headerTag: 'Заказ подтверждён!',
    greeting: 'Здравствуйте, <strong>{name}</strong>!',
    intro: '<strong>{oficinaCompradoraNome}</strong> подтвердил заказ «{pecaDescricao}»:',
    deliveryNote: 'Договоритесь о доставке напрямую с автосервисом и отметьте заказ как доставленный в своей панели, когда всё будет сделано.',
    cta: 'Посмотреть заказ',
  },
};

const pedidoPecaEntregue: Record<EmailLocale, Dict> = {
  pt: {
    subject: 'Peça entregue: {pecaDescricao}',
    headerTag: 'Pedido entregue',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: '<strong>{fornecedorNome}</strong> marcou como entregue o pedido de "{pecaDescricao}".',
    cta: 'Ver detalhes',
  },
  en: {
    subject: 'Part delivered: {pecaDescricao}',
    headerTag: 'Order delivered',
    greeting: 'Hi <strong>{name}</strong>,',
    intro: '<strong>{fornecedorNome}</strong> marked the order for "{pecaDescricao}" as delivered.',
    cta: 'View details',
  },
  et: {
    subject: 'Varuosa tarnitud: {pecaDescricao}',
    headerTag: 'Tellimus tarnitud',
    greeting: 'Tere, <strong>{name}</strong>,',
    intro: '<strong>{fornecedorNome}</strong> märkis tellimuse "{pecaDescricao}" tarnituks.',
    cta: 'Vaata detaile',
  },
  it: {
    subject: 'Ricambio consegnato: {pecaDescricao}',
    headerTag: 'Ordine consegnato',
    greeting: 'Ciao <strong>{name}</strong>,',
    intro: '<strong>{fornecedorNome}</strong> ha segnato come consegnato l\'ordine per "{pecaDescricao}".',
    cta: 'Vedi dettagli',
  },
  'pt-PT': {
    subject: 'Peça entregue: {pecaDescricao}',
    headerTag: 'Encomenda entregue',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: '<strong>{fornecedorNome}</strong> marcou como entregue a encomenda de "{pecaDescricao}".',
    cta: 'Ver detalhes',
  },
  ru: {
    subject: 'Запчасть доставлена: {pecaDescricao}',
    headerTag: 'Заказ доставлен',
    greeting: 'Здравствуйте, <strong>{name}</strong>!',
    intro: '<strong>{fornecedorNome}</strong> отметил заказ «{pecaDescricao}» как доставленный.',
    cta: 'Посмотреть детали',
  },
};

// Portal de pecas (16/11): rotulos comuns dos e-mails de pedido novo (B3/M6) e de
// pedido confirmado (A4) - carro, quantidade, detalhes, valor total e contato.
const pecaDetalhes: Record<EmailLocale, Dict> = {
  pt: { subjectLoja: 'Novo pedido de peça: {pecaDescricao}', headerTagLoja: 'Novo pedido de peça', introLoja: 'A oficina <strong>{oficinaCompradoraNome}</strong> precisa de:', veiculo: 'Veículo', quantidade: 'Quantidade', detalhes: 'Detalhes', total: 'Valor total', contatoTitulo: 'Contato da oficina', telefone: 'Telefone', endereco: 'Endereço' },
  en: { subjectLoja: 'New part request: {pecaDescricao}', headerTagLoja: 'New part request', introLoja: 'Repair shop <strong>{oficinaCompradoraNome}</strong> needs:', veiculo: 'Vehicle', quantidade: 'Quantity', detalhes: 'Details', total: 'Total', contatoTitulo: 'Shop contact', telefone: 'Phone', endereco: 'Address' },
  et: { subjectLoja: 'Uus varuosa päring: {pecaDescricao}', headerTagLoja: 'Uus varuosa päring', introLoja: 'Töökoda <strong>{oficinaCompradoraNome}</strong> vajab:', veiculo: 'Sõiduk', quantidade: 'Kogus', detalhes: 'Üksikasjad', total: 'Kokku', contatoTitulo: 'Töökoja kontakt', telefone: 'Telefon', endereco: 'Aadress' },
  it: { subjectLoja: 'Nuova richiesta di ricambio: {pecaDescricao}', headerTagLoja: 'Nuova richiesta di ricambio', introLoja: "L'officina <strong>{oficinaCompradoraNome}</strong> cerca:", veiculo: 'Veicolo', quantidade: 'Quantità', detalhes: 'Dettagli', total: 'Totale', contatoTitulo: "Contatto dell'officina", telefone: 'Telefono', endereco: 'Indirizzo' },
  'pt-PT': { subjectLoja: 'Novo pedido de peça: {pecaDescricao}', headerTagLoja: 'Novo pedido de peça', introLoja: 'A oficina <strong>{oficinaCompradoraNome}</strong> precisa de:', veiculo: 'Veículo', quantidade: 'Quantidade', detalhes: 'Detalhes', total: 'Valor total', contatoTitulo: 'Contacto da oficina', telefone: 'Telefone', endereco: 'Morada' },
  ru: { subjectLoja: 'Новый запрос запчасти: {pecaDescricao}', headerTagLoja: 'Новый запрос запчасти', introLoja: 'Автосервису <strong>{oficinaCompradoraNome}</strong> нужно:', veiculo: 'Автомобиль', quantidade: 'Количество', detalhes: 'Подробности', total: 'Итого', contatoTitulo: 'Контакты автосервиса', telefone: 'Телефон', endereco: 'Адрес' },
};

// Lote 2 de pecas (17/11): urgencia, "aberta ate", botao "Nao tenho", resumo de 2 h e IVA/oferta
// parcial. So aparecem quando a cotacao/oferta tem esses dados (tela nova); sem eles o e-mail e o de hoje.
const pecaAvisos: Record<EmailLocale, Dict> = {
  pt: { urgencia: 'Urgência', urg_hoje: 'Hoje', urg_amanha: 'Amanhã', urg_sem_pressa: 'Sem pressa', abertaAte: 'Aberto a ofertas até', naoTenho: 'Não tenho esta peça', naoTenhoAjuda: 'Um toque e este pedido some da sua lista (sem precisar entrar).', semVeiculo: 'Sem veículo', resumoAssunto: 'BipFix: pedidos de peça à espera da sua oferta ({n})', resumoTag: 'Resumo de pedidos de peça', resumoIntro: 'Estes pedidos de peça das oficinas ainda estão abertos e sem oferta sua:', resumoCta: 'Ver pedidos de peça', resumoRodape: 'Pedidos sem pressa chegam neste resumo nos dias úteis (8h e a cada 2 horas, até as 18h). Os urgentes continuam chegando na hora.', cidade: 'Oficina em', total: 'Total', ivaSem: 'sem IVA ≈ {valor} ({pct} %)', ivaNaoAplicavel: 'IVA não aplicável (fornecedor não registrado)', ivaMargem: 'IVA não dedutível — regime de margem (peça usada)', ofertaParcial: 'Oferta parcial: {ofertada} de {pedida}' },
  'pt-PT': { urgencia: 'Urgência', urg_hoje: 'Hoje', urg_amanha: 'Amanhã', urg_sem_pressa: 'Sem pressa', abertaAte: 'Aberto a propostas até', naoTenho: 'Não tenho esta peça', naoTenhoAjuda: 'Um toque e este pedido sai da sua lista (sem precisar de entrar).', semVeiculo: 'Sem veículo', resumoAssunto: 'BipFix: pedidos de peças à espera da sua proposta ({n})', resumoTag: 'Resumo de pedidos de peças', resumoIntro: 'Estes pedidos de peças das oficinas ainda estão abertos e sem proposta sua:', resumoCta: 'Ver pedidos de peças', resumoRodape: 'Os pedidos sem pressa chegam neste resumo nos dias úteis (às 8h e a cada 2 horas, até às 18h). Os urgentes continuam a chegar na hora.', cidade: 'Oficina em', total: 'Total', ivaSem: 'sem IVA ≈ {valor} ({pct} %)', ivaNaoAplicavel: 'IVA não aplicável (fornecedor não registado)', ivaMargem: 'IVA não dedutível — regime de margem (peça usada)', ofertaParcial: 'Proposta parcial: {ofertada} de {pedida}' },
  en: { urgencia: 'Urgency', urg_hoje: 'Today', urg_amanha: 'Tomorrow', urg_sem_pressa: 'No rush', abertaAte: 'Open for offers until', naoTenho: "I don't have this part", naoTenhoAjuda: 'One tap and this request leaves your list (no login needed).', semVeiculo: 'No vehicle', resumoAssunto: 'BipFix: part requests waiting for your offer ({n})', resumoTag: 'Part requests summary', resumoIntro: 'These part requests from repair shops are still open and have no offer from you:', resumoCta: 'View part requests', resumoRodape: 'Requests with no rush arrive in this summary on working days (8:00 and every 2 hours until 18:00). Urgent ones still arrive right away.', cidade: 'Repair shop in', total: 'Total', ivaSem: 'excl. VAT ≈ {valor} ({pct} %)', ivaNaoAplicavel: 'VAT not applicable (supplier not VAT-registered)', ivaMargem: 'VAT not deductible — margin scheme (used part)', ofertaParcial: 'Partial offer: {ofertada} of {pedida}' },
  et: { urgencia: 'Kiireloomulisus', urg_hoje: 'Täna', urg_amanha: 'Homme', urg_sem_pressa: 'Pole kiiret', abertaAte: 'Pakkumisi oodatakse kuni', naoTenho: 'Mul seda varuosa pole', naoTenhoAjuda: 'Üks puudutus ja päring kaob sinu nimekirjast (sisselogimist pole vaja).', semVeiculo: 'Sõidukita', resumoAssunto: 'BipFix: varuosa päringud ootavad sinu pakkumist ({n})', resumoTag: 'Varuosa päringute kokkuvõte', resumoIntro: 'Need töökodade varuosa päringud on veel avatud ja sinu pakkumiseta:', resumoCta: 'Vaata varuosa päringuid', resumoRodape: 'Kiireloomulisuseta päringud tulevad sellesse kokkuvõttesse tööpäevadel (kell 8 ja iga 2 tunni järel kuni 18-ni). Kiireloomulised tulevad endiselt kohe.', cidade: 'Töökoda asukohaga', total: 'Kokku', ivaSem: 'km-ta ≈ {valor} ({pct} %)', ivaNaoAplicavel: 'Käibemaks ei kohaldu (tarnija pole käibemaksukohustuslane)', ivaMargem: 'Käibemaks pole mahaarvatav — kasumimarginaali kord (kasutatud varuosa)', ofertaParcial: 'Osaline pakkumine: {ofertada} / {pedida}' },
  it: { urgencia: 'Urgenza', urg_hoje: 'Oggi', urg_amanha: 'Domani', urg_sem_pressa: 'Senza fretta', abertaAte: 'Aperta alle offerte fino a', naoTenho: 'Non ho questo ricambio', naoTenhoAjuda: 'Un tocco e la richiesta esce dal tuo elenco (senza accedere).', semVeiculo: 'Senza veicolo', resumoAssunto: 'BipFix: richieste di ricambi in attesa della tua offerta ({n})', resumoTag: 'Riepilogo richieste di ricambi', resumoIntro: 'Queste richieste di ricambi delle officine sono ancora aperte e senza una tua offerta:', resumoCta: 'Vedi le richieste', resumoRodape: 'Le richieste senza fretta arrivano in questo riepilogo nei giorni feriali (alle 8 e ogni 2 ore fino alle 18). Quelle urgenti arrivano subito.', cidade: 'Officina a', total: 'Totale', ivaSem: 'IVA esclusa ≈ {valor} ({pct} %)', ivaNaoAplicavel: 'IVA non applicabile (fornitore non registrato)', ivaMargem: 'IVA non detraibile — regime del margine (ricambio usato)', ofertaParcial: 'Offerta parziale: {ofertada} su {pedida}' },
  ru: { urgencia: 'Срочность', urg_hoje: 'Сегодня', urg_amanha: 'Завтра', urg_sem_pressa: 'Не срочно', abertaAte: 'Предложения принимаются до', naoTenho: 'У меня нет этой запчасти', naoTenhoAjuda: 'Одно нажатие — и запрос исчезнет из вашего списка (без входа).', semVeiculo: 'Без автомобиля', resumoAssunto: 'BipFix: запросы запчастей ждут вашего предложения ({n})', resumoTag: 'Сводка запросов запчастей', resumoIntro: 'Эти запросы запчастей от автосервисов ещё открыты, и от вас нет предложения:', resumoCta: 'Посмотреть запросы', resumoRodape: 'Несрочные запросы приходят в этой сводке по рабочим дням (в 8:00 и каждые 2 часа до 18:00). Срочные по-прежнему приходят сразу.', cidade: 'Автосервис в', total: 'Итого', ivaSem: 'без НДС ≈ {valor} ({pct} %)', ivaNaoAplicavel: 'НДС не применяется (поставщик не плательщик НДС)', ivaMargem: 'НДС не вычитается — режим маржи (б/у запчасть)', ofertaParcial: 'Частичное предложение: {ofertada} из {pedida}' },
};

// Lote 1 de pecas (17/11): rotulos curtos das unidades (os mesmos da tela, messages
// pecas.unidades.*) e o numero no formato da lingua de quem recebe.
const UNIDADES_PECA_TEXTO: Record<EmailLocale, Record<string, string>> = {
  pt: { un: 'un', jogo: 'jg', par: 'pr', litro: 'l', kg: 'kg', metro: 'm', caixa: 'cx' },
  'pt-PT': { un: 'un', jogo: 'jg', par: 'pr', litro: 'l', kg: 'kg', metro: 'm', caixa: 'cx' },
  en: { un: 'pcs', jogo: 'set', par: 'pair', litro: 'l', kg: 'kg', metro: 'm', caixa: 'box' },
  et: { un: 'tk', jogo: 'kmpl', par: 'paar', litro: 'l', kg: 'kg', metro: 'm', caixa: 'karp' },
  it: { un: 'pz', jogo: 'kit', par: 'paio', litro: 'l', kg: 'kg', metro: 'm', caixa: 'conf.' },
  ru: { un: 'шт.', jogo: 'компл.', par: 'пар', litro: 'л', kg: 'кг', metro: 'м', caixa: 'кор.' },
};
const NUMERO_LOCALE: Record<EmailLocale, string> = { pt: 'pt-BR', 'pt-PT': 'pt-PT', en: 'en-GB', et: 'et-EE', it: 'it-IT', ru: 'ru-RU' };

/** numero no formato da lingua de quem recebe (ate 2 casas) */
export function numeroTexto(locale: string | null | undefined, n: number): string {
  return new Intl.NumberFormat(NUMERO_LOCALE[resolveEmailLocale(locale)], { maximumFractionDigits: 2 }).format(Number(n) || 0);
}

/** data e hora no fuso de quem recebe (lote 2: "aberta ate" nos e-mails de pecas) */
export function dataHoraTexto(locale: string | null | undefined, iso: string, fuso: string): string {
  return new Intl.DateTimeFormat(NUMERO_LOCALE[resolveEmailLocale(locale)], { timeZone: fuso, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** Quantidade para e-mail e aviso. Unidade 'un' com numero inteiro: exatamente como antes ("2"). */
export function quantidadeTexto(locale: string | null | undefined, quantidade: number | string | null | undefined, unidade?: string | null): string {
  const n = Number(quantidade) || 1;
  if ((!unidade || unidade === 'un') && Number.isInteger(n)) return String(n);
  const l = resolveEmailLocale(locale);
  const numero = new Intl.NumberFormat(NUMERO_LOCALE[l], { maximumFractionDigits: 2 }).format(n);
  return `${numero} ${UNIDADES_PECA_TEXTO[l][unidade || 'un'] || unidade}`;
}

// A2 (16/11): mensagem nova na conversa de um pedido de peca. Sai no maximo uma vez
// por hora por conversa (rota /api/notificar-mensagem-peca).
const mensagemPeca: Record<EmailLocale, Dict> = {
  pt: { subject: 'Nova mensagem sobre: {pecaDescricao}', headerTag: 'Nova mensagem', greeting: 'Olá <strong>{name}</strong>,', intro: '<strong>{remetente}</strong> escreveu sobre o pedido de peça "{pecaDescricao}".', cta: 'Abrir conversa' },
  en: { subject: 'New message about: {pecaDescricao}', headerTag: 'New message', greeting: 'Hi <strong>{name}</strong>,', intro: '<strong>{remetente}</strong> wrote about the part request "{pecaDescricao}".', cta: 'Open conversation' },
  et: { subject: 'Uus sõnum: {pecaDescricao}', headerTag: 'Uus sõnum', greeting: 'Tere, <strong>{name}</strong>,', intro: '<strong>{remetente}</strong> kirjutas varuosa päringu "{pecaDescricao}" kohta.', cta: 'Ava vestlus' },
  it: { subject: 'Nuovo messaggio su: {pecaDescricao}', headerTag: 'Nuovo messaggio', greeting: 'Ciao <strong>{name}</strong>,', intro: '<strong>{remetente}</strong> ha scritto riguardo alla richiesta di ricambio "{pecaDescricao}".', cta: 'Apri la conversazione' },
  'pt-PT': { subject: 'Nova mensagem sobre: {pecaDescricao}', headerTag: 'Nova mensagem', greeting: 'Olá <strong>{name}</strong>,', intro: '<strong>{remetente}</strong> escreveu sobre o pedido de peça "{pecaDescricao}".', cta: 'Abrir conversa' },
  ru: { subject: 'Новое сообщение: {pecaDescricao}', headerTag: 'Новое сообщение', greeting: 'Здравствуйте, <strong>{name}</strong>!', intro: '<strong>{remetente}</strong> написал(а) по запросу запчасти «{pecaDescricao}».', cta: 'Открыть переписку' },
};

// M1 (16/11): o admin ativou a loja de pecas
const lojaAtivada: Record<EmailLocale, Dict> = {
  pt: { subject: 'Sua loja foi ativada na BipFix', headerTag: 'Conta ativada', greeting: 'Olá <strong>{name}</strong>,', intro: 'A loja <strong>{lojaNome}</strong> foi ativada. A partir de agora você recebe os pedidos de peça das oficinas e pode responder com preço e prazo.', cta: 'Ver pedidos de peça' },
  en: { subject: 'Your store is now active on BipFix', headerTag: 'Account activated', greeting: 'Hi <strong>{name}</strong>,', intro: '<strong>{lojaNome}</strong> has been activated. From now on you receive part requests from repair shops and can reply with a price and delivery time.', cta: 'View part requests' },
  et: { subject: 'Sinu pood on BipFixis aktiveeritud', headerTag: 'Konto aktiveeritud', greeting: 'Tere, <strong>{name}</strong>,', intro: 'Pood <strong>{lojaNome}</strong> on aktiveeritud. Nüüdsest saad töökodade varuosa päringuid ja saad vastata hinna ja tarneajaga.', cta: 'Vaata hinnapäringuid' },
  it: { subject: 'Il tuo negozio è attivo su BipFix', headerTag: 'Account attivato', greeting: 'Ciao <strong>{name}</strong>,', intro: 'Il negozio <strong>{lojaNome}</strong> è stato attivato. Da ora ricevi le richieste di ricambi delle officine e puoi rispondere con prezzo e tempi di consegna.', cta: 'Vedi le richieste' },
  'pt-PT': { subject: 'A sua loja foi ativada na BipFix', headerTag: 'Conta ativada', greeting: 'Olá <strong>{name}</strong>,', intro: 'A loja <strong>{lojaNome}</strong> foi ativada. A partir de agora recebe os pedidos de peças das oficinas e pode responder com preço e prazo.', cta: 'Ver pedidos de peças' },
  ru: { subject: 'Ваш магазин активирован в BipFix', headerTag: 'Аккаунт активирован', greeting: 'Здравствуйте, <strong>{name}</strong>!', intro: 'Магазин <strong>{lojaNome}</strong> активирован. Теперь вы получаете запросы запчастей от автосервисов и можете отвечать ценой и сроком поставки.', cta: 'Посмотреть запросы' },
};

const contaCriadaEmergencia: Record<EmailLocale, Dict> = {
  pt: {
    subject: 'BipFix - Sua conta foi criada',
    headerTag: 'Sua emergência foi registrada',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: 'Sua emergência foi registrada e oficinas próximas já estão sendo notificadas.',
    accountNote: 'Criamos uma conta para você acompanhar os orçamentos.',
    accessDataLabel: 'Seus dados de acesso:',
    emailLabel: 'Email:',
    tempPasswordLabel: 'Senha temporária:',
    nextLoginNote: 'No primeiro login, você será solicitado a trocar a senha.',
    setPasswordNote: 'Para entrar, defina a sua senha pelo botão abaixo. O link vale por 24 horas; depois, use "Esqueci minha senha" na tela de login.',
    setPasswordCta: 'Definir minha senha',
    cta: 'Acessar minha conta',
    footer: 'Equipe BipFix',
  },
  en: {
    subject: 'BipFix - Your account was created',
    headerTag: 'Your emergency has been registered',
    greeting: 'Hi <strong>{name}</strong>,',
    intro: 'Your emergency has been registered and nearby repair shops are already being notified.',
    accountNote: "We've created an account for you to follow the quotes.",
    accessDataLabel: 'Your login details:',
    emailLabel: 'Email:',
    tempPasswordLabel: 'Temporary password:',
    nextLoginNote: "On your first login, you'll be asked to change your password.",
    setPasswordNote: 'To sign in, set your password with the button below. The link is valid for 24 hours; after that, use "Forgot password" on the login page.',
    setPasswordCta: 'Set my password',
    cta: 'Log in to my account',
    footer: 'The BipFix Team',
  },
  et: {
    subject: 'BipFix - Sinu konto on loodud',
    headerTag: 'Sinu hädaolukord on registreeritud',
    greeting: 'Tere, <strong>{name}</strong>,',
    intro: 'Sinu hädaolukord on registreeritud ja lähedal asuvaid töökodasid juba teavitatakse.',
    accountNote: 'Lõime sulle konto, et saaksid hinnapakkumisi jälgida.',
    accessDataLabel: 'Sinu sisselogimisandmed:',
    emailLabel: 'E-post:',
    tempPasswordLabel: 'Ajutine parool:',
    nextLoginNote: 'Esimesel sisselogimisel palutakse sul parool vahetada.',
    setPasswordNote: 'Sisselogimiseks määra oma parool alloleva nupu kaudu. Link kehtib 24 tundi; hiljem kasuta sisselogimislehel valikut „Unustasin parooli“.',
    setPasswordCta: 'Määra parool',
    cta: 'Logi oma kontole sisse',
    footer: 'BipFixi meeskond',
  },
  it: {
    subject: 'BipFix - Il tuo account è stato creato',
    headerTag: 'La tua emergenza è stata registrata',
    greeting: 'Ciao <strong>{name}</strong>,',
    intro: 'La tua emergenza è stata registrata e le officine vicine sono già state avvisate.',
    accountNote: 'Abbiamo creato un account per te per seguire i preventivi.',
    accessDataLabel: 'I tuoi dati di accesso:',
    emailLabel: 'Email:',
    tempPasswordLabel: 'Password temporanea:',
    nextLoginNote: 'Al primo accesso ti verrà chiesto di cambiare la password.',
    setPasswordNote: 'Per accedere, imposta la tua password con il pulsante qui sotto. Il link è valido 24 ore; dopo, usa "Password dimenticata" nella pagina di accesso.',
    setPasswordCta: 'Imposta la password',
    cta: 'Accedi al mio account',
    footer: 'Il team BipFix',
  },
  'pt-PT': {
    subject: 'BipFix - A sua conta foi criada',
    headerTag: 'A sua emergência foi registada',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: 'A sua emergência foi registada e as oficinas próximas já estão a ser notificadas.',
    accountNote: 'Criámos uma conta para que possa acompanhar os orçamentos.',
    accessDataLabel: 'Os seus dados de acesso:',
    emailLabel: 'E-mail:',
    tempPasswordLabel: 'Palavra-passe temporária:',
    nextLoginNote: 'No primeiro início de sessão, ser-lhe-á pedido que altere a palavra-passe.',
    setPasswordNote: 'Para entrar, defina a sua palavra-passe com o botão abaixo. O link é válido durante 24 horas; depois, use "Esqueci-me da palavra-passe" no ecrã de início de sessão.',
    setPasswordCta: 'Definir a minha palavra-passe',
    cta: 'Aceder à minha conta',
    footer: 'Equipa BipFix',
  },
  ru: {
    subject: 'BipFix - Ваш аккаунт создан',
    headerTag: 'Ваше происшествие зарегистрировано',
    greeting: 'Здравствуйте, <strong>{name}</strong>!',
    intro: 'Ваше происшествие зарегистрировано, ближайшие автосервисы уже получают уведомление.',
    accountNote: 'Мы создали для вас аккаунт, чтобы вы могли следить за сметами.',
    accessDataLabel: 'Ваши данные для входа:',
    emailLabel: 'Эл. почта:',
    tempPasswordLabel: 'Временный пароль:',
    nextLoginNote: 'При первом входе вам будет предложено сменить пароль.',
    setPasswordNote: 'Чтобы войти, задайте пароль с помощью кнопки ниже. Ссылка действует 24 часа; после этого используйте «Забыли пароль?» на странице входа.',
    setPasswordCta: 'Задать пароль',
    cta: 'Войти в мой аккаунт',
    footer: 'Команда BipFix',
  },
};

const orcamentoAceitoPagamento: Record<EmailLocale, Dict> = {
  pt: {
    subject: 'Orçamento aceito - Pagamento na oficina {oficinaNome}',
    headerTag: 'Orçamento Aceito - Pagamento',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: 'O orçamento para o reparo do acidente foi aceito. Como responsável, você precisa acertar o pagamento com a oficina.',
    prazo: 'Prazo do conserto: {dias}',
    dadosOficinaLabel: 'Dados da oficina:',
    oficinaLabel: 'Oficina: {oficinaNome}',
    enderecoLabel: 'Endereço: {endereco}',
    telefoneLabel: 'Telefone: {telefone}',
    emailLabel: 'Email: {email}',
    ctaText: 'Acesse a plataforma para conversar com a oficina sobre o pagamento:',
    cta: 'Conversar com a oficina',
    footer: 'Equipe BipFix',
  },
  en: {
    subject: 'Quote accepted - Payment at {oficinaNome}',
    headerTag: 'Quote Accepted - Payment',
    greeting: 'Hi <strong>{name}</strong>,',
    intro: 'The quote for the accident repair was accepted. As the responsible party, you need to arrange payment directly with the shop.',
    prazo: 'Repair time: {dias}',
    dadosOficinaLabel: 'Shop details:',
    oficinaLabel: 'Shop: {oficinaNome}',
    enderecoLabel: 'Address: {endereco}',
    telefoneLabel: 'Phone: {telefone}',
    emailLabel: 'Email: {email}',
    ctaText: 'Open the platform to discuss payment with the shop:',
    cta: 'Chat with the shop',
    footer: 'The BipFix team',
  },
  et: {
    subject: 'Hinnapakkumine kinnitatud - Makse töökojas {oficinaNome}',
    headerTag: 'Hinnapakkumine kinnitatud - Makse',
    greeting: 'Tere, <strong>{name}</strong>,',
    intro: 'Õnnetuse remondi hinnapakkumine kinnitati. Vastutava isikuna pead sa maksega töökojaga otse kokku leppima.',
    prazo: 'Remondi kestus: {dias}',
    dadosOficinaLabel: 'Töökoja andmed:',
    oficinaLabel: 'Töökoda: {oficinaNome}',
    enderecoLabel: 'Aadress: {endereco}',
    telefoneLabel: 'Telefon: {telefone}',
    emailLabel: 'E-post: {email}',
    ctaText: 'Ava platvorm, et arutada makset töökojaga:',
    cta: 'Vestle töökojaga',
    footer: 'BipFixi meeskond',
  },
  it: {
    subject: 'Preventivo accettato - Pagamento presso {oficinaNome}',
    headerTag: 'Preventivo Accettato - Pagamento',
    greeting: 'Ciao <strong>{name}</strong>,',
    intro: "Il preventivo per la riparazione dell'incidente è stato accettato. Come responsabile, devi accordarti direttamente con l'officina per il pagamento.",
    prazo: 'Durata della riparazione: {dias}',
    dadosOficinaLabel: "Dati dell'officina:",
    oficinaLabel: 'Officina: {oficinaNome}',
    enderecoLabel: 'Indirizzo: {endereco}',
    telefoneLabel: 'Telefono: {telefone}',
    emailLabel: 'Email: {email}',
    ctaText: "Apri la piattaforma per discutere il pagamento con l'officina:",
    cta: "Chatta con l'officina",
    footer: 'Il team BipFix',
  },
  'pt-PT': {
    subject: 'Orçamento aceite - Pagamento na oficina {oficinaNome}',
    headerTag: 'Orçamento Aceite - Pagamento',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: 'O orçamento para a reparação do acidente foi aceite. Como responsável, tem de acertar o pagamento diretamente com a oficina.',
    prazo: 'Prazo da reparação: {dias}',
    dadosOficinaLabel: 'Dados da oficina:',
    oficinaLabel: 'Oficina: {oficinaNome}',
    enderecoLabel: 'Morada: {endereco}',
    telefoneLabel: 'Telefone: {telefone}',
    emailLabel: 'E-mail: {email}',
    ctaText: 'Aceda à plataforma para falar com a oficina sobre o pagamento:',
    cta: 'Falar com a oficina',
    footer: 'Equipa BipFix',
  },
  ru: {
    subject: 'Смета принята - оплата в автосервисе {oficinaNome}',
    headerTag: 'Смета принята - оплата',
    greeting: 'Здравствуйте, <strong>{name}</strong>!',
    intro: 'Смета на ремонт после ДТП принята. Как ответственная сторона, вы должны договориться об оплате напрямую с автосервисом.',
    prazo: 'Срок ремонта: {dias}',
    dadosOficinaLabel: 'Данные автосервиса:',
    oficinaLabel: 'Автосервис: {oficinaNome}',
    enderecoLabel: 'Адрес: {endereco}',
    telefoneLabel: 'Телефон: {telefone}',
    emailLabel: 'Эл. почта: {email}',
    ctaText: 'Откройте платформу, чтобы обсудить оплату с автосервисом:',
    cta: 'Написать автосервису',
    footer: 'Команда BipFix',
  },
};

const orcamentoAceitoOutro: Record<EmailLocale, Dict> = {
  pt: {
    subject: 'Orçamento aceito - {oficinaNome}',
    headerTag: 'Orçamento Aceito',
    greeting: 'Olá <strong>{name}</strong>,',
    introComPlaca: 'O orçamento para o reparo do veículo placa <strong>{placa}</strong> foi aceito:',
    introSemPlaca: 'O orçamento para o reparo do veículo foi aceito:',
    oficinaLabel: 'Oficina: {oficinaNome}',
    prazo: 'Prazo do conserto: {dias}',
    ctaText: 'Acesse a plataforma para acompanhar o andamento do reparo e trocar mensagens.',
    cta: 'Ver detalhes',
    footer: 'Equipe BipFix',
  },
  en: {
    subject: 'Quote accepted - {oficinaNome}',
    headerTag: 'Quote Accepted',
    greeting: 'Hi <strong>{name}</strong>,',
    introComPlaca: 'The quote to repair the vehicle with plate <strong>{placa}</strong> was accepted:',
    introSemPlaca: 'The quote to repair the vehicle was accepted:',
    oficinaLabel: 'Shop: {oficinaNome}',
    prazo: 'Repair time: {dias}',
    ctaText: 'Open the platform to follow the repair progress and exchange messages.',
    cta: 'View details',
    footer: 'The BipFix team',
  },
  et: {
    subject: 'Hinnapakkumine kinnitatud - {oficinaNome}',
    headerTag: 'Hinnapakkumine kinnitatud',
    greeting: 'Tere, <strong>{name}</strong>,',
    introComPlaca: 'Hinnapakkumine sõiduki (reg.märk <strong>{placa}</strong>) remondiks kinnitati:',
    introSemPlaca: 'Hinnapakkumine sõiduki remondiks kinnitati:',
    oficinaLabel: 'Töökoda: {oficinaNome}',
    prazo: 'Remondi kestus: {dias}',
    ctaText: 'Ava platvorm, et jälgida remondi kulgu ja vestelda.',
    cta: 'Vaata üksikasju',
    footer: 'BipFixi meeskond',
  },
  it: {
    subject: 'Preventivo accettato - {oficinaNome}',
    headerTag: 'Preventivo Accettato',
    greeting: 'Ciao <strong>{name}</strong>,',
    introComPlaca: 'Il preventivo per la riparazione del veicolo targa <strong>{placa}</strong> è stato accettato:',
    introSemPlaca: 'Il preventivo per la riparazione del veicolo è stato accettato:',
    oficinaLabel: 'Officina: {oficinaNome}',
    prazo: 'Durata della riparazione: {dias}',
    ctaText: 'Apri la piattaforma per seguire lo stato della riparazione e scambiare messaggi.',
    cta: 'Vedi dettagli',
    footer: 'Il team BipFix',
  },
  'pt-PT': {
    subject: 'Orçamento aceite - {oficinaNome}',
    headerTag: 'Orçamento Aceite',
    greeting: 'Olá <strong>{name}</strong>,',
    introComPlaca: 'O orçamento para a reparação do veículo com a matrícula <strong>{placa}</strong> foi aceite:',
    introSemPlaca: 'O orçamento para a reparação do veículo foi aceite:',
    oficinaLabel: 'Oficina: {oficinaNome}',
    prazo: 'Prazo da reparação: {dias}',
    ctaText: 'Aceda à plataforma para acompanhar a reparação e trocar mensagens.',
    cta: 'Ver detalhes',
    footer: 'Equipa BipFix',
  },
  ru: {
    subject: 'Смета принята - {oficinaNome}',
    headerTag: 'Смета принята',
    greeting: 'Здравствуйте, <strong>{name}</strong>!',
    introComPlaca: 'Смета на ремонт автомобиля с госномером <strong>{placa}</strong> принята:',
    introSemPlaca: 'Смета на ремонт автомобиля принята:',
    oficinaLabel: 'Автосервис: {oficinaNome}',
    prazo: 'Срок ремонта: {dias}',
    ctaText: 'Откройте платформу, чтобы следить за ходом ремонта и обмениваться сообщениями.',
    cta: 'Посмотреть детали',
    footer: 'Команда BipFix',
  },
};

const recuperarSenha: Record<EmailLocale, Dict> = {
  pt: {
    subject: 'Redefina sua senha - BipFix',
    headerTag: 'Recuperação de senha',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: 'Recebemos um pedido para redefinir a senha da sua conta BipFix. Clique no botão abaixo para escolher uma nova senha.',
    cta: 'Escolher nova senha',
    expiry: 'O link vale por 1 hora e só pode ser usado uma vez.',
    ignore: 'Se não foi você que pediu, ignore este e-mail: sua senha atual continua valendo e nada foi alterado.',
    footer: 'Equipe BipFix',
  },
  en: {
    subject: 'Reset your password - BipFix',
    headerTag: 'Password recovery',
    greeting: 'Hi <strong>{name}</strong>,',
    intro: 'We received a request to reset the password for your BipFix account. Click the button below to choose a new password.',
    cta: 'Choose a new password',
    expiry: 'The link is valid for 1 hour and can only be used once.',
    ignore: "If you didn't ask for this, just ignore this email: your current password still works and nothing has changed.",
    footer: 'The BipFix team',
  },
  et: {
    subject: 'Parooli lähtestamine - BipFix',
    headerTag: 'Parooli taastamine',
    greeting: 'Tere <strong>{name}</strong>,',
    intro: 'Saime taotluse sinu BipFixi konto parooli lähtestamiseks. Uue parooli valimiseks klõpsa alloleval nupul.',
    cta: 'Vali uus parool',
    expiry: 'Link kehtib 1 tund ja seda saab kasutada ainult üks kord.',
    ignore: 'Kui sa seda ei taotlenud, eira seda kirja: sinu praegune parool kehtib edasi ja midagi ei muutunud.',
    footer: 'BipFixi meeskond',
  },
  it: {
    subject: 'Reimposta la tua password - BipFix',
    headerTag: 'Recupero password',
    greeting: 'Ciao <strong>{name}</strong>,',
    intro: 'Abbiamo ricevuto una richiesta di reimpostare la password del tuo account BipFix. Clicca sul pulsante qui sotto per sceglierne una nuova.',
    cta: 'Scegli una nuova password',
    expiry: 'Il link è valido per 1 ora e può essere usato una sola volta.',
    ignore: 'Se non sei stato tu a chiederlo, ignora questa email: la tua password attuale resta valida e non è cambiato nulla.',
    footer: 'Il team BipFix',
  },
  'pt-PT': {
    subject: 'Reponha a sua palavra-passe - BipFix',
    headerTag: 'Recuperação de palavra-passe',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: 'Recebemos um pedido para repor a palavra-passe da sua conta BipFix. Clique no botão abaixo para escolher uma nova palavra-passe.',
    cta: 'Escolher nova palavra-passe',
    expiry: 'O link é válido durante 1 hora e só pode ser usado uma vez.',
    ignore: 'Se não fez este pedido, ignore este e-mail: a sua palavra-passe atual continua válida e nada foi alterado.',
    footer: 'Equipa BipFix',
  },
  ru: {
    subject: 'Сброс пароля - BipFix',
    headerTag: 'Восстановление пароля',
    greeting: 'Здравствуйте, <strong>{name}</strong>!',
    intro: 'Мы получили запрос на сброс пароля вашего аккаунта BipFix. Нажмите кнопку ниже, чтобы выбрать новый пароль.',
    cta: 'Выбрать новый пароль',
    expiry: 'Ссылка действует 1 час и может быть использована только один раз.',
    ignore: 'Если это были не вы, просто проигнорируйте письмо: ваш текущий пароль остаётся в силе и ничего не изменилось.',
    footer: 'Команда BipFix',
  },
};

export const EMAIL_I18N = {
  recuperarSenha,
  accidentNotification,
  funcionarioNovaSenha,
  quoteNotification,
  servicoConcluido,
  cotacaoPecaDisponivel,
  cotacaoPecaRespondida,
  pedidoPecaConfirmado,
  pedidoPecaEntregue,
  pecaDetalhes,
  pecaAvisos,
  mensagemPeca,
  lojaAtivada,
  contaCriadaEmergencia,
  orcamentoAceitoPagamento,
  orcamentoAceitoOutro,
};

// WhatsApp - mensagens curtas em texto puro (sem HTML)
const accidentWhatsApp: Record<EmailLocale, string> = {
  pt: 'Olá {toName}! {fromName} registrou um acidente envolvendo seu veículo (placa {placa}) na BipFix. Acesse para ver detalhes e orçamentos: {url}',
  en: 'Hi {toName}! {fromName} reported an accident involving your vehicle (plate {placa}) on BipFix. Check the details and quotes: {url}',
  et: 'Tere {toName}! {fromName} registreeris BipFixis avarii, milles osales sinu sõiduk (nr {placa}). Vaata detaile ja hinnapakkumisi: {url}',
  it: 'Ciao {toName}! {fromName} ha segnalato su BipFix un incidente che coinvolge il tuo veicolo (targa {placa}). Vedi dettagli e preventivi: {url}',
  'pt-PT': 'Olá {toName}! {fromName} registou um acidente que envolve o seu veículo (matrícula {placa}) na BipFix. Aceda para ver detalhes e orçamentos: {url}',
  ru: 'Здравствуйте, {toName}! {fromName} зарегистрировал(а) в BipFix ДТП с участием вашего автомобиля (госномер {placa}). Посмотрите детали и сметы: {url}',
};

const quoteWhatsApp: Record<EmailLocale, string> = {
  pt: 'Olá {toName}! A oficina {oficinaNome} enviou um orçamento de {valorTotal} para seu veículo. Veja os detalhes: {url}',
  en: 'Hi {toName}! Repair shop {oficinaNome} sent a quote of {valorTotal} for your vehicle. See the details: {url}',
  et: 'Tere {toName}! Töökoda {oficinaNome} saatis sinu sõidukile hinnapakkumise summas {valorTotal}. Vaata detaile: {url}',
  it: 'Ciao {toName}! L\'officina {oficinaNome} ha inviato un preventivo di {valorTotal} per il tuo veicolo. Vedi i dettagli: {url}',
  'pt-PT': 'Olá {toName}! A oficina {oficinaNome} enviou um orçamento de {valorTotal} para o seu veículo. Veja os detalhes: {url}',
  ru: 'Здравствуйте, {toName}! Автосервис {oficinaNome} отправил смету на {valorTotal} для вашего автомобиля. Подробности: {url}',
};

// SMS: sem nome, oficina nem valor (aparece na tela bloqueada) e curto; o ET
// evita "õ/š/ž" para caber em 1 SMS (GSM-7). RU (cirilico) sai em 2 partes com o link.
const quoteSms: Record<EmailLocale, string> = {
  pt: 'BipFix: seu pedido recebeu um novo orçamento. Veja e escolha: {url}',
  en: 'BipFix: your request has a new quote. View and choose: {url}',
  et: 'BipFix: sinu päringule saabus uus hinnapakkumine. Vaata ja vali: {url}',
  it: 'BipFix: la tua richiesta ha un nuovo preventivo. Guarda e scegli: {url}',
  'pt-PT': 'BipFix: o seu pedido recebeu um novo orçamento. Veja e escolha: {url}',
  ru: 'BipFix: новая смета по вашей заявке: {url}',
};

export const SMS_I18N = { quoteSms };

const servicoConcluidoWhatsApp: Record<EmailLocale, string> = {
  pt: 'Olá {toName}! Seu veículo {veiculoNome} já está pronto na oficina {oficinaNome} e pode ser retirado. Detalhes: {url}',
  en: 'Hi {toName}! Your vehicle {veiculoNome} is ready at {oficinaNome} and can be picked up. Details: {url}',
  et: 'Tere {toName}! Sinu sõiduk {veiculoNome} on töökojas {oficinaNome} valmis ja selle saab kätte. Detailid: {url}',
  it: 'Ciao {toName}! Il tuo veicolo {veiculoNome} è pronto presso {oficinaNome} e può essere ritirato. Dettagli: {url}',
  'pt-PT': 'Olá {toName}! O seu veículo {veiculoNome} já está pronto na oficina {oficinaNome} e pode ser levantado. Detalhes: {url}',
  ru: 'Здравствуйте, {toName}! Ваш автомобиль {veiculoNome} готов в автосервисе {oficinaNome}, его можно забирать. Подробности: {url}',
};

export const WHATSAPP_I18N = {
  accidentWhatsApp,
  quoteWhatsApp,
  servicoConcluidoWhatsApp,
};
