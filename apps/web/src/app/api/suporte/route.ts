import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite, limitarPorIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendSuporteAdminEmail } from '@/lib/notifications';
import { SUPORTE_AUTO, linguaTexto } from '@/lib/suporte-textos';
import {
  AVISO_MS, IDIOMA_ADMIN, configSuporte, conversaDe, hashToken, linguaValida, novoToken, podeMandarAuto, recente, traduzirSeLigado,
} from '@/lib/suporte';

// Chat de suporte, lado de quem pede ajuda (dono 03/11). Logado: a conversa e
// a da conta. Visitante: nome + e-mail para comecar; depois a conversa e lida
// com o id + a chave secreta que fica no navegador (c, t).

const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;

function paraTela(m: { id: string; autor: string; texto: string; traducao: string | null; created_at: string }) {
  // resposta do admin traduzida: mostra a traducao e guarda o original
  const traduzida = m.autor === 'admin' && !!m.traducao;
  return { id: m.id, autor: m.autor, texto: traduzida ? m.traducao : m.texto, original: traduzida ? m.texto : null, created_at: m.created_at };
}

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId(req);
  const p = req.nextUrl.searchParams;
  const { adminOnline } = await configSuporte();
  const conversa = await conversaDe(userId, p.get('c'), p.get('t'));
  if (!conversa) return NextResponse.json({ conversa: null, mensagens: [], adminOnline, naoLidas: 0 });
  // chat aberto na tela: conta como lido e "pessoa ativa" (nao precisa de e-mail com a resposta)
  if (p.get('aberto') === '1') {
    await supabaseAdmin.from('suporte_conversas').update({ usuario_visto_em: new Date().toISOString(), nao_lidas_usuario: 0 }).eq('id', conversa.id);
  }
  const { data } = await supabaseAdmin.from('suporte_mensagens').select('id, autor, texto, traducao, created_at')
    .eq('conversa_id', conversa.id).order('created_at', { ascending: true }).limit(200);
  return NextResponse.json({
    conversa: { id: conversa.id }, adminOnline,
    naoLidas: p.get('aberto') === '1' ? 0 : conversa.nao_lidas_usuario,
    mensagens: (data || []).map(paraTela),
  });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  const corpo = await req.json().catch(() => ({}));
  const idioma = linguaValida(corpo.idioma);
  const pagina = typeof corpo.pagina === 'string' ? corpo.pagina.slice(0, 200) : null;

  // ---------- comecar (visitante sem conta)
  if (corpo.acao === 'iniciar') {
    if (userId) return NextResponse.json({ ok: true });
    if (corpo.site) return NextResponse.json({ ok: true }); // campo isca: robo
    if (!limitarPorIp(req, 'suporte-iniciar', 5, 60 * 60 * 1000)) return NextResponse.json({ error: 'Muitas requisições', codigo: 'LIMITE' }, { status: 429 });
    const nome = String(corpo.nome || '').trim().slice(0, 100);
    const email = String(corpo.email || '').trim().toLowerCase();
    if (!nome || !emailValido(email)) return NextResponse.json({ error: 'Dados inválidos', codigo: 'CAMPOS' }, { status: 400 });
    if (corpo.consentimento !== true) return NextResponse.json({ error: 'Consentimento', codigo: 'CONSENTIMENTO' }, { status: 400 });
    const token = novoToken();
    const { data, error } = await supabaseAdmin.from('suporte_conversas')
      .insert({ visitante_nome: nome, visitante_email: email, token_hash: hashToken(token), idioma, pagina }).select('id').single();
    if (error) { console.error('[suporte] iniciar', error.message); return NextResponse.json({ error: 'Erro', codigo: 'GENERICO' }, { status: 500 }); }
    return NextResponse.json({ conversaId: data.id, token });
  }

  // ---------- enviar
  if (corpo.acao !== 'enviar') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  const texto = String(corpo.texto || '').trim();
  if (!texto || texto.length > 2000) return NextResponse.json({ error: 'Texto inválido', codigo: 'TEXTO' }, { status: 400 });

  let conversa = await conversaDe(userId, corpo.c, corpo.t);
  let nome = conversa?.visitante_nome || '';
  let contato = conversa?.visitante_email || '';
  if (userId) {
    const { data: perfil } = await supabaseAdmin.from('profiles').select('nome, email, tipo').eq('id', userId).maybeSingle();
    if (perfil?.tipo === 'admin') return NextResponse.json({ error: 'Admin responde pelo painel' }, { status: 400 });
    nome = perfil?.nome || ''; contato = `${perfil?.email || ''} (${perfil?.tipo || 'conta'})`;
    if (!conversa) {
      const { data, error } = await supabaseAdmin.from('suporte_conversas').insert({ profile_id: userId, idioma, pagina }).select('id').single();
      if (error) { console.error('[suporte] criar', error.message); return NextResponse.json({ error: 'Erro', codigo: 'GENERICO' }, { status: 500 }); }
      conversa = await conversaDe(userId);
    }
  }
  if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada', codigo: 'SEM_CONVERSA' }, { status: 404 });
  if (!dentroDoLimite(`suporte-enviar:${conversa.id}`, 30, 10 * 60 * 1000)) return NextResponse.json({ error: 'Muitas mensagens', codigo: 'LIMITE' }, { status: 429 });

  const cfg = await configSuporte();
  const { traducao, origem } = await traduzirSeLigado(texto, IDIOMA_ADMIN, cfg.traducao);
  const agora = new Date().toISOString();
  const { error } = await supabaseAdmin.from('suporte_mensagens').insert({ conversa_id: conversa.id, autor: 'usuario', texto, traducao, origem });
  if (error) { console.error('[suporte] enviar', error.message); return NextResponse.json({ error: 'Erro', codigo: 'GENERICO' }, { status: 500 }); }

  const mudancas: Record<string, unknown> = { ultima_mensagem_em: agora, nao_lidas_admin: conversa.nao_lidas_admin + 1, idioma, usuario_visto_em: agora };
  if (pagina) mudancas.pagina = pagina;
  if (!cfg.adminOnline) {
    // com o admin offline: resposta automatica (na lingua da pessoa) e e-mail ao admin
    if (await podeMandarAuto(conversa.id)) {
      await supabaseAdmin.from('suporte_mensagens').insert({ conversa_id: conversa.id, autor: 'auto', texto: SUPORTE_AUTO[linguaTexto(idioma)] });
    }
    if (!recente(conversa.admin_avisado_em, AVISO_MS)) {
      mudancas.admin_avisado_em = agora;
      await sendSuporteAdminEmail({ nome: nome || '?', contato: contato || '-', texto, traducao, locale: idioma, pagina });
    }
  }
  await supabaseAdmin.from('suporte_conversas').update(mudancas).eq('id', conversa.id);
  return NextResponse.json({ ok: true });
}
