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

// Central de acidentes ("Acabei de bater") pro admin - fluxo de destaque da
// plataforma que ate agora nao tinha nenhuma visibilidade admin dedicada.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  try {
    let query = supabaseAdmin
      .from('emergencias')
      .select(
        `id, nome, email, telefone, descricao, endereco, status, prioridade, created_at, solicitacao_id,
         outro_veiculo:emergencia_outro_veiculo(id, nome, placa, notificado),
         oficinas_notificadas:emergencia_oficinas_notificadas(id, respondeu)`
      )
      .order('created_at', { ascending: false })
      .limit(200);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const emergencias = (data || []).map((e: any) => ({
      ...e,
      totalOficinasNotificadas: e.oficinas_notificadas?.length || 0,
      totalOficinasResponderam: (e.oficinas_notificadas || []).filter((o: any) => o.respondeu).length,
    }));

    return NextResponse.json({ emergencias });
  } catch (error) {
    console.error('[admin/emergencias]', error);
    return NextResponse.json({ error: 'Erro ao carregar emergências' }, { status: 500 });
  }
}
