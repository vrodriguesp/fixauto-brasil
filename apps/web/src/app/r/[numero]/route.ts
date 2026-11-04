import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { SITE_URL, urlNoIdioma } from '@/lib/site-url';

// Link curto do SMS (dono 04/11): bipfix.com/r/100133 -> pagina dos orcamentos
// do pedido no idioma do cliente. Fica fora do middleware de idioma (matcher).
// So redireciona: a pagina de destino exige o login do proprio cliente.
export async function GET(_req: NextRequest, { params }: { params: { numero: string } }) {
  const numero = String(params.numero || '').replace(/\D/g, '').slice(0, 12);
  if (!numero) return NextResponse.redirect(SITE_URL, 302);
  const { data: sol } = await supabaseAdmin.from('solicitacoes')
    .select('id, cliente:profiles!solicitacoes_cliente_id_fkey(idioma)')
    .eq('numero', numero).maybeSingle();
  if (!sol) return NextResponse.redirect(SITE_URL, 302);
  const idioma = (sol as any).cliente?.idioma ?? 'et';
  return NextResponse.redirect(urlNoIdioma(idioma, `/cliente/orcamentos/${sol.id}`), 302);
}
