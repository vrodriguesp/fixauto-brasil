// Teste das REGRAS do e-mail "a oficina te escreveu" ao motorista (dono 24/11; 116) sem banco nem envio:
// quem recebe (so oficina -> motorista), pedido fechado, sem e-mail, conta excluida/de teste, a trava de 3 h,
// textos nos 6 idiomas (sem texto da mensagem, sem precos/"gratis"/promessas, link curto do pedido) e desenha
// os e-mails (HTML) para conferir a olho.
//
//   npx tsx scripts/teste-email-mensagem-oficina.ts [pasta-dos-html]
// (o fluxo com banco - trava na tabela, link de acesso, e-mail gravado na pasta - e contra o site local:
//  EMAIL_PASTA_TESTE no ambiente de Documentos/_teste_local)
import fs from 'node:fs';
import path from 'node:path';
import {
  decidirEmailMensagem, podeMandarDeNovo, limiteDaTrava, montarEmailMensagemOficina,
  HORAS_ENTRE_EMAILS_MENSAGEM, STATUS_PEDIDO_FECHADO, type DadosDecisao,
  consultaChatOficina, linkPagadorMensagem, comPrazo, PRAZO_EMAIL_MENSAGEM_MS,
} from '../src/lib/email-mensagem-oficina-regras';
import { TEXTOS_EMAIL_MENSAGEM } from '../src/lib/email-mensagem-oficina-textos';
import { aplicarIdentidade } from '../src/lib/email-marca';

