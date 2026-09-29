import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';

// Historico das acoes do admin (quem mudou o que, quando e por que).
// Filtros opcionais: solicitacao_id, entidade, entidade_id; limit (max 500).
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const p = req.nextUrl.searchParams;
  const limit = Math.min(Number(p.get('limit')) || 200, 500);
  let q = supabaseAdmin
    .from('admin_auditoria')
    .select('*, admin:profiles(nome, email)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (p.get('solicitacao_id')) q = q.eq('solicitacao_id', p.get('solicitacao_id')!);
  if (p.get('entidade')) q = q.eq('entidade', p.get('entidade')!);
  if (p.get('entidade_id')) q = q.eq('entidade_id', p.get('entidade_id')!);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
