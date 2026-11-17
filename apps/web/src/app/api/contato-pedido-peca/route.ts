import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { telefonesComerciais } from '@/lib/pecas-v3';

// A3 (16/11): contato da OUTRA parte de um pedido de peca ja confirmado - telefone
// e endereco do fornecedor para a oficina compradora, e da compradora para a
// oficina que vendeu. So existe depois da confirmacao (pedidos_pecas), e so para
// quem e parte do pedido (dona da oficina compradora ou dona do fornecedor).
// Service role para nao abrir profiles de uma oficina para outra na RLS.
// Lote 1 (17/11): o telefone comercial (fornecedores_contato, tabela so do dono) vale
// antes do telefone do perfil; sem telefone comercial a resposta e a de antes.
type Contato = { nome: string | null; telefone: string | null; endereco: string | null };

const enderecoDe = (o: { endereco?: string | null; numero?: string | null; cidade?: string | null } | null) =>
  o ? [[o.endereco, o.numero].filter(Boolean).join(' '), o.cidade].filter(Boolean).join(', ') || null : null;

export async function POST(req: NextRequest) {
  try {
    const callerId = await getSessionUserId(req);
    if (!callerId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    if (!dentroDoLimite(`contato-peca-u:${callerId}`, 120, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
    }
    const { pedidoIds } = await req.json();
    const ids = Array.isArray(pedidoIds) ? pedidoIds.filter((x) => typeof x === 'string').slice(0, 50) : [];
    if (!ids.length) return NextResponse.json({ contatos: {} });

    const { data: pedidos } = await supabaseAdmin
      .from('pedidos_pecas')
      .select(`
        id, fornecedor_tipo, oficina_id, loja_id, oficina_fornecedora_id,
        compradora:oficinas!pedidos_pecas_oficina_id_fkey(profile_id, nome_fantasia, endereco, numero, cidade, profile:profiles!oficinas_profile_id_fkey(telefone)),
        loja:lojas_pecas(profile_id, nome_fantasia, endereco, cidade, profile:profiles(telefone)),
        oficina_fornecedora:oficinas!pedidos_pecas_oficina_fornecedora_id_fkey(profile_id, nome_fantasia, endereco, numero, cidade, profile:profiles!oficinas_profile_id_fkey(telefone))
      `)
      .in('id', ids);

    const lista = (pedidos || []) as any[];
    const comerciais = await telefonesComerciais(lista.flatMap((p) => [
      { tipo: 'oficina' as const, id: p.oficina_id },
      p.fornecedor_tipo === 'loja' ? { tipo: 'loja' as const, id: p.loja_id } : { tipo: 'oficina' as const, id: p.oficina_fornecedora_id },
    ]));
    const contatos: Record<string, Contato> = {};
    for (const p of lista) {
      const fornecedor = p.fornecedor_tipo === 'loja' ? p.loja : p.oficina_fornecedora;
      const fornecedorId = p.fornecedor_tipo === 'loja' ? p.loja_id : p.oficina_fornecedora_id;
      if (p.compradora?.profile_id === callerId && fornecedor) {
        const telefone = comerciais.get(`${p.fornecedor_tipo}:${fornecedorId}`) || fornecedor.profile?.telefone || null;
        contatos[p.id] = { nome: fornecedor.nome_fantasia || null, telefone, endereco: enderecoDe(fornecedor) };
      } else if (fornecedor?.profile_id === callerId && p.compradora) {
        const telefone = comerciais.get(`oficina:${p.oficina_id}`) || p.compradora.profile?.telefone || null;
        contatos[p.id] = { nome: p.compradora.nome_fantasia || null, telefone, endereco: enderecoDe(p.compradora) };
      }
    }
    return NextResponse.json({ contatos });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
