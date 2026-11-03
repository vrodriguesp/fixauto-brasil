import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendSuporteRespostaEmail } from '@/lib/notifications';
import { ATIVO_MS, AVISO_MS, configSuporte, recente, traduzirSeLigado } from '@/lib/suporte';

// Uma conversa do chat de suporte, lado do admin: ler (marca como lida) e
// responder. A resposta vai traduzida para a lingua da pessoa quando a
// traducao esta ligada; quem nao esta com o chat aberto recebe por e-mail.

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  await supabaseAdmin.from('suporte_conversas').update({ nao_lidas_admin: 0 }).eq('id', params.id);
  const { data } = await supabaseAdmin.from('suporte_mensagens').select('id, autor, texto, traducao, origem, created_at')
    .eq('conversa_id', params.id).order('created_at', { ascending: true }).limit(500);
  return NextResponse.json({ mensagens: data || [] });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const corpo = await req.json().catch(() => ({}));
  const texto = String(corpo.texto || '').trim();
  if (!texto || texto.length > 2000) return NextResponse.json({ error: 'Texto inválido' }, { status: 400 });

  const { data: c } = await supabaseAdmin.from('suporte_conversas')
    .select('id, idioma, nao_lidas_usuario, usuario_visto_em, usuario_avisado_em, visitante_nome, visitante_email, profile:profiles(nome, email)')
    .eq('id', params.id).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

  const cfg = await configSuporte();
  const { traducao, origem } = await traduzirSeLigado(texto, c.idioma, cfg.traducao, c.id);
  // traducao ligada, pessoa em outra lingua e nada voltou: avisa o admin (chave/cota do DeepL)
  const semTraducao = cfg.traducao && !traducao && !origem && !c.idioma.startsWith('pt');
  const { error } = await supabaseAdmin.from('suporte_mensagens').insert({ conversa_id: c.id, autor: 'admin', texto, traducao, origem });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const agora = new Date().toISOString();
  const mudancas: Record<string, unknown> = { ultima_mensagem_em: agora, nao_lidas_usuario: c.nao_lidas_usuario + 1, nao_lidas_admin: 0 };
  // a pessoa nao esta com o chat aberto: manda a resposta por e-mail tambem
  const perfil = (c as any).profile as { nome?: string; email?: string } | null;
  const email = perfil?.email || c.visitante_email;
  let porEmail = false;
  if (email && !recente(c.usuario_visto_em, ATIVO_MS) && !recente(c.usuario_avisado_em, AVISO_MS)) {
    const r = await sendSuporteRespostaEmail({ toEmail: email, toName: perfil?.nome || c.visitante_nome || '', texto: traducao || texto, locale: c.idioma, visitante: !perfil?.email });
    porEmail = r.success;
    if (porEmail) mudancas.usuario_avisado_em = agora;
  }
  await supabaseAdmin.from('suporte_conversas').update(mudancas).eq('id', c.id);
  return NextResponse.json({ ok: true, traducao, porEmail, semTraducao });
}
