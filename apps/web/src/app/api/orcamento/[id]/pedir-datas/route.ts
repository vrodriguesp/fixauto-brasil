import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { ehUuid } from '@/lib/validacao';
import { dentroDoLimite } from '@/lib/rate-limit';
import { pedirNovasDatas } from '@/lib/pedido-datas';

export const dynamic = 'force-dynamic';

// O CLIENTE pede novas datas a oficina quando todos os horarios do orcamento ja passaram
// (migracao 079). Corpo: { sugestoes?: [{ data, turno }] (ate 3), mensagem?: string (ate 300) }.
// Regras e avisos em lib/pedido-datas.ts. Serve tambem o app (Authorization: Bearer).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    if (!ehUuid(params.id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    if (!dentroDoLimite(`pedir-datas:${userId}`, 10, 3600e3)) return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
    const corpo = await req.json().catch(() => ({}));
    const r = await pedirNovasDatas(userId, params.id, corpo);
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    console.error('[pedir-datas]', (err as Error).message);
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}
