import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { limitarPorIp } from '@/lib/rate-limit';
import { ehUuid, email as validarEmail, ErroValidacao } from '@/lib/validacao';
import { CODIGO_ENVIOS, novoCodigo, hashCodigo, enviarCodigo } from '@/lib/pedido-sem-conta';

export const dynamic = 'force-dynamic';

// Novo codigo (nao chegou) e, opcionalmente, correcao do e-mail digitado
// errado - so para conta nova ainda nao ativada; o pedido continua o mesmo.
export async function POST(req: NextRequest) {
  if (!limitarPorIp(req, 'pedido-sem-conta-reenviar', 15, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  }
  try {
    const b = await req.json().catch(() => ({}));
    if (!ehUuid(b?.id)) return NextResponse.json({ error: 'Pedido inválido', codigo: 'CODIGO_EXPIRADO' }, { status: 410 });
    const { data: p } = await supabaseAdmin.from('pedidos_pendentes').select('*').eq('id', b.id).maybeSingle();
    if (!p) return NextResponse.json({ error: 'Pedido não encontrado', codigo: 'CODIGO_EXPIRADO' }, { status: 410 });
    if (p.envios >= CODIGO_ENVIOS || Date.now() - new Date(p.ultimo_envio_em).getTime() < 30 * 1000) {
      return NextResponse.json({ error: 'Aguarde', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
    }

    let email: string = p.email;
    const novoEmail = b.email != null ? validarEmail(b.email, true)! : null;
    if (novoEmail && novoEmail.toLowerCase() !== p.email.toLowerCase()) {
      if (!p.conta_nova) throw new ErroValidacao('conta existente', 'DADOS_INVALIDOS');
      const { data: outra } = await supabaseAdmin.from('profiles').select('id').ilike('email', novoEmail.replace(/[%_\\]/g, '\\$&')).maybeSingle();
      if (outra) return NextResponse.json({ error: 'E-mail de outra conta', codigo: 'EMAIL_EM_USO' }, { status: 409 });
      const { error } = await supabaseAdmin.auth.admin.updateUserById(p.user_id, { email: novoEmail, email_confirm: false });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) return NextResponse.json({ error: 'E-mail de outra conta', codigo: 'EMAIL_EM_USO' }, { status: 409 });
        throw new Error(error.message);
      }
      email = novoEmail;
    }

    const codigo = novoCodigo();
    await supabaseAdmin.from('pedidos_pendentes').update({
      email, codigo_hash: hashCodigo(p.id, codigo), tentativas: 0, envios: p.envios + 1, ultimo_envio_em: new Date().toISOString(),
    }).eq('id', p.id);
    const enviado = await enviarCodigo(email, p.nome, codigo, p.idioma);
    if (!enviado) throw new Error('e-mail do codigo nao enviado');
    return NextResponse.json({ ok: true, email });
  } catch (e) {
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 400 });
    console.error('[pedido-sem-conta/reenviar]', e);
    return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  }
}
