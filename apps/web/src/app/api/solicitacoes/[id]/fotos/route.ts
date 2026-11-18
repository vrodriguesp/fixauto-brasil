import { NextRequest, NextResponse } from 'next/server';
import { FOTOS_POR_PEDIDO } from '@fixauto/shared';
import { getSessionUserId } from '@/lib/api-auth';
import { ErroValidacao, ehUuid, validarImagens } from '@/lib/validacao';
import { dentroDoLimite } from '@/lib/rate-limit';
import { adicionarFotos, apagarFotoAdicionada, avisarOficinasFotos, carregarPedidoDoDono, FOTOS_POR_HORA } from '@/lib/fotos-pedido';

export const dynamic = 'force-dynamic';

// Fotos do pedido depois do envio (lote A, 18/11; regras em lib/fotos-pedido.ts).
// POST  multipart { fotos: File[] }  -> { fotos: [...], total, avisos }
// DELETE ?foto=<id>                   -> { ok: true }   (so foto que o motorista adicionou)
// Site (cookie) e app (Authorization: Bearer) usam a mesma rota.
const STATUS_DO_ERRO: Record<string, number> = { NAO_ENCONTRADO: 404, SEM_ACESSO: 403, FOTO_STATUS: 409, FOTO_NAO_APAGAVEL: 409 };
const responderErro = (e: unknown) => {
  if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: STATUS_DO_ERRO[e.codigo] || 400 });
  console.error('[fotos-pedido]', e);
  return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!ehUuid(params.id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  try {
    const sol = await carregarPedidoDoDono(params.id, userId);
    const form = await req.formData();
    // ate o teto do pedido por chamada; o teto de verdade (fotos ja existentes) e conferido em adicionarFotos
    const arquivos = validarImagens(form.getAll('fotos').filter((f): f is File => f instanceof File), FOTOS_POR_PEDIDO, 'FOTOS_PEDIDO_MAX', { tipoPelosBytes: true });
    if (!arquivos.length) throw new ErroValidacao('nenhuma foto', 'CAMPO_OBRIGATORIO');
    // 20 fotos/h por pessoa (abuso de volume; auditoria Fable sec. 4) - contado so com um lote valido
    if (!dentroDoLimite(`fotos-pedido:${userId}`, FOTOS_POR_HORA, 3600e3)) return NextResponse.json({ error: 'Muitas tentativas', codigo: 'RATE_LIMIT' }, { status: 429 });
    const r = await adicionarFotos(sol, arquivos);
    const avisos = await avisarOficinasFotos(sol, r.fotos.length).catch((e) => { console.error('[fotos-pedido] avisar', e); return { inseridos: 0, atualizados: 0 }; });
    return NextResponse.json({ fotos: r.fotos, total: r.total, avisos });
  } catch (e) {
    return responderErro(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const fotoId = req.nextUrl.searchParams.get('foto') || '';
  if (!ehUuid(params.id) || !ehUuid(fotoId)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  try {
    const sol = await carregarPedidoDoDono(params.id, userId);
    await apagarFotoAdicionada(sol, fotoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderErro(e);
  }
}
