import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehUuid, texto } from '@/lib/validacao';
import { removerFoto } from '@/lib/fotos-pedido';
import { notifFotoRemovida } from '@/lib/notif-i18n';
import { emTodasAsLinguas } from '@/lib/notif-textos';

export const dynamic = 'force-dynamic';

// Admin apaga uma foto do pedido (conteudo denunciado; DSA art. 16/17, termos ponto 10): motivo
// obrigatorio, auditoria em admin_auditoria e aviso curto ao motorista com o motivo (painel + push).
// DELETE { fotoId, motivo }
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  if (!ehUuid(params.id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const fotoId = typeof body.fotoId === 'string' ? body.fotoId : '';
  const motivo = (typeof body.motivo === 'string' ? body.motivo : '').trim();
  if (!ehUuid(fotoId)) return NextResponse.json({ error: 'Foto inválida' }, { status: 400 });
  if (!motivo) return NextResponse.json({ error: 'Escreva o motivo', codigo: 'MOTIVO_OBRIGATORIO' }, { status: 400 });
  if (motivo.length > 300) return NextResponse.json({ error: 'Motivo muito longo' }, { status: 400 });

  const { data: foto } = await supabaseAdmin.from('solicitacao_fotos').select('id, foto_url, origem, created_at').eq('id', fotoId).eq('solicitacao_id', params.id).maybeSingle();
  if (!foto) return NextResponse.json({ error: 'Foto não encontrada' }, { status: 404 });
  const { data: sol } = await supabaseAdmin.from('solicitacoes').select('id, numero, cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(idioma)').eq('id', params.id).maybeSingle();
  if (!sol) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  try {
    await removerFoto(foto);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  await registrarAuditoria(supabaseAdmin, {
    adminId: auth.userId, entidade: 'solicitacao_fotos', entidadeId: foto.id, acao: 'apagar_foto',
    antes: { foto_url: foto.foto_url, origem: foto.origem, created_at: foto.created_at }, depois: null, motivo, solicitacaoId: params.id,
  });
  const numero = String((sol as any).numero ?? '');
  const idioma = ((sol as any).cliente?.idioma as string | null) ?? null;
  const n = notifFotoRemovida(idioma, numero, motivo);
  const { error } = await supabaseAdmin.from('notificacoes').insert({
    profile_id: (sol as any).cliente_id, tipo: 'foto_removida', titulo: n.titulo, mensagem: n.mensagem,
    dados: { solicitacao_id: params.id, foto_id: foto.id, motivo, textos: emTodasAsLinguas((l) => notifFotoRemovida(l, numero, motivo)) },
  });
  if (error) console.error('[admin fotos] aviso', error.message);
  return NextResponse.json({ ok: true, avisado: !error, motivo: texto(motivo, 'motivo', 300) });
}
