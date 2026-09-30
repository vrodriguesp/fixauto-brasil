import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';


export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { data: emergencia, error } = await supabaseAdmin
      .from('emergencias')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !emergencia) {
      return NextResponse.json({ error: 'Emergência não encontrada' }, { status: 404 });
    }

    const [
      { data: fotos },
      { data: outroVeiculo },
      { data: mensagens },
      { data: oficinasNotificadas },
    ] = await Promise.all([
      supabaseAdmin.from('emergencia_fotos').select('*').eq('emergencia_id', params.id),
      supabaseAdmin
        .from('emergencia_outro_veiculo')
        .select('*, fotos:emergencia_outro_veiculo_fotos(*)')
        .eq('emergencia_id', params.id)
        .maybeSingle(),
      supabaseAdmin
        .from('emergencia_mensagens')
        .select('*, remetente:profiles(nome)')
        .eq('emergencia_id', params.id)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('emergencia_oficinas_notificadas')
        .select('*, oficina:oficinas(nome_fantasia, cidade, estado)')
        .eq('emergencia_id', params.id)
        .order('distancia_km', { ascending: true }),
    ]);

    return NextResponse.json({
      emergencia,
      fotos: fotos || [],
      outroVeiculo: outroVeiculo || null,
      mensagens: mensagens || [],
      oficinasNotificadas: oficinasNotificadas || [],
    });
  } catch (error) {
    console.error('[admin/emergencias/:id]', error);
    return NextResponse.json({ error: 'Erro ao carregar emergência' }, { status: 500 });
  }
}
