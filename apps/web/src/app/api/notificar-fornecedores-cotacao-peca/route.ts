import { NextRequest, NextResponse } from 'next/server';
import { distanciaKm } from '@/lib/utils';
import { sendCotacaoPecaDisponivelEmail } from '@/lib/notifications';
import { notifCotacaoPecaDisponivel } from '@/lib/notif-i18n';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { oficinaDoUsuarioEhDona } from '@/lib/acesso-servico';
import { supabaseAdmin } from '@/lib/supabase-admin';


// Notifica oficinas que se inscreveram como fornecedoras de pecas
// (oficinas.vende_pecas = true) e estao dentro do raio de atendimento da
// oficina que abriu a cotacao, pra elas saberem que podem responder com
// estoque excedente. Lojas de pecas continuam no modelo pull (navegam
// cotacoes abertas em /loja/cotacoes) - isso aqui e so o "push" pro caso
// novo de oficina-fornecedora, mesma logica de proximidade usada em
// /api/notificar-oficinas-emergencia.
export async function POST(req: NextRequest) {
  try {
    const { cotacaoId, oficinaCompradoraId, latitude, longitude } = await req.json();

    if (!cotacaoId || !oficinaCompradoraId || latitude == null || longitude == null) {
      return NextResponse.json({ error: 'cotacaoId, oficinaCompradoraId, latitude e longitude sao obrigatorios' }, { status: 400 });
    }

    // So a dona da oficina que pediu a cotacao, para a cotacao dela
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const { data: cot } = await supabaseAdmin.from('cotacoes_pecas').select('oficina_id').eq('id', cotacaoId).maybeSingle();
    if (!cot || cot.oficina_id !== oficinaCompradoraId || !(await oficinaDoUsuarioEhDona(userId, oficinaCompradoraId))) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    if (!dentroDoLimite(`fornecedores:${userId}`, 20, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
    }

    // Caixa larga (100km) so pra pre-filtrar no banco por performance - o
    // corte de verdade e feito abaixo, por oficina, usando o raio de
    // atendimento que cada uma configurou (o mesmo raio que decide o que
    // ela VE na aba "Vender excedente"). Antes usava um raio fixo de
    // 50km aqui, que podia notificar uma oficina que depois nao via a
    // cotacao na propria tela por estar fora do raio dela.
    const BOUNDING_BOX_KM = 100;
    const radiusLat = BOUNDING_BOX_KM / 111;
    const radiusLon = BOUNDING_BOX_KM / (111 * Math.cos(latitude * Math.PI / 180));

    const { data: candidatas, error } = await supabaseAdmin
      .from('oficinas')
      .select('id, profile_id, nome_fantasia, latitude, longitude, raio_atendimento_km, profile:profiles(email, nome, idioma)')
      .eq('vende_pecas', true)
      .eq('ativa', true)
      .neq('id', oficinaCompradoraId)
      .gte('latitude', latitude - radiusLat)
      .lte('latitude', latitude + radiusLat)
      .gte('longitude', longitude - radiusLon)
      .lte('longitude', longitude + radiusLon);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const oficinas = (candidatas || []).filter((o) => {
      if (o.latitude == null || o.longitude == null) return false;
      const raio = o.raio_atendimento_km || 30;
      return distanciaKm(latitude, longitude, o.latitude, o.longitude) <= raio;
    });

    const [{ data: cotacao }, { data: oficinaCompradora }] = await Promise.all([
      supabaseAdmin.from('cotacoes_pecas').select('peca_descricao').eq('id', cotacaoId).single(),
      supabaseAdmin.from('oficinas').select('nome_fantasia').eq('id', oficinaCompradoraId).single(),
    ]);
    const pecaDescricao = cotacao?.peca_descricao || 'uma peça';
    const oficinaCompradoraNome = oficinaCompradora?.nome_fantasia || 'Uma oficina';

    let notificadas = 0;
    for (const of of oficinas) {
      if (!of.profile_id) continue;
      const nn = notifCotacaoPecaDisponivel((of as any).profile?.idioma);
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: of.profile_id,
        tipo: 'cotacao_peca_disponivel',
        titulo: nn.titulo,
        mensagem: nn.mensagem,
        dados: { cotacao_id: cotacaoId },
      });
      const email = (of as any).profile?.email;
      if (email) {
        await sendCotacaoPecaDisponivelEmail({
          toEmail: email,
          toName: (of as any).profile?.nome || of.nome_fantasia,
          pecaDescricao,
          oficinaCompradoraNome,
          locale: (of as any).profile?.idioma,
        }).catch(() => {});
      }
      notificadas++;
    }

    return NextResponse.json({ success: true, oficinasNotificadas: notificadas });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
