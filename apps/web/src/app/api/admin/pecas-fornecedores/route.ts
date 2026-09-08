import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Rastreabilidade do portal de pecas pro admin: quem esta cadastrado como
// fornecedor (loja de pecas OU oficina que ativou "vende pecas"), se esta
// ativo, e quando fez login pela ultima vez (auth.users.last_sign_in_at,
// que nao fica em profiles - so acessivel via admin API do GoTrue).
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const [
      { data: lojas, error: lojasError },
      { data: oficinasFornecedoras, error: ofiError },
      { count: totalCotacoes },
      { count: cotacoesRespondidas },
      { count: pedidosConfirmados },
      { count: pedidosEntregues },
      { data: comissoes },
    ] = await Promise.all([
      supabaseAdmin
        .from('lojas_pecas')
        .select('id, nome_fantasia, cidade, estado, ativa, created_at, profile_id, profile:profiles(email)')
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('oficinas')
        .select('id, nome_fantasia, cidade, estado, ativa, created_at, profile_id, profile:profiles(email)')
        .eq('vende_pecas', true)
        .order('created_at', { ascending: false }),
      supabaseAdmin.from('cotacoes_pecas').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('cotacoes_pecas').select('*', { count: 'exact', head: true }).neq('status', 'aberta'),
      supabaseAdmin.from('pedidos_pecas').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('pedidos_pecas').select('*', { count: 'exact', head: true }).eq('status', 'entregue'),
      supabaseAdmin.from('comissao_pecas_lancamento').select('status, valor_comissao'),
    ]);

    if (lojasError) return NextResponse.json({ error: lojasError.message }, { status: 500 });
    if (ofiError) return NextResponse.json({ error: ofiError.message }, { status: 500 });

    // Mapa profile_id -> last_sign_in_at, buscado uma vez via admin API
    // (paginado; portal ainda pequeno, algumas paginas cobrem todo mundo).
    const ultimoLoginPorProfile = new Map<string, string | null>();
    let page = 1;
    while (page <= 20) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error || !data?.users?.length) break;
      for (const u of data.users) ultimoLoginPorProfile.set(u.id, u.last_sign_in_at ?? null);
      if (data.users.length < 200) break;
      page++;
    }

    const montarLinha = (row: any, tipo: 'loja' | 'oficina') => ({
      id: row.id,
      tipo,
      nome_fantasia: row.nome_fantasia,
      cidade: row.cidade,
      estado: row.estado,
      ativa: row.ativa,
      email: row.profile?.email || null,
      created_at: row.created_at,
      ultimo_login: ultimoLoginPorProfile.get(row.profile_id) ?? null,
    });

    const fornecedores = [
      ...(lojas || []).map((r) => montarLinha(r, 'loja')),
      ...(oficinasFornecedoras || []).map((r) => montarLinha(r, 'oficina')),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const seteDiasAtras = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const comissaoPendente = (comissoes || []).filter((c) => c.status === 'pendente').reduce((s, c) => s + Number(c.valor_comissao), 0);
    const comissaoPaga = (comissoes || []).filter((c) => c.status === 'pago').reduce((s, c) => s + Number(c.valor_comissao), 0);

    const resumo = {
      totalLojas: (lojas || []).length,
      lojasAtivas: (lojas || []).filter((l) => l.ativa).length,
      totalOficinasFornecedoras: (oficinasFornecedoras || []).length,
      oficinasFornecedorasAtivas: (oficinasFornecedoras || []).filter((o) => o.ativa).length,
      ativosUltimos7Dias: fornecedores.filter((f) => f.ultimo_login && new Date(f.ultimo_login).getTime() >= seteDiasAtras).length,
      nuncaLogou: fornecedores.filter((f) => !f.ultimo_login).length,
      // Uso real do canal (pedido do usuario: acompanhar se esta sendo
      // usado mesmo que a comissao ainda nao esteja rendendo)
      totalCotacoes: totalCotacoes || 0,
      cotacoesRespondidas: cotacoesRespondidas || 0,
      pedidosConfirmados: pedidosConfirmados || 0,
      pedidosEntregues: pedidosEntregues || 0,
      comissaoPendente,
      comissaoPaga,
    };

    return NextResponse.json({ fornecedores, resumo });
  } catch (error) {
    console.error('[admin/pecas-fornecedores]', error);
    return NextResponse.json({ error: 'Erro ao carregar fornecedores de peças' }, { status: 500 });
  }
}
