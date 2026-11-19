import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';


export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Lista central de solicitacoes pro admin auditar: todo pedido de servico
// criado na plataforma, com cliente/veiculo/contagem de orcamentos, pra dar
// visibilidade completa sem precisar entrar em cada conta.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const tipo = searchParams.get('tipo');
  const clienteId = searchParams.get('cliente_id');
  const veiculoId = searchParams.get('veiculo_id');
  // sem os caracteres que mudam o filtro .or() do PostgREST (auditoria B-02)
  const q = (searchParams.get('q') || '').replace(/[,()*%\\]/g, ' ').trim() || null;
  const de = searchParams.get('de');
  const ate = searchParams.get('ate');

  try {
    let query = supabaseAdmin
      .from('solicitacoes')
      .select(
        `id, numero, tipo, descricao, urgencia, status, endereco, created_at, emergencia_id,
         cliente:profiles!solicitacoes_cliente_id_fkey(id, nome, email, telefone, codigo),
         veiculo:veiculos(id, fipe_marca, fipe_modelo, fipe_ano, placa),
         orcamentos(id, status, valor_total, oficina_id),
         dispensas:pedido_dispensas(oficina_id),
         vistos:pedido_vistos(oficina_id),
         privado:solicitacoes_privado(endereco)`
      )
      .order('created_at', { ascending: false })
      .limit(300);

    if (status) query = query.eq('status', status);
    if (tipo) query = query.eq('tipo', tipo);
    if (clienteId) query = query.eq('cliente_id', clienteId);
    if (veiculoId) query = query.eq('veiculo_id', veiculoId);
    if (de) query = query.gte('created_at', de);
    if (ate) query = query.lte('created_at', ate);
    // numero do pedido (100145) ou numero do cliente (500123) busca exato; texto busca na descricao/endereco (dono 19/11)
    if (q && /^\d{4,9}$/.test(q)) {
      const { data: cli } = await supabaseAdmin.from('profiles').select('id').eq('codigo', Number(q)).maybeSingle();
      query = cli ? query.or(`numero.eq.${Number(q)},cliente_id.eq.${cli.id}`) : query.eq('numero', Number(q));
    } else if (q) query = query.or(`descricao.ilike.%${q}%,endereco.ilike.%${q}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 102: o admin ve a rua (tabela privada); a linha so tem a area
    const solicitacoes = (data || []).map(({ dispensas, vistos, privado, ...s }: any) => ({
      endereco: privado?.endereco || s.endereco,
      ...s,
      // oficinas que abriram o pedido e que marcaram "nao tenho interesse" (migracao 070)
      totalVistos: vistos?.length || 0,
      totalDispensas: dispensas?.length || 0,
      totalOrcamentos: s.orcamentos?.length || 0,
      orcamentoAceito: (s.orcamentos || []).some((o: any) => o.status === 'aceito'),
    }));

    const resumo = {
      total: solicitacoes.length,
      abertas: solicitacoes.filter((s: any) => s.status === 'aberta').length,
      semOrcamento: solicitacoes.filter((s: any) => s.status === 'aberta' && s.totalOrcamentos === 0).length,
      emAndamento: solicitacoes.filter((s: any) => s.status === 'em_andamento').length,
      concluidas: solicitacoes.filter((s: any) => s.status === 'concluida').length,
    };

    return NextResponse.json({ solicitacoes, resumo });
  } catch (error) {
    console.error('[admin/solicitacoes]', error);
    return NextResponse.json({ error: 'Erro ao carregar solicitações' }, { status: 500 });
  }
}
