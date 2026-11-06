import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { limitarPorIp } from '@/lib/rate-limit';
import { ehUuid } from '@/lib/validacao';
import {
  CODIGO_TENTATIVAS, PENDENTE_HORAS, codigoConfere, criarPedido, apagarPendente, contarEtapa, type DadosPedido,
} from '@/lib/pedido-sem-conta';

export const dynamic = 'force-dynamic';

// Codigo certo: ativa a conta (nova) ou confirma o e-mail (conta existente) e
// so entao o pedido vira solicitacao e vai para as oficinas.
export async function POST(req: NextRequest) {
  if (!limitarPorIp(req, 'pedido-sem-conta-confirmar', 40, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  const id = b?.id;
  const codigo = typeof b?.codigo === 'string' ? b.codigo.replace(/\D/g, '') : '';
  if (!ehUuid(id)) return NextResponse.json({ error: 'Pedido inválido', codigo: 'CODIGO_EXPIRADO' }, { status: 410 });

  const { data: p } = await supabaseAdmin.from('pedidos_pendentes').select('*').eq('id', id).maybeSingle();
  if (!p) return NextResponse.json({ error: 'Pedido não encontrado', codigo: 'CODIGO_EXPIRADO' }, { status: 410 });
  if (Date.now() - new Date(p.created_at).getTime() > PENDENTE_HORAS * 3600 * 1000) {
    await apagarPendente(p);
    return NextResponse.json({ error: 'Expirado', codigo: 'CODIGO_EXPIRADO' }, { status: 410 });
  }
  if (p.tentativas >= CODIGO_TENTATIVAS) {
    return NextResponse.json({ error: 'Tentativas esgotadas', codigo: 'CODIGO_TENTATIVAS' }, { status: 429 });
  }
  if (!codigoConfere(id, codigo, p.codigo_hash)) {
    await supabaseAdmin.from('pedidos_pendentes').update({ tentativas: p.tentativas + 1 }).eq('id', id);
    const restantes = CODIGO_TENTATIVAS - p.tentativas - 1;
    return NextResponse.json({ error: 'Código errado', codigo: restantes > 0 ? 'CODIGO_INVALIDO' : 'CODIGO_TENTATIVAS', restantes }, { status: 400 });
  }

  // reserva: so uma confirmacao cria o pedido (dois toques ao mesmo tempo)
  const { data: reservado } = await supabaseAdmin.from('pedidos_pendentes').delete().eq('id', id).select('id');
  if (!reservado?.length) return NextResponse.json({ error: 'Já confirmado', codigo: 'CODIGO_EXPIRADO' }, { status: 410 });

  try {
    if (p.conta_nova) {
      await supabaseAdmin.auth.admin.updateUserById(p.user_id, { email_confirm: true });
      const { error } = await supabaseAdmin.from('profiles').insert({
        id: p.user_id, tipo: 'cliente', nome: p.nome, email: p.email, telefone: p.telefone, idioma: p.idioma,
        termos_aceitos_em: p.termos_aceitos_em, termos_versao: p.termos_versao,
      });
      if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
    } else {
      // o codigo prova o e-mail: quem tinha cadastro sem confirmar passa a entrar
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.user_id);
      if (u?.user && !u.user.email_confirmed_at) await supabaseAdmin.auth.admin.updateUserById(p.user_id, { email_confirm: true });
      if (p.telefone) await supabaseAdmin.from('profiles').update({ telefone: p.telefone }).eq('id', p.user_id).is('telefone', null);
      const { data: avaliar } = await supabaseAdmin.rpc('tem_avaliacao_pendente', { p_cliente: p.user_id });
      if (avaliar === true) {
        if (p.fotos?.length) await supabaseAdmin.storage.from('damage-photos').remove(p.fotos);
        return NextResponse.json({ error: 'Avaliação pendente', codigo: 'AVALIACAO_PENDENTE' }, { status: 409 });
      }
    }
    const r = await criarPedido(p.user_id, p.dados as DadosPedido, p.fotos || []);
    await contarEtapa(`pedido_${p.origem}`, 'confirmado');
    return NextResponse.json({ solicitacaoId: r.id, numero: r.numero, contaNova: p.conta_nova, email: p.email });
  } catch (e) {
    // devolve o pendente para a pessoa poder tentar de novo
    await supabaseAdmin.from('pedidos_pendentes').insert(p).then(() => {}, () => {});
    console.error('[pedido-sem-conta/confirmar]', e);
    return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  }
}
