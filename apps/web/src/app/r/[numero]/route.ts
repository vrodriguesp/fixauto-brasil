import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { SITE_URL, urlNoIdioma } from '@/lib/site-url';
import { TOKEN_ACESSO } from '@/lib/link-acesso';

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
  // &p=1: aviso de pedido de novas datas (079) -> pagina do pedido da oficina (cartao para responder)
  if (oficina && req.nextUrl.searchParams.get('p')) return NextResponse.redirect(urlNoIdioma(oficina, `/oficina/pedidos/${sol.id}`), 302);
  if (oficina) return NextResponse.redirect(urlNoIdioma(oficina, `/oficina/enviar-orcamento/${sol.id}`), 302);
  // ?l=<idioma>: e-mail de orcamento para quem nao e o dono do pedido (outro motorista do acidente)
  const idioma = req.nextUrl.searchParams.get('l') || ((sol as any).cliente?.idioma ?? 'et');
  const k = req.nextUrl.searchParams.get('k');
  if (k && TOKEN_ACESSO.test(k)) return NextResponse.redirect(`${urlNoIdioma(idioma, '/ver-pedido')}?k=${k}${req.nextUrl.searchParams.get('c') ? '&c=1' : ''}`, 302);
  // ?c=1: botao "conversar com a oficina" do e-mail de agendamento -> chat com a oficina escolhida
  if (req.nextUrl.searchParams.get('c')) {
    const { data: orc } = await supabaseAdmin.from('orcamentos').select('oficina_id').eq('solicitacao_id', sol.id).eq('status', 'aceito').maybeSingle();
    return NextResponse.redirect(urlNoIdioma(idioma, `/cliente/mensagens/${sol.id}${orc?.oficina_id ? `?oficina=${orc.oficina_id}` : ''}`), 302);
  }
  return NextResponse.redirect(urlNoIdioma(idioma, `/cliente/orcamentos/${sol.id}`), 302);
}
