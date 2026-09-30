import { NextRequest, NextResponse } from 'next/server';
import { taxaEfetivaServicos } from '@/lib/comissao-regras';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';


export const dynamic = 'force-dynamic';

// Devolve a taxa de comissao que vale agora para a oficina, pela hierarquia
// (taxa individual do admin > regra global), de onde ela vem, se a oficina
// e parceira fundadora e as metricas de desempenho (para o detalhamento).
export async function GET(req: NextRequest) {
  const oficinaId = req.nextUrl.searchParams.get('oficinaId');
  if (!oficinaId) {
    return NextResponse.json({ error: 'oficinaId obrigatório' }, { status: 400 });
  }

  // Taxa de comissao e dado comercial da propria oficina - sem essa
  // checagem, qualquer um sabendo o oficinaId (aparece em URL publica)
  // conseguia ler a taxa e o volume de servicos de um concorrente.
  const callerId = await getSessionUserId(req);
  const { data: oficina } = await supabaseAdmin.from('oficinas').select('profile_id, parceiro_fundador').eq('id', oficinaId).single();
  if (!callerId || !oficina || oficina.profile_id !== callerId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const info = await taxaEfetivaServicos(supabaseAdmin, oficinaId);
  const { data: metricas } = await supabaseAdmin
    .from('comissao_config')
    .select('taxa_calculada, media_tempo_resposta_horas, media_revisoes_orcamento, media_avaliacao_clientes, total_servicos_concluidos')
    .eq('oficina_id', oficinaId)
    .maybeSingle();
  return NextResponse.json({ ...info, fundador: !!oficina.parceiro_fundador, metricas: metricas || null });
}
