import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { oficinasDoUsuario } from '@/lib/acesso-servico';
import { dentroDoLimite } from '@/lib/rate-limit';
import { notifNovaMensagem } from '@/lib/notif-i18n';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Aviso de "nova mensagem" para o outro lado da conversa (usado pelo app; o
// site grava o aviso direto). So quem enviou a mensagem pode pedir o aviso
// dela, e o destinatario sai da propria conversa - nunca do corpo:
// oficina -> cliente (ou quem paga o reparo); cliente/quem paga -> oficina.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!dentroDoLimite(`avisar-mensagem:${userId}`, 120, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
  }
  const { mensagemId } = await req.json().catch(() => ({}));
  if (typeof mensagemId !== 'string') return NextResponse.json({ error: 'mensagemId obrigatório' }, { status: 400 });

  const { data: msg } = await supabaseAdmin
    .from('mensagens')
    .select('solicitacao_id, oficina_id, pagador_id, remetente_id, tipo, texto')
    .eq('id', mensagemId)
    .maybeSingle();
  if (!msg || msg.remetente_id !== userId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const [{ data: sol }, { data: oficina }] = await Promise.all([
    supabaseAdmin.from('solicitacoes').select('cliente_id').eq('id', msg.solicitacao_id).maybeSingle(),
    supabaseAdmin.from('oficinas').select('profile_id').eq('id', msg.oficina_id).maybeSingle(),
  ]);
  const daOficina = (await oficinasDoUsuario(userId)).includes(msg.oficina_id);
  const destino = daOficina ? msg.pagador_id || sol?.cliente_id : oficina?.profile_id;
  if (!destino || destino === userId) return NextResponse.json({ ok: true });

  const { data: perfil } = await supabaseAdmin.from('profiles').select('idioma').eq('id', destino).maybeSingle();
  const n = notifNovaMensagem(perfil?.idioma);
  const audio = msg.tipo === 'audio';
  await supabaseAdmin.from('notificacoes').insert({
    profile_id: destino,
    tipo: 'nova_mensagem',
    titulo: audio ? n.tituloAudio : n.titulo,
    mensagem: audio ? n.mensagemAudio : String(msg.texto || '').slice(0, 100),
    dados: { solicitacao_id: msg.solicitacao_id, oficina_id: msg.oficina_id, ...(msg.pagador_id ? { pagador_id: msg.pagador_id } : {}) },
  });
  return NextResponse.json({ ok: true });
}
