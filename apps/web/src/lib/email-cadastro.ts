import { supabaseAdmin } from './supabase-admin';
import { enviarEmail } from './email';
import { escapeHtml, fmt } from './email-i18n';
import { idiomaDoSite, urlNoIdioma } from './site-url';
import type { Locale } from '@/i18n/routing';

// E-mails do cadastro, nos 6 idiomas do site (a confirmacao e o primeiro
// contato com a pessoa - vai no idioma em que ela se cadastrou, inclusive
// russo e portugues de Portugal).
type Textos = {
  assunto: string; titulo: string; ola: string; intro: string; botao: string;
  validade: string; ignorar: string; jaTemAssunto: string; jaTemIntro: string;
  jaTemEntrar: string; jaTemSenha: string; rodape: string;
};

const TEXTOS: Record<Locale, Textos> = {
  pt: {
    assunto: 'Confirme seu e-mail - BipFix',
    titulo: 'Confirmação de e-mail',
    ola: 'Olá <strong>{nome}</strong>,',
    intro: 'Falta só um passo para ativar sua conta na BipFix: confirme que este e-mail é seu clicando no botão abaixo.',
    botao: 'Confirmar meu e-mail',
    validade: 'O link vale por 1 hora e só pode ser usado uma vez. Se expirar, é só tentar entrar: vamos oferecer um novo link.',
    ignorar: 'Se você não criou uma conta na BipFix, ignore este e-mail: nenhuma conta será ativada.',
    jaTemAssunto: 'Você já tem uma conta na BipFix',
    jaTemIntro: 'Alguém (provavelmente você) tentou criar uma conta na BipFix com este e-mail, mas ele já está cadastrado.',
    jaTemEntrar: 'Entrar na minha conta',
    jaTemSenha: 'Se não lembra a senha, use "Esqueci minha senha" na página de login.',
    rodape: 'Equipe BipFix',
  },
  'pt-PT': {
    assunto: 'Confirme o seu e-mail - BipFix',
    titulo: 'Confirmação de e-mail',
    ola: 'Olá <strong>{nome}</strong>,',
    intro: 'Falta apenas um passo para ativar a sua conta na BipFix: confirme que este e-mail é seu clicando no botão abaixo.',
    botao: 'Confirmar o meu e-mail',
    validade: 'A ligação é válida durante 1 hora e só pode ser usada uma vez. Se expirar, basta tentar iniciar sessão: iremos oferecer uma nova ligação.',
    ignorar: 'Se não criou uma conta na BipFix, ignore este e-mail: nenhuma conta será ativada.',
    jaTemAssunto: 'Já tem uma conta na BipFix',
    jaTemIntro: 'Alguém (provavelmente o próprio) tentou criar uma conta na BipFix com este e-mail, mas ele já está registado.',
    jaTemEntrar: 'Iniciar sessão',
    jaTemSenha: 'Se não se lembra da palavra-passe, use "Esqueci-me da palavra-passe" na página de início de sessão.',
    rodape: 'Equipa BipFix',
  },
  en: {
    assunto: 'Confirm your email - BipFix',
    titulo: 'Email confirmation',
    ola: 'Hi <strong>{nome}</strong>,',
    intro: 'One last step to activate your BipFix account: confirm this email address is yours by clicking the button below.',
    botao: 'Confirm my email',
    validade: 'The link is valid for 1 hour and can be used only once. If it expires, just try to sign in and we will offer you a new link.',
    ignorar: 'If you did not create a BipFix account, ignore this email: no account will be activated.',
    jaTemAssunto: 'You already have a BipFix account',
    jaTemIntro: 'Someone (probably you) tried to create a BipFix account with this email address, but it is already registered.',
    jaTemEntrar: 'Sign in to my account',
    jaTemSenha: 'If you do not remember your password, use "Forgot password" on the sign-in page.',
    rodape: 'The BipFix team',
  },
  et: {
    assunto: 'Kinnita oma e-posti aadress - BipFix',
    titulo: 'E-posti kinnitamine',
    ola: 'Tere <strong>{nome}</strong>,',
    intro: 'BipFixi konto aktiveerimiseks on jäänud üks samm: kinnita, et see e-posti aadress kuulub sulle, klõpsates alloleval nupul.',
    botao: 'Kinnita e-posti aadress',
    validade: 'Link kehtib 1 tund ja seda saab kasutada ainult üks kord. Kui see aegub, proovi lihtsalt sisse logida ja pakume uue lingi.',
    ignorar: 'Kui sa ei loonud BipFixi kontot, eira seda kirja: ühtegi kontot ei aktiveerita.',
    jaTemAssunto: 'Sul on juba BipFixi konto',
    jaTemIntro: 'Keegi (tõenäoliselt sina) proovis selle e-posti aadressiga BipFixi kontot luua, kuid aadress on juba registreeritud.',
    jaTemEntrar: 'Logi oma kontole sisse',
    jaTemSenha: 'Kui sa parooli ei mäleta, kasuta sisselogimislehel valikut „Unustasin parooli“.',
    rodape: 'BipFixi meeskond',
  },
  it: {
    assunto: 'Conferma la tua email - BipFix',
    titulo: 'Conferma email',
    ola: 'Ciao <strong>{nome}</strong>,',
    intro: 'Manca solo un passaggio per attivare il tuo account BipFix: conferma che questo indirizzo email è tuo cliccando sul pulsante qui sotto.',
    botao: 'Conferma la mia email',
    validade: 'Il link è valido per 1 ora e può essere usato una sola volta. Se scade, prova ad accedere e ti proporremo un nuovo link.',
    ignorar: 'Se non hai creato un account BipFix, ignora questa email: nessun account verrà attivato.',
    jaTemAssunto: 'Hai già un account BipFix',
    jaTemIntro: 'Qualcuno (probabilmente tu) ha provato a creare un account BipFix con questo indirizzo email, ma è già registrato.',
    jaTemEntrar: 'Accedi al mio account',
    jaTemSenha: 'Se non ricordi la password, usa "Password dimenticata" nella pagina di accesso.',
    rodape: 'Il team BipFix',
  },
  ru: {
    assunto: 'Подтвердите адрес электронной почты - BipFix',
    titulo: 'Подтверждение электронной почты',
    ola: 'Здравствуйте, <strong>{nome}</strong>!',
    intro: 'Остался один шаг до активации вашего аккаунта BipFix: подтвердите, что этот адрес принадлежит вам, нажав кнопку ниже.',
    botao: 'Подтвердить адрес',
    validade: 'Ссылка действует 1 час и может быть использована только один раз. Если срок истёк, просто попробуйте войти — мы предложим новую ссылку.',
    ignorar: 'Если вы не создавали аккаунт в BipFix, проигнорируйте это письмо: аккаунт не будет активирован.',
    jaTemAssunto: 'У вас уже есть аккаунт BipFix',
    jaTemIntro: 'Кто-то (вероятно, вы) попытался создать аккаунт BipFix с этим адресом, но он уже зарегистрирован.',
    jaTemEntrar: 'Войти в аккаунт',
    jaTemSenha: 'Если вы не помните пароль, воспользуйтесь ссылкой «Забыли пароль?» на странице входа.',
    rodape: 'Команда BipFix',
  },
};

