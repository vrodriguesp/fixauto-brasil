import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { oficinasDoUsuario } from '@/lib/acesso-servico';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nada = () => NextResponse.json({ error: 'Não encontrada' }, { status: 404 });

// Lote 1 de pecas (17/11): placa da cotacao com carro. Fica em cotacoes_pecas_placa
// (so a compradora le pela RLS; fora do tempo real) e os fornecedores so a recebem
// por aqui, avaliada AO VIVO (ocultar depois corta na hora). Devolve a placa a:
//  (a) compradora (dona ou equipe);
//  (b) com "enviar a placa" e a cotacao aberta/respondida: loja ATIVA do mesmo pais
//      ou oficina ATIVA que vende (nunca a compradora; so em "lojas e oficinas"),
//      do mesmo tipo de conta (teste x real);
//  (c) o fornecedor escolhido (pedido confirmado), mesmo com a placa oculta.
// Qualquer outro caso: 404 igual ao de cotacao inexistente (nao revela se ha placa).
// Nunca vai em e-mail nem em aviso. Regra: Fable_auditoria_mapa_lote1.md sec. 4.
export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const cotacaoId = req.nextUrl.searchParams.get('cotacao') || '';
    if (!UUID.test(cotacaoId)) return NextResponse.json({ error: 'cotacao obrigatória' }, { status: 400 });
    if (!dentroDoLimite(`placa-peca-u:${userId}`, 120, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
    }

    const { data: cot } = await supabaseAdmin
      .from('cotacoes_pecas')
      .select('id, oficina_id, tipo, enviar_placa, alvo, status, oficina:oficinas!cotacoes_pecas_oficina_id_fkey(pais, profile:profiles!oficinas_profile_id_fkey(conta_teste))')
      .eq('id', cotacaoId)
      .maybeSingle();
    if (!cot || cot.tipo !== 'carro') return nada();
    const { data: linha } = await supabaseAdmin.from('cotacoes_pecas_placa').select('placa').eq('cotacao_id', cot.id).maybeSingle();
    if (!linha?.placa) return nada();
    const placa = () => NextResponse.json({ placa: linha.placa }, { headers: { 'Cache-Control': 'no-store' } });

    // (a) compradora
    const minhasOficinas = await oficinasDoUsuario(userId);
    if (minhasOficinas.includes(cot.oficina_id)) return placa();

    // (c) fornecedor de um pedido desta cotacao
    const { data: minhasLojas } = await supabaseAdmin.from('lojas_pecas').select('id, ativa, pais').eq('profile_id', userId);
    const lojaIds = (minhasLojas || []).map((l) => l.id);
    const { data: pedidos } = await supabaseAdmin.from('pedidos_pecas').select('loja_id, oficina_fornecedora_id').eq('cotacao_id', cot.id).in('status', ['confirmado', 'entregue']);
    if ((pedidos || []).some((p) => (p.loja_id && lojaIds.includes(p.loja_id)) || (p.oficina_fornecedora_id && minhasOficinas.includes(p.oficina_fornecedora_id)))) return placa();

    // (b) fornecedor que ainda pode ofertar
    if (!cot.enviar_placa || !['aberta', 'respondida'].includes(String(cot.status))) return nada();
    const compradora = (cot as any).oficina as { pais: string | null; profile: { conta_teste: boolean | null } | null } | null;
    const compradoraTeste = !!compradora?.profile?.conta_teste;
    if ((minhasLojas || []).some((l) => l.ativa && !!compradora?.pais && l.pais === compradora.pais)) {
      // a loja e do proprio usuario: o tipo de conta e o dele
      const { data: eu } = await supabaseAdmin.from('profiles').select('conta_teste').eq('id', userId).maybeSingle();
      if (!!eu?.conta_teste === compradoraTeste) return placa();
    }
    if (cot.alvo === 'todos' && minhasOficinas.length) {
      const { data: vendedoras } = await supabaseAdmin
        .from('oficinas')
        .select('id, profile:profiles!oficinas_profile_id_fkey(conta_teste)')
        .in('id', minhasOficinas)
        .eq('ativa', true)
        .eq('vende_pecas', true)
        .neq('id', cot.oficina_id);
      if ((vendedoras || []).some((o: any) => !!o.profile?.conta_teste === compradoraTeste)) return placa();
    }
    return nada();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
