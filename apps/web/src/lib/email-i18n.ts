// Strings dos e-mails/WhatsApp transacionais, por idioma do DESTINATARIO
// (profiles.idioma) - nunca do idioma de quem disparou a acao. E-mail e
// enviado de forma assincrona/server-side, entao nao da pra usar
// next-intl (React) aqui; interpolacao simples com {chave}.

export type EmailLocale = 'pt' | 'en' | 'et' | 'it';

export function resolveEmailLocale(locale: string | null | undefined): EmailLocale {
  return locale === 'en' || locale === 'et' || locale === 'it' ? locale : 'pt';
}

function fmt(str: string, vars: Record<string, string | number> = {}): string {
  return str.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
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
};

const quoteNotification: Record<EmailLocale, Dict> = {
  pt: {
    subject: 'Novo orçamento recebido - {oficinaNome}',
    headerTag: 'Novo Orçamento',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: 'A oficina <strong>{oficinaNome}</strong> enviou um orçamento para sua solicitação:',
    prazo: 'Prazo: {prazoDias} dias',
    cta: 'Ver orçamento completo',
  },
  en: {
    subject: 'New quote received - {oficinaNome}',
    headerTag: 'New Quote',
    greeting: 'Hi <strong>{name}</strong>,',
    intro: 'Repair shop <strong>{oficinaNome}</strong> sent a quote for your request:',
    prazo: 'Estimated time: {prazoDias} days',
    cta: 'View full quote',
  },
  et: {
    subject: 'Uus hinnapakkumine - {oficinaNome}',
    headerTag: 'Uus hinnapakkumine',
    greeting: 'Tere, <strong>{name}</strong>,',
    intro: 'Töökoda <strong>{oficinaNome}</strong> saatis sinu päringule hinnapakkumise:',
    prazo: 'Tähtaeg: {prazoDias} päeva',
    cta: 'Vaata täielikku hinnapakkumist',
  },
  it: {
    subject: 'Nuovo preventivo ricevuto - {oficinaNome}',
    headerTag: 'Nuovo Preventivo',
    greeting: 'Ciao <strong>{name}</strong>,',
    intro: "L'officina <strong>{oficinaNome}</strong> ha inviato un preventivo per la tua richiesta:",
    prazo: 'Tempi: {prazoDias} giorni',
    cta: 'Vedi preventivo completo',
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
};

const cotacaoPecaRespondida: Record<EmailLocale, Dict> = {
  pt: {
    subject: 'Nova resposta de cotação: {pecaDescricao}',
    headerTag: 'Resposta de cotação de peça',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: '<strong>{fornecedorNome}</strong> respondeu sua cotação de "{pecaDescricao}":',
    prazo: 'Prazo: {prazoDias} dia(s)',
    cta: 'Ver resposta completa',
  },
  en: {
    subject: 'New quote response: {pecaDescricao}',
    headerTag: 'Part quote response',
    greeting: 'Hi <strong>{name}</strong>,',
    intro: '<strong>{fornecedorNome}</strong> responded to your quote request for "{pecaDescricao}":',
    prazo: 'Delivery time: {prazoDias} day(s)',
    cta: 'View full response',
  },
  et: {
    subject: 'Uus vastus hinnapäringule: {pecaDescricao}',
    headerTag: 'Varuosa hinnapäringu vastus',
    greeting: 'Tere, <strong>{name}</strong>,',
    intro: '<strong>{fornecedorNome}</strong> vastas sinu hinnapäringule "{pecaDescricao}":',
    prazo: 'Tarneaeg: {prazoDias} päev(a)',
    cta: 'Vaata täielikku vastust',
  },
  it: {
    subject: 'Nuova risposta al preventivo: {pecaDescricao}',
    headerTag: 'Risposta preventivo ricambio',
    greeting: 'Ciao <strong>{name}</strong>,',
    intro: '<strong>{fornecedorNome}</strong> ha risposto alla tua richiesta di preventivo per "{pecaDescricao}":',
    prazo: 'Tempi di consegna: {prazoDias} giorno/i',
    cta: 'Vedi risposta completa',
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
    cta: 'Accedi al mio account',
    footer: 'Il team BipFix',
  },
};

const orcamentoAceitoPagamento: Record<EmailLocale, Dict> = {
  pt: {
    subject: 'Orçamento aceito - Pagamento na oficina {oficinaNome}',
    headerTag: 'Orçamento Aceito - Pagamento',
    greeting: 'Olá <strong>{name}</strong>,',
    intro: 'O orçamento para o reparo do acidente foi aceito. Como responsável, você precisa acertar o pagamento com a oficina.',
    prazo: 'Prazo: {dias} dias',
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
    prazo: 'Estimated time: {dias} days',
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
    prazo: 'Tähtaeg: {dias} päeva',
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
    prazo: 'Tempi: {dias} giorni',
    dadosOficinaLabel: "Dati dell'officina:",
    oficinaLabel: 'Officina: {oficinaNome}',
    enderecoLabel: 'Indirizzo: {endereco}',
    telefoneLabel: 'Telefono: {telefone}',
    emailLabel: 'Email: {email}',
    ctaText: "Apri la piattaforma per discutere il pagamento con l'officina:",
    cta: "Chatta con l'officina",
    footer: 'Il team BipFix',
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
    prazo: 'Prazo: {dias} dias',
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
    prazo: 'Estimated time: {dias} days',
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
    prazo: 'Tähtaeg: {dias} päeva',
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
    prazo: 'Tempi: {dias} giorni',
    ctaText: 'Apri la piattaforma per seguire lo stato della riparazione e scambiare messaggi.',
    cta: 'Vedi dettagli',
    footer: 'Il team BipFix',
  },
};

export const EMAIL_I18N = {
  accidentNotification,
  funcionarioNovaSenha,
  quoteNotification,
  servicoConcluido,
  cotacaoPecaDisponivel,
  cotacaoPecaRespondida,
  pedidoPecaConfirmado,
  pedidoPecaEntregue,
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
};

const quoteWhatsApp: Record<EmailLocale, string> = {
  pt: 'Olá {toName}! A oficina {oficinaNome} enviou um orçamento de {valorTotal} para seu veículo. Veja os detalhes: {url}',
  en: 'Hi {toName}! Repair shop {oficinaNome} sent a quote of {valorTotal} for your vehicle. See the details: {url}',
  et: 'Tere {toName}! Töökoda {oficinaNome} saatis sinu sõidukile hinnapakkumise summas {valorTotal}. Vaata detaile: {url}',
  it: 'Ciao {toName}! L\'officina {oficinaNome} ha inviato un preventivo di {valorTotal} per il tuo veicolo. Vedi i dettagli: {url}',
};

const servicoConcluidoWhatsApp: Record<EmailLocale, string> = {
  pt: 'Olá {toName}! Seu veículo {veiculoNome} já está pronto na oficina {oficinaNome} e pode ser retirado. Detalhes: {url}',
  en: 'Hi {toName}! Your vehicle {veiculoNome} is ready at {oficinaNome} and can be picked up. Details: {url}',
  et: 'Tere {toName}! Sinu sõiduk {veiculoNome} on töökojas {oficinaNome} valmis ja selle saab kätte. Detailid: {url}',
  it: 'Ciao {toName}! Il tuo veicolo {veiculoNome} è pronto presso {oficinaNome} e può essere ritirato. Dettagli: {url}',
};

export const WHATSAPP_I18N = {
  accidentWhatsApp,
  quoteWhatsApp,
  servicoConcluidoWhatsApp,
};
