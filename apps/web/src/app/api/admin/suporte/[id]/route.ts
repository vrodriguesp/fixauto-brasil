import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendSuporteRespostaEmail } from '@/lib/notifications';
import { ATIVO_MS, AVISO_MS, IDIOMA_ADMIN, configSuporte, recente, traduzirSeLigado } from '@/lib/suporte';

// Uma conversa do chat de suporte, lado do admin: ler (marca como lida),
// responder e traduzir uma mensagem recebida. Modo da traducao (dono 03/11):
// automatico = tudo traduzido; manual = o admin toca "Traduzir" na mensagem
// recebida e marca, a cada resposta, se ela vai traduzida. Quem nao esta com o
// chat aberto recebe a resposta por e-mail.

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

  // modo manual: traduzir para o portugues uma mensagem recebida (fica guardada nela)
  if (corpo.acao === 'traduzir') {
    const { data: m } = await supabaseAdmin.from('suporte_mensagens').select('id, texto, traducao, origem, autor')
      .eq('id', String(corpo.mensagemId || '')).eq('conversa_id', params.id).maybeSingle();
    if (!m || m.autor !== 'usuario') return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
    if (m.traducao || m.origem) return NextResponse.json({ traducao: m.traducao, origem: m.origem });
    const t = await traduzirSeLigado(m.texto, IDIOMA_ADMIN, true, params.id);
    if (!t.traducao && !t.origem) return NextResponse.json({ error: 'Tradução indisponível', codigo: 'SEM_TRADUCAO' }, { status: 503 });
    // so grava se ninguem traduziu no meio tempo (dois cliques / duas abas)
    const { error: eUp } = await supabaseAdmin.from('suporte_mensagens').update({ traducao: t.traducao, origem: t.origem }).eq('id', m.id).is('origem', null);
    if (eUp) return NextResponse.json({ error: eUp.message }, { status: 500 });
    return NextResponse.json(t);
  }

  const texto = String(corpo.texto || '').trim();
  if (!texto || texto.length > 2000) return NextResponse.json({ error: 'Texto inválido' }, { status: 400 });

  const { data: c } = await supabaseAdmin.from('suporte_conversas')
    .select('id, idioma, nao_lidas_usuario, usuario_visto_em, usuario_avisado_em, visitante_nome, visitante_email, profile:profiles(nome, email)')
    .eq('id', params.id).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

  const cfg = await configSuporte();
  // automatico: sempre; manual: so quando o admin marcou "traduzir esta resposta"
  const traduzir = cfg.traducao || corpo.traduzir === true;
  const { traducao, origem } = await traduzirSeLigado(texto, c.idioma, traduzir, c.id);
  // era para traduzir, pessoa em outra lingua e nada voltou: avisa o admin (chave/cota do DeepL)
  const semTraducao = traduzir && !traducao && !origem && !c.idioma.startsWith('pt');
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
