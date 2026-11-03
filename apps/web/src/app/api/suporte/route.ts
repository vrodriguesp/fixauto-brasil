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
// com o id + a chave secreta que fica no navegador - no GET vao nos cabecalhos
// (x-suporte-conversa / x-suporte-chave), nunca no endereco: o endereco fica
// gravado no log do servidor.

const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const erroInterno = () => NextResponse.json({ error: 'Erro', codigo: 'GENERICO' }, { status: 500 });

function paraTela(m: { id: string; autor: string; texto: string; traducao: string | null; created_at: string }) {
  // resposta do admin traduzida: mostra a traducao e guarda o original
  const traduzida = m.autor === 'admin' && !!m.traducao;
  return { id: m.id, autor: m.autor, texto: traduzida ? m.traducao : m.texto, original: traduzida ? m.texto : null, created_at: m.created_at };
}

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId(req);
  const c = req.headers.get('x-suporte-conversa');
  const t = req.headers.get('x-suporte-chave');
  const aberto = req.nextUrl.searchParams.get('aberto') === '1';
  const { adminOnline } = await configSuporte();
  const { conversa, erro } = await conversaDe(userId, c, t);
  if (erro) return erroInterno();
  if (!conversa) {
    // visitante com chave que nao vale mais (conversa apagada): o navegador esquece a chave
    if (!userId && c && t) return NextResponse.json({ error: 'Conversa não encontrada', codigo: 'SEM_CONVERSA' }, { status: 404 });
    return NextResponse.json({ conversa: null, mensagens: [], adminOnline, naoLidas: 0 });
  }
  // chat aberto na tela: conta como lido e "pessoa ativa" (nao precisa de e-mail com a resposta)
  if (aberto) {
    await supabaseAdmin.from('suporte_conversas').update({ usuario_visto_em: new Date().toISOString(), nao_lidas_usuario: 0 }).eq('id', conversa.id);
  }
  const { data, error } = await supabaseAdmin.from('suporte_mensagens').select('id, autor, texto, traducao, created_at')
    .eq('conversa_id', conversa.id).order('created_at', { ascending: true }).limit(200);
  if (error) return erroInterno();
  return NextResponse.json({
    conversa: { id: conversa.id }, adminOnline,
    naoLidas: aberto ? 0 : conversa.nao_lidas_usuario,
    mensagens: (data || []).map(paraTela),
  });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  const corpo = await req.json().catch(() => ({}));
  const idioma = linguaValida(corpo.idioma);
  // pagina onde a pessoa estava: so para quem tem conta (de visitante nao guardamos)
  const pagina = userId && typeof corpo.pagina === 'string' ? corpo.pagina.slice(0, 200) : null;

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
      .insert({ visitante_nome: nome, visitante_email: email, token_hash: hashToken(token), idioma }).select('id').single();
    if (error) { console.error('[suporte] iniciar', error.message); return erroInterno(); }
    return NextResponse.json({ conversaId: data.id, token });
  }

  // ---------- enviar
  if (corpo.acao !== 'enviar') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  const texto = String(corpo.texto || '').trim();
  if (!texto || texto.length > 2000) return NextResponse.json({ error: 'Texto inválido', codigo: 'TEXTO' }, { status: 400 });
  // limite por IP alem do limite por conversa: varias conversas do mesmo lugar
  // nao passam de 20 mensagens em 10 min (cota do DeepL e e-mails ao admin)
  if (!limitarPorIp(req, 'suporte-enviar', 20, 10 * 60 * 1000)) return NextResponse.json({ error: 'Muitas mensagens', codigo: 'LIMITE' }, { status: 429 });

  let { conversa, erro } = await conversaDe(userId, corpo.c, corpo.t);
  if (erro) return erroInterno();
  let nome = conversa?.visitante_nome || '';
  let contato = conversa?.visitante_email ? `${conversa.visitante_email} (visitante, e-mail não verificado)` : '';
  if (userId) {
    const { data: perfil } = await supabaseAdmin.from('profiles').select('nome, email, tipo, ativo').eq('id', userId).maybeSingle();
    if (perfil?.tipo === 'admin') return NextResponse.json({ error: 'Admin responde pelo painel' }, { status: 400 });
    if (perfil && perfil.ativo === false) return NextResponse.json({ error: 'Conta bloqueada', codigo: 'BLOQUEADA' }, { status: 403 });
    nome = perfil?.nome || ''; contato = `${perfil?.email || ''} (${perfil?.tipo || 'conta'})`;
    if (!conversa) {
      const { error } = await supabaseAdmin.from('suporte_conversas').insert({ profile_id: userId, idioma, pagina });
      if (error) { console.error('[suporte] criar', error.message); return erroInterno(); }
      ({ conversa, erro } = await conversaDe(userId));
      if (erro) return erroInterno();
    }
  }
  if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada', codigo: 'SEM_CONVERSA' }, { status: 404 });
  if (!dentroDoLimite(`suporte-enviar:${conversa.id}`, 30, 10 * 60 * 1000)) return NextResponse.json({ error: 'Muitas mensagens', codigo: 'LIMITE' }, { status: 429 });

  const cfg = await configSuporte();
  const { traducao, origem } = await traduzirSeLigado(texto, IDIOMA_ADMIN, cfg.traducao, conversa.id);
  const agora = new Date().toISOString();
  const { error } = await supabaseAdmin.from('suporte_mensagens').insert({ conversa_id: conversa.id, autor: 'usuario', texto, traducao, origem });
  if (error) { console.error('[suporte] enviar', error.message); return erroInterno(); }

  const mudancas: Record<string, unknown> = { ultima_mensagem_em: agora, nao_lidas_admin: conversa.nao_lidas_admin + 1, idioma, usuario_visto_em: agora };
  if (pagina) mudancas.pagina = pagina;
  if (!cfg.adminOnline) {
    // com o admin offline: resposta automatica (na lingua da pessoa) e e-mail ao admin
    if (await podeMandarAuto(conversa.id)) {
      await supabaseAdmin.from('suporte_mensagens').insert({ conversa_id: conversa.id, autor: 'auto', texto: SUPORTE_AUTO[linguaTexto(idioma)] });
    }
    if (!recente(conversa.admin_avisado_em, AVISO_MS)) {
      const r = await sendSuporteAdminEmail({ nome: nome || '?', contato: contato || '-', texto, traducao, locale: idioma, pagina });
      // so conta como avisado se o e-mail saiu (senao tenta de novo na proxima mensagem)
      if (r.success) mudancas.admin_avisado_em = agora;
    }
  }
  await supabaseAdmin.from('suporte_conversas').update(mudancas).eq('id', conversa.id);
  return NextResponse.json({ ok: true });
}
