import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { oficinaDoUsuarioEhDona } from '@/lib/acesso-servico';
import { avisarFornecedoresCotacao, carregarCotacaoParaAviso, cotacaoAvisavel, SEM_AVISO } from '@/lib/avisar-fornecedores-cotacao';

// Avisa (sino + e-mail) quem pode vender a peca de um pedido novo - regras em
// lib/avisar-fornecedores-cotacao.ts (lote 2, 17/11: o corpo foi para la para o "reabrir"
// re-avisar). Aqui: so a dona da oficina que pediu, limite por usuario e o JSON de sempre
// (+ emailsImediatos/naFila). Dados lidos do banco (id da cotacao + sessao); o corpo nao decide nada.
export async function POST(req: NextRequest) {
  try {
    const { cotacaoId } = await req.json();
    if (!cotacaoId) {
      return NextResponse.json({ error: 'cotacaoId obrigatorio' }, { status: 400 });
    }

    // So a dona da oficina que pediu a cotacao
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const cot = await carregarCotacaoParaAviso(cotacaoId);
    if (!cot || !(await oficinaDoUsuarioEhDona(userId, cot.oficina_id))) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    // fechada, cancelada ou vencida (expira_em no passado): ninguem e avisado
    if (!cotacaoAvisavel(cot)) return NextResponse.json(SEM_AVISO);
    if (!dentroDoLimite(`fornecedores:${userId}`, 20, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
    }

    const r = await avisarFornecedoresCotacao(cot);
    if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status });
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
