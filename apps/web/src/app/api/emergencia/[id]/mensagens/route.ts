import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { acessoEmergencia } from '@/lib/emergencia-acesso';
import { limitarPorIp } from '@/lib/rate-limit';
import { ErroValidacao, ehUuid, texto } from '@/lib/validacao';

export const dynamic = 'force-dynamic';

// Mensagem no chat do acidente (entre quem registrou e o outro motorista).
// Quem envia e o papel vem do acesso verificado, nunca do corpo.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!ehUuid(params.id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    if (!limitarPorIp(req, 'emergencia-msg', 60, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas mensagens' }, { status: 429 });
    }
    const acesso = await acessoEmergencia(req, params.id);
    if (!acesso || (acesso.papel !== 'proprietario' && acesso.papel !== 'outro')) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const msg = texto(body.texto, 'texto', 2000, true)!;
    const { data, error } = await supabaseAdmin
      .from('emergencia_mensagens')
      .insert({ emergencia_id: params.id, remetente_tipo: acesso.papel, remetente_id: acesso.userId, texto: msg })
      .select('id, remetente_tipo, texto, created_at')
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('[emergencia/mensagens]', e);
    return NextResponse.json({ error: 'Erro ao enviar' }, { status: 500 });
  }
}
