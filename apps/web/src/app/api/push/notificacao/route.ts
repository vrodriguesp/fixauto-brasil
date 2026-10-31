import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { enviarPushDoAviso } from '@/lib/push';
import { ehUuid } from '@/lib/validacao';

export const dynamic = 'force-dynamic';

// Chamada pelo BANCO (gatilho da migracao 066, via pg_net) a cada aviso novo:
// manda o push para os aparelhos de quem recebe. Protegida pela chave
// PUSH_CHAVE (a mesma gravada em push_config no banco).
export async function POST(req: NextRequest) {
  const chave = process.env.PUSH_CHAVE;
  const recebida = req.headers.get('x-push-chave') || '';
  if (!chave || recebida.length !== chave.length || !timingSafeEqual(Buffer.from(recebida), Buffer.from(chave))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }
  const { id } = await req.json().catch(() => ({}));
  if (!ehUuid(id)) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  const r = await enviarPushDoAviso(id);
  return NextResponse.json({ ok: true, ...r });
}
