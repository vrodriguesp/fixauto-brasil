import { NextRequest, NextResponse } from 'next/server';
import { taxaEfetivaPecas } from '@/lib/comissao-regras';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// Taxa de comissao de PECAS que vale agora para o fornecedor (loja ou oficina
// que vende excedente), pela mesma regra usada na cobranca (individual do
// admin > regra global da plataforma). Antes o cartao mostrava a taxa base
// fixa (3%) mesmo com a plataforma "isenta" (teste do dono 10/10).
export async function GET(req: NextRequest) {
  const tipo = req.nextUrl.searchParams.get('fornecedorTipo');
  const id = req.nextUrl.searchParams.get('fornecedorId');
  if ((tipo !== 'loja' && tipo !== 'oficina') || !id) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  const callerId = await getSessionUserId(req);
  const tabela = tipo === 'loja' ? 'lojas_pecas' : 'oficinas';
  const { data: dono } = await supabaseAdmin.from(tabela).select('profile_id').eq('id', id).maybeSingle();
  if (!callerId || !dono || dono.profile_id !== callerId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  const info = await taxaEfetivaPecas(supabaseAdmin, tipo, id);
  return NextResponse.json({ taxa: info.taxa, origem: info.origem, modoGlobal: info.modoGlobal });
}
