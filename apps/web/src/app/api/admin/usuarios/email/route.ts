import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { registrarAuditoria } from '@/lib/admin-auditoria';

export const dynamic = 'force-dynamic';

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Admin troca o email de acesso de uma conta (cadastro com email errado ou
// sem acesso a caixa). O email novo ja fica confirmado: o admin responde por
// ele. A senha nao muda. Fica registrado na auditoria (antes/depois/motivo).
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id, email, motivo } = await req.json().catch(() => ({}));
  const novo = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!id || !EMAIL_OK.test(novo)) return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
  if (typeof motivo !== 'string' || motivo.trim().length < 3) return NextResponse.json({ error: 'Informe o motivo' }, { status: 400 });

  const { data: perfil } = await supabaseAdmin.from('profiles').select('id, email, tipo').eq('id', id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 });
  if (perfil.email?.toLowerCase() === novo) return NextResponse.json({ error: 'É o mesmo email' }, { status: 400 });
  const { data: outro } = await supabaseAdmin.from('profiles').select('id').ilike('email', novo).neq('id', id).maybeSingle();
  if (outro) return NextResponse.json({ error: 'Este email já é usado por outra conta' }, { status: 409 });

  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { email: novo, email_confirm: true });
  if (error) {
    const usado = /already|registered|exists/i.test(error.message);
    return NextResponse.json({ error: usado ? 'Este email já é usado por outra conta' : error.message }, { status: usado ? 409 : 500 });
  }
  const { error: e2 } = await supabaseAdmin.from('profiles').update({ email: novo }).eq('id', id);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  await registrarAuditoria(supabaseAdmin, {
    adminId: auth.userId, entidade: 'profile', entidadeId: id, acao: 'trocar_email',
    antes: { email: perfil.email }, depois: { email: novo }, motivo,
  });
  return NextResponse.json({ ok: true, email: novo });
}
