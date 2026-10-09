import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { acessoEmergencia } from '@/lib/emergencia-acesso';
import { ehUuid } from '@/lib/validacao';

export const dynamic = 'force-dynamic';

// Dados de um acidente para a pagina de acompanhamento - so para quem tem
// acesso (codigo secreto de quem registrou, participante logado, oficina
// avisada ou admin). O id sozinho nao basta.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!ehUuid(params.id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const acesso = await acessoEmergencia(req, params.id);
  if (!acesso) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  const e = acesso.emergencia;

  const [{ data: outro }, { data: mensagens }] = await Promise.all([
    supabaseAdmin
      .from('emergencia_outro_veiculo')
      .select('id, nome, telefone, email, placa, veiculo_descricao, observacoes, notificado')
      .eq('emergencia_id', e.id)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('emergencia_mensagens')
      .select('id, remetente_tipo, texto, created_at')
      .eq('emergencia_id', e.id)
      .order('created_at', { ascending: true }),
  ]);

  let veiculo = null;
  let seguro: Record<string, unknown> | null = null;
  let orcamentos: unknown[] = [];
  if (e.solicitacao_id) {
    const [{ data: sol }, { data: orcs }] = await Promise.all([
      supabaseAdmin
        .from('solicitacoes')
        .select('pagamento_reparo, seguradora, sinistro_numero, franquia, veiculo:veiculos(fipe_marca, fipe_modelo, fipe_ano, placa, cor)')
        .eq('id', e.solicitacao_id)
        .maybeSingle(),
      supabaseAdmin
        .from('orcamentos')
        .select(
          'id, valor_total, prazo_dias, status, observacoes, oficina:oficinas(nome_fantasia, endereco, cidade, estado, pais, profile:profiles!oficinas_profile_id_fkey(telefone, email))'
        )
        .eq('solicitacao_id', e.solicitacao_id),
    ]);
    veiculo = (sol as { veiculo?: unknown } | null)?.veiculo ?? null;
    // dados do seguro: nao vao para o outro motorista
    if (sol && acesso.papel !== 'outro') {
      const { veiculo: _v, ...resto } = sol as Record<string, unknown>;
      seguro = resto;
    }
    orcamentos = orcs || [];
  }

  return NextResponse.json({
    papel: acesso.papel,
    // coordenadas: a pagina descobre o PAIS do acidente (regras e seguro do local, nao do idioma)
    emergencia: { id: e.id, solicitacao_id: e.solicitacao_id, profile_id: e.profile_id, descricao: e.descricao, nome: e.nome, latitude: e.latitude, longitude: e.longitude },
    outro: outro ?? null,
    mensagens: mensagens || [],
    veiculo,
    seguro,
    orcamentos,
  });
}
