import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function paraCsv(linhas: Record<string, any>[]): string {
  if (linhas.length === 0) return '';
  const colunas = Object.keys(linhas[0]);
  const escapar = (v: any) => {
    const texto = v == null ? '' : String(v);
    return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const cabecalho = colunas.join(',');
  const corpo = linhas.map((l) => colunas.map((c) => escapar(l[c])).join(',')).join('\n');
  return `${cabecalho}\n${corpo}`;
}

// Extracao de dados pra uso externo (ex: concessionaria querendo o
// historico de veiculos de uma marca especifica, ou a diretoria pedindo
// solicitacoes de um periodo). Filtros: tipo (obrigatorio), marca, status,
// de, ate.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get('tipo');
  const marca = searchParams.get('marca');
  const status = searchParams.get('status');
  const de = searchParams.get('de');
  const ate = searchParams.get('ate');

  try {
    if (tipo === 'veiculos') {
      let query = supabaseAdmin
        .from('veiculos')
        .select('id, placa, fipe_marca, fipe_modelo, fipe_ano, cor, apelido, created_at, dono:profiles(nome, email, telefone)')
        .order('created_at', { ascending: false });
      if (marca) query = query.eq('fipe_marca', marca);
      if (de) query = query.gte('created_at', de);
      if (ate) query = query.lte('created_at', ate);

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const linhas = (data || []).map((v: any) => ({
        veiculo_id: v.id,
        placa: v.placa || '',
        marca: v.fipe_marca,
        modelo: v.fipe_modelo,
        ano: v.fipe_ano,
        cor: v.cor || '',
        apelido: v.apelido || '',
        dono_nome: v.dono?.nome || '',
        dono_email: v.dono?.email || '',
        dono_telefone: v.dono?.telefone || '',
        cadastrado_em: v.created_at,
      }));

      const csv = paraCsv(linhas);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="bipfix-veiculos-${Date.now()}.csv"`,
        },
      });
    }

    if (tipo === 'solicitacoes') {
      let query = supabaseAdmin
        .from('solicitacoes')
        .select(
          `id, tipo, status, urgencia, descricao, endereco, created_at,
           cliente:profiles!solicitacoes_cliente_id_fkey(nome, email, telefone),
           veiculo:veiculos(fipe_marca, fipe_modelo, fipe_ano, placa),
           orcamentos(valor_total, status)`
        )
        .order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      if (de) query = query.gte('created_at', de);
      if (ate) query = query.lte('created_at', ate);

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      let linhas = (data || []).map((s: any) => {
        const aceito = (s.orcamentos || []).find((o: any) => o.status === 'aceito');
        return {
          solicitacao_id: s.id,
          tipo_servico: s.tipo,
          status: s.status,
          urgencia: s.urgencia,
          descricao: s.descricao,
          endereco: s.endereco,
          cliente_nome: s.cliente?.nome || '',
          cliente_email: s.cliente?.email || '',
          cliente_telefone: s.cliente?.telefone || '',
          veiculo_marca: s.veiculo?.fipe_marca || '',
          veiculo_modelo: s.veiculo?.fipe_modelo || '',
          veiculo_ano: s.veiculo?.fipe_ano || '',
          veiculo_placa: s.veiculo?.placa || '',
          total_orcamentos: (s.orcamentos || []).length,
          valor_aceito: aceito?.valor_total ?? '',
          criada_em: s.created_at,
        };
      });
      if (marca) linhas = linhas.filter((l) => l.veiculo_marca === marca);

      const csv = paraCsv(linhas);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="bipfix-solicitacoes-${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({ error: 'tipo deve ser "solicitacoes" ou "veiculos"' }, { status: 400 });
  } catch (error) {
    console.error('[admin/export]', error);
    return NextResponse.json({ error: 'Erro ao gerar exportação' }, { status: 500 });
  }
}
