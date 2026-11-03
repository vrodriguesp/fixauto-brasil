import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { ALVO_DEEPL, traduzirTextos, type Traducao } from '@/lib/deepl';

// Traducao automatica do texto livre (descricao do pedido, itens e observacoes
// do orcamento, chat) para a lingua de quem le - como Airbnb/Booking: cada um
// escreve na sua lingua e ve "traduzido do ... / ver original" (dono 03/11:
// pedido em estoniano, oficina russa). DeepL e cache em lib/deepl.ts.

const MAX_TEXTOS = 50;
const MAX_CHARS = 3000;

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const corpo = await request.json().catch(() => null);
  const lingua = String(corpo?.lingua || '');
  const textos: string[] = Array.isArray(corpo?.textos) ? corpo.textos.slice(0, MAX_TEXTOS).map((t: unknown) => String(t ?? '').slice(0, MAX_CHARS)) : [];
  if (!ALVO_DEEPL[lingua] || !textos.length) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  // limite por pessoa: o que ja esta guardado nao gasta DeepL, mas a rota fica protegida
  if (!dentroDoLimite(`traduzir:${userId}`, 120, 60 * 60 * 1000)) {
    return NextResponse.json({ traducoes: textos.map((): Traducao => ({ texto: null, origem: null })) });
  }
  return NextResponse.json({ traducoes: await traduzirTextos(textos, lingua) });
}
