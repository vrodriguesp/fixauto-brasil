import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { ehUuid } from '@/lib/validacao';
import { dentroDoLimite } from '@/lib/rate-limit';
import { responderNovasDatas } from '@/lib/pedido-datas';

export const dynamic = 'force-dynamic';

// A OFICINA responde ao pedido de novas datas do cliente (migracao 079):
//  { confirmar: indice da sugestao, previsao?: AAAA-MM-DD } -> horario origem='cliente' e o orcamento
//    e aceito/agendado pelo nucleo do aceite (lib/aceitar-orcamento.ts);
//  { horarios: [{ data, turno, previsao? }] } (1 a 3) -> horarios novos, sem nova revisao.
// So o dono ou a equipe (nao mecanico) da oficina do orcamento.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    if (!ehUuid(params.id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    if (!dentroDoLimite(`novas-datas:${userId}`, 30, 3600e3)) return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
    const corpo = await req.json().catch(() => ({}));
    const r = await responderNovasDatas(userId, params.id, corpo);
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    console.error('[novas-datas]', (err as Error).message);
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}
