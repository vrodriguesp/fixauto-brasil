import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Ferramenta de engajamento do admin: cobra oficinas proximas de uma
// solicitacao parada. Mesmo raio/filtro por especialidade que
// notificar-oficinas-emergencia, mas so notifica quem ainda NAO enviou
// orcamento (pra nao incomodar quem ja respondeu).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { data: solicitacao } = await supabaseAdmin
      .from('solicitacoes')
      .select('id, tipo, latitude, longitude, descricao, status')
      .eq('id', params.id)
      .single();

    if (!solicitacao) {
      return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });
    }

    const { data: jaResponderam } = await supabaseAdmin
      .from('orcamentos')
      .select('oficina_id')
      .eq('solicitacao_id', params.id);
    const idsJaResponderam = new Set((jaResponderam || []).map((o) => o.oficina_id));

    const RADIUS_KM = 40;
    const radiusLat = RADIUS_KM / 111;
    const radiusLon = RADIUS_KM / (111 * Math.cos((solicitacao.latitude * Math.PI) / 180));

    const { data: oficinasProximas, error } = await supabaseAdmin
      .from('oficinas')
      .select('id, profile_id, nome_fantasia, especialidades')
      .eq('ativa', true)
      .gte('latitude', solicitacao.latitude - radiusLat)
      .lte('latitude', solicitacao.latitude + radiusLat)
      .gte('longitude', solicitacao.longitude - radiusLon)
      .lte('longitude', solicitacao.longitude + radiusLon);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const destinatarias = (oficinasProximas || []).filter((o) => {
      if (idsJaResponderam.has(o.id)) return false;
      if (!o.especialidades || o.especialidades.length === 0) return true;
      return o.especialidades.includes(solicitacao.tipo);
    });

    let notificadas = 0;
    for (const oficina of destinatarias) {
      if (!oficina.profile_id) continue;
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: oficina.profile_id,
        tipo: 'cobranca_admin_solicitacao',
        titulo: 'Cliente esperando orçamento',
        mensagem: `A equipe BipFix identificou uma solicitação próxima ("${solicitacao.descricao.slice(0, 60)}") ainda sem resposta. Que tal enviar um orçamento?`,
        dados: { solicitacao_id: solicitacao.id },
      });
      notificadas++;
    }

    return NextResponse.json({ success: true, oficinasNotificadas: notificadas });
  } catch (error) {
    console.error('[admin/solicitacoes/:id/cobrar]', error);
    return NextResponse.json({ error: 'Erro ao cobrar oficinas' }, { status: 500 });
  }
}
