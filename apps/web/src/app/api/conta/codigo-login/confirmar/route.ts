import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { limitarPorIp } from '@/lib/rate-limit';
import { ehUuid } from '@/lib/validacao';
import { CODIGO_LOGIN_TENTATIVAS, codigoLoginConfere } from '@/lib/codigo-login';
import { loginPorToken } from '@/lib/login-token';

export const dynamic = 'force-dynamic';

// Codigo de login certo -> token de uso unico (lib/login-token.ts) que o
// navegador/app troca por sessao. 5 tentativas por codigo, contadas no banco
// (num passo so, como o codigo do pedido); 40 confirmacoes/h por IP.
export async function POST(req: NextRequest) {
  if (!limitarPorIp(req, 'codigo-login-confirmar', 40, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  const id = b?.id;
  const codigo = typeof b?.codigo === 'string' ? b.codigo.replace(/\D/g, '') : '';
  const expirado = NextResponse.json({ error: 'Código expirado', codigo: 'CODIGO_EXPIRADO' }, { status: 410 });
  if (!ehUuid(id)) return expirado;
  const { data: existe } = await supabaseAdmin.from('codigos_login').select('id, expira_em').eq('id', id).maybeSingle();
  if (!existe) return expirado;
  if (new Date(existe.expira_em).getTime() < Date.now()) {
    await supabaseAdmin.from('codigos_login').delete().eq('id', id);
    return expirado;
  }
  const { data: t } = await supabaseAdmin.rpc('codigo_login_tentativa', { p_id: id, p_max: CODIGO_LOGIN_TENTATIVAS });
  const tentativa = (t as { user_id: string | null; codigo_hash: string; tentativas: number }[] | null)?.[0];
  if (!tentativa) return NextResponse.json({ error: 'Tentativas esgotadas', codigo: 'CODIGO_TENTATIVAS' }, { status: 429 });
  // e-mail sem conta: o codigo nunca foi enviado, responde como codigo errado
  if (!codigoLoginConfere(id, codigo, tentativa.codigo_hash) || !tentativa.user_id) {
    const restantes = CODIGO_LOGIN_TENTATIVAS - tentativa.tentativas;
    return NextResponse.json({ error: 'Código errado', codigo: restantes > 0 ? 'CODIGO_INVALIDO' : 'CODIGO_TENTATIVAS', restantes }, { status: 400 });
  }
  // uso unico: some antes de gerar o login
  const { data: usado } = await supabaseAdmin.from('codigos_login').delete().eq('id', id).select('id');
  if (!usado?.length) return expirado;
  const { data: perfil } = await supabaseAdmin.from('profiles').select('ativo').eq('id', tentativa.user_id).maybeSingle();
  if (!perfil || perfil.ativo === false) return NextResponse.json({ error: 'Sem acesso', codigo: 'SEM_ACESSO' }, { status: 403 });
  const login = await loginPorToken(tentativa.user_id);
  if (!login.tokenHash) return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  return NextResponse.json(login);
}
