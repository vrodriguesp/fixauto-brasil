import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { limitarPorIp, dentroDoLimite } from '@/lib/rate-limit';
import { ehUuid, email as validarEmail, ErroValidacao } from '@/lib/validacao';
import { CODIGO_ENVIOS, novoCodigo, hashCodigo, enviarCodigo, contaParaEmail } from '@/lib/pedido-sem-conta';

export const dynamic = 'force-dynamic';

// Novo codigo (nao chegou) e, opcionalmente, correcao do e-mail digitado errado;
// o pedido continua o mesmo. O e-mail corrigido ganha a conta dele (existente ou
// nova sem senha, como no envio) - vale para qualquer pedido pendente, para a
// resposta nao revelar se o e-mail anterior tinha conta.
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
    let userId: string = p.user_id;
    let contaNova: boolean = p.conta_nova;
    const novoEmail = b.email != null ? validarEmail(b.email, true)! : null;
    // no maximo 5 e-mails de codigo por hora para o mesmo endereco (somando o envio do pedido)
    if (!dentroDoLimite(`pedido-sem-conta:${(novoEmail || email).toLowerCase()}`, 5, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
    }
    if (novoEmail && novoEmail.toLowerCase() !== p.email.toLowerCase()) {
      const conta = await contaParaEmail(novoEmail, p.idioma);
      if ('erro' in conta) {
        return conta.erro === 'SEM_ACESSO'
          ? NextResponse.json({ error: 'Sem acesso', codigo: 'SEM_ACESSO' }, { status: 403 })
          : NextResponse.json({ error: 'Avaliação pendente', codigo: 'AVALIACAO_PENDENTE' }, { status: 409 });
      }
      email = novoEmail; userId = conta.userId; contaNova = conta.contaNova;
    }
    // a conta do e-mail errado, se foi criada so para este pedido, sai junto - mas so DEPOIS
    // de o pendente passar para a conta certa: pedidos_pendentes.user_id e ON DELETE CASCADE
    // e apagar antes levava o pedido junto (e2e 12/11)
    const contaErrada = p.conta_nova && userId !== p.user_id ? p.user_id : null;

    const codigo = novoCodigo();
    await supabaseAdmin.from('pedidos_pendentes').update({
      email, user_id: userId, conta_nova: contaNova, codigo_hash: hashCodigo(p.id, codigo), envios: p.envios + 1, ultimo_envio_em: new Date().toISOString(),
      // e-mail corrigido: o link do lembrete que foi para o endereco errado deixa de
      // valer e o lembrete pode ir de novo, agora para o endereco certo
      ...(email !== p.email ? { retomar_hash: null, lembrete_enviado_em: null } : {}),
    }).eq('id', p.id);
    if (contaErrada) {
      const { data: perfil } = await supabaseAdmin.from('profiles').select('id').eq('id', contaErrada).maybeSingle();
      if (!perfil) await supabaseAdmin.auth.admin.deleteUser(contaErrada).catch(() => {});
    }
    const enviado = await enviarCodigo(email, p.nome, codigo, p.idioma);
    if (!enviado) throw new Error('e-mail do codigo nao enviado');
    return NextResponse.json({ ok: true, email });
  } catch (e) {
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 400 });
    console.error('[pedido-sem-conta/reenviar]', e);
    return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  }
}
