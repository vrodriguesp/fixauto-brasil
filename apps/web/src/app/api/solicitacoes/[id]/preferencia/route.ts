import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehUuid } from '@/lib/validacao';
import { dentroDoLimite } from '@/lib/rate-limit';
import { validarPreferencia } from '@/lib/preferencia-horario';

export const dynamic = 'force-dynamic';

// 114 (dono 21/11): "Quando voce pode levar o carro?" - preferencia OPCIONAL do motorista, gravada DEPOIS
// do pedido ja existir (nunca trava o envio). PATCH { dias?: [1..6], partes?: ['manha'|'tarde'], opcao?: 'qualquer'|'urgente' }
// grava; PATCH { limpar: true } (ou DELETE) apaga. So o cliente do pedido; pedido aberto ou em orcamento.
// Serve tambem o app (Authorization: Bearer).
async function gravar(req: NextRequest, id: string, corpo: any, limpar: boolean) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!ehUuid(id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (!dentroDoLimite(`preferencia:${userId}`, 30, 3600e3)) return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  const { data: sol } = await supabaseAdmin.from('solicitacoes').select('id, status, cliente_id').eq('id', id).maybeSingle();
  if (!sol) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (sol.cliente_id !== userId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  if (!['aberta', 'em_orcamento', 'no_show'].includes(sol.status)) return NextResponse.json({ error: 'Pedido fechado', codigo: 'PEDIDO_FECHADO' }, { status: 409 });
  const pref = limpar ? null : validarPreferencia(corpo);
  if (!limpar && !pref) return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  const { error } = await supabaseAdmin.from('solicitacoes').update({ preferencia_horario: pref, preferencia_em: pref ? new Date().toISOString() : null }).eq('id', sol.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, preferencia: pref });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const corpo = await req.json().catch(() => ({}));
    return await gravar(req, params.id, corpo, corpo?.limpar === true);
  } catch (err) {
    console.error('[preferencia]', (err as Error).message);
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}
export const POST = PATCH;
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    return await gravar(req, params.id, null, true);
  } catch (err) {
    console.error('[preferencia]', (err as Error).message);
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}