function moldura(tag: string, corpo: string, rodape: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0c4a6e;color:white;padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:24px;">BipFix</h1>
        <p style="margin:8px 0 0;opacity:0.8;">${tag}</p>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
        ${corpo}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:12px;color:#9ca3af;">${rodape}</p>
      </div>
    </div>`;
}

const botao = (url: string, texto: string) =>
  `<p style="margin:24px 0;"><a href="${url}" style="display:inline-block;background:#0284c7;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">${texto}</a></p>`;

/**
 * Manda o link de confirmacao (token de uso unico, 1 h). O token e de
 * "magiclink": ao abrir, o GoTrue marca o e-mail como confirmado e ja
 * devolve a sessao - a pessoa cai logada no painel.
 */
export async function enviarConfirmacaoEmail(email: string, nome: string, idioma: string | null | undefined): Promise<boolean> {
  const loc = idiomaDoSite(idioma);
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error('[cadastro] falha ao gerar link de confirmacao', error?.message);
    return false;
  }
  const s = TEXTOS[loc];
  const url = urlNoIdioma(loc, `/confirmar-email?token_hash=${encodeURIComponent(tokenHash)}`);
  return enviarEmail({
    para: email,
    assunto: s.assunto,
    html: moldura(s.titulo, `
      <p>${fmt(s.ola, { nome: escapeHtml(nome) })}</p>
      <p>${s.intro}</p>
      ${botao(url, s.botao)}
      <p style="font-size:13px;color:#6b7280;">${s.validade}</p>
      <p style="font-size:13px;color:#6b7280;">${s.ignorar}</p>`, s.rodape),
  });
}

/** Cadastro com e-mail que ja existe: avisa o dono em vez de revelar na tela. */
export async function enviarAvisoContaExistente(email: string, idioma: string | null | undefined): Promise<boolean> {
  const loc = idiomaDoSite(idioma);
  const s = TEXTOS[loc];
  return enviarEmail({
    para: email,
    assunto: s.jaTemAssunto,
    html: moldura(s.jaTemAssunto, `
      <p>${s.jaTemIntro}</p>
      ${botao(urlNoIdioma(loc, '/login'), s.jaTemEntrar)}
      <p style="font-size:13px;color:#6b7280;">${s.jaTemSenha}</p>
      <p style="font-size:13px;color:#6b7280;">${s.ignorar}</p>`, s.rodape),
  });
}
