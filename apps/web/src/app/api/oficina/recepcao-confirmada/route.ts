import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// "O horario de funcionamento serve" no convite de Pedidos (check-in v2, decisao 6): grava
// oficinas.recepcao_confirmada_em e o convite nao aparece mais. Dono da oficina ou funcionario admin
// (o funcionario nao pode alterar a oficina pelo navegador - RLS - por isso pelo servidor).
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  let { data: of } = await supabaseAdmin.from('oficinas').select('id').eq('profile_id', userId).maybeSingle();
  if (!of) {
    const { data: f } = await supabaseAdmin.from('funcionarios').select('oficina_id, cargo').eq('profile_id', userId).eq('ativo', true).maybeSingle();
    if (!f || f.cargo !== 'admin') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    of = { id: f.oficina_id };
  }
  const { error } = await supabaseAdmin.from('oficinas').update({ recepcao_confirmada_em: new Date().toISOString() }).eq('id', of.id).is('recepcao_confirmada_em', null);
  if (error) return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
