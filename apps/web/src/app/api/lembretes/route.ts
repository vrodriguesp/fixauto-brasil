import { NextRequest, NextResponse } from 'next/server';
import { limitarPorIp } from '@/lib/rate-limit';
import { pausaPorToken } from '@/lib/lembrar-clientes';

export const dynamic = 'force-dynamic';

// Pagina "parar lembretes" (bipfix.com/r/<n>?s=<token>, migracao 115). Sem login: o token de cada e-mail de
// lembrete prova que a pessoa recebeu o e-mail do pedido. So mexe nos LEMBRETES do pedido (nunca na conta,
// nunca entra na conta).
//   acao 'ver'     -> numero do pedido e se os lembretes estao pausados (nao grava nada)
//   acao 'pausar'  -> solicitacoes.lembretes_pausados_em = agora
//   acao 'retomar' -> volta a ligar
export async function POST(req: NextRequest) {
  if (!limitarPorIp(req, 'lembretes-pausa', 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  const k = typeof b?.k === 'string' ? b.k : '';
  const acao = b?.acao;
  const n = typeof b?.n === 'string' || typeof b?.n === 'number' ? String(b.n) : null;
  if (!['ver', 'pausar', 'retomar'].includes(acao)) return NextResponse.json({ error: 'Link inválido', codigo: 'LINK_INVALIDO' }, { status: 410 });
  const r = await pausaPorToken(k, acao, n);
  if (!r.ok) return NextResponse.json({ error: 'Link inválido', codigo: 'LINK_INVALIDO' }, { status: 410 });
  return NextResponse.json({ numero: r.numero, pausado: r.pausado }, { headers: { 'Cache-Control': 'no-store' } });
}
