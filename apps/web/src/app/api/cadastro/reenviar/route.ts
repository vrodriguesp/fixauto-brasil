import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { limitarPorIp, dentroDoLimite } from '@/lib/rate-limit';
import { ErroValidacao, email as validarEmail } from '@/lib/validacao';
import { enviarConfirmacaoEmail } from '@/lib/email-cadastro';

// Novo link de confirmacao (o anterior expirou ou nao chegou). Sempre
// responde ok - nao revela se o e-mail tem conta nem se ja foi confirmado.
// Um envio por e-mail a cada 2 min.
export async function POST(req: NextRequest) {
  if (!limitarPorIp(req, 'cadastro-reenviar', 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  }
  try {
    const b = await req.json();
    const email = validarEmail(b.email, true)!;
    if (!dentroDoLimite(`cadastro-reenviar:${email}`, 1, 2 * 60 * 1000)) return NextResponse.json({ ok: true });

    const { data: perfil } = await supabaseAdmin
      .from('profiles').select('id, nome, idioma').ilike('email', email.replace(/[%_\\]/g, '\\$&')).maybeSingle();
    if (!perfil) return NextResponse.json({ ok: true });
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(perfil.id);
    if (!u?.user || u.user.email_confirmed_at) return NextResponse.json({ ok: true });

    await enviarConfirmacaoEmail(email, perfil.nome, perfil.idioma || b.idioma);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 400 });
    console.error('[cadastro/reenviar]', e);
    return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  }
}
