import { NextRequest, NextResponse } from 'next/server';
import { recalcularComissaoConfig } from '@/lib/comissao';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { temRelacaoComOficina } from '@/lib/acesso-servico';
import { supabaseAdmin } from '@/lib/supabase-admin';


// Chamado (fire-and-forget) sempre que algo que afeta a taxa de comissao
// muda do lado do cliente: orcamento enviado/revisado, nova avaliacao.
// Escrever em comissao_config exige service role (RLS so libera leitura
// pra propria oficina), por isso isso nao pode rodar direto do navegador.
export async function POST(req: NextRequest) {
  try {
    const { oficinaId } = await req.json();
    if (!oficinaId) {
      return NextResponse.json({ error: 'oficinaId obrigatório' }, { status: 400 });
    }
    // Quem pode pedir o recalculo: pessoa ligada a oficina (dona/funcionaria)
    // ou o cliente cuja acao mudou a metrica (avaliacao, aceite) - basta
    // estar logado e dentro do limite; o calculo so le dados do banco.
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    if (!dentroDoLimite(`recalcular:${userId}`, 60, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
    }
    if (!(await temRelacaoComOficina(userId, oficinaId))) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    const info = await recalcularComissaoConfig(supabaseAdmin, oficinaId);
    return NextResponse.json(info);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
