import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionUserId } from '@/lib/api-auth';
import { limitarPorIp } from '@/lib/rate-limit';
import { hashLinkAcesso, TOKEN_ACESSO } from '@/lib/link-acesso';
import { loginPorToken } from '@/lib/login-token';

export const dynamic = 'force-dynamic';

// Pagina "ver pedido" do link do e-mail (lib/link-acesso.ts). Nada acontece ao
// abrir o link: so o toque no botao gasta o token.
//   acao 'ver'    -> nome e numero do pedido para a saudacao (nao gasta o token);
//                    quem ja esta logado como o dono do pedido recebe jaLogado
//   acao 'entrar' -> gasta o token (uso unico, num passo so no banco) e devolve o
//                    login de uso unico (tokenHash) + se ainda falta criar senha
export async function POST(req: NextRequest) {
  if (!limitarPorIp(req, 'link-acesso', 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  const token = typeof b?.k === 'string' ? b.k : '';
  const acao = b?.acao;
  const invalido = (extra: Record<string, unknown> = {}) => NextResponse.json({ error: 'Link inválido', codigo: 'LINK_INVALIDO', ...extra }, { status: 410 });
  if (!TOKEN_ACESSO.test(token) || !['ver', 'entrar'].includes(acao)) return invalido();
  const hash = hashLinkAcesso(token);
  const { data: l } = await supabaseAdmin.from('links_acesso')
    .select('user_id, solicitacao_id, usado_em, expira_em').eq('token_hash', hash).maybeSingle();
  if (!l) return invalido();
  // ja esta logado como o dono: vai direto ao pedido (mesmo com o link gasto)
  const sessao = await getSessionUserId(req);
  const jaLogado = !!sessao && sessao === l.user_id;
  const vencido = !!l.usado_em || new Date(l.expira_em).getTime() < Date.now();

  if (acao === 'ver') {
    if (jaLogado) return NextResponse.json({ jaLogado: true, solicitacaoId: l.solicitacao_id });
    if (vencido) return invalido({ solicitacaoId: l.solicitacao_id });
    const { data: perfil } = await supabaseAdmin.from('profiles').select('nome, ativo').eq('id', l.user_id).maybeSingle();
    const { data: sol } = await supabaseAdmin.from('solicitacoes').select('numero').eq('id', l.solicitacao_id).maybeSingle();
    if (!perfil || perfil.ativo === false) return invalido();
    return NextResponse.json({ nome: perfil.nome, numero: sol?.numero ?? null, solicitacaoId: l.solicitacao_id });
  }

  // entrar: gasta o token num passo so (dois toques ao mesmo tempo entram uma vez)
  const { data: usado } = await supabaseAdmin.rpc('link_acesso_usar', { p_hash: hash });
  const linha = (usado as { user_id: string; solicitacao_id: string }[] | null)?.[0];
  if (!linha) return jaLogado ? NextResponse.json({ jaLogado: true, solicitacaoId: l.solicitacao_id }) : invalido({ solicitacaoId: l.solicitacao_id });
  const { data: perfil } = await supabaseAdmin.from('profiles').select('ativo').eq('id', linha.user_id).maybeSingle();
  if (!perfil || perfil.ativo === false) return NextResponse.json({ error: 'Sem acesso', codigo: 'SEM_ACESSO' }, { status: 403 });
  const login = await loginPorToken(linha.user_id);
  if (!login.tokenHash) return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  return NextResponse.json({ ...login, solicitacaoId: linha.solicitacao_id });
}