let falhas = 0, oks = 0;
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (ok) oks++; else falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${ok ? '' : ` - obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}
const H = 3600e3;
const T0 = Date.parse('2026-11-24T10:00:00Z');

// ---- decisao ----
const base: DadosDecisao = {
  daOficina: true, remetenteId: 'oficina-user', destinoId: 'cliente-user', numero: 100150,
  statusPedido: 'em_orcamento', email: 'motorista@example.com', ativo: true, contaTeste: false,
};
const motivo = (d: Partial<DadosDecisao>) => { const r = decidirEmailMensagem({ ...base, ...d }); return r.enviar ? 'envia' : r.motivo; };
confere('oficina -> motorista: envia', motivo({}), 'envia');
confere('motorista -> oficina: nao (so oficina -> motorista)', motivo({ daOficina: false }), 'nao_e_oficina');
confere('sem destinatario', motivo({ destinoId: null }), 'sem_destino');
confere('destinatario = quem escreveu', motivo({ destinoId: 'oficina-user' }), 'para_si_mesmo');
confere('sem numero do pedido', motivo({ numero: null }), 'sem_pedido');
for (const s of STATUS_PEDIDO_FECHADO) confere(`pedido ${s}: nao`, motivo({ statusPedido: s }), 'pedido_fechado');
for (const s of ['aberta', 'em_orcamento', 'aceita', 'em_andamento']) confere(`pedido ${s}: envia`, motivo({ statusPedido: s }), 'envia');
confere('sem e-mail', motivo({ email: '' }), 'sem_email');
confere('e-mail sem @', motivo({ email: 'nada' }), 'sem_email');
confere('conta excluida (.invalid)', motivo({ email: 'excluida-x@conta-excluida.invalid' }), 'sem_email');
confere('perfil desativado', motivo({ ativo: false }), 'perfil_inativo');
confere('ativo null (perfil antigo) envia', motivo({ ativo: null }), 'envia');
confere('conta de teste', motivo({ contaTeste: true }), 'conta_teste');
confere('audio: mesma decisao (a regra nao olha o tipo)', motivo({}), 'envia');

// ---- trava ----
confere('intervalo e 3 h (constante)', HORAS_ENTRE_EMAILS_MENSAGEM, 3);
confere('limite = agora - 3 h', limiteDaTrava(T0), new Date(T0 - 3 * H).toISOString());
confere('sem e-mail antes: pode', podeMandarDeNovo(null, T0), true);
confere('e-mail ha 1 min: nao', podeMandarDeNovo(new Date(T0 - 60e3).toISOString(), T0), false);
confere('e-mail ha 2 h 59: nao', podeMandarDeNovo(new Date(T0 - 3 * H + 60e3).toISOString(), T0), false);
confere('e-mail ha exatamente 3 h: nao (estrito, igual ao lt do banco)', podeMandarDeNovo(new Date(T0 - 3 * H).toISOString(), T0), false);
confere('e-mail ha 3 h + 1 s: pode', podeMandarDeNovo(new Date(T0 - 3 * H - 1000).toISOString(), T0), true);
confere('data invalida: pode (nao trava para sempre)', podeMandarDeNovo('lixo', T0), true);
// sequencia de mensagens da mesma conversa: 10:00 envia, 10:30/12:59 nao, 13:01 envia, 13:30 nao
{
  let ultimo: string | null = null; const enviados: string[] = [];
  for (const min of [0, 30, 179, 181, 210, 362]) {
    const t = T0 + min * 60e3;
    if (podeMandarDeNovo(ultimo, t)) { ultimo = new Date(t).toISOString(); enviados.push(`+${min}`); }
  }
  confere('sequencia: 1 e-mail a cada 3 h', enviados, ['+0', '+181', '+362']);
}

// ---- textos ----
const LINGUAS = ['et', 'ru', 'en', 'it', 'pt', 'pt-PT'] as const;
const PROIBIDO = /gr[aá]tis|free|tasuta|бесплатн|gratuit|€|\beur\b|pre[cç]o|price|hind\b|цен[аы]|prezzo|garant|guarantee|гарант/i;
for (const l of LINGUAS) {
  const t = TEXTOS_EMAIL_MENSAGEM[l];
  for (const [k, v] of Object.entries(t)) confere(`${l}.${k} preenchido`, typeof v === 'string' && v.trim().length > 0, true);
  confere(`${l} assunto tem {oficina} e {numero}`, t.assunto.includes('{oficina}') && t.assunto.includes('{numero}'), true);
  confere(`${l} intro tem {oficina} e {numero}`, t.intro.includes('{oficina}') && t.intro.includes('{numero}'), true);
  confere(`${l} sem precos/gratis/promessa`, Object.values(t).filter((v) => PROIBIDO.test(v)), []);
}
confere('mesmas chaves nos 6 idiomas', LINGUAS.map((l) => Object.keys(TEXTOS_EMAIL_MENSAGEM[l]).sort().join(',')).every((k, _, a) => k === a[0]), true);

const LINK = 'https://bipfix.com/r/100150?k=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&c=1';
const SEGREDO = 'Texto secreto da mensagem 123';
const pasta = process.argv[2];
if (pasta) fs.mkdirSync(pasta, { recursive: true });
const esperadoAssunto: Record<string, string> = {
  et: 'Auto Kiirabi OÜ kirjutas sulle päringu 100150 kohta',
  ru: 'Новое сообщение от Auto Kiirabi OÜ по заявке 100150',
  en: 'Auto Kiirabi OÜ wrote to you about request 100150',
  it: 'Auto Kiirabi OÜ ti ha scritto per la richiesta 100150',
  pt: 'Auto Kiirabi OÜ enviou uma mensagem sobre o seu pedido 100150',
  'pt-PT': 'Auto Kiirabi OÜ enviou-lhe uma mensagem sobre o seu pedido 100150',
};
for (const l of LINGUAS) {
  const { assunto, html } = montarEmailMensagemOficina({ idioma: l, nome: 'Mari', oficina: 'Auto Kiirabi OÜ', numero: 100150, link: LINK });
  confere(`${l} assunto`, assunto, esperadoAssunto[l]);
  confere(`${l} html tem o link curto do pedido`, html.includes('href="https://bipfix.com/r/100150?k=') && !/\/cliente\//.test(html), true);
  confere(`${l} html tem oficina e numero`, html.includes('Auto Kiirabi OÜ') && html.includes('100150'), true);
  confere(`${l} html sem o texto da mensagem`, html.includes(SEGREDO), false);
  confere(`${l} html com o botao`, html.includes(TEXTOS_EMAIL_MENSAGEM[l].botao.replace(/'/g, '&#39;')), true);
  const final = aplicarIdentidade(html);
  confere(`${l} identidade da marca aplicada (logo, rodape)`, final.includes('data-bipfix-marca') && final.includes('/email/logo-branco.png') && !final.includes('>BipFix</h1>'), true);
  if (pasta) fs.writeFileSync(path.join(pasta, `mensagem-oficina-${l}.html`), `<!-- assunto: ${assunto} -->\n${final}`);
}
// idioma: lv/lt/fi e vazio -> ingles (regra unica dos e-mails); "pt-BR" -> pt
confere('lv -> en', montarEmailMensagemOficina({ idioma: 'lv', nome: '', oficina: 'X', numero: 1, link: LINK }).assunto, 'X wrote to you about request 1');
confere('fi -> en', montarEmailMensagemOficina({ idioma: 'fi', nome: '', oficina: 'X', numero: 1, link: LINK }).assunto, 'X wrote to you about request 1');
confere('sem idioma -> en', montarEmailMensagemOficina({ idioma: null, nome: '', oficina: 'X', numero: 1, link: LINK }).assunto, 'X wrote to you about request 1');
confere('pt-BR -> pt', montarEmailMensagemOficina({ idioma: 'pt-BR', nome: '', oficina: 'X', numero: 1, link: LINK }).assunto, 'X enviou uma mensagem sobre o seu pedido 1');
// sem nome: saudacao sem nome; nome/oficina com HTML: escapado; quebra de linha fora do assunto
{
  const r = montarEmailMensagemOficina({ idioma: 'et', nome: '', oficina: 'A', numero: 2, link: LINK });
  confere('sem nome: "Tere!"', r.html.includes('>Tere!</p>'), true);
  const x = montarEmailMensagemOficina({ idioma: 'en', nome: '<img src=x onerror=alert(1)>', oficina: 'Shop <b>1</b>\nBcc: a@b.c', numero: 3, link: LINK });
  confere('nome escapado', x.html.includes('<img src=x') || x.html.includes('<b>1</b>'), false);
  confere('assunto em uma linha', /[\r\n]/.test(x.assunto), false);
  const sem = montarEmailMensagemOficina({ idioma: 'en', nome: 'A', oficina: '', numero: 4, link: LINK });
  confere('oficina sem nome -> BipFix', sem.assunto, 'BipFix wrote to you about request 4');
}

// ---- links (Fable #3/#8) ----
{
  const OF = '0f1e2d3c-4b5a-4968-8776-655443322110';
  confere('consulta do dono leva c=1 e a oficina', consultaChatOficina(OF), `c=1&of=${OF}`);
  const pag = linkPagadorMensagem('https://bipfix.com', 100150, OF, 'et');
  confere('link de quem paga', pag, `https://bipfix.com/r/100150?c=1&g=1&of=${OF}&l=et`);
  const SLUG_PT = /\/(cliente|oficina|mensagens|orcamentos|pedido|solicitac)/i;
  for (const l of ['et', 'ru', 'en', 'it', 'pt', 'pt-PT']) {
    const x = linkPagadorMensagem('https://bipfix.com', 100150, OF, l);
    confere(`link de quem paga (${l}) sem /cliente/ nem nome de pagina em portugues`, SLUG_PT.test(x.replace(/\?.*$/, '')) || x.includes('/cliente/'), false);
    confere(`link de quem paga (${l}) e o link curto /r/<n>`, x.startsWith('https://bipfix.com/r/100150?'), true);
  }
  const html = montarEmailMensagemOficina({ idioma: 'en', nome: 'A', oficina: 'X', numero: 100150, link: pag }).html;
  confere('html leva o of= da oficina (escapado)', html.includes(`&amp;of=${OF}`), true);
}
// ---- nome da oficina cortado em 80 ----
{
  const longo = 'Oficina '.repeat(20); // 160 caracteres
  const r = montarEmailMensagemOficina({ idioma: 'en', nome: '', oficina: longo, numero: 5, link: LINK });
  const nomeNoAssunto = r.assunto.replace(/ wrote to you about request 5$/, '');
  confere('nome da oficina no assunto com no maximo 80', nomeNoAssunto.length <= 80, true);
  confere('nome da oficina cortado = 80 primeiros (sem espaco no fim)', nomeNoAssunto, longo.slice(0, 80).trim());
}
// ---- prazo do envio (Fable #5) ----
void (async () => {
  const lento = new Promise<string>((r) => setTimeout(() => r('fim'), 500));
  confere('envio lento: devolve "prazo" no tempo', await comPrazo(lento, 20), 'prazo');
  confere('envio rapido: devolve o resultado', await comPrazo(Promise.resolve('ok'), 1000), 'ok');
  confere('prazo da rota = 8 s', PRAZO_EMAIL_MENSAGEM_MS, 8000);
})().then(() => {
  console.log(`\n${oks} ok, ${falhas} falha(s)${pasta ? ` - HTML em ${pasta}` : ''}`);
  if (falhas) process.exit(1);
});
