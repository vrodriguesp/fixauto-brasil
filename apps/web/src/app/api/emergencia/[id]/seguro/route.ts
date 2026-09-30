import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { acessoEmergencia } from '@/lib/emergencia-acesso';
import { limitarPorIp } from '@/lib/rate-limit';
import { ErroValidacao, ehUuid } from '@/lib/validacao';
import { validarSeguro } from '@/lib/seguro-reparo';

export const dynamic = 'force-dynamic';

// Quem registrou o acidente atualiza quem paga o reparo e os dados do seguro
// (ex.: o numero do sinistro chega dias depois). So o dono do acidente.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!ehUuid(params.id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    if (!limitarPorIp(req, 'emergencia-seguro', 20, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
    }
    const acesso = await acessoEmergencia(req, params.id);
    if (!acesso || acesso.papel !== 'proprietario') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    if (!acesso.emergencia.solicitacao_id) return NextResponse.json({ error: 'Acidente sem pedido' }, { status: 409 });

    const seguro = validarSeguro(await req.json());
    const { error } = await supabaseAdmin
      .from('solicitacoes')
      .update({ ...seguro, seguro_atualizado_em: new Date().toISOString() })
      .eq('id', acesso.emergencia.solicitacao_id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, ...seguro });
  } catch (e) {
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 400 });
    console.error('[emergencia/seguro]', e);
    return NextResponse.json({ error: 'Erro ao salvar', codigo: 'GENERICO' }, { status: 500 });
  }
}
