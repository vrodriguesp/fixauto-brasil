import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { SITE_URL, urlNoIdioma } from '@/lib/site-url';
import { TOKEN_ACESSO } from '@/lib/link-acesso';
import { TOKEN_LEMBRETE, pausaPorToken } from '@/lib/lembrar-clientes';
import { limitarPorIp } from '@/lib/rate-limit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Link curto do SMS (dono 04/11): bipfix.com/r/100133 -> pagina dos orcamentos
// do pedido no idioma do cliente. Fica fora do middleware de idioma (matcher).
// So redireciona: a pagina de destino exige o login do proprio cliente.
// ?o=<idioma>: link do e-mail de pedido novo para a OFICINA (07/11) -> pagina para
// orcar, no idioma da oficina (o link do e-mail nao leva nome de pagina em portugues).
// ?k=<token>: link de acesso dos e-mails do cliente (12/11; lib/link-acesso.ts) ->
// pagina "ver pedido", que so entra na conta com o toque no botao (nunca ao abrir).
export async function GET(req: NextRequest, { params }: { params: { numero: string } }) {
  const numero = String(params.numero || '').replace(/\D/g, '').slice(0, 12);
  if (!numero) return NextResponse.redirect(SITE_URL, 302);
  const { data: sol } = await supabaseAdmin.from('solicitacoes')
    .select('id, cliente:profiles!solicitacoes_cliente_id_fkey(idioma)')
    .eq('numero', numero).maybeSingle();
  if (!sol) return NextResponse.redirect(SITE_URL, 302);
  const oficina = req.nextUrl.searchParams.get('o');
  const k = req.nextUrl.searchParams.get('k');
  // ?s=<token>: "parar lembretes" dos e-mails de lembrete ao motorista (115) -> pagina sem login no idioma do
  // e-mail, token no FRAGMENTO (nao vai ao log). Abrir NAO pausa (leitores de e-mail abrem links): so o toque
  // no botao da pagina (ou o POST one-click do leitor de e-mail, abaixo) grava.
  const s = req.nextUrl.searchParams.get('s');
  if (s && TOKEN_LEMBRETE.test(s)) {
    const l = req.nextUrl.searchParams.get('l') || ((sol as any).cliente?.idioma ?? 'et');
    return NextResponse.redirect(`${urlNoIdioma(l, '/lembretes')}#k=${s}&n=${numero}`, 302);
  }
  // ?o=<idioma>&k=<token>: link de acesso da oficina (089, lib/link-acesso.ts) -> pagina "ver pedido"
  // em modo oficina, que nao entra sozinha ao abrir; &d=1 abre ja no "nao tenho interesse" (sem gravar).
  // Na pagina, o=1 so escolhe o esqueleto inicial: quem decide o modo e a API (finalidade do link).
  if (oficina && k && TOKEN_ACESSO.test(k)) {
    return NextResponse.redirect(`${urlNoIdioma(oficina, '/ver-pedido')}?k=${k}&o=1${req.nextUrl.searchParams.get('d') === '1' ? '&d=1' : ''}`, 302);
  }
  // &p=1: aviso de pedido de novas datas (079) -> pagina do pedido da oficina (cartao para responder)
  if (oficina && req.nextUrl.searchParams.get('p')) return NextResponse.redirect(urlNoIdioma(oficina, `/oficina/pedidos/${sol.id}`), 302);
  // sem token: pede login; ?n= leva o numero do pedido para a caixa "modo oficina" do login
  if (oficina) return NextResponse.redirect(`${urlNoIdioma(oficina, `/oficina/enviar-orcamento/${sol.id}`)}?n=${numero}`, 302);
  // ?l=<idioma>: e-mail de orcamento para quem nao e o dono do pedido (outro motorista do acidente)
  const idioma = req.nextUrl.searchParams.get('l') || ((sol as any).cliente?.idioma ?? 'et');
  // &of=<oficina>: e-mail "a oficina te escreveu" (24/11) -> o chat com a oficina que escreveu (so um uuid; a pagina
  // do chat exige o login e a RLS so mostra a conversa de quem participa). Links antigos sem "of": iguais a antes.
  const ofParam = req.nextUrl.searchParams.get('of') || '';
  const of = UUID.test(ofParam) ? ofParam.toLowerCase() : '';
  if (k && TOKEN_ACESSO.test(k)) return NextResponse.redirect(`${urlNoIdioma(idioma, '/ver-pedido')}?k=${k}${req.nextUrl.searchParams.get('c') ? `&c=1${of ? `&of=${of}` : ''}` : ''}`, 302);
  // ?c=1: botao "conversar com a oficina" do e-mail de agendamento -> chat com a oficina escolhida
  // &g=1: e-mail "a oficina te escreveu" (24/11) a quem paga o reparo (acidente) -> o chat DELE com a oficina
  if (req.nextUrl.searchParams.get('c')) {
    let oficinaChat = of;
    if (!oficinaChat) {
      // limit(1): dois orcamentos aceitos (dado estranho) nao derrubam o maybeSingle
      const { data: orc } = await supabaseAdmin.from('orcamentos').select('oficina_id').eq('solicitacao_id', sol.id).eq('status', 'aceito').limit(1).maybeSingle();
      oficinaChat = orc?.oficina_id || '';
    }
    const pagador = req.nextUrl.searchParams.get('g') === '1' && oficinaChat ? '&pagador=1' : '';
    return NextResponse.redirect(urlNoIdioma(idioma, `/cliente/mensagens/${sol.id}${oficinaChat ? `?oficina=${oficinaChat}${pagador}` : ''}`), 302);
  }
  return NextResponse.redirect(urlNoIdioma(idioma, `/cliente/orcamentos/${sol.id}`), 302);
}

// List-Unsubscribe-Post (RFC 8058): o leitor de e-mail (Gmail, Apple Mail...) faz POST no link de pausa
// com o corpo "List-Unsubscribe=One-Click" -> pausa os lembretes deste pedido, sem login e sem pagina.
export async function POST(req: NextRequest, { params }: { params: { numero: string } }) {
  if (!limitarPorIp(req, 'lembretes-one-click', 30, 60 * 60 * 1000)) return new NextResponse(null, { status: 429 });
  const numero = String(params.numero || '').replace(/\D/g, '').slice(0, 12);
  const s = req.nextUrl.searchParams.get('s') || '';
  const corpo = await req.text().catch(() => '');
  if (!numero || !TOKEN_LEMBRETE.test(s) || !/List-Unsubscribe=One-Click/i.test(corpo)) return new NextResponse(null, { status: 400 });
  const r = await pausaPorToken(s, 'pausar', numero);
  return new NextResponse(null, { status: r.ok ? 200 : 404 });
}
