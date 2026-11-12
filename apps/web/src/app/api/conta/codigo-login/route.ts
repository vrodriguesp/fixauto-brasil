import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { dentroDoLimite, ipDe } from '@/lib/rate-limit';
import { email as validarEmail, ErroValidacao } from '@/lib/validacao';
import { guardarCodigoLogin, novoCodigoLogin, enviarCodigoLogin, limparCodigosLogin } from '@/lib/codigo-login';

export const dynamic = 'force-dynamic';
const HORA = 60 * 60 * 1000;

// Tela de login, "Receber um codigo por e-mail" (lib/codigo-login.ts). Sempre
// responde { id } - exista ou nao a conta, com ou sem senha - para nao revelar
// quais e-mails estao cadastrados. Limites iguais ao /api/esqueci-senha: 10/h
// por IP e 1 por e-mail a cada 2 min (acima disso responde igual, sem enviar).
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const email = validarEmail(b?.email, true)!;
    const idiomaTela = typeof b?.idioma === 'string' ? b.idioma : null;
    const chave = email.toLowerCase();
    if (!dentroDoLimite(`codigo-login:${ipDe(req)}`, 10, HORA) || !dentroDoLimite(`codigo-login-email:${chave}`, 1, 2 * 60 * 1000)) {
      return NextResponse.json({ id: randomUUID() });
    }
    limparCodigosLogin().catch(() => {});

    const { data: perfil } = await supabaseAdmin.from('profiles')
      .select('id, nome, idioma, tipo, ativo').ilike('email', email.replace(/[%_\\]/g, '\\$&')).maybeSingle();
    // sem conta, desativada ou admin (entra so com senha, sessao curta): registro
    // vazio, mesma resposta
    if (!perfil || perfil.ativo === false || perfil.tipo === 'admin') {
      return NextResponse.json({ id: await guardarCodigoLogin(email, null, null) });
    }
    const codigo = novoCodigoLogin();
    const id = await guardarCodigoLogin(email, perfil.id, codigo);
    const enviado = await enviarCodigoLogin(email, perfil.nome, codigo, perfil.idioma || idiomaTela);
    if (!enviado) {
      await supabaseAdmin.from('codigos_login').delete().eq('id', id);
      return NextResponse.json({ error: 'Falha ao enviar e-mail', codigo: 'GENERICO' }, { status: 502 });
    }
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 400 });
    console.error('[conta/codigo-login]', e);
    return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  }
}
