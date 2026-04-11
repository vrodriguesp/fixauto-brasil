import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// POST: Create a new funcionario with nome, email, senha temporária
export async function POST(req: NextRequest) {
  try {
    const { nome, email, senha, cargo, especialidade, oficina_id } = await req.json();

    if (!email || !senha || !cargo || !oficina_id) {
      return NextResponse.json({ error: 'Campos obrigatórios: email, senha, cargo, oficina_id' }, { status: 400 });
    }

    // 1. Check if user exists with this email
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, nome, email')
      .eq('email', email)
      .single();

    let profileId: string;

    if (existingProfile) {
      profileId = existingProfile.id;
    } else {
      // 2. Create auth user with the provided password
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      });

      if (authError || !authData.user) {
        return NextResponse.json({ error: authError?.message || 'Erro ao criar usuário' }, { status: 500 });
      }

      profileId = authData.user.id;

      // Create profile as 'oficina' type so they get oficina routing
      await supabaseAdmin.from('profiles').insert({
        id: profileId,
        tipo: 'oficina',
        nome: nome || email.split('@')[0],
        email,
      });
    }

    // 3. Check if already a funcionario of this oficina
    const { data: existing } = await supabaseAdmin
      .from('funcionarios')
      .select('id')
      .eq('profile_id', profileId)
      .eq('oficina_id', oficina_id)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Este funcionário já está cadastrado nesta oficina' }, { status: 409 });
    }

    // 4. Create funcionario record with primeiro_login = true
    const { data: func, error: funcError } = await supabaseAdmin
      .from('funcionarios')
      .insert({
        profile_id: profileId,
        oficina_id,
        cargo,
        especialidade: especialidade || null,
        primeiro_login: true,
      })
      .select('*, profile:profiles(*)')
      .single();

    if (funcError) {
      return NextResponse.json({ error: funcError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, funcionario: func });
  } catch (err) {
    console.error('[funcionarios] POST error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PATCH: Update funcionario (toggle ativo, change cargo, primeiro_login)
export async function PATCH(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('funcionarios')
      .update(updates)
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE: Remove funcionario
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('funcionarios')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
