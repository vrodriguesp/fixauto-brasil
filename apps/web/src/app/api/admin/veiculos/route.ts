import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// veiculos_select no banco e restrita ao dono (auth.uid() = profile_id) -
// diferente da maioria das outras tabelas do app, que sao publicas. Por
// isso essa listagem so existe via rota admin com service role.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const clienteId = searchParams.get('cliente_id');
  const marca = searchParams.get('marca');

  try {
    let query = supabaseAdmin
      .from('veiculos')
      .select('*, dono:profiles(id, nome, email, telefone)')
      .order('created_at', { ascending: false })
      .limit(300);

    if (clienteId) query = query.eq('profile_id', clienteId);
    if (marca) query = query.eq('fipe_marca', marca);
    if (q) query = query.or(`placa.ilike.%${q}%,fipe_marca.ilike.%${q}%,fipe_modelo.ilike.%${q}%,apelido.ilike.%${q}%`);

    const { data: veiculos, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const veiculoIds = (veiculos || []).map((v) => v.id);
    const { data: solicitacoesCount } = veiculoIds.length
      ? await supabaseAdmin.from('solicitacoes').select('veiculo_id').in('veiculo_id', veiculoIds)
      : { data: [] as any[] };

    const contagemPorVeiculo = new Map<string, number>();
    for (const s of solicitacoesCount || []) {
      contagemPorVeiculo.set(s.veiculo_id, (contagemPorVeiculo.get(s.veiculo_id) || 0) + 1);
    }

    const resultado = (veiculos || []).map((v) => ({ ...v, totalIntervencoes: contagemPorVeiculo.get(v.id) || 0 }));

    const { data: marcasDisponiveis } = await supabaseAdmin.from('veiculos').select('fipe_marca');
    const marcas = Array.from(new Set((marcasDisponiveis || []).map((m) => m.fipe_marca))).sort();

    return NextResponse.json({ veiculos: resultado, marcas });
  } catch (error) {
    console.error('[admin/veiculos]', error);
    return NextResponse.json({ error: 'Erro ao carregar veículos' }, { status: 500 });
  }
}
