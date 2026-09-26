// Strings de notificacao IN-APP (tabela `notificacoes`) por idioma do
// DESTINATARIO (profiles.idioma) - mesma logica dos e-mails
// (lib/email-i18n.ts), mas pro texto salvo em `notificacoes.titulo`/
// `mensagem`. Cobre so os tipos de notificacao ja migrados pra esse
// padrao; a maioria dos ~27 pontos que inserem em `notificacoes` ainda
// grava texto fixo em portugues (ver docs/PROGRESSO - pendencia
// conhecida, nao coberta nesta leva).
import { resolveEmailLocale, fmt, type EmailLocale } from './email-i18n';

const novaSolicitacaoColisao: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Nova solicitação!', mensagem: 'Emergência - Novo pedido de reparo por colisão na sua região.' },
  en: { titulo: 'New request!', mensagem: 'Emergency - New collision repair request in your area.' },
  et: { titulo: 'Uus päring!', mensagem: 'Hädaolukord - Uus kokkupõrke remondipäring sinu piirkonnas.' },
  it: { titulo: 'Nuova richiesta!', mensagem: 'Emergenza - Nuova richiesta di riparazione per collisione nella tua zona.' },
};

export function notifNovaSolicitacaoColisao(locale: string | null | undefined) {
  return novaSolicitacaoColisao[resolveEmailLocale(locale)];
}

const novaSolicitacaoTitulo: Record<EmailLocale, string> = {
  pt: 'Nova solicitação!',
  en: 'New request!',
  et: 'Uus päring!',
  it: 'Nuova richiesta!',
};

export function notifNovaSolicitacaoTitulo(locale: string | null | undefined) {
  return novaSolicitacaoTitulo[resolveEmailLocale(locale)];
}

const cotacaoPecaRespondida: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Nova resposta de cotação de peça', mensagem: '{fornecedorNome} respondeu sua cotação de "{pecaDescricao}"' },
  en: { titulo: 'New part quote response', mensagem: '{fornecedorNome} responded to your quote request for "{pecaDescricao}"' },
  et: { titulo: 'Uus vastus varuosa hinnapäringule', mensagem: '{fornecedorNome} vastas sinu hinnapäringule "{pecaDescricao}"' },
  it: { titulo: 'Nuova risposta al preventivo ricambio', mensagem: '{fornecedorNome} ha risposto alla tua richiesta per "{pecaDescricao}"' },
};

export function notifCotacaoPecaRespondida(locale: string | null | undefined, fornecedorNome: string, pecaDescricao: string) {
  const s = cotacaoPecaRespondida[resolveEmailLocale(locale)];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, { fornecedorNome, pecaDescricao }) };
}

const pedidoPecaEntregue: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Peça entregue', mensagem: '{fornecedorNome} marcou como entregue o pedido de "{pecaDescricao}"' },
  en: { titulo: 'Part delivered', mensagem: '{fornecedorNome} marked the order for "{pecaDescricao}" as delivered' },
  et: { titulo: 'Varuosa tarnitud', mensagem: '{fornecedorNome} märkis tellimuse "{pecaDescricao}" tarnituks' },
  it: { titulo: 'Ricambio consegnato', mensagem: '{fornecedorNome} ha segnato come consegnato l\'ordine per "{pecaDescricao}"' },
};

export function notifPedidoPecaEntregue(locale: string | null | undefined, fornecedorNome: string | undefined, pecaDescricao: string) {
  const s = pedidoPecaEntregue[resolveEmailLocale(locale)];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, { fornecedorNome: fornecedorNome || 'O fornecedor', pecaDescricao }) };
}

const cotacaoPecaDisponivel: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Oficina próxima precisa de uma peça', mensagem: 'Uma oficina perto de você abriu uma cotação de peça. Responda se tiver em estoque.' },
  en: { titulo: 'A nearby shop needs a part', mensagem: 'A repair shop near you opened a part request. Respond if you have it in stock.' },
  et: { titulo: 'Lähedal asuv töökoda vajab varuosa', mensagem: 'Sinu lähedal asuv töökoda avas varuosa hinnapäringu. Vasta, kui sul on see laos.' },
  it: { titulo: "Un'officina vicina ha bisogno di un ricambio", mensagem: 'Una officina vicino a te ha aperto una richiesta di ricambio. Rispondi se lo hai in magazzino.' },
};

export function notifCotacaoPecaDisponivel(locale: string | null | undefined) {
  return cotacaoPecaDisponivel[resolveEmailLocale(locale)];
}

export { fmt };
